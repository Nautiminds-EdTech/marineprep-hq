"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { collectReviews } from "@/lib/reviews";

export async function refreshReviews() {
  await requireAdmin();
  await collectReviews();
  revalidatePath("/reviews");
}
