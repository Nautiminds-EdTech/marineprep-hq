import "server-only";
import { cache } from "react";
import { requireAdmin } from "@/lib/auth";
import { countWaiting } from "@/lib/fixes";
import { countUnansweredLow } from "@/lib/reviews";
import { createServiceClient } from "@/lib/supabase/server";

export type Attention = { fixesWaiting: number; reviewsUnanswered: number; postsWaiting: number };

/** What's waiting on an admin, for the nav badges and the Overview. Zero when it can't be read. */
export const getAttention = cache(async (): Promise<Attention> => {
  await requireAdmin();
  const db = createServiceClient();
  if (!db) return { fixesWaiting: 0, reviewsUnanswered: 0, postsWaiting: 0 };
  const [fixesWaiting, reviewsUnanswered, postsWaiting] = await Promise.all([
    countWaiting().catch(() => 0),
    countUnansweredLow().catch(() => 0),
    // Blog drafts waiting for approval (the pipeline sends these to Telegram).
    Promise.resolve(db.from("blog_pipeline").select("blog_id", { count: "exact", head: true }).eq("state", "awaiting_approval"))
      .then((r) => r.count ?? 0)
      .catch(() => 0),
  ]);
  return { fixesWaiting, reviewsUnanswered, postsWaiting };
});
