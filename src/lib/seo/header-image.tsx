import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import rough from "roughjs";
import type { Drawable } from "roughjs/bin/core";
import type { RoughGenerator } from "roughjs/bin/generator";
import { createServiceClient } from "@/lib/supabase/server";

// Blog header images in the "logbook" style: cream chart paper with a faint grid, depth contours
// seeded from the slug, a pencil doodle, the category as a handwritten note with an arrow, one
// headline word under a highlighter swipe, and the logo with "Marine Prep". 1200x630, used as both
// the post's hero and its og:image. Claude picks only the text fields and the doodle.

export const DOODLES = ["compass", "lighthouse", "ship", "anchor", "lifering", "paperboat", "books", "stopwatch", "wheel"] as const;
export type Doodle = (typeof DOODLES)[number];

export type HeaderSpec = {
  slug: string;
  /** Short headline, ideally under 45 characters. */
  headline: string;
  /** One word of the headline to highlight; ignored if it isn't in the headline. */
  mark?: string;
  /** Lowercase, a word or two: "exam guide", "careers". */
  category: string;
  doodle: Doodle;
};

const W = 1200;
const H = 630;
const C = { chart: "#F5F1E3", ink: "#1B2A33", pencil: "#3B4A52", ocean: "#1565C0", marine: "#26C6DA" };

const ASSETS = join(process.cwd(), "assets/blog-header");
async function readAssets() {
  const [o6, o8, hand, logo, grain] = await Promise.all(
    ["Outfit-600.ttf", "Outfit-800.ttf", "Caveat-600.ttf", "logo.png", "grain.png"].map((f) => readFile(join(ASSETS, f))),
  );
  return {
    fonts: [
      { name: "Outfit", data: o6, weight: 600 as const, style: "normal" as const },
      { name: "Outfit", data: o8, weight: 800 as const, style: "normal" as const },
      { name: "Hand", data: hand, weight: 600 as const, style: "normal" as const },
    ],
    logo: `data:image/png;base64,${logo.toString("base64")}`,
    grain: `data:image/png;base64,${grain.toString("base64")}`,
  };
}
let assets: ReturnType<typeof readAssets> | undefined;
const loadAssets = () => (assets ??= readAssets());

// ---- seeded randomness, so the same slug always gives the same image ----
function hash(s: string) {
  let x = 2166136261;
  for (const c of s) x = Math.imul(x ^ c.charCodeAt(0), 16777619);
  return x >>> 0;
}
function prng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const generator = (seed: string) => rough.generator({ options: { seed: (hash(seed) % 2147483646) + 1 } });

// ---- depth contours: 2-3 shoals, each a nest of wobbly closed rings ----
type Pt = [number, number];
function smoothClosed(pts: Pt[]) {
  const n = pts.length;
  const f = (v: number) => v.toFixed(1);
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [pts[(i - 1 + n) % n], pts[i], pts[(i + 1) % n], pts[(i + 2) % n]];
    d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)},${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)},${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])},${f(p2[1])}`;
  }
  return d + "Z";
}
function contours(slug: string, box: { x: number; y: number; w: number; h: number }) {
  const r = prng(hash(slug));
  const out: string[] = [];
  const shoals = 2 + Math.floor(r() * 2);
  for (let s = 0; s < shoals; s++) {
    const cx = box.x + r() * box.w;
    const cy = box.y + r() * box.h;
    const base = 120 + r() * 180;
    const rings = 4 + Math.floor(r() * 3);
    const harmonics = [1, 2, 3, 5].map((k) => ({ k, a: (0.05 + r() * 0.12) / Math.sqrt(k), p: r() * 2 * Math.PI }));
    const stretch = 0.6 + r() * 0.6;
    const rot = r() * Math.PI;
    for (let k = 0; k < rings; k++) {
      const rad = base * (1 - k / (rings + 0.6));
      const pts: Pt[] = [];
      for (let i = 0; i < 48; i++) {
        const t = (i / 48) * 2 * Math.PI;
        let m = 1;
        for (const hm of harmonics) m += hm.a * Math.sin(hm.k * t + hm.p + k * 0.25);
        const x = Math.cos(t) * rad * m;
        const y = Math.sin(t) * rad * m * stretch;
        pts.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]);
      }
      out.push(smoothClosed(pts));
    }
  }
  return out;
}

// ---- doodle kit: line drawings inside a 200x200 box (kept 10px clear of the edge) ----
type Shape = { fills?: string[]; lines?: string[]; circles?: [number, number, number][] };
const spokes = Array.from({ length: 8 }, (_, i) => {
  const a = (i * Math.PI) / 4;
  const p = (r: number) => `${(100 + Math.cos(a) * r).toFixed(1)},${(100 + Math.sin(a) * r).toFixed(1)}`;
  return `M${p(14)} L${p(88)}`;
});
const KIT: Record<Doodle, Shape> = {
  compass: {
    fills: ["M100,26 L112,100 L100,174 L88,100 Z", "M26,100 L100,90 L174,100 L100,110 Z"],
    lines: ["M100,10 L100,26", "M100,174 L100,190", "M10,100 L26,100", "M174,100 L190,100"],
    circles: [[100, 100, 148], [100, 100, 16]],
  },
  lighthouse: {
    fills: ["M76,170 L86,62 L114,62 L124,170 Z", "M83,42 L117,42 L117,62 L83,62 Z", "M79,42 L100,22 L121,42 Z"],
    lines: ["M24,172 Q62,164 100,172 T176,172", "M126,46 L188,26", "M126,54 L188,78", "M81,104 L119,104", "M79,138 L121,138"],
  },
  ship: {
    fills: ["M26,122 L174,122 L152,156 L48,156 Z", "M66,84 L136,84 L136,122 L66,122 Z", "M114,56 L130,56 L130,84 L114,84 Z"],
    lines: ["M14,170 Q38,160 62,170 T110,170 T158,170 T188,166", "M122,48 Q128,36 120,26 Q114,16 124,10"],
    circles: [[86, 104, 12], [112, 104, 12]],
  },
  anchor: {
    lines: ["M100,44 L100,168", "M68,66 L132,66", "M38,118 Q46,176 100,170 Q154,176 162,118", "M38,118 L28,134 M38,118 L54,126", "M162,118 L172,134 M162,118 L146,126"],
    circles: [[100, 30, 26]],
  },
  lifering: {
    fills: ["M100,34 A66,66 0 0 1 147,53 L123,77 A32,32 0 0 0 100,68 Z", "M100,166 A66,66 0 0 1 53,147 L77,123 A32,32 0 0 0 100,132 Z"],
    lines: ["M53,53 L77,77", "M147,53 L123,77", "M53,147 L77,123", "M147,147 L123,123", "M150,40 Q176,60 170,96"],
    circles: [[100, 100, 132], [100, 100, 64]],
  },
  paperboat: {
    fills: ["M70,112 L100,44 L130,112 Z"],
    lines: ["M20,112 L180,112 L150,156 L50,156 Z", "M12,172 Q42,162 72,172 T132,172 T188,170"],
  },
  books: {
    fills: ["M36,92 L150,92 L150,120 L36,120 Z"],
    lines: ["M28,152 L172,152 L172,182 L28,182 Z", "M44,122 L162,122 L162,152 L44,152 Z", "M36,92 L150,92 L150,120 L36,120 Z", "M50,152 L50,182", "M146,122 L146,152", "M58,72 L166,48 L172,60 L64,84 Z"],
  },
  stopwatch: {
    fills: ["M90,18 L110,18 L110,36 L90,36 Z"],
    lines: ["M100,112 L100,66", "M100,112 L130,126", "M100,50 L100,58", "M162,112 L154,112", "M100,174 L100,166", "M38,112 L46,112", "M148,52 L160,40"],
    circles: [[100, 112, 136], [100, 112, 8]],
  },
  wheel: {
    lines: spokes,
    circles: [[100, 100, 124], [100, 100, 30], ...spokes.map((_, i): [number, number, number] => {
      const a = (i * Math.PI) / 4;
      return [100 + Math.cos(a) * 88, 100 + Math.sin(a) * 88, 12];
    })],
  },
};

function svgPaths(g: RoughGenerator, drawables: Drawable[], hatch?: { color: string; opacity: number }) {
  return drawables.flatMap((d) => g.toPaths(d)).map((p, i) => (
    <path
      key={i}
      d={p.d}
      stroke={p.stroke}
      strokeWidth={p.strokeWidth}
      fill={p.fill ?? "none"}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeOpacity={hatch && p.stroke === hatch.color ? hatch.opacity : 1}
    />
  ));
}

function doodle(name: Doodle, seed: string) {
  const g = generator(seed);
  const line = { stroke: C.pencil, strokeWidth: 2, roughness: 1.4, bowing: 1.3 };
  const fill = { ...line, fill: C.marine, fillStyle: "hachure", hachureGap: 7, hachureAngle: -41, fillWeight: 1.5 };
  const s = KIT[name];
  return svgPaths(g, [
    ...(s.fills ?? []).map((d) => g.path(d, fill)),
    ...(s.lines ?? []).map((d) => g.path(d, line)),
    ...(s.circles ?? []).map(([x, y, dia]) => g.circle(x, y, dia, line)),
  ], { color: C.marine, opacity: 0.6 });
}

function arrow(seed: string, w: number, h: number) {
  const g = generator(seed + "arrow");
  const o = { stroke: C.pencil, strokeWidth: 2.6, roughness: 1.2 };
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ opacity: 0.85 }}>
      {svgPaths(g, [
        g.curve([[4, 6], [w * 0.35, h * 0.15], [w * 0.75, h * 0.5], [w - 10, h - 10]], o),
        g.linearPath([[w - 30, h - 12], [w - 8, h - 8], [w - 14, h - 32]], o),
      ])}
    </svg>
  );
}

function ellipse(seed: string, w: number, h: number) {
  const g = generator(seed + "circle");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ position: "absolute", left: 0, top: 0, opacity: 0.8 }}>
      {svgPaths(g, [g.ellipse(w / 2, h / 2, w - 8, h - 8, { stroke: C.ocean, strokeWidth: 2.6, roughness: 1.8 })])}
    </svg>
  );
}

/** Highlighter swipe as an SVG stretched to the marked word's box, so it always fits the word. */
function swipe(seed: string) {
  const g = generator(seed + "swipe");
  const [w, h] = [300, 80];
  const shape = g.polygon([[2, h * 0.1], [w - 3, h * 0.04], [w - 1, h * 0.94], [5, h * 0.99]], { stroke: "none", fill: C.marine, fillStyle: "solid", roughness: 1.6 });
  const body = g.toPaths(shape).map((p) => `<path d="${p.d}" fill="${p.fill ?? "none"}" stroke="none"/>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" opacity="0.38">${body}</svg>`;
  return `url(data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")})`;
}

const clean = (w: string) => w.replace(/[^\p{L}\p{N}.'+-]/gu, "").toLowerCase();

function Headline({ spec, size }: { spec: HeaderSpec; size: number }) {
  const words = spec.headline.trim().split(/\s+/);
  const mark = spec.mark ? clean(spec.mark) : "";
  const markAt = mark ? words.findIndex((w) => clean(w) === mark) : -1;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", maxWidth: 680, fontFamily: "Outfit", fontWeight: 800, fontSize: size, lineHeight: 1.08, color: C.ink, letterSpacing: -1.5 }}>
      {words.map((w, i) => {
        // Trailing punctuation stays outside the highlight.
        const word = w.replace(/[,?!:;.]+$/, "");
        return (
          <div key={i} style={{ display: "flex", marginRight: size * 0.24 }}>
            <div style={{ display: "flex", position: "relative" }}>
              {i === markAt && (
                <div style={{ display: "flex", position: "absolute", left: -8, right: -8, top: size * 0.1, bottom: size * 0.02, backgroundImage: swipe(spec.slug), backgroundSize: "100% 100%", backgroundRepeat: "no-repeat" }} />
              )}
              {word}
            </div>
            {w.slice(word.length)}
          </div>
        );
      })}
    </div>
  );
}

const headlineSize = (t: string) => (t.length <= 24 ? 80 : t.length <= 34 ? 74 : t.length <= 46 ? 66 : 58);

/** Renders the header as a 1200x630 PNG. */
export async function renderHeaderImage(spec: HeaderSpec): Promise<Buffer> {
  const { fonts, logo, grain } = await loadAssets();
  const hand = { display: "flex", fontFamily: "Hand", fontWeight: 600, lineHeight: 1 } as const;
  const res = new ImageResponse(
    (
      <div style={{ width: W, height: H, display: "flex", position: "relative", overflow: "hidden", background: C.chart }}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", left: 0, top: 0 }}>
          {Array.from({ length: Math.floor(W / 64) }, (_, i) => <path key={`x${i}`} d={`M${(i + 1) * 64},0 L${(i + 1) * 64},${H}`} stroke="rgba(27,42,51,0.07)" strokeWidth={1} />)}
          {Array.from({ length: Math.floor(H / 64) }, (_, i) => <path key={`y${i}`} d={`M0,${(i + 1) * 64} L${W},${(i + 1) * 64}`} stroke="rgba(27,42,51,0.07)" strokeWidth={1} />)}
          {contours(spec.slug, { x: 560, y: 40, w: 640, h: 560 }).map((d, i) => (
            <path key={`c${i}`} d={d} stroke={C.ink} strokeOpacity={0.13} strokeWidth={1.4} fill="none" />
          ))}
        </svg>
        <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H, backgroundImage: `url(${grain})`, backgroundRepeat: "repeat", backgroundSize: "160px 160px" }} />

        {/* The whole doodle stays inside the frame; the padded viewBox leaves room for rough strokes. */}
        <svg width={370} height={370} viewBox="-12 -12 224 224" style={{ position: "absolute", right: 60, bottom: 48 }}>
          {doodle(spec.doodle, spec.slug)}
        </svg>

        <div style={{ position: "absolute", left: 84, top: 70, display: "flex", transform: "rotate(-3deg)" }}>
          <div style={{ ...hand, fontSize: 44, color: C.pencil }}>{spec.category}</div>
        </div>
        <div style={{ position: "absolute", left: 100 + spec.category.length * 19, top: 84, display: "flex" }}>{arrow(spec.slug, 90, 70)}</div>

        <div style={{ position: "absolute", left: 80, top: 172, display: "flex" }}>
          <Headline spec={spec} size={headlineSize(spec.headline)} />
        </div>

        <div style={{ position: "absolute", left: 82, bottom: 56, display: "flex", alignItems: "center", gap: 14 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- rendered by Satori, not the browser */}
          <img src={logo} width={46} height={42} alt="" />
          <div style={{ display: "flex", fontFamily: "Outfit", fontWeight: 600, fontSize: 26, color: C.ink }}>Marine Prep</div>
        </div>

        <div style={{ position: "absolute", right: 290, top: 48, display: "flex", alignItems: "center", justifyContent: "center", width: 230, height: 86, transform: "rotate(4deg)" }}>
          {ellipse(spec.slug, 230, 86)}
          <div style={{ ...hand, fontSize: 38, color: C.ocean }}>IMU CET &apos;27</div>
        </div>
      </div>
    ),
    { width: W, height: H, fonts },
  );
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Renders the header and uploads it to Storage (blog-images/headers/<slug>-<hash>.png). The hash
 * changes with the content, so a new render gets a new URL and no CDN serves a stale image.
 */
export async function uploadHeaderImage(spec: HeaderSpec) {
  const supabase = createServiceClient();
  if (!supabase) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  const png = await renderHeaderImage(spec);
  const version = hash(JSON.stringify([spec.headline, spec.mark, spec.category, spec.doodle])).toString(36);
  const path = `headers/${spec.slug}-${version}.png`;
  const { error } = await supabase.storage.from("blog-images").upload(path, png, { contentType: "image/png", upsert: true });
  if (error) throw new Error(`Header upload failed: ${error.message}`);
  return { path, url: supabase.storage.from("blog-images").getPublicUrl(path).data.publicUrl };
}
