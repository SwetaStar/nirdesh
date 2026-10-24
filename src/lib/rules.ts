// Deterministic rules (handoff sections 4.3 Skill 5, 8). Dates, statuses and
// quote checks are computed here in code — never by the model.

import { addDays, addMonths, addWeeks, addYears, differenceInCalendarDays, format, parseISO, isValid } from "date-fns";

export const CORRECTION_ROUNDS = 2;
export const SYSTEMIC_THRESHOLD = 3;
export const MINUTES_PER_JUDGMENT = 45;
export const MINUTES_PER_DRAFT = 20;
export const DUE_SOON_DAYS = 14;
export const NO_DEADLINE_REVIEW_DAYS = 30;

export type TaskStatus =
  | "on_track" | "due_soon" | "overdue" | "urgent" | "date_pending" | "no_deadline" | "paused" | "rejected";

export const STATUS_META: Record<TaskStatus | "unresolved", { label: string; action: string; color: string }> = {
  on_track: { label: "On track", action: "Continue tasks", color: "bg-emerald-100 text-emerald-800" },
  due_soon: { label: "Due soon", action: "Prioritise", color: "bg-amber-100 text-amber-800" },
  overdue: { label: "Overdue", action: "Act now; escalation note offered", color: "bg-red-100 text-red-800" },
  urgent: { label: "Urgent", action: "Act immediately", color: "bg-rose-200 text-rose-900" },
  date_pending: { label: "Date pending", action: "Enter date of receipt to compute the deadline", color: "bg-violet-100 text-violet-800" },
  no_deadline: { label: "No deadline", action: "Review date = today + 30 days", color: "bg-slate-100 text-slate-700" },
  paused: { label: "Paused (stay)", action: "Excluded from overdue", color: "bg-sky-100 text-sky-800" },
  rejected: { label: "Rejected", action: "Excluded", color: "bg-zinc-100 text-zinc-500" },
  unresolved: { label: "Unresolved", action: "Must be decided at the gate", color: "bg-orange-100 text-orange-800" },
};

export function toDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = parseISO(s);
  return isValid(d) ? d : null;
}
export const iso = (d: Date) => format(d, "yyyy-MM-dd");

/** Parse "8 weeks", "three months", "30 days", "six weeks" into an adder. */
const WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, sixteen: 16, twenty: 20, thirty: 30, forty: 40, "forty-five": 45,
  sixty: 60, ninety: 90, a: 1, an: 1,
};
export function parsePeriod(period: string | null | undefined): { n: number; unit: "day" | "week" | "month" | "year" } | null {
  if (!period) return null;
  const m = period.toLowerCase().match(/(\d+|[a-z-]+)\s*(?:\(\d+\)\s*)?(day|week|month|year)s?/);
  if (!m) return null;
  const n = /^\d+$/.test(m[1]) ? parseInt(m[1], 10) : WORDS[m[1]];
  if (!n) return null;
  return { n, unit: m[2] as "day" | "week" | "month" | "year" };
}

export function addPeriod(start: Date, p: NonNullable<ReturnType<typeof parsePeriod>>): Date {
  switch (p.unit) {
    case "day": return addDays(start, p.n);
    case "week": return addWeeks(start, p.n);
    case "month": return addMonths(start, p.n);
    case "year": return addYears(start, p.n);
  }
}

/** Re-do the extractor's date arithmetic in code. Returns the computed date and a note if it disagrees. */
export function checkDeadline(d: {
  period: string | null; trigger: string | null; deadline_date: string | null; deadline_status: string;
}, judgmentDate: string | null): { computed: string | null; note: string | null } {
  if (d.deadline_status === "needs_human") {
    return d.deadline_date
      ? { computed: null, note: "A date was given although the trigger needs a human (e.g. receipt of copy). Date ignored." }
      : { computed: null, note: null };
  }
  if (d.deadline_status !== "calculated") return { computed: null, note: null };
  const p = parsePeriod(d.period);
  const jd = toDate(judgmentDate);
  if (d.trigger === "judgment_date" && p && jd) {
    const computed = iso(addPeriod(jd, p));
    if (d.deadline_date && d.deadline_date !== computed)
      return { computed, note: `Model said ${d.deadline_date}; code computes ${computed} (${d.period} from ${judgmentDate}).` };
    return { computed, note: null };
  }
  if (d.deadline_date && toDate(d.deadline_date)) return { computed: d.deadline_date, note: null };
  return { computed: null, note: "Could not verify the deadline arithmetic; please check." };
}

/** Normalise text for verbatim quote matching (whitespace, quotes, dashes, hyphenation at line breaks). */
export function normaliseForMatch(s: string): string {
  return s
    .replace(/[‘’‚‛`´]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/-\s*\n\s*/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Deterministic check: does the quote appear verbatim (after normalisation) in the judgment text? */
export function quoteAppears(quote: string, fullText: string): boolean {
  const q = normaliseForMatch(quote).replace(/^["']|["']$/g, "").replace(/\.{3}|…/g, "\u0000");
  if (q.length < 8) return false;
  const t = normaliseForMatch(fullText);
  // Allow ellipses in the quote: every fragment must appear, in order.
  let from = 0;
  for (const frag of q.split("\u0000").map((f) => f.trim()).filter(Boolean)) {
    const at = t.indexOf(frag, from);
    if (at === -1) return false;
    from = at + frag.length;
  }
  return true;
}

export interface DirectionLike {
  deadline_status: string | null;
  deadline_date: string | null;
  corrected_deadline_date?: string | null;
  corrected_trigger?: string | null;
  corrected_period?: string | null;
  period: string | null;
  trigger: string | null;
  date_of_receipt?: string | null;
  stay_details?: unknown;
  status?: string | null;
}

/** The effective deadline after human corrections and receipt dates. */
export function effectiveDeadline(d: DirectionLike): string | null {
  if (d.corrected_deadline_date) return d.corrected_deadline_date;
  const trigger = d.corrected_trigger ?? d.trigger;
  const period = d.corrected_period ?? d.period;
  if (trigger === "receipt_of_copy" || d.deadline_status === "needs_human") {
    const r = toDate(d.date_of_receipt ?? null);
    const p = parsePeriod(period);
    return r && p ? iso(addPeriod(r, p)) : null;
  }
  return d.deadline_date;
}

/** Status rules from handoff section 8. */
export function computeStatus(d: DirectionLike, today: Date = new Date()): {
  task_status: TaskStatus; days_remaining: number | null; deadline: string | null; review_date: string | null;
} {
  if (d.status === "rejected") return { task_status: "rejected", days_remaining: null, deadline: null, review_date: null };
  const deadline = effectiveDeadline(d);
  if (d.stay_details) return { task_status: "paused", days_remaining: null, deadline, review_date: null };
  if (d.deadline_status === "immediate" && !d.corrected_deadline_date)
    return { task_status: "urgent", days_remaining: null, deadline: null, review_date: null };
  if (d.deadline_status === "none_stated" && !d.corrected_deadline_date)
    return { task_status: "no_deadline", days_remaining: null, deadline: null, review_date: iso(addDays(today, NO_DEADLINE_REVIEW_DAYS)) };
  if (!deadline) return { task_status: "date_pending", days_remaining: null, deadline: null, review_date: null };
  const days = differenceInCalendarDays(parseISO(deadline), today);
  const task_status: TaskStatus = days <= 0 ? "overdue" : days <= DUE_SOON_DAYS ? "due_soon" : "on_track";
  return { task_status, days_remaining: days, deadline, review_date: null };
}

/** Internal milestones at 25 / 50 / 75 % of the period between start and deadline. */
export function milestones(start: string | null, deadline: string | null) {
  const s = toDate(start);
  const e = toDate(deadline);
  if (!s || !e) return null;
  const total = differenceInCalendarDays(e, s);
  if (total <= 0) return null;
  const at = (f: number) => iso(addDays(s, Math.round(total * f)));
  return { decision_by: at(0.25), reminder_50: at(0.5), action_by: at(0.75), reminder_75: at(0.75), deadline: iso(e) };
}

/** Contempt limitation: one year from the date the deadline was missed (Contempt of Courts Act s.20). */
export function contemptWindowEnds(deadline: string | null): string | null {
  const d = toDate(deadline);
  return d ? iso(addYears(d, 1)) : null;
}
