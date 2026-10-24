import { db, jsonError, must } from "@/lib/server/db";
import { withStatus } from "@/lib/server/directions";
import { MINUTES_PER_DRAFT, MINUTES_PER_JUDGMENT } from "@/lib/rules";

/** Everything the live dashboard needs, with statuses computed for today. */
export async function GET() {
  try {
    const sb = db();
    const [orders, dirs, skills, activity, hours, issues] = await Promise.all([
      sb.from("court_orders").select("id, case_number, court, file_name, user_role, pipeline_stage, directions_total, directions_approved, source_channel, is_sample, created_at, updated_at").order("updated_at", { ascending: false }),
      sb.from("directions").select("*"),
      sb.from("skills_registry").select("*"),
      sb.from("skill_activities").select("*").order("ts", { ascending: false }).limit(40),
      sb.from("hours_saved_log").select("kind, minutes"),
      sb.from("systemic_issues").select("*").order("created_at", { ascending: false }),
    ]);
    const directions = must(dirs).map(withStatus);
    const count = (f: (d: (typeof directions)[number]) => boolean) => directions.filter(f).length;
    const h = must(hours);
    const judgments = h.filter((x) => x.kind === "judgment_read").length;
    const draftsN = h.filter((x) => x.kind === "draft").length;

    const stats = {
      total: directions.length,
      verified: count((d) => d.status === "verified"),
      overdue: count((d) => d.task_status === "overdue"),
      due_soon: count((d) => d.task_status === "due_soon"),
      urgent: count((d) => d.task_status === "urgent"),
      date_pending: count((d) => d.task_status === "date_pending"),
      no_deadline: count((d) => d.task_status === "no_deadline"),
      paused: count((d) => d.task_status === "paused"),
      unresolved: count((d) => d.status === "unverified" && d.critic_result === "unresolved"),
      awaiting_gate: count((d) => d.status === "unverified"),
      hours_saved: Math.round((h.reduce((a, x) => a + x.minutes, 0) / 60) * 10) / 10,
      hours_basis: { judgments, drafts: draftsN, per_judgment: MINUTES_PER_JUDGMENT, per_draft: MINUTES_PER_DRAFT },
    };
    const o = must(orders);
    const by_channel = {
      upload: o.filter((x) => x.source_channel === "upload").length,
      email: o.filter((x) => x.source_channel === "email").length,
    };
    return Response.json({
      stats,
      by_channel,
      orders: o.map((x) => ({ ...x, directions: directions.filter((d) => d.court_order_id === x.id) })),
      skills: must(skills),
      activity: must(activity),
      issues: must(issues),
    });
  } catch (e) {
    return jsonError(e);
  }
}
