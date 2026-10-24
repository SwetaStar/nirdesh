import { z } from "zod";
import { db, jsonError, logSkill, must } from "@/lib/server/db";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("finish") }),
  z.object({ action: z.literal("approve"), approved_by: z.string().min(1) }),
  z.object({ action: z.literal("discard") }),
  z.object({ action: z.literal("set_source"), source_url: z.string().url().or(z.literal("")) }),
]);

/**
 * finish   — an upload is complete: importing -> active
 * approve  — a human accepts a new version found by the nightly check: pending -> active,
 *            and the version it replaces -> superseded (kept for the record)
 * discard  — reject a pending version (deleted with its sections)
 * set_source — set or clear the official download link checked nightly
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const b = Body.parse(await req.json());
    const sb = db();
    const doc = must(await sb.from("knowledge_documents").select("*").eq("id", id).single());
    const now = new Date().toISOString();

    if (b.action === "finish") {
      if (doc.status !== "importing") return jsonError("Not importing.", 409);
      must(await sb.from("knowledge_documents").update({ status: "active", uploaded_at: now }).eq("id", id));
    } else if (b.action === "approve") {
      if (doc.status !== "pending") return jsonError("Only a version awaiting review can be approved.", 409);
      if (doc.supersedes)
        must(await sb.from("knowledge_documents").update({ status: "superseded", last_check_status: "superseded" }).eq("id", doc.supersedes));
      must(await sb.from("knowledge_documents").update({ status: "active", approved_by: b.approved_by, approved_at: now }).eq("id", id));
      await logSkill("knowledge-sync", "completed", `${b.approved_by} approved a new version of ${doc.title}`, id);
    } else if (b.action === "discard") {
      if (doc.status !== "pending") return jsonError("Only a version awaiting review can be discarded.", 409);
      must(await sb.from("knowledge_documents").delete().eq("id", id));
      if (doc.supersedes)
        must(await sb.from("knowledge_documents").update({ last_check_status: "new_version_discarded" }).eq("id", doc.supersedes));
    } else {
      must(await sb.from("knowledge_documents").update({ source_url: b.source_url || null }).eq("id", id));
    }
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
