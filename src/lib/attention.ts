import "server-only";
import { cache } from "react";
import { requireAdmin } from "@/lib/auth";
import { countWaiting } from "@/lib/fixes";
import { countUnansweredLow } from "@/lib/reviews";
import { createServiceClient } from "@/lib/supabase/server";

export type Attention = { fixesWaiting: number; reviewsUnanswered: number };

/** What's waiting on an admin, for the nav badges and the Overview. Zero when it can't be read. */
export const getAttention = cache(async (): Promise<Attention> => {
  await requireAdmin();
  if (!createServiceClient()) return { fixesWaiting: 0, reviewsUnanswered: 0 };
  const [fixesWaiting, reviewsUnanswered] = await Promise.all([
    countWaiting().catch(() => 0),
    countUnansweredLow().catch(() => 0),
  ]);
  return { fixesWaiting, reviewsUnanswered };
});
