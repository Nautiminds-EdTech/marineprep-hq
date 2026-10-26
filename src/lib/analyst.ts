import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { IssueDetail } from "@/lib/sentry";

export function analystConfigured() {
  return !!process.env.ANTHROPIC_API_KEY;
}

function anthropic() {
  // Keys created outside a workspace must name one on every request.
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID;
  return new Anthropic(workspace ? { defaultHeaders: { "anthropic-workspace-id": workspace } } : {});
}

const Proposal = z.object({
  title: z.string().describe("Short imperative fix title, under 80 characters"),
  severity: z.enum(["critical", "high", "medium", "low"]),
  summary: z.string().describe("Likely root cause in 2-4 sentences, citing the evidence"),
  suggested_fix: z.string().describe("Concrete change: which file/function and what to do. Markdown allowed."),
  how_to_test: z.string().describe("Steps to reproduce and verify the fix"),
});
export type DraftProposal = z.infer<typeof Proposal>;

const SYSTEM = `You triage production errors for MarinePrep, a Flutter app (Riverpod, go_router, Supabase,
PostHog, Sentry, Razorpay + Apple IAP) that helps Class 12 students in India prepare for the IMU-CET
maritime entrance exam. You get one Sentry issue with its latest event and write a fix proposal for the
CTO, who will fix it by hand.

Severity: critical = payments, login or data loss for many users; high = a core flow (mocks, notes,
question bank) breaks for real users; medium = a screen misbehaves or a minority is affected; low =
cosmetic, or expected failures (wrong OTP, no network) reported as errors.

Base the root cause only on the evidence. When it isn't enough, say what to check instead of guessing.
If the error is expected behaviour being reported as an error, say so and suggest reporting it as a
breadcrumb instead.`;

/** Asks Claude for a root cause and fix. Returns null when no API key is set. */
export async function draftFromSentry(issue: IssueDetail): Promise<DraftProposal | null> {
  if (!analystConfigured()) return null;
  const client = anthropic();

  const evidence = [
    `Issue ${issue.shortId}: ${issue.title}`,
    `Culprit: ${issue.culprit || "unknown"}`,
    `Handled: ${issue.unhandled ? "no (unhandled)" : "yes"} · ${issue.events} events · ${issue.users} users`,
    `First seen ${issue.firstSeen}, last seen ${issue.lastSeen} · release ${issue.release ?? "?"} · ${issue.os ?? "?"}`,
    issue.loggerTag ? `AppLogger tag: ${issue.loggerTag}` : "",
    "",
    "Exceptions (in-app frames, innermost last):",
    ...issue.exceptions.map((x) => `- ${x.type}: ${x.value}\n${x.frames.map((f) => `    ${f}`).join("\n")}`),
    "",
    "Last breadcrumbs:",
    ...issue.breadcrumbs.map((b) => `- ${b}`),
  ].join("\n");

  const response = await client.beta.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(Proposal) },
    system: SYSTEM,
    messages: [{ role: "user", content: evidence }],
  });

  if (response.stop_reason === "refusal") return null;
  return response.parsed_output ?? null;
}

// ── Review themes ─────────────────────────────────────────────────────────────

export const REVIEW_THEMES = [
  "content_accuracy",
  "mock_tests",
  "question_bank",
  "notes",
  "marine_ai",
  "login_otp",
  "payments_pricing",
  "bugs_crashes",
  "performance",
  "ui_design",
  "exam_guidance",
  "praise",
  "other",
] as const;

const ThemeTags = z.object({
  reviews: z.array(
    z.object({
      id: z.string(),
      themes: z.array(z.enum(REVIEW_THEMES)).describe("1 to 3 themes, most important first"),
    }),
  ),
});

/** Tags each review with 1–3 themes from REVIEW_THEMES. Returns null when no API key is set. */
export async function tagReviewThemes(reviews: { id: string; rating: number; text: string }[]) {
  if (!analystConfigured() || !reviews.length) return null;
  const client = anthropic();

  const response = await client.beta.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(ThemeTags) },
    system: `You tag app store reviews of MarinePrep, an IMU-CET (Indian maritime entrance exam) prep app for
Class 12 students, so the team can see what users talk about. Give each review 1-3 themes from the allowed
list, most important first. Use "praise" for general positive feedback without a specific topic, "other" only
when nothing else fits. Reviews may be in Hindi or other Indian languages; tag them the same way.`,
    messages: [
      {
        role: "user",
        content: reviews.map((r) => `[${r.id}] ${r.rating}★ ${r.text.slice(0, 1500)}`).join("\n\n"),
      },
    ],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) return null;
  return new Map(response.parsed_output.reviews.map((r) => [r.id, r.themes as string[]]));
}
