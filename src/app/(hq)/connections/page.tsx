import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { connectionStatus } from "@/lib/connections";

export const metadata = { title: "Connections · MarinePrep HQ" };

export default function ConnectionsPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Connections</h1>
        <p className="text-sm text-ink-2">
          Which services HQ can reach. Keys live in the server environment and are never shown here.
        </p>
      </header>
      <Suspense fallback={<p className="text-sm text-ink-3">Checking…</p>}>
        <ConnectionList />
      </Suspense>
    </div>
  );
}

async function ConnectionList() {
  await requireAdmin();
  const rows = connectionStatus();
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {rows.map((c) => (
        <li key={c.name} className="card flex flex-col gap-2 p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-medium">{c.name}</h2>
            <span
              className={`rounded px-2 py-0.5 text-xs font-medium ${
                c.ready ? "bg-good/15 text-good" : "bg-warning/15 text-warning"
              }`}
            >
              {c.ready ? "✓ Configured" : "Not set up"}
            </span>
          </div>
          <p className="text-sm text-ink-2">{c.purpose}</p>
          {!c.ready && (
            <p className="text-xs text-ink-3">
              Missing: <code className="font-mono">{c.missing.join(", ")}</code>
            </p>
          )}
          {c.ready && c.missingOptional.length > 0 && (
            <p className="text-xs text-ink-3">
              Optional, not set: <code className="font-mono">{c.missingOptional.join(", ")}</code>
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
