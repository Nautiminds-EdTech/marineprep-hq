"use client";

import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Sparkles,
  Strikethrough,
  Table,
  Underline,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { ASSIST_LABELS, type AssistKind } from "@/lib/seo/assist-kinds";
import { compressToWebp } from "./image-utils";

export type Uploader = (file: File) => Promise<string>;
export type Assistant = (kind: AssistKind, selection: string) => Promise<string>;

/** HTML of the current selection (block-level where possible, so headings and lists survive a rewrite). */
function selectionHtml(editor: Editor) {
  const { from, to } = editor.state.selection;
  if (from === to) return "";
  const slice = editor.state.doc.slice(from, to);
  const div = document.createElement("div");
  const serializer = editor.view.someProp("clipboardSerializer") ?? null;
  if (serializer) div.appendChild(serializer.serializeFragment(slice.content));
  else div.textContent = editor.state.doc.textBetween(from, to, "\n");
  return div.innerHTML;
}

export function RichText({
  initialHtml,
  onReady,
  onChange,
  upload,
  assistant,
}: {
  initialHtml: string;
  /** The editor's own HTML for initialHtml (TipTap normalises markup), so loading isn't an edit. */
  onReady: (html: string) => void;
  onChange: (html: string) => void;
  upload: Uploader;
  assistant: Assistant;
}) {
  const [pendingImage, setPendingImage] = useState<{ file: File; preview: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: { openOnClick: false, autolink: true, HTMLAttributes: { target: null, rel: null } },
        // The trailing empty paragraph it adds would make every post "changed" on open.
        trailingNode: false,
      }),
      // No base64: pasted data: images are dropped, and files go through upload instead.
      Image.configure({ allowBase64: false, inline: false }),
      TableKit.configure({ table: { resizable: false } }),
    ],
    content: initialHtml,
    editorProps: {
      attributes: { class: "post-body min-h-[50vh] px-4 py-5 outline-none sm:px-6", "aria-label": "Post body" },
      handlePaste: (_view, event) => takeImage(event.clipboardData?.files),
      handleDrop: (_view, event) => takeImage((event as DragEvent).dataTransfer?.files),
    },
    onCreate: ({ editor }) => onReady(editor.getHTML()),
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  function takeImage(files?: FileList | null) {
    const file = files && [...files].find((f) => f.type.startsWith("image/"));
    if (!file) return false;
    setPendingImage({ file, preview: URL.createObjectURL(file) });
    return true;
  }

  if (!editor) return <div className="skeleton min-h-[50vh]" aria-hidden />;

  return (
    <div className="card overflow-hidden">
      <Toolbar editor={editor} onPickImage={(f) => setPendingImage({ file: f, preview: URL.createObjectURL(f) })} assistant={assistant} onError={setError} />
      {editor.isActive("image") && <ImageAltBar editor={editor} />}
      {error && (
        <p role="alert" className="border-b border-line bg-critical-soft px-4 py-2 text-sm text-critical">
          {error}
        </p>
      )}
      {pendingImage && (
        <ImageDialog
          pending={pendingImage}
          onCancel={() => {
            URL.revokeObjectURL(pendingImage.preview);
            setPendingImage(null);
          }}
          onInsert={async (alt) => {
            const { file, width, height } = await compressToWebp(pendingImage.file);
            const src = await upload(file);
            editor.chain().focus().setImage({ src, alt, width, height }).run();
            URL.revokeObjectURL(pendingImage.preview);
            setPendingImage(null);
          }}
        />
      )}
      <EditorContent editor={editor} />
    </div>
  );
}

function Btn({ icon: Icon, label, active, onClick, disabled }: { icon: LucideIcon; label: string; active?: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors disabled:opacity-40 ${
        active ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-surface-2 hover:text-ink"
      }`}
    >
      <Icon size={17} strokeWidth={2} aria-hidden />
    </button>
  );
}

const Sep = () => <span className="mx-1 h-5 w-px shrink-0 bg-line" aria-hidden />;

function Toolbar({ editor, onPickImage, assistant, onError }: { editor: Editor; onPickImage: (f: File) => void; assistant: Assistant; onError: (e: string | null) => void }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      link: e.isActive("link"),
      table: e.isActive("table"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
      hasSelection: !e.state.selection.empty,
    }),
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [assistOpen, setAssistOpen] = useState(false);
  const c = () => editor.chain().focus();

  return (
    <div className="sticky top-0 z-10 border-b border-line bg-surface/95 backdrop-blur">
      <div className="flex items-center gap-0.5 overflow-x-auto px-2 py-1.5">
        <Btn icon={Bold} label="Bold" active={s.bold} onClick={() => c().toggleBold().run()} />
        <Btn icon={Italic} label="Italic" active={s.italic} onClick={() => c().toggleItalic().run()} />
        <Btn icon={Underline} label="Underline" active={s.underline} onClick={() => c().toggleUnderline().run()} />
        <Btn icon={Strikethrough} label="Strikethrough" active={s.strike} onClick={() => c().toggleStrike().run()} />
        <Sep />
        <Btn icon={Heading2} label="Section heading (H2)" active={s.h2} onClick={() => c().toggleHeading({ level: 2 }).run()} />
        <Btn icon={Heading3} label="Sub-heading (H3)" active={s.h3} onClick={() => c().toggleHeading({ level: 3 }).run()} />
        <Btn icon={List} label="Bullet list" active={s.bullet} onClick={() => c().toggleBulletList().run()} />
        <Btn icon={ListOrdered} label="Numbered list" active={s.ordered} onClick={() => c().toggleOrderedList().run()} />
        <Btn icon={Quote} label="Quote" active={s.quote} onClick={() => c().toggleBlockquote().run()} />
        <Sep />
        <Btn icon={Link2} label="Link" active={s.link || linkOpen} onClick={() => setLinkOpen((o) => !o)} />
        <Btn icon={ImagePlus} label="Image" onClick={() => fileRef.current?.click()} />
        <Btn icon={Table} label="Table" active={s.table} onClick={() => (s.table ? null : c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())} />
        <Sep />
        <Btn icon={Undo2} label="Undo" disabled={!s.canUndo} onClick={() => c().undo().run()} />
        <Btn icon={Redo2} label="Redo" disabled={!s.canRedo} onClick={() => c().redo().run()} />
        <Sep />
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setAssistOpen((o) => !o)}
          aria-expanded={assistOpen}
          className={`btn-sm inline-flex shrink-0 items-center gap-1.5 rounded-lg font-medium ${assistOpen ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-surface-2"}`}
        >
          <Sparkles size={15} aria-hidden /> Ask Claude
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPickImage(f);
            e.target.value = "";
          }}
        />
      </div>
      {s.table && (
        <div className="flex flex-wrap gap-1.5 border-t border-line px-3 py-1.5 text-xs">
          <span className="self-center text-ink-3">Table:</span>
          <button type="button" className="btn btn-sm" onClick={() => c().addRowAfter().run()}>Add row</button>
          <button type="button" className="btn btn-sm" onClick={() => c().addColumnAfter().run()}>Add column</button>
          <button type="button" className="btn btn-sm" onClick={() => c().deleteRow().run()}>Delete row</button>
          <button type="button" className="btn btn-sm" onClick={() => c().deleteColumn().run()}>Delete column</button>
          <button type="button" className="btn btn-sm text-critical" onClick={() => c().deleteTable().run()}>Delete table</button>
        </div>
      )}
      {linkOpen && <LinkBar editor={editor} onClose={() => setLinkOpen(false)} />}
      {assistOpen && <AssistBar editor={editor} assistant={assistant} hasSelection={s.hasSelection} onError={onError} onClose={() => setAssistOpen(false)} />}
    </div>
  );
}

function LinkBar({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [href, setHref] = useState<string>(() => editor.getAttributes("link").href ?? "");
  const apply = () => {
    const v = href.trim();
    if (!v) editor.chain().focus().extendMarkRange("link").unsetLink().run();
    else {
      // Bare domains become https links; root-relative paths stay as they are.
      const url = /^(https?:\/\/|\/|#|mailto:)/i.test(v) ? v.replace(/^http:\/\//i, "https://") : `https://${v}`;
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }
    onClose();
  };
  return (
    <form
      className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2"
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
    >
      <input autoFocus value={href} onChange={(e) => setHref(e.target.value)} placeholder="https://imu.edu.in/… or /blogs/…" className="field min-w-0 flex-1 py-1.5 text-sm" />
      <button type="submit" className="btn-primary btn-sm">Apply</button>
      {editor.isActive("link") && (
        <button type="button" className="btn btn-sm" onClick={() => { editor.chain().focus().extendMarkRange("link").unsetLink().run(); onClose(); }}>
          Remove link
        </button>
      )}
    </form>
  );
}

function AssistBar({ editor, assistant, hasSelection, onError, onClose }: { editor: Editor; assistant: Assistant; hasSelection: boolean; onError: (e: string | null) => void; onClose: () => void }) {
  const [busy, setBusy] = useState<AssistKind | null>(null);
  const [result, setResult] = useState<{ kind: AssistKind; html: string; range: { from: number; to: number } } | null>(null);

  async function ask(kind: AssistKind) {
    onError(null);
    const { from, to } = editor.state.selection;
    setBusy(kind);
    try {
      const html = await assistant(kind, kind === "faq" ? "" : selectionHtml(editor));
      setResult({ kind, html, range: kind === "faq" ? { from: editor.state.doc.content.size, to: editor.state.doc.content.size } : { from, to } });
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (result) {
    return (
      <div className="flex flex-col gap-2 border-t border-line bg-surface-2/60 px-3 py-3">
        <p className="text-xs font-medium text-ink-2">Claude&apos;s version. Check it before you use it.</p>
        <div className="post-body max-h-72 overflow-y-auto rounded-xl border border-line bg-surface px-4 py-3 text-sm" dangerouslySetInnerHTML={{ __html: result.html }} />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-primary btn-sm"
            onClick={() => {
              editor.chain().focus().insertContentAt(result.range, result.html).run();
              setResult(null);
              onClose();
            }}
          >
            {result.kind === "faq" ? "Add to the end" : "Replace selection"}
          </button>
          <button type="button" className="btn btn-sm" onClick={() => setResult(null)}>Discard</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2">
      {(Object.keys(ASSIST_LABELS) as AssistKind[]).map((k) => {
        const needsSelection = k !== "faq";
        return (
          <button key={k} type="button" disabled={!!busy || (needsSelection && !hasSelection)} onMouseDown={(e) => e.preventDefault()} onClick={() => ask(k)} className="btn btn-sm">
            {busy === k ? "Working…" : ASSIST_LABELS[k]}
          </button>
        );
      })}
      {!hasSelection && <span className="text-xs text-ink-3">Select text to rewrite, shorten or simplify it.</span>}
    </div>
  );
}

function ImageAltBar({ editor }: { editor: Editor }) {
  const alt = (editor.getAttributes("image").alt as string | undefined) ?? "";
  return (
    <label className="flex items-center gap-2 border-b border-line bg-warning-soft/40 px-3 py-2 text-xs text-ink-2">
      Alt text
      <input
        key={editor.getAttributes("image").src}
        defaultValue={alt}
        onBlur={(e) => editor.chain().updateAttributes("image", { alt: e.target.value.trim() }).run()}
        placeholder="What the image shows, for screen readers and Google"
        className="field min-w-0 flex-1 py-1 text-sm"
      />
    </label>
  );
}

function ImageDialog({ pending, onCancel, onInsert }: { pending: { preview: string }; onCancel: () => void; onInsert: (alt: string) => Promise<void> }) {
  const [alt, setAlt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="flex flex-col gap-3 border-b border-line bg-surface-2/60 p-3 sm:flex-row sm:items-start"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await onInsert(alt.trim());
        } catch (err) {
          setError((err as Error).message);
          setBusy(false);
        }
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- local preview of a file before upload */}
      <img src={pending.preview} alt="" className="h-24 w-auto rounded-lg border border-line object-cover" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-2">
          Alt text (required)
          <input autoFocus required minLength={5} value={alt} onChange={(e) => setAlt(e.target.value)} placeholder="e.g. IMU CET 2026 Physics paper, first page" className="field py-1.5 text-sm" />
        </label>
        <p className="text-xs text-ink-3">Saved as WebP, at most 1600px wide.</p>
        {error && <p className="text-xs text-critical">{error}</p>}
        <div className="flex gap-2">
          <button type="submit" disabled={busy} className="btn-primary btn-sm">{busy ? "Uploading…" : "Insert image"}</button>
          <button type="button" onClick={onCancel} className="btn btn-sm">Cancel</button>
        </div>
      </div>
    </form>
  );
}
