import { z } from "zod";
import { db, jsonError, must } from "@/lib/server/db";

/** List knowledge documents (all versions) with their section counts. */
export async function GET() {
  try {
    const sb = db();
    const docs = must(await sb.from("knowledge_documents").select("*").order("uploaded_at", { ascending: false }));
    const counts = await Promise.all(
      docs.map((d) => sb.from("knowledge_chunks").select("id", { count: "exact", head: true }).eq("document_id", d.id)),
    );
    return Response.json({
      documents: docs.map((d, i) => ({ status: "active", ...d, chunks: counts[i].count ?? 0 })),
    });
  } catch (e) {
    return jsonError(e);
  }
}

const Create = z.object({
  title: z.string().min(1),
  type: z.enum(["act", "rules", "orgchart", "judgment_example"]).default("act"),
  act_year: z.coerce.number().int().nullish(),
  version_note: z.string().nullish(),
  assigned_skills: z.array(z.string()).default(["know-your-law"]),
  source_url: z.string().url().nullish().or(z.literal("")),
  checksum: z.string().nullish(),
  file_bytes: z.number().int().nullish(),
});

/**
 * Start a new library entry. The browser reads the PDF (so large Acts avoid the server's
 * upload limit), splits it into sections, then sends them in batches to /api/knowledge/[id]/chunks
 * and finally PATCHes { action: "finish" } to make it active.
 */
export async function POST(req: Request) {
  try {
    const b = Create.parse(await req.json());
    const doc = must(
      await db()
        .from("knowledge_documents")
        .insert({ ...b, act_year: b.act_year || null, source_url: b.source_url || null, status: "importing" })
        .select("*")
        .single(),
    );
    return Response.json({ document: doc });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return jsonError("id required", 400);
    must(await db().from("knowledge_documents").delete().eq("id", id));
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
