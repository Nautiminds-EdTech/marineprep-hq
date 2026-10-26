import { Suspense } from "react";
import { AutoRefresh } from "@/components/auto-refresh";
import { requireAdmin } from "@/lib/auth";
import { listProposals, markDone, type FixProposal, type Status } from "@/lib/fixes";
import { githubConfigured, issueStates } from "@/lib/github";
import { createServiceClient } from "@/lib/supabase/server";
import { formatTimeIST } from "@/lib/time";
import { decideFix, markFixDone } from "./actions";

export const metadata = { title: "Fix queue · MarinePrep HQ" };
// Approving can open a GitHub issue and edit the Telegram message.
export const maxDuration = 60;

export default function FixesPage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Fix queue</h1>
          <p className="text-sm text-ink-2">
            Propose from the Quality page or a Telegram alert · approve here or in Telegram · approval opens a
            GitHub issue
          </p>
        </div>
        <AutoRefresh seconds={20} />
      </header>
      <Suspense fallback={<p className="text-sm text-ink-3">Loading…</p>}>
        <Queue />
      </Suspense>
    </div>
  );
}

const SECTIONS: { status: Status; title: string; empty: string }[] = [
  { status: "proposed", title: "Waiting for approval", empty: "Nothing waiting." },
  { status: "approved", title: "Approved, to fix", empty: "Nothing approved and open." },
  { status: "done", title: "Done", empty: "Nothing done yet." },
  { status: "rejected", title: "Rejected", empty: "Nothing rejected." },
];

async function Queue() {
  await requireAdmin();
  if (!createServiceClient()) {
    return <p className="card p-4 text-sm text-ink-2">The Fix queue needs SUPABASE_SERVICE_ROLE_KEY.</p>;
  }

  let proposals = await listProposals();

  // An approved fix whose GitHub issue was closed is done.
  const open = proposals.filter((p) => p.status === "approved" && p.github_issue_number);
  if (open.length && githubConfigured()) {
    const states = await issueStates(open.map((p) => p.github_issue_number!));
    const closed = open.filter((p) => states.get(p.github_issue_number!) === "closed");
    if (closed.length) {
      await Promise.all(closed.map((p) => markDone(p.id, "GitHub")));
      proposals = await listProposals();
    }
  }

  return (
    <>
      {SECTIONS.map(({ status, title, empty }) => {
        const items = proposals.filter((p) => p.status === status);
        if (!items.length && (status === "rejected" || status === "done")) return null;
        return (
          <section key={status} className="flex flex-col gap-3">
            <h2 className="font-medium">
              {title} <span className="text-sm font-normal text-ink-3">({items.length})</span>
            </h2>
            {items.length === 0 ? (
              <p className="text-sm text-ink-3">{empty}</p>
            ) : (
              items.map((p) => <ProposalCard key={p.id} p={p} />)
            )}
          </section>
        );
      })}
    </>
  );
}

const SEVERITY_STYLE: Record<FixProposal["severity"], string> = {
  critical: "bg-critical/15 text-critical",
  high: "bg-warning/15 text-warning",
  medium: "bg-accent/15 text-accent",
  low: "bg-line text-ink-2",
};

function ProposalCard({ p }: { p: FixProposal }) {
  const issue = p.evidence.issue;
  const drafting = p.status === "proposed" && !p.summary && !p.evidence.drafted_by;
  return (
    <article id={p.id} className="card flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
            <span className={`rounded px-1.5 py-0.5 font-medium uppercase ${SEVERITY_STYLE[p.severity]}`}>
              {p.severity}
            </span>
            {issue && (
              <a href={issue.permalink} target="_blank" rel="noreferrer" className="font-mono hover:underline">
                {issue.shortId}
              </a>
            )}
            {issue && (
              <span>
                {issue.users} users · {issue.events} events{issue.unhandled ? " · unhandled" : ""}
              </span>
            )}
            <span>· {formatTimeIST(p.created_at)}</span>
          </p>
          <h3 className="mt-1 font-medium">{p.title}</h3>
        </div>
        {p.status === "proposed" && (
          <form action={decideFix} className="flex shrink-0 gap-2">
            <input type="hidden" name="id" value={p.id} />
            <button name="decision" value="approved" className="btn-primary text-sm">
              Approve
            </button>
            <button
              name="decision"
              value="rejected"
              className="rounded-lg border border-line px-4 py-2 text-sm text-ink-2 hover:text-ink"
            >
              Reject
            </button>
          </form>
        )}
        {p.status === "approved" && (
          <form action={markFixDone} className="shrink-0">
            <input type="hidden" name="id" value={p.id} />
            <button className="rounded-lg border border-line px-4 py-2 text-sm text-ink-2 hover:text-ink">
              Mark done
            </button>
          </form>
        )}
      </div>

      {drafting && <p className="text-sm text-ink-3">Claude is drafting the root cause and fix…</p>}
      {p.evidence.draft_error && (
        <p className="text-xs text-warning">Couldn&apos;t draft with Claude: {p.evidence.draft_error}</p>
      )}
      {p.summary && <Block label="Root cause" text={p.summary} />}
      {p.suggested_fix && <Block label="Suggested fix" text={p.suggested_fix} />}
      {p.evidence.how_to_test && <Block label="How to test" text={p.evidence.how_to_test} />}

      {issue && (
        <details className="text-sm">
          <summary className="cursor-pointer text-ink-2">Evidence</summary>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-bg p-3 font-mono text-xs whitespace-pre-wrap text-ink-2">
            {[
              `${issue.title}`,
              `Release ${issue.release ?? "?"} · ${issue.os ?? "?"}${issue.loggerTag ? ` · tag ${issue.loggerTag}` : ""}`,
              "",
              ...issue.exceptions.flatMap((x) => [`${x.type}: ${x.value}`, ...x.frames.map((f) => `  ${f}`)]),
              "",
              "Breadcrumbs:",
              ...issue.breadcrumbs.map((b) => `  ${b}`),
            ].join("\n")}
          </pre>
        </details>
      )}

      {(p.decided_by || p.github_issue_url) && (
        <p className="text-xs text-ink-3">
          {p.decided_by && (
            <>
              {p.status === "done" ? "Done" : p.status === "rejected" ? "Rejected" : "Approved"} by {p.decided_by}
              {p.decided_via === "telegram" ? " in Telegram" : ""}
              {p.decided_at ? ` · ${formatTimeIST(p.decided_at)}` : ""}
            </>
          )}
          {p.github_issue_url && (
            <>
              {" · "}
              <a href={p.github_issue_url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                GitHub issue #{p.github_issue_number}
              </a>
            </>
          )}
        </p>
      )}
    </article>
  );
}

function Block({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="text-xs font-medium tracking-wide text-ink-3 uppercase">{label}</p>
      <p className="mt-1 text-sm whitespace-pre-wrap text-ink">{text}</p>
    </div>
  );
}
