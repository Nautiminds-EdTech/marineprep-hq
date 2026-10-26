import "server-only";
import { draftFromSentry } from "@/lib/analyst";
import { createIssue, githubConfigured } from "@/lib/github";
import { getIssueDetail, type IssueDetail } from "@/lib/sentry";
import { createServiceClient } from "@/lib/supabase/server";
import { editMessage, esc, sendMessage, telegramConfigured, type Button } from "@/lib/telegram";

export type Severity = "critical" | "high" | "medium" | "low";
export type Status = "proposed" | "approved" | "rejected" | "done";

export type FixProposal = {
  id: string;
  source: "sentry" | "review" | "analyst" | "manual";
  source_ref: string | null;
  title: string;
  severity: Severity;
  summary: string | null;
  suggested_fix: string | null;
  evidence: { issue?: IssueDetail; how_to_test?: string; drafted_by?: "claude" | "none"; draft_error?: string };
  status: Status;
  decided_by: string | null;
  decided_via: "hq" | "telegram" | null;
  decided_at: string | null;
  github_issue_number: number | null;
  github_issue_url: string | null;
  telegram_message_id: number | null;
  created_at: string;
};

function db() {
  const client = createServiceClient();
  if (!client) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return client.from("hq_fix_proposals");
}

export async function listProposals(): Promise<FixProposal[]> {
  const { data, error } = await db().select("*").order("created_at", { ascending: false }).limit(200);
  if (error) throw new Error(error.message);
  return data as FixProposal[];
}

/** Proposals waiting for an approve/reject decision. */
export async function countWaiting() {
  const { count, error } = await db().select("*", { count: "exact", head: true }).eq("status", "proposed");
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Proposal IDs keyed by Sentry short ID, for "already in the queue" links. */
export async function proposalsForSentry(shortIds: string[]) {
  if (!shortIds.length) return new Map<string, { id: string; status: Status }>();
  const { data } = await db().select("id, status, source_ref").eq("source", "sentry").in("source_ref", shortIds);
  return new Map((data ?? []).map((p) => [p.source_ref as string, { id: p.id as string, status: p.status as Status }]));
}

/**
 * Creates a proposal for a Sentry issue, or returns the existing one.
 * The row is saved straight away; call draftProposal() afterwards (it can take a minute).
 */
export async function proposeFromSentry(shortId: string) {
  const { data: existing } = await db().select("id").eq("source", "sentry").eq("source_ref", shortId).maybeSingle();
  if (existing) return { id: existing.id as string, created: false };

  const issue = await getIssueDetail(shortId);
  const { data, error } = await db()
    .insert({
      source: "sentry",
      source_ref: issue.shortId,
      title: issue.title.slice(0, 200),
      severity: issue.unhandled ? "high" : "medium",
      evidence: { issue },
    })
    .select("id")
    .single();
  // 23505: a concurrent request (e.g. a double tap) created it first
  if (error?.code === "23505") return proposeFromSentry(shortId);
  if (error) throw new Error(error.message);
  return { id: data.id as string, created: true };
}

/** Fills in Claude's root cause and fix (when configured), then posts the proposal to Telegram. */
export async function draftProposal(id: string) {
  const { data, error } = await db().select("*").eq("id", id).single();
  if (error) throw new Error(error.message);
  let p = data as FixProposal;

  if (p.evidence.issue && !p.summary) {
    let update: Partial<FixProposal>;
    try {
      const draft = await draftFromSentry(p.evidence.issue);
      update = draft
        ? {
            title: draft.title,
            severity: draft.severity,
            summary: draft.summary,
            suggested_fix: draft.suggested_fix,
            evidence: { ...p.evidence, how_to_test: draft.how_to_test, drafted_by: "claude" },
          }
        : { evidence: { ...p.evidence, drafted_by: "none" } };
    } catch (e) {
      update = { evidence: { ...p.evidence, drafted_by: "none", draft_error: (e as Error).message.slice(0, 300) } };
    }
    const { data: updated } = await db().update(update).eq("id", id).select("*").single();
    if (updated) p = updated as FixProposal;
  }

  if (telegramConfigured() && !p.telegram_message_id && p.status === "proposed") {
    const messageId = await sendMessage(telegramText(p), telegramButtons(p));
    await db().update({ telegram_message_id: messageId }).eq("id", id);
  }
}

/**
 * Approves or rejects a proposal that is still pending. Approval opens a GitHub issue when configured.
 * Returns null if someone else already decided it.
 */
export async function decideProposal(id: string, decision: "approved" | "rejected", by: string, via: "hq" | "telegram") {
  const { data, error } = await db()
    .update({ status: decision, decided_by: by, decided_via: via, decided_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "proposed")
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  let p = data as FixProposal;

  if (decision === "approved" && githubConfigured() && !p.github_issue_number) {
    try {
      const issue = await createIssue(p.title, issueBody(p), ["hq-fix", p.severity]);
      const { data: updated } = await db()
        .update({ github_issue_number: issue.number, github_issue_url: issue.url })
        .eq("id", id)
        .select("*")
        .single();
      if (updated) p = updated as FixProposal;
    } catch (e) {
      console.error("[fixes] GitHub issue failed:", (e as Error).message);
    }
  }

  await syncTelegram(p);
  return p;
}

export async function markDone(id: string, by: string) {
  const { data } = await db()
    .update({ status: "done", decided_by: by, decided_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "approved")
    .select("*")
    .maybeSingle();
  if (data) await syncTelegram(data as FixProposal);
}

async function syncTelegram(p: FixProposal) {
  if (!telegramConfigured() || !p.telegram_message_id) return;
  try {
    await editMessage(p.telegram_message_id, telegramText(p), telegramButtons(p));
  } catch (e) {
    // "message is not modified" and deleted messages aren't worth failing the decision over
    console.error("[fixes] Telegram edit failed:", (e as Error).message);
  }
}

// ── Formatting ────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<Status, string> = {
  proposed: "⏳ Waiting for approval",
  approved: "✅ Approved",
  rejected: "❌ Rejected",
  done: "🏁 Done",
};

function telegramText(p: FixProposal) {
  const issue = p.evidence.issue;
  const lines = [
    `🛠 <b>Fix proposal</b> · ${p.severity.toUpperCase()}`,
    `<b>${esc(p.title)}</b>`,
    issue
      ? `<a href="${issue.permalink}">${esc(issue.shortId)}</a> · ${issue.users} users · ${issue.events} events${issue.unhandled ? " · unhandled" : ""}`
      : "",
    "",
    p.summary ? `<i>Root cause</i>\n${esc(p.summary)}` : esc(issue?.culprit ?? ""),
    p.suggested_fix ? `\n<i>Fix</i>\n${esc(p.suggested_fix.slice(0, 1500))}` : "",
    "",
    p.status === "proposed"
      ? STATUS_LABEL.proposed
      : `${STATUS_LABEL[p.status]} by ${esc(p.decided_by ?? "?")}${p.decided_via === "telegram" ? " (Telegram)" : ""}`,
    p.github_issue_url ? `<a href="${p.github_issue_url}">GitHub issue #${p.github_issue_number}</a>` : "",
  ];
  return lines.filter((l, i, all) => l !== "" || all[i - 1] !== "").join("\n");
}

function telegramButtons(p: FixProposal): Button[][] {
  const rows: Button[][] = [];
  if (p.status === "proposed") {
    rows.push([
      { text: "✅ Approve", callback_data: `fix:a:${p.id}` },
      { text: "❌ Reject", callback_data: `fix:r:${p.id}` },
    ]);
  }
  // Telegram only accepts public https links in buttons (not localhost).
  const hq = process.env.HQ_URL;
  if (hq?.startsWith("https://")) rows.push([{ text: "Open in HQ", url: `${hq}/fixes#${p.id}` }]);
  return rows;
}

function issueBody(p: FixProposal) {
  const issue = p.evidence.issue;
  return [
    p.summary ? `## Root cause\n\n${p.summary}` : "",
    p.suggested_fix ? `## Suggested fix\n\n${p.suggested_fix}` : "",
    p.evidence.how_to_test ? `## How to test\n\n${p.evidence.how_to_test}` : "",
    issue
      ? [
          "## Evidence",
          "",
          `- Sentry: [${issue.shortId}](${issue.permalink}) · ${issue.users} users · ${issue.events} events · ${issue.unhandled ? "unhandled" : "handled"}`,
          `- Release ${issue.release ?? "?"} · ${issue.os ?? "?"} · first seen ${issue.firstSeen.slice(0, 10)}, last seen ${issue.lastSeen.slice(0, 10)}`,
          "",
          "```",
          ...issue.exceptions.flatMap((x) => [`${x.type}: ${x.value}`, ...x.frames.map((f) => `  ${f}`)]),
          "```",
          "",
          "<details><summary>Last breadcrumbs</summary>",
          "",
          ...issue.breadcrumbs.map((b) => `- ${b.replace(/\n/g, " ")}`),
          "",
          "</details>",
        ].join("\n")
      : "",
    `---\nProposed by MarinePrep HQ${p.evidence.drafted_by === "claude" ? " (root cause drafted by Claude)" : ""}. Approved by ${p.decided_by} via ${p.decided_via === "telegram" ? "Telegram" : "HQ"}.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
