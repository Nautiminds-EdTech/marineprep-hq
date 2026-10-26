import {
  Check,
  CircleCheck,
  CircleDot,
  ExternalLink,
  FlaskConical,
  Hourglass,
  Lightbulb,
  Search,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { Suspense } from "react";
import { AutoRefresh } from "@/components/auto-refresh";
import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
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
      <PageHeader
        title="Fix queue"
        description="Propose a fix from the Quality page or a Telegram alert. Claude drafts it; approving here or in Telegram opens a GitHub issue."
        actions={<AutoRefresh seconds={20} />}
      />
      <Suspense
        fallback={
          <div className="flex flex-col gap-3" aria-hidden>
            <div className="skeleton h-20" />
            <div className="skeleton h-56" />
            <div className="skeleton h-56" />
          </div>
        }
      >
        <Queue />
      </Suspense>
    </div>
  );
}

const SECTIONS: { status: Status; title: string; empty: string; icon: LucideIcon; style: string }[] = [
  { status: "proposed", title: "Waiting for approval", empty: "Nothing waiting.", icon: Hourglass, style: "bg-warning-soft text-warning" },
  { status: "approved", title: "Approved, to fix", empty: "Nothing approved and open.", icon: CircleDot, style: "bg-accent-soft text-accent" },
  { status: "done", title: "Done", empty: "Nothing done yet.", icon: CircleCheck, style: "bg-good-soft text-good" },
  { status: "rejected", title: "Rejected", empty: "Nothing rejected.", icon: X, style: "bg-surface-2 text-ink-3" },
];

async function Queue() {
  await requireAdmin();
  if (!createServiceClient()) {
    return <Notice tone="warning">The Fix queue needs SUPABASE_SERVICE_ROLE_KEY.</Notice>;
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
      <nav aria-label="Queue by status" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {SECTIONS.map(({ status, title, icon: Icon, style }) => {
          const count = proposals.filter((p) => p.status === status).length;
          return (
            <a
              key={status}
              href={`#${status}`}
              className="card flex items-center gap-3 p-3.5 transition-colors hover:border-line-strong"
            >
              <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${style}`}>
                <Icon size={17} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="display-num block text-2xl leading-none">{count}</span>
                <span className="mt-1 block truncate text-xs text-ink-3">{title}</span>
              </span>
            </a>
          );
        })}
      </nav>

      {SECTIONS.map(({ status, title, empty }) => {
        const items = proposals.filter((p) => p.status === status);
        if (!items.length && (status === "rejected" || status === "done")) return null;
        return (
          <section key={status} id={status} className="flex scroll-mt-24 flex-col gap-3">
            <h2 className="text-base font-semibold">
              {title} <span className="text-sm font-normal text-ink-3">({items.length})</span>
            </h2>
            {items.length === 0 ? (
              <p className="card p-4 text-sm text-ink-3">{empty}</p>
            ) : (
              items.map((p) => <ProposalCard key={p.id} p={p} />)
            )}
          </section>
        );
      })}
    </>
  );
}

const SEVERITY_STYLE: Record<FixProposal["severity"], { chip: string; stripe: string }> = {
  critical: { chip: "bg-critical-soft text-critical", stripe: "bg-critical" },
  high: { chip: "bg-warning-soft text-warning", stripe: "bg-warning" },
  medium: { chip: "bg-accent-soft text-accent", stripe: "bg-accent" },
  low: { chip: "bg-surface-2 text-ink-2", stripe: "bg-line-strong" },
};

function ProposalCard({ p }: { p: FixProposal }) {
  const issue = p.evidence.issue;
  const drafting = p.status === "proposed" && !p.summary && !p.evidence.drafted_by;
  const settled = p.status === "done" || p.status === "rejected";
  return (
    <article id={p.id} className={`card relative flex scroll-mt-24 flex-col gap-4 overflow-hidden p-4 pl-5 sm:p-5 sm:pl-6 ${settled ? "opacity-80" : ""}`}>
      <span className={`absolute inset-y-0 left-0 w-1 ${SEVERITY_STYLE[p.severity].stripe}`} aria-hidden />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
            <span className={`chip font-semibold uppercase ${SEVERITY_STYLE[p.severity].chip}`}>{p.severity}</span>
            {issue && (
              <a href={issue.permalink} target="_blank" rel="noreferrer" className="font-mono hover:text-accent hover:underline">
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
          <h3 className="mt-1.5 text-base leading-snug font-semibold break-words">{p.title}</h3>
        </div>
        {p.status === "proposed" && (
          <form action={decideFix} className="grid shrink-0 grid-cols-2 gap-2 sm:flex">
            <input type="hidden" name="id" value={p.id} />
            <button name="decision" value="approved" className="btn-primary">
              <Check size={16} aria-hidden /> Approve
            </button>
            <button name="decision" value="rejected" className="btn">
              <X size={16} aria-hidden /> Reject
            </button>
          </form>
        )}
        {p.status === "approved" && (
          <form action={markFixDone} className="shrink-0">
            <input type="hidden" name="id" value={p.id} />
            <button className="btn w-full sm:w-auto">
              <CircleCheck size={16} aria-hidden /> Mark done
            </button>
          </form>
        )}
      </div>

      {drafting && (
        <p className="flex items-center gap-2 text-sm text-ink-3">
          <Sparkles size={15} className="animate-pulse text-accent" aria-hidden /> Claude is drafting the root cause and
          fix…
        </p>
      )}
      {p.evidence.draft_error && (
        <Notice tone="warning">Couldn&apos;t draft with Claude: {p.evidence.draft_error}</Notice>
      )}
      {(p.summary || p.suggested_fix || p.evidence.how_to_test) &&
        (p.status === "proposed" ? (
          <Draft p={p} />
        ) : (
          // Once decided, the draft lives in the GitHub issue; keep the card short.
          <details className="group">
            <summary className="cursor-pointer text-xs font-medium text-ink-2 hover:text-ink">
              <span className="group-open:hidden">Show root cause, fix and test steps</span>
              <span className="hidden group-open:inline">Hide the draft</span>
            </summary>
            <div className="mt-3">
              <Draft p={p} />
            </div>
          </details>
        ))}

      {issue && (
        <details className="group text-sm">
          <summary className="cursor-pointer text-xs font-medium text-ink-2 hover:text-ink">
            <span className="group-open:hidden">Show evidence</span>
            <span className="hidden group-open:inline">Hide evidence</span>
          </summary>
          <pre className="mt-2 max-h-96 overflow-auto rounded-xl bg-surface-2 p-3 font-mono text-xs whitespace-pre-wrap text-ink-2">
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
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line pt-3 text-xs text-ink-3">
          {p.decided_by && (
            <span>
              {p.status === "done" ? "Done" : p.status === "rejected" ? "Rejected" : "Approved"} by {p.decided_by}
              {p.decided_via === "telegram" ? " in Telegram" : ""}
              {p.decided_at ? ` · ${formatTimeIST(p.decided_at)}` : ""}
            </span>
          )}
          {p.github_issue_url && (
            <a
              href={p.github_issue_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-medium text-accent hover:underline"
            >
              GitHub issue #{p.github_issue_number} <ExternalLink size={12} aria-hidden />
            </a>
          )}
        </p>
      )}
    </article>
  );
}

function Draft({ p }: { p: FixProposal }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {p.summary && <Block icon={Search} label="Root cause" text={p.summary} />}
      {p.suggested_fix && <Block icon={Lightbulb} label="Suggested fix" text={p.suggested_fix} />}
      {p.evidence.how_to_test && <Block icon={FlaskConical} label="How to test" text={p.evidence.how_to_test} />}
    </div>
  );
}

function Block({ icon: Icon, label, text }: { icon: LucideIcon; label: string; text: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-surface-2 p-3.5">
      <p className="eyebrow flex items-center gap-1.5">
        <Icon size={13} aria-hidden /> {label}
      </p>
      <p className="mt-1.5 text-sm leading-relaxed break-words whitespace-pre-wrap text-ink">{text}</p>
    </div>
  );
}
