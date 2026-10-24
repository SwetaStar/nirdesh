import { z } from "zod";
import { db, jsonError, logSkill, must } from "@/lib/server/db";

const Body = z.object({
  type: z.enum(["office_note", "affidavit", "reminder", "escalation", "policy_note", "plan", "citizen_explanation"]),
  content: z.string().min(1),
  court_order_id: z.string().uuid().nullish(),
  direction_id: z.string().uuid().nullish(),
  systemic_issue_id: z.string().uuid().nullish(),
  language: z.string().nullish(),
  model_used: z.string().nullish(),
  created_by: z.string().nullish(),
});

/** Save a generated draft (always the live model output; never edited server-side). */
export async function POST(req: Request) {
  try {
    const b = Body.parse(await req.json());
    const sb = db();
    const draft = must(await sb.from("drafts").insert(b).select("*").single());
    if (!["plan", "citizen_explanation"].includes(b.type))
      await sb.from("hours_saved_log").insert({ kind: "draft", minutes: 20, ref_id: draft.id });
    const skill = b.type === "citizen_explanation" ? "citizen-explainer" : b.type === "policy_note" ? "policy-insights" : "compliance-planning-drafting";
    await logSkill(skill, "completed", `Saved ${b.type.replace("_", " ")}`, b.court_order_id ?? undefined);
    return Response.json({ draft });
  } catch (e) {
    return jsonError(e);
  }
}
