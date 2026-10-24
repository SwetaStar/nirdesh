import { extractText, getDocumentProxy } from "unpdf";
import { db, jsonError, must } from "@/lib/server/db";
import { chunkAct } from "@/lib/server/chunk";

export const maxDuration = 60;

/** List knowledge documents (Acts, Rules, org chart) with their chunk counts. */
export async function GET() {
  try {
    const sb = db();
    const docs = must(await sb.from("knowledge_documents").select("*").order("uploaded_at", { ascending: false }));
    const chunks = must(await sb.from("knowledge_chunks").select("document_id"));
    return Response.json({
      documents: docs.map((d) => ({ ...d, chunks: chunks.filter((c) => c.document_id === d.id).length })),
    });
  } catch (e) {
    return jsonError(e);
  }
}

/**
 * Add an Act. Either a text PDF (file) or text already read by the AI for scanned PDFs (text).
 * Returns needsOcr when a PDF has no text layer, so the browser can read it with the user's AI.
 */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const title = String(form.get("title") ?? "").trim();
    const type = String(form.get("type") ?? "act");
    const year = Number(form.get("act_year")) || null;
    const version = String(form.get("version_note") ?? "").trim() || null;
    const skills = String(form.get("assigned_skills") ?? "know-your-law").split(",").map((s) => s.trim()).filter(Boolean);
    if (!title) return jsonError("Title is required.", 400);

    let text = String(form.get("text") ?? "");
    const file = form.get("file");
    if (!text && file instanceof File) {
      const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
      text = (await extractText(pdf, { mergePages: true })).text;
      if (text.replace(/\s+/g, "").length / Math.max(pdf.numPages, 1) < 200)
        return Response.json({ needsOcr: true, pages: pdf.numPages });
    }
    if (!text.trim()) return jsonError("No text found.", 400);

    const sb = db();
    const doc = must(
      await sb.from("knowledge_documents").insert({ title, type, act_year: year, version_note: version, assigned_skills: skills }).select("*").single(),
    );
    const chunks = chunkAct(text);
    for (let i = 0; i < chunks.length; i += 200)
      must(await sb.from("knowledge_chunks").insert(chunks.slice(i, i + 200).map((c) => ({ ...c, document_id: doc.id }))));
    return Response.json({ document: doc, chunks: chunks.length });
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
