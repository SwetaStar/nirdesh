import { z } from "zod";
import { db, jsonError, must } from "@/lib/server/db";

const Body = z.object({
  chunks: z.array(z.object({ section_ref: z.string(), heading: z.string(), content: z.string() })).max(400),
});

/** Append a batch of sections to a library entry that is still importing. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const { chunks } = Body.parse(await req.json());
    const sb = db();
    const doc = must(await sb.from("knowledge_documents").select("status").eq("id", id).single());
    if (doc.status !== "importing") return jsonError("This entry is no longer importing.", 409);
    if (chunks.length) must(await sb.from("knowledge_chunks").insert(chunks.map((c) => ({ ...c, document_id: id }))));
    return Response.json({ ok: true, added: chunks.length });
  } catch (e) {
    return jsonError(e);
  }
}
