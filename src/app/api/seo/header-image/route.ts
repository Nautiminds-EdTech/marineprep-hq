import { requireAdmin } from "@/lib/auth";
import { DOODLES, renderHeaderImage, type Doodle } from "@/lib/seo/header-image";

/**
 * Admin-only preview of a blog header, rendered on the fly (nothing is uploaded):
 * /api/seo/header-image?slug=…&headline=…&mark=…&category=…&doodle=ship
 */
export async function GET(req: Request) {
  await requireAdmin();
  const q = new URL(req.url).searchParams;
  const headline = q.get("headline")?.trim();
  if (!headline) return new Response("headline is required", { status: 400 });
  const doodle = q.get("doodle") ?? "compass";
  if (!DOODLES.includes(doodle as Doodle)) return new Response(`doodle must be one of ${DOODLES.join(", ")}`, { status: 400 });

  const png = await renderHeaderImage({
    slug: q.get("slug") || headline,
    headline: headline.slice(0, 80),
    mark: q.get("mark") ?? undefined,
    category: (q.get("category") || "notes").slice(0, 24),
    doodle: doodle as Doodle,
  });
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store" } });
}
