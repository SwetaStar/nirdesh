"use client";

// Client-side orchestrator (a state machine, not a free-form LLM router).
// Each step: call the user's AI provider from the browser -> save the result via
// the server -> the saved pipeline_stage decides the next step. A reload resumes
// from the last saved stage.

import type { ZodType } from "zod";
import { callModel, canSearchOfficial, extractJson, searchOfficial, type CallArgs, type OfficialSearchResult } from "@/lib/ai/providers";
import { CITIZEN_PROMPT, CRITIC_PROMPT, EXTRACTOR_PROMPT, LAWGUIDE_PROMPT, PLANNER_PROMPT } from "@/lib/ai/prompts";
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
  console.warn(`${agent} invalid output:`, lastErr);
  throw new Error(
    `The AI model gave an answer in the wrong format twice, so Nirdesh did not use it. ` +
      `Small free models often do this — in Settings choose a stronger model (for example openai/gpt-oss-120b:free on OpenRouter, Gemini 3.5 Flash, or Claude).`,
  );
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

export const LANGUAGES = [
  { id: "English", native: "English" },
  { id: "Hindi", native: "हिन्दी" },
  { id: "Kannada", native: "ಕನ್ನಡ" },
  { id: "Marathi", native: "मराठी" },
  { id: "Telugu", native: "తెలుగు" },
] as const;

/** Citizen explanation: four layers, in the chosen language, from verified directions only. */
export async function runExplainer(orderId: string, language: string, question?: string) {
  const b = await api<{ order: Record<string, unknown>; directions: Record<string, unknown>[] }>(`/api/orders/${orderId}`);
  const { contemptWindowEnds } = await import("@/lib/rules");
  const dirs = b.directions
    .filter((d) => d.status === "verified")
    .map((d) => ({
      label: d.label, summary: d.summary, quote: d.quote, paragraph: d.paragraph,
      office: d.corrected_authority ?? d.responsible_authority, deadline: d.effective_deadline,
      deadline_kind: d.task_status, period: d.corrected_period ?? d.period, trigger: d.corrected_trigger ?? d.trigger,
      // Computed in code: one year from the date the deadline is missed (Contempt of Courts Act s.20).
      contempt_petition_generally_by: contemptWindowEnds(d.effective_deadline as string | null),
    }));
  const { text, model } = await runAgent(
    "Nirdesh_CitizenExplainer",
    {
      system: CITIZEN_PROMPT,
      user:
        `Preferred language: ${language}. Today's date: ${new Date().toISOString().slice(0, 10)}.\n` +
        `Format: exactly four sections, each starting with a markdown heading "## " (headings in ${language}), in this order: ` +
        `In one line; What you should do; What the order says; Be careful. Then the closing disclaimer line. Under 200 words in total.\n` +
        `The user's question: ${question?.trim() || "Explain this court order to me."}\n\n` +
        `CASE: ${JSON.stringify({ court: b.order.court, case_number: b.order.case_number, judgment_date: b.order.judgment_date, petitioners: b.order.petitioners, respondents: b.order.respondents })}\n\n` +
        `VERIFIED DIRECTIONS (dates computed by the system — use them as given):\n${JSON.stringify(dirs, null, 2)}`,
      effort: "medium",
    },
    orderId,
  );
  // Check in code that the explanation is really in the chosen language; if not, translate it once.
  const { isInLanguage } = await import("@/lib/language");
  let finalText = text;
  if (!isInLanguage(text.replace(/\(([^)]*)\)/g, ""), language)) {
    const t = await runAgent(
      "Nirdesh_CitizenExplainer (translate)",
      {
        system: `Translate this explanation into ${language} at a class-8 reading level. Keep the four "## " headings (translated), paragraph numbers, dates and the disclaimer. Keep official names of offices in English in brackets. Do not add anything.`,
        user: text,
        effort: "low",
      },
      orderId,
    ).catch(() => null);
    if (t && isInLanguage(t.text.replace(/\(([^)]*)\)/g, ""), language)) finalText = t.text;
  }
  await api("/api/drafts", { method: "POST", json: { type: "citizen_explanation", content: finalText, court_order_id: orderId, language, model_used: model } });
  return finalText;
}

export interface LawAnswer {
  in_one_line: string;
  what_to_do: string[];
  law_says: { act: string; section: string; quote: string; chunk: string }[];
  be_careful: string;
  uncertain: boolean;
  uncertain_reason: string | null;
  acts_used: { title: string; year: number | null }[];
  legal_aid: { summary: string; facts_given: string[]; sections: string[]; open_questions: string[] } | null;
  official_sources: string[];
}

interface LawChunk {
  id: string; section_ref: string; heading: string; content: string;
  document: { title: string; act_year: number | null; version_note: string | null; uploaded_at: string; source_url: string | null };
}

/** Know Your Law: search terms -> keyword retrieval -> LawGuide four-layer answer -> code checks quotes. */
export async function runLawGuide(question: string, chosenLanguage: string) {
  const { z } = await import("zod");
  const { languageOfText, isInLanguage } = await import("@/lib/language");
  // Answer in the language the question is written in; for Latin-script questions use the chosen button.
  const language = languageOfText(question, chosenLanguage) ?? chosenLanguage;
  const { OFFICIAL_SOURCES } = await import("@/lib/sources");
  await logSkill("know-your-law", "started", question.slice(0, 80));
  // Lenient on shape (small models return a boolean or a single string where a list is expected),
  // strict on content: quotes are still verified word for word against the Act afterwards.
  // Flatten anything a model returns (string, list, nested object) into readable text — never "[object Object]".
  const flat = (v: unknown): string =>
    v == null || v === false || v === true ? "" : typeof v === "string" ? v : typeof v === "number" ? String(v)
      : Array.isArray(v) ? v.map(flat).filter(Boolean).join("\n") : Object.values(v as object).map(flat).filter(Boolean).join("\n");
  const str = z.preprocess((v) => flat(v), z.string());
  const strList = z.preprocess((v) => (v == null ? [] : Array.isArray(v) ? v.map(flat).filter(Boolean) : [flat(v)].filter(Boolean)), z.array(z.string()));
  const bool = z.preprocess((v) => (typeof v === "string" ? /^(true|yes)$/i.test(v.trim()) : Boolean(v)), z.boolean());
  const Answer = z.object({
    in_one_line: str,
    what_to_do: strList.default([]),
    law_says: z.preprocess((v) => (Array.isArray(v) ? v : []), z.array(z.object({ act: str, section: str, quote: str, chunk: str }))).default([]),
    be_careful: str.default(""),
    uncertain: bool,
    uncertain_reason: z.preprocess((v) => (v == null || v === false ? null : String(v)), z.string().nullable()).default(null),
    acts_used: z.preprocess((v) => (Array.isArray(v) ? v : []), z.array(z.object({ title: str, year: z.coerce.number().nullable().catch(null).default(null) }))).default([]),
    legal_aid: z.preprocess((v) => (v && typeof v === "object" ? v : null), z.object({ summary: str, facts_given: strList.default([]), sections: strList.default([]), open_questions: strList.default([]) }).nullable()).default(null),
    official_sources: strList.default([]),
  });
  type Found = { chunks: LawChunk[]; documents: LawChunk["document"][] };
  const search = (q: string) => api<Found>(`/api/law?k=14&q=${encodeURIComponent(q)}`);
  // 1. Search the library with the question itself.
  let found = await search(question);
  // 2. If the library has Acts, ask the AI for the words the Acts themselves use (people say "how long to
  //    reply", the RTI Act says "disposal of request ... thirty days") and search again with both.
  if (found.documents.length) {
    const Terms = z.object({ terms: z.array(z.string()).default([]) });
    const t = await runJsonAgent(
      "Nirdesh_LawGuide (search terms)",
      Terms,
      {
        system:
          "You turn a citizen's legal question (any language) into 5-12 short English search terms that would appear in the text of the relevant Indian Bare Act: the Act's name and its own legal wording (e.g. 'disposal of request', 'thirty days', 'detain in custody', 'twenty-four hours', 'Magistrate', 'foreign contribution', 'registration', 'District Commission', 'complaint'). Use current law: BNSS replaced CrPC, BNS replaced IPC. Reply as JSON: {\"terms\": [...]}.",
        user: question,
        effort: "low",
        maxTokens: 4000,
      },
      "00000000-0000-0000-0000-000000000000",
    ).catch(() => ({ terms: [] as string[] }));
    if (t.terms.length) {
      const again = await search([question, ...t.terms].join(" "));
      if (again.chunks.length) found = again;
    }
  }
  // 3. Still nothing in the library. With Claude or Gemini, answer from official government websites
  //    (live search restricted to the official list); anything not backed by an official page is discarded.
  if (!found.chunks.length && canSearchOfficial()) {
    const live = await runOfficialSearch(question, language, Answer).then((r) => (r ? { ...r, language, languageNote: null as string | null } : r)).catch((e) => {
      console.warn("official search failed", e);
      return null;
    });
    if (live) return live;
  }
  // 4. Otherwise: the fixed "not in library" text. No AI call, so nothing can be guessed.
  if (!found.chunks.length) {
    const { NOT_IN_LIBRARY } = await import("@/lib/notInLibrary");
    const { sourcesFor } = await import("@/lib/sources");
    const t = NOT_IN_LIBRARY[language] ?? NOT_IN_LIBRARY.English;
    const official = [...new Set(["indiacode", ...sourcesFor(question).map((o) => o.id), "egazette"])];
    const ans: LawAnswer = {
      in_one_line: t.one, what_to_do: t.steps, law_says: [], be_careful: t.careful, uncertain: true,
      uncertain_reason: t.reason, acts_used: [],
      legal_aid: { summary: "The question concerns a law that is not in Nirdesh's library, so no section could be quoted.", facts_given: [], sections: [], open_questions: ["Which Act and section apply?", "Do the facts of my case change the answer?"] },
      official_sources: official,
    };
    await api("/api/law", {
      method: "POST",
      json: { question, language, answer_layers: ans, acts_cited: [], uncertain: true, quotes: [], handoff: { summary: ans.legal_aid!.summary, sections: [], open_questions: ans.legal_aid!.open_questions } },
    }).catch(() => {});
    return { answer: ans, quoteChecks: [], sources: [], documents: found.documents, removedQuotes: 0, notInLibrary: true, live: null, related: [] as { act: string; section: string; text: string }[], language, languageNote: null as string | null };
  }
  const context = found.chunks
    .map((c, i) => `[C${i + 1}] ${c.document.title}${c.document.act_year ? ` (${c.document.act_year})` : ""}, ${c.section_ref}${c.document.version_note ? ` — version: ${c.document.version_note}` : ""}, uploaded ${c.document.uploaded_at.slice(0, 10)}\n${c.content}`)
    .join("\n\n---\n\n");
  const sourceList = OFFICIAL_SOURCES.map((o) => `${o.id}: ${o.name} (${o.url}) — ${o.topics.join("; ")}`).join("\n");
  let ans = (await runJsonAgent(
    "Nirdesh_LawGuide",
    Answer,
    {
      system: LAWGUIDE_PROMPT,
      user:
        `User's language: ${language}. Write every field in ${language} EXCEPT "quote", which must be copied exactly from the source text.\n` +
        `Acts in the knowledge base: ${found.documents.map((d) => `${d.title}${d.act_year ? ` (${d.act_year})` : ""}`).join("; ") || "NONE"}.\n` +
        `Use ONLY the sections below. If they do not answer the question, set uncertain=true and say the law is not in the knowledge base.\n` +
        `If uncertain is true, fill legal_aid (summary, facts_given, sections, open_questions); otherwise legal_aid is null.\n` +
        `In official_sources list the ids (1-3) of the official websites below where the user can read the relevant law or file — especially when the law is not in the knowledge base. Never invent a website.\n` +
        `OFFICIAL SOURCES:\n${sourceList}\n\n` +
        `Reply as JSON: {"in_one_line","what_to_do":[3-5 steps],"law_says":[{"act","section","quote","chunk":"C#"}],"be_careful","uncertain","uncertain_reason","acts_used":[{"title","year"}],"legal_aid","official_sources":[ids]}.\n\n` +
        `QUESTION: ${question}\n\nSECTIONS FROM THE KNOWLEDGE BASE:\n${context || "(none found)"}`,
      effort: "high",
    },
    "00000000-0000-0000-0000-000000000000",
  )) as LawAnswer;
  // The answer must be in the chosen language. If not, ask the model to translate it (quotations unchanged).
  let languageNote: string | null = null;
  const visible = [ans.in_one_line, ...ans.what_to_do, ans.be_careful].join(" ");
  if (!isInLanguage(visible, language)) {
    try {
      const translated = await runJsonAgent(
        "Nirdesh_LawGuide (translate)",
        Answer,
        {
          system: `Translate the text fields of this JSON into ${language} (simple words, class-8 level). Do NOT translate or change the "quote", "act", "section" or "chunk" fields. Keep the same JSON shape. Reply with the JSON only.`,
          user: JSON.stringify(ans),
          effort: "low",
        },
        "00000000-0000-0000-0000-000000000000",
      );
      const tv = [translated.in_one_line, ...translated.what_to_do, translated.be_careful].join(" ");
      if (isInLanguage(tv, language)) ans = { ...translated, law_says: ans.law_says };
      else languageNote = `The AI model could not answer in ${language}; the answer is shown in English. Try a stronger model in Settings.`;
    } catch {
      languageNote = `The AI model could not answer in ${language}; the answer is shown in English. Try a stronger model in Settings.`;
    }
  }
  const quotes = ans.law_says.map((l) => {
    const n = Number(l.chunk.replace(/\D/g, "")) - 1;
    return { text: l.quote, chunk_ids: found.chunks[n] ? [found.chunks[n].id] : found.chunks.map((c) => c.id) };
  });
  const saved = await api<{ id: string; quote_checks: { text: string; verbatim: boolean }[] }>("/api/law", {
    method: "POST",
    json: {
      question, language, answer_layers: ans, acts_cited: ans.acts_used, uncertain: ans.uncertain, quotes,
      handoff: ans.legal_aid ? { summary: ans.legal_aid.summary, sections: ans.legal_aid.sections, open_questions: ans.legal_aid.open_questions } : null,
    },
  });
  // Show only quotes that code found word for word in the uploaded Acts; drop the rest.
  const keep = ans.law_says.map((_, i) => saved.quote_checks[i]?.verbatim === true);
  const removedQuotes = keep.filter((k) => !k).length;
  const shown: LawAnswer = { ...ans, law_says: ans.law_says.filter((_, i) => keep[i]) };
  // An answer is shown only if at least one of its quotations is verified word for word.
  // Otherwise the AI's text is withheld and the user sees the library's own sections instead.
  let related: { act: string; section: string; text: string }[] = [];
  if (!shown.law_says.length) {
    const { NOT_IN_LIBRARY, UNVERIFIED } = await import("@/lib/notInLibrary");
    const t = NOT_IN_LIBRARY[language] ?? NOT_IN_LIBRARY.English;
    shown.in_one_line = UNVERIFIED[language] ?? UNVERIFIED.English;
    shown.what_to_do = t.steps;
    shown.be_careful = t.careful;
    shown.uncertain = true;
    shown.uncertain_reason = removedQuotes
      ? "The AI's quotations could not be found word for word in the uploaded Acts."
      : "The AI did not quote any section of the uploaded Acts.";
    related = found.chunks.slice(0, 3).map((c) => ({
      act: `${c.document.title}${c.document.act_year ? `, ${c.document.act_year}` : ""}`,
      section: c.section_ref,
      text: c.content.length > 1200 ? `${c.content.slice(0, 1200)}…` : c.content,
    }));
  }
  return { answer: shown, quoteChecks: shown.law_says.map((l) => ({ text: l.quote, verbatim: true })), sources: found.chunks, documents: found.documents, removedQuotes, notInLibrary: false, live: null, related, language, languageNote };
}

/** Know Your Law fallback: answer from official government websites only, clearly labelled as live search. */
async function runOfficialSearch(question: string, language: string, Answer: ZodType<LawAnswer>) {
  const { OFFICIAL_SOURCES } = await import("@/lib/sources");
  const domains = [...new Set(OFFICIAL_SOURCES.map((o) => new URL(o.url).hostname.replace(/^www\./, "")))];
  const system =
    LAWGUIDE_PROMPT +
    `\n\nLIVE SEARCH MODE: the knowledge base does not cover this question. Search ONLY these official Indian government websites: ${domains.join(", ")}. ` +
    `Never rely on memory or any other website. Indian criminal law changed on 1 July 2024 (BNS, BNSS and BSA replaced IPC, CrPC and Evidence Act) — use the current law. ` +
    `If the official sites do not clearly answer the question, set uncertain=true and say so.`;
  const user =
    `User's language: ${language}. Write every field in ${language}.\n` +
    `Reply with ONE JSON object only: {"in_one_line","what_to_do":[3-5 steps],"law_says":[{"act","section","quote":"what the section says, in plain words (not a quotation)","chunk":"URL of the official page"}],"be_careful","uncertain","uncertain_reason","acts_used":[{"title","year"}],"legal_aid":{"summary","facts_given","sections","open_questions"}}.\n\n` +
    `QUESTION: ${question}`;
  const t0 = Date.now();
  let r: OfficialSearchResult;
  try {
    r = await searchOfficial(system, user, domains);
    await api("/api/log", { method: "POST", json: { kind: "ai_call", agent: "Nirdesh_LawGuide (official websites)", provider: r.provider, model: r.model, request_summary: user.slice(0, 1500), response_text: `${r.text}\n\nOFFICIAL SOURCES USED:\n${r.sources.map((s) => s.url).join("\n")}`, ok: true, duration_ms: r.durationMs } }).catch(() => {});
  } catch (e) {
    await api("/api/log", { method: "POST", json: { kind: "ai_call", agent: "Nirdesh_LawGuide (official websites)", request_summary: user.slice(0, 1500), ok: false, error: e instanceof Error ? e.message : String(e), duration_ms: Date.now() - t0 } }).catch(() => {});
    throw e;
  }
  // No official page behind the answer -> do not show it.
  if (!r.sources.length) return null;
  let ans: LawAnswer;
  try {
    ans = Answer.parse(extractJson(r.text));
  } catch {
    return null;
  }
  const uniq = [...new Map(r.sources.map((s) => [s.url, s])).values()].slice(0, 8);
  await api("/api/law", {
    method: "POST",
    json: {
      question, language, answer_layers: { ...ans, live_sources: uniq }, acts_cited: ans.acts_used, uncertain: ans.uncertain, quotes: [],
      handoff: ans.legal_aid ? { summary: ans.legal_aid.summary, sections: ans.legal_aid.sections, open_questions: ans.legal_aid.open_questions } : null,
    },
  }).catch(() => {});
  return { answer: ans, quoteChecks: [] as { text: string; verbatim: boolean }[], sources: [] as LawChunk[], documents: [] as LawChunk["document"][], removedQuotes: 0, notInLibrary: false, live: { sources: uniq, model: `${r.provider}/${r.model}` }, related: [] as { act: string; section: string; text: string }[] };
}
