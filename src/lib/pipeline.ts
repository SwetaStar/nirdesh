"use client";

// Client-side orchestrator (a state machine, not a free-form LLM router).
// Each step: call the user's AI provider from the browser -> save the result via
// the server -> the saved pipeline_stage decides the next step. A reload resumes
// from the last saved stage.

import type { ZodType } from "zod";
import { callModel, extractJson, type CallArgs } from "@/lib/ai/providers";
import { CRITIC_PROMPT, EXTRACTOR_PROMPT, PLANNER_PROMPT } from "@/lib/ai/prompts";
import { CriticOutput, ExtractorOutput } from "@/lib/schemas";
import { CORRECTION_ROUNDS } from "@/lib/rules";

export async function api<T = unknown>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.json !== undefined ? { "Content-Type": "application/json" } : init?.headers,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

const logSkill = (skill: string, event: "started" | "processing" | "completed" | "failed", detail: string, ref_id?: string) =>
  api("/api/log", { method: "POST", json: { kind: "skill", skill, event, detail, ref_id } }).catch(() => {});

/** Call an agent and record what was sent and received in the AI activity log. */
export async function runAgent(agent: string, args: CallArgs, refId?: string): Promise<{ text: string; model: string }> {
  try {
    const r = await callModel(args);
    await api("/api/log", {
      method: "POST",
      json: {
        kind: "ai_call", agent, provider: r.provider, model: r.model, ref_id: refId ?? null,
        request_summary: args.user.slice(0, 1500) + (args.pdfBase64 ? "\n[+ PDF attached]" : ""),
        response_text: r.text, ok: true, duration_ms: r.durationMs,
      },
    }).catch(() => {});
    return { text: r.text, model: `${r.provider}/${r.model}` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await api("/api/log", {
      method: "POST",
      json: { kind: "ai_call", agent, ref_id: refId ?? null, request_summary: args.user.slice(0, 1500), ok: false, error: msg },
    }).catch(() => {});
    throw e;
  }
}

/** JSON agent: validate against the schema; on invalid output retry once, then surface the error. */
async function runJsonAgent<T>(agent: string, schema: ZodType<T>, args: CallArgs, refId: string): Promise<T> {
  let lastErr = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const user = attempt === 0 ? args.user : `${args.user}\n\nYour previous reply was not valid JSON for the required format (${lastErr}). Reply with the JSON object only.`;
    const { text } = await runAgent(agent, { ...args, user, json: true }, refId);
    try {
      return schema.parse(extractJson(text));
    } catch (e) {
      lastErr = e instanceof Error ? e.message.slice(0, 300) : "invalid";
    }
  }
  throw new Error(`${agent} returned invalid output twice: ${lastErr}`);
}

interface DirectionRow {
  id: string; label: string; summary: string | null; quote: string | null; paragraph: string | null;
  responsible_authority: string | null; action_type: string | null; period: string | null; trigger: string | null;
  deadline_date: string | null; deadline_status: string | null; beneficiary: string | null; confidence: string | null;
  critic_result: string | null; critic_flags: string[]; critic_problem: string | null;
}
interface OrderBundle {
  order: {
    id: string; pipeline_stage: string; extracted_text: string | null; correction_round: number; court: string | null;
    case_number: string | null; judgment_date: string | null; petitioners: string | null; respondents: string | null;
    extractor_notes: string | null; missed_directions: string[];
  };
  directions: DirectionRow[];
  fileBase64?: string | null;
}

function asExtractorJson(b: OrderBundle) {
  const o = b.order;
  return {
    case: { court: o.court, case_number: o.case_number, judgment_date: o.judgment_date, petitioners: o.petitioners, respondents: o.respondents },
    directions: b.directions.map((d) => ({
      id: d.label, summary: d.summary, quote: d.quote, paragraph: d.paragraph, responsible_authority: d.responsible_authority,
      action_type: d.action_type, period: d.period, trigger: d.trigger, deadline_date: d.deadline_date,
      deadline_status: d.deadline_status, beneficiary: d.beneficiary, confidence: d.confidence,
    })),
    notes: o.extractor_notes,
  };
}

export const STAGE_LABEL: Record<string, string> = {
  needs_ocr: "Reading the scanned PDF",
  uploaded: "Extracting directions",
  critic_round_1: "Critic checking (round 1)",
  correcting_1: "Extractor correcting (round 1)",
  critic_round_2: "Critic checking (round 2)",
  correcting_2: "Extractor correcting (round 2)",
  critic_round_3: "Critic final check",
  awaiting_gate: "Waiting for your verification",
  no_directions: "No government directions found",
  verified: "Verified — ready to plan",
  planned: "Plan ready",
};

/** Run pipeline steps until it needs a human (the gate) or finishes. */
export async function advance(orderId: string, onStage: (stage: string) => void): Promise<string> {
  for (let guard = 0; guard < 10; guard++) {
    const b = await api<OrderBundle>(`/api/orders/${orderId}`);
    const stage = b.order.pipeline_stage;
    onStage(stage);
    const text = b.order.extracted_text ?? "";

    if (stage === "needs_ocr") {
      const withFile = await api<OrderBundle>(`/api/orders/${orderId}?file=1`);
      if (!withFile.fileBase64) throw new Error("Could not load the uploaded file.");
      await logSkill("direction-extraction", "started", "Reading scanned PDF with the AI (OCR fallback)", orderId);
      const { text: ocr } = await runAgent(
        "OCR",
        {
          system: "You transcribe scanned Indian court documents. Output the full text exactly as printed, page by page, starting each page with [Page N]. Keep paragraph numbers. Do not summarise, correct or add anything.",
          user: "Transcribe this document verbatim.",
          pdfBase64: withFile.fileBase64,
          maxTokens: 64000,
        },
        orderId,
      );
      await api(`/api/orders/${orderId}`, { method: "PATCH", json: { extracted_text: ocr } });
      continue;
    }

    if (stage === "uploaded") {
      await logSkill("direction-extraction", "started", "Reading the judgment", orderId);
      const out = await runJsonAgent(
        "Nirdesh_DirectionExtractor",
        ExtractorOutput,
        { system: EXTRACTOR_PROMPT, user: `JUDGMENT TEXT:\n\n${text}`, effort: "high" },
        orderId,
      );
      await api(`/api/orders/${orderId}/extraction`, { method: "POST", json: { output: out, round: 0 } });
      continue;
    }

    const criticMatch = stage.match(/^critic_round_(\d)$/);
    if (criticMatch) {
      const round = Number(criticMatch[1]);
      await logSkill("extraction-verification", "started", `Critic round ${round}`, orderId);
      const out = await runJsonAgent(
        "Nirdesh_Critic",
        CriticOutput,
        {
          system: CRITIC_PROMPT,
          user:
            `JUDGMENT TEXT:\n\n${text}\n\nEXTRACTOR JSON:\n${JSON.stringify(asExtractorJson(b), null, 2)}` +
            (round > CORRECTION_ROUNDS ? "\n\nThis is the FINAL round: anything still wrong must be \"unresolved\"." : ""),
          effort: "high",
        },
        orderId,
      );
      await api(`/api/orders/${orderId}/critic`, { method: "POST", json: { output: out, round } });
      continue;
    }

    const fixMatch = stage.match(/^correcting_(\d)$/);
    if (fixMatch) {
      const round = Number(fixMatch[1]);
      const flagged = b.directions.filter((d) => d.critic_result && d.critic_result !== "approved");
      const corrections = {
        fix_these: flagged.map((d) => ({ id: d.label, flags: d.critic_flags, problem: d.critic_problem })),
        missed_directions: b.order.missed_directions,
      };
      await logSkill("direction-extraction", "started", `Correction round ${round}: ${flagged.length} item(s)`, orderId);
      const out = await runJsonAgent(
        "Nirdesh_DirectionExtractor",
        ExtractorOutput,
        {
          system: EXTRACTOR_PROMPT,
          user:
            `JUDGMENT TEXT:\n\n${text}\n\nYOUR PREVIOUS JSON:\n${JSON.stringify(asExtractorJson(b), null, 2)}\n\n` +
            `CORRECTIONS FROM THE CRITIC (fix only these items; keep the rest unchanged; add any missed directions with new ids; ` +
            `if an item is not an operative order, leave it out):\n${JSON.stringify(corrections, null, 2)}`,
          effort: "high",
        },
        orderId,
      );
      await api(`/api/orders/${orderId}/extraction`, {
        method: "POST",
        json: { output: out, round, corrected: flagged.map((d) => d.label) },
      });
      continue;
    }

    return stage; // awaiting_gate, no_directions, verified, planned
  }
  throw new Error("Pipeline did not settle; please reload.");
}

/** Officer plan: code builds tasks/dates, the Planner explains them. */
export async function runPlan(orderId: string) {
  const plan = await api<{ directions: unknown[]; appeal_info: unknown; today: string; order: unknown }>(
    `/api/orders/${orderId}/plan`,
    { method: "POST", json: {} },
  );
  const { text, model } = await runAgent(
    "Nirdesh_PlannerDrafter",
    {
      system: PLANNER_PROMPT,
      user:
        `MODE: PLAN. Today's date: ${plan.today}.\n` +
        `Statuses, days remaining, internal milestone dates, tasks and appeal windows below were COMPUTED BY THE SYSTEM — ` +
        `use them exactly; do not recompute or invent dates. Present a markdown table (Direction | Para | Owner office | Tasks & dates | Status | Days left), ` +
        `then the appeal-window note, then one line on overall risk.\n\nCASE + VERIFIED DIRECTIONS:\n${JSON.stringify(plan, null, 2)}`,
      effort: "medium",
    },
    orderId,
  );
  await api("/api/drafts", { method: "POST", json: { type: "plan", content: text, court_order_id: orderId, model_used: model } });
  return text;
}

export const DRAFT_TYPES = {
  office_note: "Office note (comply-or-appeal options)",
  affidavit: "Compliance affidavit",
  reminder: "Reminder note",
  escalation: "Escalation note",
} as const;
export type DraftType = keyof typeof DRAFT_TYPES;

export async function runDraft(orderId: string, type: DraftType, directionId?: string) {
  const b = await api<{ order: Record<string, unknown>; directions: Record<string, unknown>[] }>(`/api/orders/${orderId}`);
  const dirs = b.directions.filter((d) => d.status === "verified" && (!directionId || d.id === directionId));
  const today = new Date().toISOString().slice(0, 10);
  const { text, model } = await runAgent(
    "Nirdesh_PlannerDrafter",
    {
      system: PLANNER_PROMPT,
      user:
        `MODE: DRAFT. Today's date: ${today}. Draft a ${DRAFT_TYPES[type]}.\n` +
        `Use corrected_* values when present. Use [BLANKS] for every fact not given. Do not state any action was taken.\n\n` +
        `CASE:\n${JSON.stringify({ court: b.order.court, case_number: b.order.case_number, judgment_date: b.order.judgment_date, petitioners: b.order.petitioners, respondents: b.order.respondents }, null, 2)}\n\n` +
        `VERIFIED DIRECTIONS:\n${JSON.stringify(dirs.map((d) => ({ label: d.label, summary: d.summary, quote: d.quote, paragraph: d.paragraph, responsible_authority: d.responsible_authority, corrected_authority: d.corrected_authority, owner_office: d.owner_office, deadline: d.effective_deadline, task_status: d.task_status, days_remaining: d.days_remaining, stay_details: d.stay_details })), null, 2)}`,
      effort: "medium",
    },
    orderId,
  );
  await api("/api/drafts", { method: "POST", json: { type, content: text, court_order_id: orderId, direction_id: directionId ?? null, model_used: model } });
  return text;
}
