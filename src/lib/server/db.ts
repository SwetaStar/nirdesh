import "server-only";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** Server-only Supabase client using the service-role key. Never import from client components. */
export function db(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Database not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

export function must<T>(res: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (res.error) throw new Error(res.error.message);
  return res.data as NonNullable<T>;
}

export async function logSkill(skill: string, event: "started" | "processing" | "completed" | "failed", detail?: string, refId?: string) {
  const sb = db();
  await sb.from("skill_activities").insert({ skill, event, detail: detail ?? null, ref_id: refId ?? null });
  if (event === "started") {
    const { data } = await sb.from("skills_registry").select("invocation_count").eq("skill", skill).single();
    await sb.from("skills_registry").upsert({
      skill, status: "running", invocation_count: (data?.invocation_count ?? 0) + 1, last_run: new Date().toISOString(),
    });
  } else if (event === "completed" || event === "failed") {
    await sb.from("skills_registry").update({ status: "idle" }).eq("skill", skill);
  }
}

export function jsonError(e: unknown, status = 500) {
  const message = e instanceof Error ? e.message : String(e);
  return Response.json({ error: message }, { status });
}
