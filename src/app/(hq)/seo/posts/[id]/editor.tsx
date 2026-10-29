"use client";

import {
  ArrowLeft,
  Archive,
  CalendarClock,
  Check,
  CircleAlert,
  Eye,
  History,
  MoreHorizontal,
  Rocket,
  Trash2,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Menu } from "@/components/menu";
import { CATEGORIES, categoryLabel, checks, postUrl, slugify, type PostFields } from "@/lib/seo/content";
import type { Post } from "@/lib/seo/posts";
import {
  assistAction,
  autosaveAction,
  deleteAction,
  discardAutosaveAction,
  publishAction,
  saveAction,
  scheduleAction,
  statusAction,
  suggestSlugAction,
  uploadImageAction,
  versionAction,
} from "../../actions";
import { HeaderPanel } from "./header-panel";
import { RichText } from "./rich-text";
import { SitePreview } from "./site-preview";

export type Version = { id: number; kind: string; saved_by: string | null; note: string | null; created_at: string };

const timeFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

/** The last autosave; `of` is the JSON of the fields it saved, to tell whether newer edits are pending. */
type SaveState = { kind: "idle" | "saving" | "saved" | "error"; at?: Date; error?: string; of?: string };

export function Editor({ post, saved, versions }: { post: Post; saved: PostFields; versions: Version[] }) {
  const router = useRouter();
  const live = post.status === "published";
  const restored = !!post.pipeline?.autosave;
  const [f, setF] = useState<PostFields>(() => ({ ...saved, ...(post.pipeline?.autosave ?? {}) }));
  // What "no changes" looks like. Its HTML is replaced by the editor's normalised HTML once it loads.
  const [baseline, setBaseline] = useState<PostFields>(saved);
  const [editorKey, setEditorKey] = useState(0);
  const [autosave, setAutosave] = useState<SaveState>(() =>
    restored ? { kind: "saved", at: new Date(post.pipeline!.autosaved_at!), of: JSON.stringify({ ...saved, ...post.pipeline!.autosave }) } : { kind: "idle" },
  );
  const [message, setMessage] = useState<{ tone: "good" | "critical"; text: string } | null>(
    restored ? { tone: "good", text: "Unsaved changes from your last session are back." } : null,
  );
  const [preview, setPreview] = useState(false);
  const [busy, startTransition] = useTransition();
  const slugAuto = useRef(!live && (saved.slug === slugify(saved.title) || saved.slug.startsWith("untitled-post")));

  const current = useMemo(() => JSON.stringify(f), [f]);
  const dirty = current !== JSON.stringify(baseline);
  const pending = dirty && autosave.of !== current;
  const list = useMemo(() => checks(f), [f]);
  const blocking = list.filter((c) => c.blocker && !c.ok);

  const set = useCallback(<K extends keyof PostFields>(key: K, value: PostFields[K]) => setF((prev) => ({ ...prev, [key]: value })), []);

  // Autosave 2.5 s after the last real change. It never touches the live post.
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(async () => {
      setAutosave({ kind: "saving" });
      const r = await autosaveAction(post.id, f);
      setAutosave(r.ok ? { kind: "saved", at: new Date(), of: JSON.stringify(f) } : { kind: "error", error: r.error });
    }, 2500);
    return () => clearTimeout(t);
  }, [f, dirty, post.id]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (pending || autosave.kind === "saving") e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending, autosave.kind]);

  function act(fn: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    setMessage(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setMessage({ tone: "critical", text: r.error ?? "Something went wrong." });
      else {
        setMessage({ tone: "good", text: done });
        router.refresh();
      }
    });
  }

  function load(fields: Partial<PostFields>, note: string) {
    setF((prev) => ({ ...prev, ...fields }));
    if (fields.content_html !== undefined) setEditorKey((k) => k + 1);
    setMessage({ tone: "good", text: note });
  }

  const saveLabel = live ? "Update live post" : "Save draft";

  return (
    <div className="flex flex-col gap-4">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/seo/posts" className="btn btn-sm" aria-label="Back to posts">
          <ArrowLeft size={15} aria-hidden /> Posts
        </Link>
        <StatusChip post={post} />
        <AutosaveText state={autosave} dirty={dirty} pending={pending} />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button type="button" className="btn" onClick={() => setPreview(true)}>
            <Eye size={16} aria-hidden /> Preview
          </button>
          <button type="button" className={live ? "btn-primary" : "btn"} disabled={busy || !dirty} onClick={() => act(() => saveAction(post.id, f), live ? "The live post is updated." : "Draft saved.")}>
            <Check size={16} aria-hidden /> {saveLabel}
          </button>
          {!live && (
            <button
              type="button"
              className="btn-primary"
              disabled={busy || blocking.length > 0}
              title={blocking.length ? `Fix first: ${blocking.map((b) => b.label).join(", ")}` : undefined}
              onClick={() => confirm("Publish this post on marineprep.app now?") && act(() => publishAction(post.id, f), "Published. It's live on marineprep.app.")}
            >
              <Rocket size={16} aria-hidden /> Publish
            </button>
          )}
          <Menu label="More actions" summary={<MoreHorizontal size={18} aria-hidden />}>
            <div className="flex flex-col">
              {live && <MenuButton icon={Undo2} onClick={() => confirm("Take this post off marineprep.app? It becomes a draft.") && act(() => statusAction(post.id, "draft"), "Unpublished. It's a draft again.")}>Unpublish</MenuButton>}
              {post.status !== "archived" && <MenuButton icon={Archive} onClick={() => confirm("Archive this post? It won't show on the site.") && act(() => statusAction(post.id, "archived"), "Archived.")}>Archive</MenuButton>}
              {post.status === "archived" && <MenuButton icon={Undo2} onClick={() => act(() => statusAction(post.id, "draft"), "Moved back to drafts.")}>Move to drafts</MenuButton>}
              {live && (
                <a href={postUrl(post.slug)} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm hover:bg-surface-2">
                  <Eye size={16} className="text-ink-3" aria-hidden /> View on marineprep.app
                </a>
              )}
              <MenuButton
                icon={Trash2}
                danger
                onClick={() => {
                  if (!confirm(`Delete "${f.title}" for good? Its images are removed too.`)) return;
                  startTransition(() => deleteAction(post.id));
                }}
              >
                Delete
              </MenuButton>
            </div>
          </Menu>
        </div>
      </div>

      {message && (
        <p role={message.tone === "critical" ? "alert" : "status"} className={`rounded-xl px-3.5 py-2.5 text-sm ${message.tone === "critical" ? "bg-critical-soft text-critical" : "bg-good-soft text-good"}`}>
          {message.text}
        </p>
      )}
      {live && dirty && (
        <p className="rounded-xl bg-warning-soft px-3.5 py-2.5 text-sm text-ink">
          Your changes are autosaved in HQ only. The live post changes when you press <strong>Update live post</strong>.
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {/* Writing column */}
        <div className="flex min-w-0 flex-col gap-3">
          <textarea
            value={f.title}
            onChange={(e) => {
              const title = e.target.value.replace(/\n/g, " ");
              setF((prev) => ({ ...prev, title, ...(slugAuto.current ? { slug: slugify(title) } : {}) }));
            }}
            onBlur={async () => {
              if (!slugAuto.current) return;
              const r = await suggestSlugAction(post.id, f.title);
              if (r.ok && r.data) set("slug", r.data);
            }}
            rows={2}
            placeholder="Post title"
            aria-label="Title"
            className="w-full resize-none bg-transparent font-display text-2xl leading-tight font-semibold outline-none placeholder:text-ink-3 sm:text-3xl"
          />
          <RichText
            key={editorKey}
            initialHtml={f.content_html}
            onReady={(html) => {
              // Restored autosaves stay "changed"; otherwise the loaded post is the baseline.
              if (restored || editorKey > 0) return;
              setBaseline((b) => ({ ...b, content_html: html }));
              setF((prev) => ({ ...prev, content_html: html }));
            }}
            onChange={(html) => set("content_html", html)}
            upload={async (file) => {
              const fd = new FormData();
              fd.set("file", file);
              fd.set("folder", "editor-images");
              const r = await uploadImageAction(fd);
              if (!r.ok || !r.data) throw new Error(r.ok ? "Upload failed" : r.error);
              return r.data.url;
            }}
            assistant={async (kind, selection) => {
              const r = await assistAction(post.id, kind, { title: f.title, keyword: f.keywords[0] ?? "", selection, postHtml: f.content_html });
              if (!r.ok || !r.data) throw new Error(r.ok ? "No answer" : r.error);
              return r.data;
            }}
          />
        </div>

        {/* Side panels */}
        <aside className="flex min-w-0 flex-col gap-4">
          <GooglePreview f={f} />
          <Checklist list={list} />
          <Details f={f} set={set} live={live} onSlugEdit={() => (slugAuto.current = false)} />
          <HeaderPanel f={f} set={set} />
          {!live && <Schedule post={post} busy={busy} blocked={blocking.length > 0} onSchedule={(at) => act(() => scheduleAction(post.id, f, at), at ? "Scheduled." : "Schedule cleared.")} />}
          <Versions
            versions={versions}
            onLoad={async (v) => {
              const r = await versionAction(post.id, v.id);
              if (r.ok && r.data) load(r.data, `Loaded the version from ${timeFmt.format(new Date(v.created_at))}. Save to keep it.`);
              else setMessage({ tone: "critical", text: r.ok ? "Version not found" : r.error });
            }}
            onDiscard={
              dirty || restored
                ? async () => {
                    await discardAutosaveAction(post.id);
                    setBaseline(saved);
                    load(saved, "Back to the last saved version.");
                    setAutosave({ kind: "idle" });
                  }
                : undefined
            }
          />
        </aside>
      </div>

      {preview && <SitePreview f={f} publishedAt={post.published_at} onClose={() => setPreview(false)} />}
    </div>
  );
}

function MenuButton({ icon: Icon, children, onClick, danger }: { icon: typeof Trash2; children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-surface-2 ${danger ? "text-critical" : ""}`}>
      <Icon size={16} className={danger ? "" : "text-ink-3"} aria-hidden /> {children}
    </button>
  );
}

function StatusChip({ post }: { post: Post }) {
  if (post.pipeline?.state === "awaiting_approval") return <span className="chip bg-warning-soft text-warning">Waiting for approval</span>;
  if (post.status === "published") return <span className="chip bg-good-soft text-good">Live</span>;
  if (post.status === "archived") return <span className="chip bg-surface-2 text-ink-3">Archived</span>;
  return <span className="chip bg-surface-2 text-ink-2">Draft</span>;
}

function AutosaveText({ state, dirty, pending }: { state: SaveState; dirty: boolean; pending: boolean }) {
  const text =
    state.kind === "saving"
      ? "Saving…"
      : state.kind === "error"
        ? `Couldn't autosave: ${state.error}`
        : pending
          ? "Unsaved changes"
          : dirty && state.at
            ? `Autosaved ${timeFmt.format(state.at)}`
            : "All changes saved";
  return (
    <span className={`text-xs ${state.kind === "error" ? "text-critical" : "text-ink-3"}`} aria-live="polite">
      {text}
    </span>
  );
}

function Panel({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="card flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function GooglePreview({ f }: { f: PostFields }) {
  const title = f.seo_title || f.title || "Post title";
  const desc = f.meta_description || f.excerpt || "Write a meta description: it's what Google shows under the title.";
  return (
    <Panel title="In Google">
      <div className="rounded-xl bg-white p-3 text-left [color-scheme:light]">
        <p className="truncate text-xs text-[#4d5156]">marineprep.app › blogs › {f.slug || "…"}</p>
        <p className="mt-0.5 line-clamp-1 text-lg leading-snug text-[#1a0dab]">{title.length > 60 ? `${title.slice(0, 58)}…` : title}</p>
        <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-[#4d5156]">{desc.length > 158 ? `${desc.slice(0, 155)}…` : desc}</p>
      </div>
    </Panel>
  );
}

function Checklist({ list }: { list: ReturnType<typeof checks> }) {
  const passed = list.filter((c) => c.ok).length;
  return (
    <Panel title="Checklist" action={<span className="text-xs text-ink-3">{passed} of {list.length}</span>}>
      <ul className="flex flex-col gap-1.5">
        {list.map((c) => (
          <li key={c.id} className="flex items-start gap-2 text-[13px]">
            {c.ok ? (
              <Check size={15} className="mt-0.5 shrink-0 text-good" aria-label="Passes" />
            ) : c.blocker ? (
              <CircleAlert size={15} className="mt-0.5 shrink-0 text-critical" aria-label="Must fix before publishing" />
            ) : (
              <TriangleAlert size={15} className="mt-0.5 shrink-0 text-warning" aria-label="Should fix" />
            )}
            <span className={c.ok ? "text-ink-2" : "text-ink"}>
              {c.label}
              {c.detail && <span className="text-ink-3"> · {c.detail}</span>}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Counter({ n, min, max }: { n: number; min?: number; max: number }) {
  const ok = n <= max && (min === undefined || n >= min);
  return <span className={`text-[11px] ${ok ? "text-ink-3" : "text-warning"}`}>{min ? `${n} / ${min}–${max}` : `${n} / ${max}`}</span>;
}

function Details({ f, set, live, onSlugEdit }: { f: PostFields; set: <K extends keyof PostFields>(k: K, v: PostFields[K]) => void; live: boolean; onSlugEdit: () => void }) {
  const label = "flex flex-col gap-1 text-xs font-medium text-ink-2";
  return (
    <Panel title="Details">
      <label className={label}>
        <span className="flex justify-between">Slug {live && <span className="font-normal text-ink-3">locked while live</span>}</span>
        <input
          value={f.slug}
          readOnly={live}
          onChange={(e) => {
            onSlugEdit();
            set("slug", slugify(e.target.value.replace(/\s/g, "-"), 120) + (e.target.value.endsWith("-") ? "-" : ""));
          }}
          className="field py-2 font-mono text-[13px] read-only:opacity-70"
        />
      </label>
      <label className={label}>
        <span className="flex justify-between">SEO title <Counter n={(f.seo_title || f.title).length} max={60} /></span>
        <input value={f.seo_title} onChange={(e) => set("seo_title", e.target.value)} placeholder={f.title} className="field py-2 text-sm" />
      </label>
      <label className={label}>
        <span className="flex justify-between">Meta description <Counter n={f.meta_description.length} min={140} max={155} /></span>
        <textarea value={f.meta_description} onChange={(e) => set("meta_description", e.target.value.replace(/\n/g, " "))} rows={3} className="field py-2 text-sm" />
      </label>
      <label className={label}>
        Excerpt (blog list cards)
        <textarea value={f.excerpt} onChange={(e) => set("excerpt", e.target.value.replace(/\n/g, " "))} rows={2} className="field py-2 text-sm" />
      </label>
      <label className={label}>
        Keywords (first one is the main keyword)
        <input
          key={f.keywords.join(",")}
          defaultValue={f.keywords.join(", ")}
          onBlur={(e) => set("keywords", e.target.value.split(",").map((k) => k.trim()).filter(Boolean))}
          placeholder="imu cet syllabus, imu cet 2027"
          className="field py-2 text-sm"
        />
      </label>
      <label className={label}>
        Category
        <select value={f.category} onChange={(e) => set("category", e.target.value)} className="field py-2 text-sm">
          <option value="">Choose…</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {categoryLabel(c)}
            </option>
          ))}
        </select>
      </label>
    </Panel>
  );
}

function Schedule({ post, busy, blocked, onSchedule }: { post: Post; busy: boolean; blocked: boolean; onSchedule: (at: string | null) => void }) {
  const current = post.pipeline?.scheduled_for;
  const [day, setDay] = useState(current ? new Date(current).toISOString().slice(0, 10) : "");
  return (
    <Panel title="Schedule">
      {current && (
        <p className="flex items-center gap-2 text-sm">
          <CalendarClock size={15} className="text-accent" aria-hidden /> Publishes on {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(new Date(current))} at 09:00 IST
        </p>
      )}
      <div className="flex gap-2">
        <input type="date" value={day} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDay(e.target.value)} className="field min-w-0 flex-1 py-2 text-sm" aria-label="Publish date" />
        <button type="button" className="btn" disabled={busy || !day || blocked} onClick={() => onSchedule(`${day}T03:30:00Z`)}>
          Schedule
        </button>
      </div>
      {current && (
        <button type="button" className="btn btn-sm self-start" disabled={busy} onClick={() => onSchedule(null)}>
          Clear schedule
        </button>
      )}
      <p className="text-xs text-ink-3">The daily run at 09:00 IST publishes it. Fix the red checklist items first.</p>
    </Panel>
  );
}

function Versions({ versions, onLoad, onDiscard }: { versions: Version[]; onLoad: (v: Version) => void; onDiscard?: () => void }) {
  const [open, setOpen] = useState(false);
  const shown = open ? versions : versions.slice(0, 4);
  return (
    <Panel title="Version history" action={<History size={15} className="text-ink-3" aria-hidden />}>
      {onDiscard && (
        <button type="button" className="btn btn-sm self-start" onClick={onDiscard}>
          Discard unsaved changes
        </button>
      )}
      {versions.length === 0 ? (
        <p className="text-sm text-ink-3">Saved versions show up here.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {shown.map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-2 py-2 text-[13px]">
              <span className="min-w-0">
                <span className="block">{timeFmt.format(new Date(v.created_at))}</span>
                <span className="block truncate text-xs text-ink-3">
                  {v.note ?? { saved: "Saved", published: "Live update", ai: "Claude edit", restored: "Restored" }[v.kind] ?? v.kind}
                  {v.saved_by ? ` · ${v.saved_by}` : ""}
                </span>
              </span>
              <button type="button" className="btn btn-sm" onClick={() => onLoad(v)}>
                Load
              </button>
            </li>
          ))}
        </ul>
      )}
      {versions.length > 4 && (
        <button type="button" className="text-xs text-accent" onClick={() => setOpen((o) => !o)}>
          {open ? "Show fewer" : `Show all ${versions.length}`}
        </button>
      )}
    </Panel>
  );
}
