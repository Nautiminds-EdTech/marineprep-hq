"use client";

import { ImageUp, Wand2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactCrop, { centerCrop, makeAspectCrop, type Crop, type PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { categoryLabel, type PostFields } from "@/lib/seo/content";
import { headerImageAction, uploadImageAction } from "../../actions";
import { cropHeader } from "./image-utils";

// Kept in step with DOODLES in src/lib/seo/header-image.tsx (that file is server-only).
const DOODLES = ["compass", "lighthouse", "ship", "anchor", "lifering", "paperboat", "books", "stopwatch", "wheel"] as const;
const DOODLE_LABEL: Record<(typeof DOODLES)[number], string> = {
  compass: "Compass",
  lighthouse: "Lighthouse",
  ship: "Ship",
  anchor: "Anchor",
  lifering: "Life ring",
  paperboat: "Paper boat",
  books: "Stack of books",
  stopwatch: "Stopwatch",
  wheel: "Ship's wheel",
};

type Set = <K extends keyof PostFields>(k: K, v: PostFields[K]) => void;

export function HeaderPanel({ f, set }: { f: PostFields; set: Set }) {
  const [mode, setMode] = useState<"make" | "upload">("make");
  return (
    <section className="card flex flex-col gap-3 p-4">
      <h2 className="text-sm font-semibold">Header image</h2>
      {f.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element -- Storage URL
        <img src={f.image_url} alt={f.image_alt} className="aspect-[1200/630] w-full rounded-xl border border-line object-cover" />
      ) : (
        <p className="rounded-xl bg-surface-2 p-3 text-xs text-ink-3">No header image yet. Make one in the house style or upload your own.</p>
      )}
      {f.image_url && (
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-2">
          Alt text
          <input value={f.image_alt} onChange={(e) => set("image_alt", e.target.value)} placeholder="What the image shows" className="field py-2 text-sm" />
        </label>
      )}
      <div className="flex gap-1 rounded-xl bg-surface-2 p-1 text-xs" role="tablist">
        {(["make", "upload"] as const).map((m) => (
          <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 ${mode === m ? "bg-surface font-semibold text-ink shadow-sm" : "text-ink-2"}`}>
            {m === "make" ? <Wand2 size={14} aria-hidden /> : <ImageUp size={14} aria-hidden />}
            {m === "make" ? "Make one" : "Upload"}
          </button>
        ))}
      </div>
      {mode === "make" ? <MakeHeader f={f} set={set} /> : <UploadHeader set={set} />}
    </section>
  );
}

function MakeHeader({ f, set }: { f: PostFields; set: Set }) {
  const [headline, setHeadline] = useState(() => (f.title.length <= 46 ? f.title : ""));
  const [mark, setMark] = useState("");
  const [doodle, setDoodle] = useState<(typeof DOODLES)[number]>("compass");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const words = useMemo(() => [...new Set(headline.split(/\s+/).map((w) => w.replace(/[,?!:;.]+$/, "")).filter((w) => w.length > 2))], [headline]);

  // Debounced live preview from the admin-only render route.
  const params = new URLSearchParams({ slug: f.slug || "preview", headline: headline || "Your headline here", mark, category: categoryLabel(f.category || "notes"), doodle }).toString();
  const [src, setSrc] = useState(params);
  useEffect(() => {
    const t = setTimeout(() => setSrc(params), 600);
    return () => clearTimeout(t);
  }, [params]);

  return (
    <div className="flex flex-col gap-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element -- generated preview */}
      <img src={`/api/seo/header-image?${src}`} alt="Preview of the generated header" className="aspect-[1200/630] w-full rounded-xl border border-line bg-surface-2 object-cover" />
      <label className="flex flex-col gap-1 text-xs font-medium text-ink-2">
        <span className="flex justify-between">Headline on the image <span className={`font-normal ${headline.length > 46 ? "text-warning" : "text-ink-3"}`}>{headline.length} / 46</span></span>
        <input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Short: under 46 characters reads best" className="field py-2 text-sm" />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-2">
          Highlight
          <select value={mark} onChange={(e) => setMark(e.target.value)} className="field py-2 text-sm">
            <option value="">No highlight</option>
            {words.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-2">
          Doodle
          <select value={doodle} onChange={(e) => setDoodle(e.target.value as typeof doodle)} className="field py-2 text-sm">
            {DOODLES.map((d) => (
              <option key={d} value={d}>
                {DOODLE_LABEL[d]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-xs text-ink-3">The handwritten note is the post&apos;s category{f.category ? `: "${categoryLabel(f.category)}"` : ""}.</p>
      {error && <p className="text-xs text-critical">{error}</p>}
      <button
        type="button"
        className="btn-primary"
        disabled={busy || !headline.trim()}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const r = await headerImageAction({ slug: f.slug, headline, mark, category: f.category, doodle });
          setBusy(false);
          if (!r.ok || !r.data) return setError(r.ok ? "No image" : r.error);
          set("image_url", r.data.url);
          if (!f.image_alt.trim()) set("image_alt", `Marine Prep blog header: "${headline.trim()}", with a pencil sketch of a ${DOODLE_LABEL[doodle].toLowerCase()}`);
        }}
      >
        {busy ? "Making it…" : "Use this image"}
      </button>
    </div>
  );
}

function UploadHeader({ set }: { set: Set }) {
  const [src, setSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>();
  const [area, setArea] = useState<PixelCrop>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  return (
    <div className="flex flex-col gap-2.5">
      <input
        type="file"
        accept="image/*"
        className="text-xs file:mr-2 file:rounded-lg file:border file:border-line file:bg-surface file:px-2.5 file:py-1.5 file:text-xs"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          if (!file.type.startsWith("image/")) return setError("That isn't an image.");
          setError(null);
          if (src) URL.revokeObjectURL(src);
          setSrc(URL.createObjectURL(file));
        }}
      />
      {src && (
        <>
          <ReactCrop crop={crop} onChange={(_, pct) => setCrop(pct)} onComplete={setArea} aspect={1200 / 630} keepSelection>
            {/* eslint-disable-next-line @next/next/no-img-element -- local file being cropped */}
            <img
              ref={imgRef}
              src={src}
              alt="Image to crop"
              onLoad={(e) => {
                const { width, height } = e.currentTarget;
                setCrop(centerCrop(makeAspectCrop({ unit: "%", width: 100 }, 1200 / 630, width, height), width, height));
              }}
            />
          </ReactCrop>
          <p className="text-xs text-ink-3">Cropped to 1200×630 and saved as JPEG.</p>
          {error && <p className="text-xs text-critical">{error}</p>}
          <button
            type="button"
            className="btn-primary"
            disabled={busy || !area?.width}
            onClick={async () => {
              const img = imgRef.current;
              if (!img || !area) return;
              setBusy(true);
              setError(null);
              try {
                const sx = img.naturalWidth / img.width;
                const sy = img.naturalHeight / img.height;
                const file = await cropHeader(img, { x: area.x * sx, y: area.y * sy, width: area.width * sx, height: area.height * sy });
                const fd = new FormData();
                fd.set("file", file);
                fd.set("folder", "header-images");
                const r = await uploadImageAction(fd);
                if (!r.ok || !r.data) throw new Error(r.ok ? "Upload failed" : r.error);
                set("image_url", r.data.url);
                URL.revokeObjectURL(src);
                setSrc(null);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Uploading…" : "Use this crop"}
          </button>
        </>
      )}
    </div>
  );
}
