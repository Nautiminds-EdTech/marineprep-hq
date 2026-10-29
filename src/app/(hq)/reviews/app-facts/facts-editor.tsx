"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveAppFactsAction } from "../actions";

export function FactsEditor({ initial, note }: { initial: string; note: string }) {
  const router = useRouter();
  const [text, setText] = useState(initial);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();
  return (
    <section className="card flex flex-col gap-3 p-4">
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={16} maxLength={8000} aria-label="App facts" className="field font-mono text-[13px] leading-relaxed" />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn-primary"
          disabled={busy || text === initial || !text.trim()}
          onClick={() =>
            start(async () => {
              const r = await saveAppFactsAction(text);
              setMessage(r.ok ? { ok: true, text: "Saved. New drafts use it straight away." } : { ok: false, text: r.error });
              if (r.ok) router.refresh();
            })
          }
        >
          <Check size={16} aria-hidden /> {busy ? "Saving…" : "Save"}
        </button>
        <span className="text-xs text-ink-3">{note}</span>
      </div>
      {message && <p className={`rounded-xl px-3 py-2 text-sm ${message.ok ? "bg-good-soft text-good" : "bg-critical-soft text-critical"}`}>{message.text}</p>}
    </section>
  );
}
