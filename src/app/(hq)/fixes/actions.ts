"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { decideProposal, draftProposal, markDone, proposeFromSentry } from "@/lib/fixes";

const who = (email: string) => email.split("@")[0];

export async function proposeFix(formData: FormData) {
  await requireAdmin();
  const shortId = String(formData.get("shortId") ?? "");
  if (!/^[A-Z0-9-]+$/.test(shortId)) return;

  const { id, created } = await proposeFromSentry(shortId);
  // Claude can take a minute; the queue shows "drafting" until it's done.
  if (created) {
    after(() =>
      draftProposal(id).catch((e) => console.error("[fixes] draft failed:", (e as Error).message)),
    );
  }
  revalidatePath("/quality");
  revalidatePath("/fixes");
}

export async function decideFix(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const decision = formData.get("decision") === "approved" ? "approved" : "rejected";
  await decideProposal(id, decision, who(admin.email), "hq");
  revalidatePath("/fixes");
}

export async function markFixDone(formData: FormData) {
  const admin = await requireAdmin();
  await markDone(String(formData.get("id") ?? ""), who(admin.email));
  revalidatePath("/fixes");
}
