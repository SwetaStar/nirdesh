import { z } from "zod";
import { db, jsonError, logSkill, must } from "@/lib/server/db";

const Decision = z.object({
  id: z.string().uuid(),
  decision: z.enum(["approved", "corrected", "rejected"]),
  corrected_authority: z.string().nullish(),
  corrected_deadline_date: z.string().nullish(),
  corrected_trigger: z.string().nullish(),
  corrected_period: z.string().nullish(),
});
const Body = z.object({ decided_by: z.string().min(1), decisions: z.array(Decision) });

/**
 * Verification Gate. Every direction must get a human decision. critic_result is never
 * touched; the human decision and corrected values are stored alongside the AI values.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const { decided_by, decisions } = Body.parse(await req.json());
    const sb = db();
    const dirs = must(await sb.from("directions").select("id, responsible_authority").eq("court_order_id", id));
    const missing = dirs.filter((d) => !decisions.some((x) => x.id === d.id));
    if (missing.length) return jsonError(`Every item needs a decision (${missing.length} left).`, 400);

    const now = new Date().toISOString();
    for (const x of decisions) {
      const d = dirs.find((r) => r.id === x.id);
      if (!d) return jsonError("Direction does not belong to this order.", 400);
      const corrected = x.decision === "corrected";
      const authority = (corrected && x.corrected_authority) || d.responsible_authority;
      must(
        await sb
          .from("directions")
          .update({
            human_decision: x.decision,
            decided_by,
            decided_at: now,
            corrected_authority: corrected ? x.corrected_authority || null : null,
            corrected_deadline_date: corrected ? x.corrected_deadline_date || null : null,
            corrected_trigger: corrected ? x.corrected_trigger || null : null,
            corrected_period: corrected ? x.corrected_period || null : null,
            status: x.decision === "rejected" ? "rejected" : "verified",
            // The authority named in the judgment wins; the routing table is only a fallback.
            owner_office: x.decision === "rejected" ? null : authority,
            owner_source: x.decision === "rejected" ? null : corrected && x.corrected_authority ? "human" : authority ? "judgment" : null,
          })
          .eq("id", x.id),
      );
    }
    const approved = decisions.filter((d) => d.decision !== "rejected").length;
    must(
      await sb
        .from("court_orders")
        .update({ directions_approved: approved, pipeline_stage: "verified", updated_at: now })
        .eq("id", id),
    );
    await logSkill("verification-gate", "completed", `${decided_by}: ${approved} verified, ${decisions.length - approved} rejected`, id);
    return Response.json({ ok: true, approved });
  } catch (e) {
    return jsonError(e);
  }
}
