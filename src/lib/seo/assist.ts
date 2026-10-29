import "server-only";
import { claude, claudeErrorMessage, logRun } from "@/lib/seo/claude";
import type { AssistKind } from "@/lib/seo/assist-kinds";
import { VOICE } from "@/lib/seo/voice";

// "Ask Claude" actions in the blog editor. Each returns an HTML fragment that replaces the selection
// (or, for an FAQ, is inserted at the cursor). The editor shows it for review before applying.

const TASK: Record<AssistKind, string> = {
  rewrite: "Rewrite the selected passage in the house voice. Keep every fact, number, link and heading level. Fix anything on the \"Never\" list.",
  shorten: "Cut the selected passage to about 60% of its length. Keep every fact, number and link that matters; drop repetition and throat-clearing.",
  simplify: "Rewrite the selected passage so a Class 12 student reads it easily: shorter sentences, everyday words, technical terms explained once. Keep every fact and link.",
  faq: "Write a short FAQ section for this post: an <h2>Frequently asked questions</h2> followed by 4-6 questions as <h3> with 1-3 sentence answers in <p>. Use only questions the post itself answers or that follow from it, phrased the way a student would search them. Answer from the post's facts only.",
};

const SYSTEM = `${VOICE}

You are editing a draft in the MarinePrep blog editor. Return only the replacement HTML fragment: no Markdown, no code
fences, no commentary. Allowed tags: h2, h3, p, ul, ol, li, strong, em, a (with href), blockquote, table, thead,
tbody, tr, th, td, br. Never use h1. Keep existing links (href values) exactly as they are.`;

export async function assist(opts: { blogId: string; kind: AssistKind; title: string; keyword?: string; selection: string; postHtml: string }) {
  const startedAt = new Date();
  const jobId = crypto.randomUUID();
  const context = [
    `Post title: ${opts.title}`,
    opts.keyword ? `Main keyword: ${opts.keyword}` : "",
    "",
    "<post>",
    opts.postHtml.slice(0, 60_000),
    "</post>",
    "",
    opts.kind === "faq" ? "" : `<selection>\n${opts.selection}\n</selection>`,
    "",
    TASK[opts.kind],
  ].join("\n");

  let response;
  try {
    response = await claude().beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      system: SYSTEM,
      messages: [{ role: "user", content: context }],
    });
  } catch (e) {
    console.error("[seo] assist failed:", (e as Error).message);
    throw new Error(claudeErrorMessage(e));
  }

  const html = response.content
    .flatMap((b) => (b.type === "text" ? [b.text] : []))
    .join("")
    .replace(/^```(?:html)?\s*|\s*```$/g, "")
    .trim();
  const refused = response.stop_reason === "refusal";
  await logRun({
    jobId,
    stage: `editor:${opts.kind}`,
    model: response.model,
    usage: response.usage,
    blogId: opts.blogId,
    status: refused || !html ? "failed" : "ok",
    error: refused ? "refusal" : undefined,
    startedAt,
  });
  if (refused || !html) throw new Error("Claude couldn't do that one. Try a smaller selection.");
  return html;
}
