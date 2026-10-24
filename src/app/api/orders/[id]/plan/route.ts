import { addDays } from "date-fns";
import { db, jsonError, logSkill, must } from "@/lib/server/db";
import { withStatus } from "@/lib/server/directions";
import { iso, milestones, toDate } from "@/lib/rules";

/**
 * Build the deterministic part of the compliance plan: tasks with internal dates
 * (decision at 25 %, action at 75 %, affidavit before the deadline) and appeal windows.
 * The Planner agent then explains this plan; it does not compute dates.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const sb = db();
    const order = must(await sb.from("court_orders").select("*").eq("id", id).single());
    const dirs = must(await sb.from("directions").select("*").eq("court_order_id", id).eq("status", "verified").order("created_at"));
    await logSkill("compliance-planning-drafting", "started", "Building compliance plan", id);

    const jd = toDate(order.judgment_date);
    // Appeal windows are shown as two routes and never as one certain number.
    const appeal_info = jd
      ? {
          writ_appeal_approx: iso(addDays(jd, 30)),
          slp_supreme_court: iso(addDays(jd, 90)),
          label: "To be confirmed by Government Pleader",
          note: "Time taken to obtain the certified copy may be excluded (Limitation Act s.12).",
        }
      : null;

    const planned = [];
    for (const raw of dirs) {
      const d = withStatus(raw);
      must(await sb.from("compliance_tasks").delete().eq("direction_id", d.id));
      const owner = d.owner_office ?? "[OWNER OFFICE — confirm]";
      const start = d.trigger === "receipt_of_copy" || d.corrected_trigger === "receipt_of_copy" ? d.date_of_receipt : order.judgment_date;
      const m = milestones(start, d.effective_deadline);
      const tasks: { title: string; due_date: string | null }[] = [];
      if (m) {
        tasks.push({ title: "Comply-or-appeal decision recorded (office note)", due_date: m.decision_by });
        tasks.push({ title: "Reminder: 50% of the period has passed", due_date: m.reminder_50 });
        tasks.push({ title: `Action completed: ${d.summary ?? d.label}`, due_date: m.action_by });
        tasks.push({ title: "Compliance affidavit approved by Government Pleader and filed", due_date: iso(addDays(toDate(m.deadline)!, -3)) });
      } else if (d.task_status === "urgent") {
        tasks.push({ title: "Comply-or-appeal decision today (direction says forthwith / at the earliest)", due_date: iso(new Date()) });
        tasks.push({ title: `Action: ${d.summary ?? d.label}`, due_date: null });
        tasks.push({ title: "Compliance affidavit prepared", due_date: null });
      } else if (d.task_status === "date_pending") {
        tasks.push({ title: "Enter the date the certified copy was received, to compute the deadline", due_date: null });
        tasks.push({ title: "Comply-or-appeal decision recorded (office note)", due_date: null });
      } else if (d.task_status === "no_deadline") {
        tasks.push({ title: "Review progress (no time limit stated in the order)", due_date: d.review_date ?? null });
        tasks.push({ title: `Action: ${d.summary ?? d.label}`, due_date: null });
      } else if (d.task_status === "overdue") {
        tasks.push({ title: "OVERDUE — escalate to the Administrative Secretary", due_date: iso(new Date()) });
        tasks.push({ title: "Compliance affidavit / explanation to court", due_date: null });
      }
      if (tasks.length)
        must(await sb.from("compliance_tasks").insert(tasks.map((t) => ({ ...t, direction_id: d.id, owner }))));
      must(await sb.from("directions").update({ appeal_info, task_status: d.task_status, review_date: d.review_date ?? null }).eq("id", d.id));
      planned.push({ ...d, appeal_info, milestones: m, tasks });
    }
    must(await sb.from("court_orders").update({ pipeline_stage: "planned", updated_at: new Date().toISOString() }).eq("id", id));
    return Response.json({ order, directions: planned, appeal_info, today: iso(new Date()) });
  } catch (e) {
    return jsonError(e);
  }
}
