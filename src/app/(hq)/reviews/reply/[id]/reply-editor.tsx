"use client";

import { Check, CircleCheck, RotateCcw, Send, Sparkles, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { discardReplyAction, redraftReplyAction, saveReplyAction, sendReplyAction } from "../../actions";

type Status = "draft" | "sending" | "sent" | "failed" | "discarded";

export function ReplyEditor(props: {
  id: number;
  initial: string;
  initialFollowup: boolean;
  status: Status;
  error: string | null;
  decided: string | null;
  editedBy: string | null;
  store: string;
  limit: number;
  email: string;
}) {
  const { id, limit, email } = props;
  const router = useRouter();
  const [text, setText] = useState(props.initial);
  const [instruction, setInstruction] = useState("");
  const [message, setMessage] = useState<{ tone: "good" | "critical"; text: string } | null>(
    props.status === "failed" && props.error ? { tone: "critical", text: `Last attempt failed: ${props.error}` } : null,
  );
  const [busy, start] = useTransition();
  const open = props.status === "draft" || props.status === "failed";

  const length = text.trim().length;
  const hasEmail = text.includes(email);
  const warning = length > limit ? `${length - limit} characters over the limit.` : null;
  const changed = text !== props.initial;

  function act(fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
    setMessage(null);
    start(async () => {
      const r = await fn();
      setMessage(r.ok ? { tone: "good", text: ok } : { tone: "critical", text: r.error ?? "Something went wrong." });
      if (r.ok) router.refresh();
    });
  }

  if (!open) {
    return (
      <section className="card flex flex-col gap-3 p-4">
        <p className={`flex items-center gap-2 text-sm font-semibold ${props.status === "sent" ? "text-good" : "text-ink-2"}`}>
          {props.status === "sent" ? <CircleCheck size={16} aria-hidden /> : <Trash2 size={16} aria-hidden />}
          {props.status === "sent" ? `Sent to ${props.store}` : props.status === "sending" ? "Sending…" : "Discarded"}
          {props.decided && <span className="font-normal text-ink-3">by {props.decided}</span>}
        </p>
        <p className="rounded-xl bg-surface-2 p-3 text-sm whitespace-pre-wrap">{props.initial}</p>
        {props.status === "sent" && props.store === "App Store" && (
          <p className="text-xs text-ink-3">Apple checks replies before they appear, usually within a day.</p>
        )}
      </section>
    );
  }

  return (
    <section className="card flex flex-col gap-3 p-4">
      <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-2">
        <span className="flex items-baseline justify-between">
          Reply
          <span className={`text-xs font-normal ${length > limit ? "text-critical" : length > limit - 30 ? "text-warning" : "text-ink-3"}`}>
            {length} / {limit}
          </span>
        </span>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} className="field text-[15px] leading-relaxed text-ink" />
      </label>
      <p className="text-xs text-ink-3">
        {hasEmail
          ? `Asks them to write to ${email}: ${props.initialFollowup ? "Claude judged this review needs details or investigation." : "added in your edit."}`
          : props.initialFollowup
            ? `Claude had asked them to write to ${email}; your edit removed it.`
            : "No support email: Claude judged this review doesn't need follow-up."}
      </p>
      {props.editedBy && <p className="text-xs text-ink-3">Last edited by {props.editedBy}.</p>}
      {warning && <p className="rounded-xl bg-warning-soft px-3 py-2 text-sm text-ink">{warning}</p>}
      {message && (
        <p role={message.tone === "critical" ? "alert" : "status"} className={`rounded-xl px-3 py-2 text-sm ${message.tone === "critical" ? "bg-critical-soft text-critical" : "bg-good-soft text-good"}`}>
          {message.text}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-primary"
          disabled={busy || length === 0 || length > limit}
          onClick={() => confirm(`Post this reply publicly on ${props.store}?`) && act(() => sendReplyAction(id, text), `Sent to ${props.store}.`)}
        >
          <Send size={16} aria-hidden /> {props.status === "failed" ? "Try again" : "Approve & send"}
        </button>
        <button type="button" className="btn" disabled={busy || !changed || length === 0 || length > limit} onClick={() => act(() => saveReplyAction(id, text), "Saved. The Telegram message shows this version now.")}>
          <Check size={16} aria-hidden /> Save
        </button>
        {changed && (
          <button type="button" className="btn" disabled={busy} onClick={() => setText(props.initial)}>
            <RotateCcw size={16} aria-hidden /> Undo changes
          </button>
        )}
        <button type="button" className="btn ml-auto text-critical" disabled={busy} onClick={() => confirm("Discard this reply?") && act(() => discardReplyAction(id), "Discarded.")}>
          <Trash2 size={16} aria-hidden /> Discard
        </button>
      </div>

      <div className="mt-1 flex flex-col gap-2 border-t border-line pt-3">
        <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-2">
          Ask Claude for a new draft (optional instruction)
          <input value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="e.g. mention the new chapter tests, keep it shorter" className="field py-2 text-sm" />
        </label>
        <button
          type="button"
          className="btn btn-sm self-start"
          disabled={busy}
          onClick={() =>
            act(async () => {
              const r = await redraftReplyAction(id, instruction);
              if (r.ok) setInstruction("");
              return r;
            }, "New draft ready.")
          }
        >
          <Sparkles size={15} aria-hidden /> {busy ? "Working…" : "Redraft"}
        </button>
      </div>
    </section>
  );
}
