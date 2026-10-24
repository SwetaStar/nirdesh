import "server-only";
import { computeStatus } from "@/lib/rules";

export interface DirectionRow {
  id: string;
  court_order_id: string;
  label: string;
  status: string;
  critic_result: string | null;
  human_decision: string | null;
  deadline_status: string | null;
  deadline_date: string | null;
  corrected_deadline_date: string | null;
  corrected_trigger: string | null;
  corrected_period: string | null;
  period: string | null;
  trigger: string | null;
  date_of_receipt: string | null;
  stay_details: unknown;
  [k: string]: unknown;
}

/** Statuses depend on today's date, so compute them on every read (rules in code, not stored guesses). */
export function withStatus<T extends DirectionRow>(d: T) {
  if (d.status !== "verified" && d.status !== "rejected") {
    return { ...d, task_status: null, days_remaining: null, effective_deadline: null };
  }
  const s = computeStatus(d);
  return { ...d, task_status: s.task_status, days_remaining: s.days_remaining, effective_deadline: s.deadline, review_date: d.review_date ?? s.review_date };
}
