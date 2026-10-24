import { z } from "zod";
import { db, jsonError, logSkill, must } from "@/lib/server/db";
import { withStatus } from "@/lib/server/directions";

const Body = z.object({
  date_of_receipt: z.string().nullish(),
  stay_details: z.object({ court: z.string(), date: z.string(), order_no: z.string() }).nullish(),
  clear_stay: z.boolean().optional(),
  owner_office: z.string().nullish(),
});

/** Officer actions after the gate: receipt date (date_pending -> computed), stay (-> paused), owner. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = Body.parse(await req.json());
    const patch: Record<string, unknown> = {};
    if (body.date_of_receipt !== undefined) patch.date_of_receipt = body.date_of_receipt || null;
    if (body.stay_details) patch.stay_details = body.stay_details;
    if (body.clear_stay) patch.stay_details = null;
    if (body.owner_office) {
      patch.owner_office = body.owner_office;
      patch.owner_source = "human";
    }
    const sb = db();
    const row = must(await sb.from("directions").update(patch).eq("id", id).select("*").single());
    const d = withStatus(row);
    must(await sb.from("directions").update({ task_status: d.task_status }).eq("id", id));
    await logSkill("compliance-planning-drafting", "completed", `${row.label}: status now ${d.task_status}`, row.court_order_id);
    return Response.json({ direction: d });
  } catch (e) {
    return jsonError(e);
  }
}
