import { db, jsonError, logSkill, must } from "@/lib/server/db";
import { checkDocument } from "@/lib/server/checkDoc";

export const maxDuration = 300;
export const preferredRegion = "bom1";

/**
 * Daily automatic check (Vercel Cron, see vercel.json). Checks the documents checked longest ago
 * until the time budget is used; the rest are picked up the next day.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const fromCron = (req.headers.get("user-agent") ?? "").startsWith("vercel-cron");
  if (secret ? auth !== `Bearer ${secret}` : !fromCron) return new Response("Forbidden", { status: 403 });
  try {
    const started = Date.now();
    const docs = must(
      await db().from("knowledge_documents").select("id, last_checked_at").eq("status", "active").not("source_url", "is", null)
        .order("last_checked_at", { ascending: true, nullsFirst: true }),
    );
    const results: { id: string; outcome: string; detail: string }[] = [];
    for (const d of docs) {
      if (Date.now() - started > 230_000) break;
      results.push(await checkDocument(d.id, Math.min(100_000, 280_000 - (Date.now() - started))).catch((e) => ({ id: d.id, outcome: "failed", detail: String(e) })));
    }
    const count = (o: string) => results.filter((r) => r.outcome === o).length;
    await logSkill("knowledge-sync", "completed", `Daily check: ${results.length} checked — ${count("unchanged")} unchanged, ${count("updated")} updated, ${count("removed_at_source")} removed at source, ${count("failed")} failed`);
    return Response.json({ checked: results.length, results });
  } catch (e) {
    return jsonError(e);
  }
}
