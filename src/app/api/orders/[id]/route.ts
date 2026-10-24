import { db, jsonError, must } from "@/lib/server/db";
import { withStatus } from "@/lib/server/directions";

/** One court order with everything needed for the pipeline, gate and audit trail. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const sb = db();
    const order = must(await sb.from("court_orders").select("*").eq("id", id).single());
    const directions = must(await sb.from("directions").select("*").eq("court_order_id", id).order("created_at"));
    const ids = directions.map((d) => d.id);
    const tasks = ids.length ? must(await sb.from("compliance_tasks").select("*").in("direction_id", ids).order("due_date")) : [];
    const drafts = must(await sb.from("drafts").select("*").eq("court_order_id", id).order("created_at", { ascending: false }));
    const calls = must(await sb.from("ai_calls").select("id, agent, provider, model, ok, error, duration_ms, ts").eq("ref_id", id).order("ts"));
    const url = new URL(req.url);
    let fileBase64: string | null = null;
    if (url.searchParams.get("file") === "1" && order.file_ref) {
      const f = await sb.storage.from("judgments").download(order.file_ref);
      if (f.data) fileBase64 = Buffer.from(await f.data.arrayBuffer()).toString("base64");
    }
    return Response.json({ order, directions: directions.map(withStatus), tasks, drafts, calls, fileBase64 });
  } catch (e) {
    return jsonError(e);
  }
}

/** Save AI-read text for scanned PDFs, or move the pipeline stage. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.extracted_text === "string") {
      patch.extracted_text = body.extracted_text;
      patch.ocr_used = true;
      patch.pipeline_stage = "uploaded";
    }
    if (typeof body.pipeline_stage === "string") patch.pipeline_stage = body.pipeline_stage;
    must(await db().from("court_orders").update(patch).eq("id", id));
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const sb = db();
    const order = must(await sb.from("court_orders").select("file_ref").eq("id", id).single());
    if (order.file_ref) await sb.storage.from("judgments").remove([order.file_ref]);
    must(await sb.from("court_orders").delete().eq("id", id));
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
