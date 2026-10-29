import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { getAppFacts } from "@/lib/settings";
import { formatTimeIST } from "@/lib/time";
import { FactsEditor } from "./facts-editor";

export const metadata = { title: "App facts · MarinePrep HQ" };

export default function AppFactsPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <Link href="/reviews" className="btn btn-sm self-start">
        <ArrowLeft size={15} aria-hidden /> Reviews
      </Link>
      <header>
        <h1 className="text-2xl font-semibold">App facts</h1>
        <p className="mt-1 text-sm text-ink-2">
          What Marine Prep offers right now, in plain words. Claude reads this every time it drafts a review reply, so
          update it when an app release changes what students get (free vs paid, new features, prices). Short dated
          lines work best, e.g. &quot;Free users get one mock test (since the October 2026 update)&quot;.
        </p>
      </header>
      <Suspense fallback={<div className="skeleton h-80" aria-hidden />}>
        <Load />
      </Suspense>
    </div>
  );
}

async function Load() {
  await requireAdmin();
  const facts = await getAppFacts();
  return (
    <FactsEditor
      key={facts.updated_at ?? "default"}
      initial={facts.text}
      note={facts.updated_at ? `Last saved ${formatTimeIST(facts.updated_at)}${facts.updated_by ? ` by ${facts.updated_by}` : ""}.` : "Not saved yet: this is the starting text."}
    />
  );
}
