import { CircleCheck, CircleDashed } from "lucide-react";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { requireAdmin } from "@/lib/auth";
import { connectionStatus } from "@/lib/connections";

export const metadata = { title: "Connections · MarinePrep HQ" };

export default function ConnectionsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Connections"
        description="Which services HQ can reach. Keys live in the server environment and are never shown here."
      />
      <Suspense
        fallback={
          <div className="grid gap-3 md:grid-cols-2" aria-hidden>
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="skeleton h-28" />
            ))}
          </div>
        }
      >
        <ConnectionList />
      </Suspense>
    </div>
  );
}

async function ConnectionList() {
  await requireAdmin();
  const rows = connectionStatus();
  const ready = rows.filter((c) => c.ready).length;
  return (
    <>
      <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-6 sm:p-5">
        <p className="shrink-0">
          <span className="display-num text-4xl">{ready}</span>
          <span className="ml-1 text-sm text-ink-3">of {rows.length} connected</span>
        </p>
        <div className="flex flex-1 gap-1" aria-hidden>
          {rows.map((c) => (
            <span key={c.name} className={`h-2 flex-1 rounded-full ${c.ready ? "bg-good" : "bg-warning"}`} />
          ))}
        </div>
      </div>
      <ul className="grid gap-3 md:grid-cols-2">
        {rows.map((c) => (
          <li key={c.name} className="card flex gap-3 p-4">
            {c.ready ? (
              <CircleCheck size={20} className="mt-0.5 shrink-0 text-good" aria-hidden />
            ) : (
              <CircleDashed size={20} className="mt-0.5 shrink-0 text-warning" aria-hidden />
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold">{c.name}</h2>
                <span className={`chip ${c.ready ? "bg-good-soft text-good" : "bg-warning-soft text-warning"}`}>
                  {c.ready ? "Configured" : "Not set up"}
                </span>
              </div>
              <p className="text-sm text-ink-2">{c.purpose}</p>
              {!c.ready && (
                <p className="text-xs break-words text-ink-3">
                  Missing: <code className="font-mono">{c.missing.join(", ")}</code>
                </p>
              )}
              {c.ready && c.missingOptional.length > 0 && (
                <p className="text-xs break-words text-ink-3">
                  Optional, not set: <code className="font-mono">{c.missingOptional.join(", ")}</code>
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
