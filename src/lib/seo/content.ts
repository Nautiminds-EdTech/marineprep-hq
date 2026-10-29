// Pure helpers for blog content, shared by the editor (live checklist) and the server (publish
// gate). No server-only imports here. The rules follow ../marineprep-landing-page/SEO-BLOG-HQ-CONTRACT.md
// section 5, "What HQ guarantees about a published row".

/** Fixed category list (contract section 5). The header shows them as words: "exam guide". */
export const CATEGORIES = ["exam-guide", "registration", "syllabus", "study-plan", "papers", "careers", "life-at-sea"] as const;
export type Category = (typeof CATEGORIES)[number];
export const categoryLabel = (c: string) => c.replace(/-/g, " ");

export const SITE = "https://marineprep.app";
export const postUrl = (slug: string) => `${SITE}/blogs/${slug}/`;

/** "IMU CET 2027: Dates & Fees!" → "imu-cet-2027-dates-fees". */
export function slugify(text: string, max = 80) {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
}

/** Visible text of an HTML fragment (no tags, entities decoded for the common cases). */
export function htmlText(html: string) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|h[1-6]|li|blockquote|tr|td|th)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*/g, "\n")
    .trim();
}

export const wordCount = (html: string) => htmlText(html).split(/\s+/).filter(Boolean).length;
/** 200 words a minute, at least 1. */
export const readingMinutes = (html: string) => Math.max(1, Math.ceil(wordCount(html) / 200));

export function headings(html: string) {
  return [...html.matchAll(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) => ({ level: Number(m[1]), text: htmlText(m[2]) }));
}

/**
 * Makes body HTML safe to publish: no H1 (demoted to H2), no script/style/iframe, no event handlers,
 * scheme-less and http marineprep links made https, the parked marineprep.com domain fixed. It doesn't
 * touch data: images; checks() blocks publishing while they exist (they need uploading to Storage).
 */
export function cleanHtml(html: string) {
  return html
    .replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1>/gi, "")
    .replace(/<(script|style|iframe|object|embed)[^>]*\/?>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/<h1(\s[^>]*)?>/gi, "<h2$1>")
    .replace(/<\/h1>/gi, "</h2>")
    .replace(/href="(?:https?:\/\/)?(?:www\.)?marineprep\.com\/download\/?"/gi, `href="${SITE}/"`)
    .replace(/href="(?:http:\/\/|\/\/)?(www\.)?marineprep\.app/gi, 'href="https://marineprep.app')
    .replace(/href="javascript:[^"]*"/gi, 'href="#"');
}

/**
 * Phrases that make text read as machine-written. From the claude-seo skill's content_humanize.py
 * (MIT; aligned with Wikipedia's "AI Cleanup" catalogue), plus a few common in exam-prep copy.
 */
export const AI_PHRASES: RegExp[] = [
  /\bdelve(s|d)?\b/i, /\bever-(evolving|changing)\b/i, /\bnavigat(e|ing) the complexities\b/i, /\btapestry\b/i,
  /\bembark on (a|your) journey\b/i, /\ba testament to\b/i, /\ba beacon of\b/i, /\bcornerstone of\b/i,
  /\bat the heart of\b/i, /\bin essence\b/i, /\bin conclusion\b/i, /\bmoreover\b/i, /\bfurthermore\b/i,
  /\bit'?s worth noting\b/i, /\bleverag(e|ing)\b/i, /\bharness the power\b/i, /\bunlock (the |your )?(full )?potential\b/i,
  /\ba world of possibilities\b/i, /\belevate your\b/i, /\bgame-?changer\b/i, /\bcutting-?edge\b/i, /\bstate-of-the-art\b/i,
  /\bin summary\b/i, /\bin a nutshell\b/i, /\bit'?s important to note\b/i, /\bin today'?s (fast-paced|digital|competitive)\b/i,
  /\bneedless to say\b/i, /\bat the end of the day\b/i, /\bfirst and foremost\b/i, /\blast but not least\b/i,
  /\blet'?s dive\b/i, /\blet'?s take a (closer|deeper) look\b/i, /\bseamless(ly)?\b/i, /\brobust\b/i,
  /\bcomprehensive guide\b/i, /\bultimate guide\b/i, /\bcrack(ing)? the code\b/i, /\bdream career\b/i,
];

export const aiPhraseHits = (text: string) =>
  AI_PHRASES.flatMap((re) => text.match(new RegExp(re.source, "gi")) ?? []).map((m) => m.toLowerCase());

export type PostFields = {
  title: string;
  slug: string;
  seo_title: string;
  meta_description: string;
  excerpt: string;
  content_html: string;
  image_url: string;
  image_alt: string;
  category: string;
  keywords: string[];
};

export type Check = { id: string; label: string; ok: boolean; detail?: string; /** blocks publishing */ blocker?: boolean };

/** The editor's SEO checklist. Blockers must pass before a post can go live. */
export function checks(p: PostFields): Check[] {
  const html = p.content_html ?? "";
  const words = wordCount(html);
  const hs = headings(html);
  const keyword = (p.keywords[0] ?? "").toLowerCase().trim();
  const text = htmlText(html).toLowerCase();
  const firstPara = htmlText(html.match(/<p[^>]*>[\s\S]*?<\/p>/i)?.[0] ?? "").toLowerCase();
  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  const links = [...html.matchAll(/<a\b[^>]*href="([^"]*)"/gi)].map((m) => m[1]);
  const seoTitle = p.seo_title || p.title;
  const metaLen = p.meta_description.trim().length;

  return [
    { id: "title", label: "Title", ok: p.title.trim().length >= 10, detail: `${p.title.trim().length} characters`, blocker: true },
    { id: "slug", label: "Slug is lowercase words and hyphens", ok: /^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.slug), detail: p.slug || "empty", blocker: true },
    { id: "seo_title", label: "SEO title at most 60 characters", ok: seoTitle.length > 0 && seoTitle.length <= 60, detail: `${seoTitle.length} characters` },
    { id: "meta", label: "Meta description 140–155 characters", ok: metaLen >= 140 && metaLen <= 155, detail: `${metaLen} characters`, blocker: metaLen === 0 },
    { id: "excerpt", label: "Excerpt (1–2 sentences)", ok: p.excerpt.trim().length >= 40 && p.excerpt.trim().length <= 320, detail: `${p.excerpt.trim().length} characters` },
    { id: "category", label: "Category", ok: (CATEGORIES as readonly string[]).includes(p.category), detail: p.category || "none", blocker: true },
    { id: "image", label: "Header image with alt text", ok: !!p.image_url && p.image_alt.trim().length >= 10, detail: !p.image_url ? "no image" : !p.image_alt.trim() ? "no alt text" : undefined, blocker: !p.image_url },
    { id: "length", label: "At least 800 words", ok: words >= 800, detail: `${words} words` },
    { id: "h1", label: "No H1 in the body (the title is the H1)", ok: !hs.some((h) => h.level === 1), blocker: false },
    { id: "headings", label: "Uses H2 sections", ok: hs.filter((h) => h.level === 2).length >= 2, detail: `${hs.filter((h) => h.level === 2).length} H2s` },
    { id: "keyword", label: "Main keyword in title and first paragraph", ok: !keyword || (p.title.toLowerCase().includes(keyword) && firstPara.includes(keyword)), detail: keyword ? `"${keyword}"` : "no keyword set" },
    { id: "keyword_density", label: "Main keyword not stuffed", ok: !keyword || text.split(keyword).length - 1 <= Math.max(3, Math.ceil(words / 150)), detail: keyword ? `${text.split(keyword).length - 1} uses` : undefined },
    { id: "data_images", label: "No inline base64 images", ok: !imgs.some((i) => /src="data:/i.test(i)), blocker: true },
    { id: "alt", label: "Every image has alt text", ok: imgs.every((i) => /\salt="[^"]+"/i.test(i)), detail: `${imgs.length} images` },
    { id: "links", label: "Links are https or root-relative", ok: links.every((l) => /^(https:\/\/|\/(?!\/)|#|mailto:)/i.test(l)), detail: `${links.length} links` },
    { id: "parked", label: "No marineprep.com links", ok: !links.some((l) => /marineprep\.com/i.test(l)), blocker: true },
    { id: "dashes", label: "No em dashes (house style)", ok: !/—/.test(htmlText(html) + p.title + p.meta_description) },
    (() => {
      const hits = [...new Set(aiPhraseHits(`${p.title}\n${p.meta_description}\n${htmlText(html)}`))];
      return { id: "ai_phrases", label: "No AI-sounding phrases", ok: hits.length === 0, detail: hits.slice(0, 4).join(", ") || undefined };
    })(),
  ];
}

export const blockers = (p: PostFields) => checks(p).filter((c) => c.blocker && !c.ok);
