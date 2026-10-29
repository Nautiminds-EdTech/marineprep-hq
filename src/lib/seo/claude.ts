import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase/server";

// Claude calls for the SEO section, each logged to seo_runs with tokens and cost (the monthly cap
// adds these up).

export function claude() {
  // Keys created outside a workspace must name one on every request.
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID;
  return new Anthropic(workspace ? { defaultHeaders: { "anthropic-workspace-id": workspace } } : {});
}

/** A message an admin can act on, instead of the API's raw JSON. */
export function claudeErrorMessage(e: unknown) {
  if (e instanceof Anthropic.AuthenticationError) return "Claude rejected the API key. Check ANTHROPIC_API_KEY (locally, .env.local needs the same key as Vercel).";
  if (e instanceof Anthropic.PermissionDeniedError) return "This API key isn't allowed to use that model or workspace.";
  if (e instanceof Anthropic.RateLimitError) return "Claude is rate-limited or the workspace hit its spend limit. Try again in a minute.";
  if (e instanceof Anthropic.APIConnectionError) return "Couldn't reach Claude. Check the connection and try again.";
  if (e instanceof Anthropic.APIError) return `Claude returned an error (${e.status ?? "unknown"}). Try again.`;
  return (e as Error).message;
}

/** USD per million tokens: input, output, cache read. Cache writes (5-minute) cost 1.25x input. */
const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
  // A refusal fallback can answer on an older model.
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5 },
};
const SEARCH_USD = 10 / 1000;

type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  server_tool_use?: { web_search_requests?: number | null; web_fetch_requests?: number | null } | null;
};

export function costUsd(model: string, u: Usage) {
  const p = PRICES[model] ?? PRICES["claude-opus-5-5"];
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  return (
    (u.input_tokens * p.input + cacheWrite * p.input * 1.25 + cacheRead * p.cacheRead + u.output_tokens * p.output) / 1e6 +
    (u.server_tool_use?.web_search_requests ?? 0) * SEARCH_USD
  );
}

/** Records one model call in seo_runs. Never throws: logging must not break the feature. */
export async function logRun(run: {
  jobId: string;
  stage: string;
  model: string;
  usage: Usage;
  blogId?: string | null;
  topicId?: string | null;
  status?: "ok" | "failed";
  error?: string;
  output?: unknown;
  startedAt: Date;
}) {
  const db = createServiceClient();
  if (!db) return;
  const u = run.usage;
  const { error } = await db.from("seo_runs").insert({
    job_id: run.jobId,
    stage: run.stage,
    model: run.model,
    blog_id: run.blogId ?? null,
    topic_id: run.topicId ?? null,
    input_tokens: u.input_tokens,
    output_tokens: u.output_tokens,
    cache_read_tokens: u.cache_read_input_tokens ?? 0,
    cache_write_tokens: u.cache_creation_input_tokens ?? 0,
    web_searches: u.server_tool_use?.web_search_requests ?? 0,
    web_fetches: u.server_tool_use?.web_fetch_requests ?? 0,
    cost_usd: Number(costUsd(run.model, u).toFixed(4)),
    status: run.status ?? "ok",
    error: run.error ?? null,
    output: run.output ?? null,
    started_at: run.startedAt.toISOString(),
    finished_at: new Date().toISOString(),
  });
  if (error) console.error("[seo] couldn't log run:", error.message);
}
