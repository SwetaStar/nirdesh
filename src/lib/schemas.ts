import { z } from "zod";

// Models sometimes return "" instead of null; normalise both to null.
const nullableStr = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => (v === undefined || v === null || v.trim() === "" || v === "null" ? null : v));

export const ExtractedDirection = z.object({
  id: z.string(),
  summary: z.string(),
  quote: z.string(),
  paragraph: nullableStr,
  responsible_authority: nullableStr,
  action_type: z.string().catch("other"),
  period: nullableStr,
  trigger: nullableStr,
  deadline_date: nullableStr,
  deadline_status: z.enum(["calculated", "needs_human", "immediate", "none_stated"]),
  beneficiary: nullableStr,
  confidence: z.enum(["high", "medium", "low"]).catch("medium"),
});
export type ExtractedDirection = z.infer<typeof ExtractedDirection>;

export const ExtractorOutput = z.object({
  case: z.object({
    court: nullableStr,
    case_number: nullableStr,
    judgment_date: nullableStr,
    petitioners: nullableStr,
    respondents: nullableStr,
  }),
  directions: z.array(ExtractedDirection),
  notes: nullableStr,
});
export type ExtractorOutput = z.infer<typeof ExtractorOutput>;

export const CriticFlag = z.enum(["quote_mismatch", "not_an_order", "wrong_authority", "deadline_error", "missed_direction"]);

export const CriticOutput = z.object({
  verdict: z.enum(["approved", "needs_correction"]),
  checks: z.array(
    z.object({
      id: z.string(),
      result: z.enum(["approved", "needs_correction", "unresolved"]),
      flags: z.array(z.string()).default([]),
      problem: nullableStr,
      correct_value: z.union([z.string(), z.null(), z.record(z.string(), z.unknown())]).optional().nullable(),
    }),
  ),
  missed_directions: z.array(z.string()).default([]),
  flags_for_human: z
    .array(z.object({ id: z.string(), flag: z.string(), note: z.string().nullable().default("") }))
    .default([]),
});
export type CriticOutput = z.infer<typeof CriticOutput>;
