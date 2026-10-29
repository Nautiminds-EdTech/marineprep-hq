import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

// Settings an admin edits in HQ, stored in hq_settings (one JSON value per key).

function db() {
  const client = createServiceClient();
  if (!client) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return client;
}

export type AppFacts = { text: string; updated_by: string | null; updated_at: string | null };

/** Starting point until someone saves the page; from the Play Console replies of 27 Oct 2026. */
const DEFAULT_FACTS = `What's in Marine Prep right now (keep this current; Claude reads it when drafting replies):

- Free users get: one free note and one question bank per subject, one free mock test with a detailed performance analysis, and limited access to Marine AI. (Added in an update in October 2026.)
- Paid plans unlock all notes, the full question bank, all mock tests and full Marine AI access.
- One-to-one counselling calls with mentors can be booked in the app.
- Support: support@nautiminds.com`;

export async function getAppFacts(): Promise<AppFacts> {
  const { data } = await db().from("hq_settings").select("value, updated_by, updated_at").eq("key", "app_facts").maybeSingle();
  const text = (data?.value as { text?: string } | null)?.text;
  return { text: text ?? DEFAULT_FACTS, updated_by: data?.updated_by ?? null, updated_at: data?.updated_at ?? null };
}

export async function saveAppFacts(text: string, by: string) {
  const { error } = await db()
    .from("hq_settings")
    .upsert({ key: "app_facts", value: { text: text.trim().slice(0, 8000) }, updated_by: by }, { onConflict: "key" });
  if (error) throw new Error(error.message);
}
