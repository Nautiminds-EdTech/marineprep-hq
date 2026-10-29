"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { cleanHtml, readingMinutes, type PostFields } from "@/lib/seo/content";

const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

/** The post roughly as marineprep.app/blogs/<slug> shows it: dark page, Outfit headings, aqua links. */
export function SitePreview({ f, publishedAt, onClose }: { f: PostFields; publishedAt: string | null; onClose: () => void }) {
  const [width, setWidth] = useState<"phone" | "desktop">("desktop");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div role="dialog" aria-modal="true" aria-label="Preview on marineprep.app" className="fixed inset-0 z-50 flex flex-col bg-black/70 backdrop-blur-sm">
      <div className="flex items-center gap-2 bg-surface px-4 py-2.5" style={{ paddingTop: "max(0.625rem, env(safe-area-inset-top, 0px))" }}>
        <p className="text-sm font-semibold">Preview</p>
        <div className="ml-2 hidden gap-1 rounded-xl bg-surface-2 p-1 text-xs sm:flex">
          {(["desktop", "phone"] as const).map((w) => (
            <button key={w} onClick={() => setWidth(w)} aria-pressed={width === w} className={`rounded-lg px-2.5 py-1 capitalize ${width === w ? "bg-surface font-semibold shadow-sm" : "text-ink-2"}`}>
              {w}
            </button>
          ))}
        </div>
        <button type="button" onClick={onClose} className="btn btn-sm ml-auto" aria-label="Close preview">
          <X size={16} aria-hidden /> Close
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <article className={`site-preview mx-auto min-h-full px-5 py-10 sm:px-8 ${width === "phone" ? "max-w-[390px]" : "max-w-4xl"}`}>
          <p className="sp-back">← Back to blogs</p>
          <h1 className="sp-title">{f.title || "Untitled post"}</h1>
          <p className="sp-meta">
            {dateFmt.format(publishedAt ? new Date(publishedAt) : new Date())} · {readingMinutes(f.content_html)} min read
          </p>
          {f.image_url && (
            // eslint-disable-next-line @next/next/no-img-element -- Storage URL
            <img src={f.image_url} alt={f.image_alt} className="sp-hero" />
          )}
          <div className="sp-body" dangerouslySetInnerHTML={{ __html: cleanHtml(f.content_html) }} />
        </article>
      </div>
    </div>
  );
}
