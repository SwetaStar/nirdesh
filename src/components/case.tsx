"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, PauseCircle, RotateCw } from "lucide-react";
import { STAGE_LABEL, advance, api } from "@/lib/pipeline";
import { CriticBadge, Countdown, ErrorBox, StatusBadge } from "@/components/ui";
import type { TaskStatus } from "@/lib/rules";

export interface Direction {
  id: string; label: string; summary: string | null; quote: string | null; paragraph: string | null;
  responsible_authority: string | null; action_type: string | null; period: string | null; trigger: string | null;
  deadline_date: string | null; deadline_status: string | null; beneficiary: string | null; confidence: string | null;
  quote_verified: boolean | null; date_check_note: string | null;
  critic_result: string | null; critic_flags: string[]; critic_problem: string | null;
  flags_for_human: { id: string; flag: string; note: string }[];
  human_decision: string | null; decided_by: string | null; decided_at: string | null;
  corrected_authority: string | null; corrected_deadline_date: string | null; corrected_trigger: string | null; corrected_period: string | null;
  owner_office: string | null; owner_source: string | null; status: string;
  task_status: TaskStatus | null; days_remaining: number | null; effective_deadline: string | null; review_date: string | null;
  date_of_receipt: string | null; stay_details: { court: string; date: string; order_no: string } | null;
  appeal_info: { writ_appeal_approx: string; slp_supreme_court: string; label: string; note: string } | null;
}
export interface Bundle {
  order: {
    id: string; case_number: string | null; court: string | null; judgment_date: string | null; petitioners: string | null;
    respondents: string | null; file_name: string; ocr_used: boolean; pipeline_stage: string; extractor_notes: string | null;
    missed_directions: string[]; correction_round: number; directions_total: number; directions_approved: number; user_role: string;
  };
  directions: Direction[];
  tasks: { id: string; direction_id: string; title: string; due_date: string | null; status: string; owner: string | null }[];
  drafts: { id: string; type: string; content: string; created_at: string; model_used: string | null; language: string | null; direction_id: string | null }[];
  calls: { id: number; agent: string; provider: string | null; model: string | null; ok: boolean; error: string | null; duration_ms: number | null; ts: string }[];
}

const RUNNING = new Set(["needs_ocr", "uploaded", "critic_round_1", "correcting_1", "critic_round_2", "correcting_2", "critic_round_3"]);
const STEPS = [
  { key: "extract", label: "Extract", match: ["needs_ocr", "uploaded"] },
  { key: "critic", label: "Critic & corrections", match: ["critic_round_1", "correcting_1", "critic_round_2", "correcting_2", "critic_round_3"] },
  { key: "gate", label: "Your verification", match: ["awaiting_gate"] },
  { key: "plan", label: "Plan & drafts", match: ["verified", "planned"] },
];

export function useCase(id: string) {
  const [b, setB] = useState<Bundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState<string | null>(null);
  const running = useRef(false);

  const reload = useCallback(async () => {
    const r = await api<Bundle>(`/api/orders/${id}`);
    setB(r);
    return r;
  }, [id]);

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setError(null);
    try {
      await advance(id, (stage) => {
        setLive(stage);
        reload().catch(() => {});
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      running.current = false;
      setLive(null);
      await reload().catch(() => {});
    }
  }, [id, reload]);

  useEffect(() => {
    (async () => {
      const r = await reload();
      if (RUNNING.has(r.order.pipeline_stage)) await run();
    })().catch((e) => setError(e.message));
  }, [reload, run]);

  return { b, error, setError, live, run, reload };
}

export function CaseHeader({ b }: { b: Bundle }) {
  const o = b.order;
  return (
    <div className="card p-6">
      <p className="text-xs tracking-wide text-muted uppercase">{o.court ?? "Court"}</p>
      <h1 className="text-xl font-semibold">{o.case_number ?? o.file_name}</h1>
      <p className="mt-1 text-sm text-muted">
        {o.petitioners && <>{o.petitioners} <span className="mx-1">vs</span> {o.respondents}</>}
        {o.judgment_date && <> · Judgment dated {o.judgment_date}</>}
      </p>
      <p className="mt-2 flex flex-wrap gap-2 text-xs text-muted">
        <span className="rounded-full bg-lavender px-2 py-0.5">File: {o.file_name}</span>
        {o.ocr_used && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-800">Scanned — text read by AI</span>}
      </p>
    </div>
  );
}

export function Progress({ stage, live, error, onRetry }: { stage: string; live: string | null; error: string | null; onRetry: () => void }) {
  const current = STEPS.findIndex((s) => s.match.includes(stage));
  return (
    <div className="card space-y-4 p-5">
      <ol className="flex flex-wrap gap-2">
        {STEPS.map((s, i) => (
          <li key={s.key} className={`flex items-center gap-2 rounded-full px-3 py-1 text-sm ${i < current ? "bg-emerald-50 text-emerald-800" : i === current ? "bg-brand text-white" : "bg-lavender text-muted"}`}>
            {i < current ? <CheckCircle2 size={14} /> : <span className="text-xs">{i + 1}</span>}
            {s.label}
          </li>
        ))}
      </ol>
      {live && RUNNING.has(live) && (
        <p className="flex items-center gap-2 text-sm text-brand">
          <Loader2 size={16} className="animate-spin" /> {STAGE_LABEL[live]}… (live AI call — this can take a minute)
        </p>
      )}
      {error && (
        <div className="space-y-2">
          <ErrorBox error={error} />
          <button className="btn-ghost" onClick={onRetry}><RotateCw size={14} /> Retry from the last saved step</button>
        </div>
      )}
      {!live && !error && RUNNING.has(stage) && (
        <button className="btn-primary" onClick={onRetry}><RotateCw size={14} /> Continue processing</button>
      )}
    </div>
  );
}

type GateChoice = { decision: "approved" | "corrected" | "rejected"; corrected_authority?: string; corrected_deadline_date?: string; corrected_trigger?: string; corrected_period?: string };

export function Gate({ b, onDone }: { b: Bundle; onDone: () => void }) {
  const [choices, setChoices] = useState<Record<string, GateChoice>>({});
  // Gate only renders client-side after data loads, so reading localStorage here is safe.
  const [name, setName] = useState(() => (typeof window === "undefined" ? "" : localStorage.getItem("nirdesh.officer") ?? ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirs = [...b.directions].sort((a, c) => Number(c.critic_result === "unresolved") - Number(a.critic_result === "unresolved"));
  const left = b.directions.filter((d) => !choices[d.id]).length;

  const set = (id: string, patch: Partial<GateChoice>) => setChoices((c) => ({ ...c, [id]: { ...(c[id] ?? { decision: "approved" }), ...patch } as GateChoice }));

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      localStorage.setItem("nirdesh.officer", name);
      await api(`/api/orders/${b.order.id}/gate`, {
        method: "POST",
        json: { decided_by: name, decisions: b.directions.map((d) => ({ id: d.id, ...choices[d.id] })) },
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card space-y-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Verification gate</h2>
          <p className="text-sm text-muted">Nothing moves until you approve, correct or reject every item. Your decision is stored separately from the AI&apos;s and the critic&apos;s.</p>
        </div>
        <span className="rounded-full bg-brand-soft px-3 py-1 text-sm font-medium text-brand">{left} of {b.directions.length} left</span>
      </div>

      {b.order.missed_directions?.length > 0 && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm">
          <p className="font-medium text-orange-900">The critic thinks these may be missed directions:</p>
          <ul className="mt-1 list-disc pl-5 text-orange-900">{b.order.missed_directions.map((q, i) => <li key={i}>&ldquo;{q}&rdquo;</li>)}</ul>
          <p className="mt-1 text-xs text-orange-800">Check them against the judgment. If one is a real direction, note it before approving the rest.</p>
        </div>
      )}

      <div className="space-y-3">
        {dirs.map((d) => {
          const c = choices[d.id];
          const unresolved = d.critic_result === "unresolved";
          return (
            <div key={d.id} className={`rounded-2xl border p-4 ${unresolved ? "border-orange-300 bg-orange-50/50" : "border-line"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-lg bg-ink px-2 py-0.5 text-xs font-semibold text-white">{d.label}</span>
                <span className="font-medium">{d.summary}</span>
                <span className="ml-auto flex items-center gap-2"><span className="text-xs text-muted">Critic:</span><CriticBadge result={d.critic_result} /></span>
              </div>
              <blockquote className="mt-3 border-l-4 border-brand-soft pl-3 text-sm italic">
                &ldquo;{d.quote}&rdquo; <span className="not-italic text-muted">— para {d.paragraph ?? "?"}</span>
                {d.quote_verified === false
                  ? <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs not-italic text-red-800">not found word-for-word in the text</span>
                  : <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-xs not-italic text-emerald-800">quote found in text ✓</span>}
              </blockquote>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-4">
                <div><dt className="text-xs text-muted">Authority</dt><dd>{d.responsible_authority ?? "—"}</dd></div>
                <div><dt className="text-xs text-muted">Period / trigger</dt><dd>{d.period ?? "—"} · {d.trigger ?? "—"}</dd></div>
                <div><dt className="text-xs text-muted">Deadline</dt><dd>{d.deadline_date ?? d.deadline_status?.replace("_", " ")}</dd></div>
                <div><dt className="text-xs text-muted">Beneficiary · confidence</dt><dd>{d.beneficiary ?? "—"} · {d.confidence}</dd></div>
              </dl>
              {(d.critic_problem || d.critic_flags?.length > 0 || d.flags_for_human?.length > 0) && (
                <div className="mt-3 space-y-1 text-sm">
                  {d.critic_flags?.length > 0 && <p className="flex flex-wrap gap-1">{d.critic_flags.map((f) => <span key={f} className="rounded bg-amber-100 px-1.5 text-xs text-amber-900">{f}</span>)}</p>}
                  {d.critic_problem && <p className="text-amber-900"><AlertTriangle size={14} className="mr-1 inline" />{d.critic_problem}</p>}
                  {d.flags_for_human?.map((f, i) => <p key={i} className="text-violet-900">For a legal officer — <b>{f.flag.replace("_", " ")}</b>: {f.note}</p>)}
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                {(["approved", "corrected", "rejected"] as const).map((k) => (
                  <button key={k} onClick={() => set(d.id, { decision: k })}
                    className={`btn ${c?.decision === k ? (k === "rejected" ? "bg-zinc-700 text-white" : "bg-brand text-white") : "border border-line bg-white"}`}>
                    {k === "approved" ? "Approve" : k === "corrected" ? "Correct" : "Reject"}
                  </button>
                ))}
              </div>
              {c?.decision === "corrected" && (
                <div className="mt-3 grid gap-3 sm:grid-cols-4">
                  <input className="input" placeholder={`Authority (${d.responsible_authority ?? ""})`} value={c.corrected_authority ?? ""} onChange={(e) => set(d.id, { corrected_authority: e.target.value })} />
                  <input className="input" type="date" title="Corrected deadline" value={c.corrected_deadline_date ?? ""} onChange={(e) => set(d.id, { corrected_deadline_date: e.target.value })} />
                  <select className="input" value={c.corrected_trigger ?? ""} onChange={(e) => set(d.id, { corrected_trigger: e.target.value })}>
                    <option value="">Trigger (unchanged)</option>
                    <option value="judgment_date">From judgment date</option>
                    <option value="receipt_of_copy">From receipt of copy</option>
                    <option value="other">Other</option>
                  </select>
                  <input className="input" placeholder={`Period (${d.period ?? ""})`} value={c.corrected_period ?? ""} onChange={(e) => set(d.id, { corrected_period: e.target.value })} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-end gap-3 border-t border-line pt-4">
        <div className="min-w-60 flex-1">
          <label className="label" htmlFor="officer">Decided by (your name and designation)</label>
          <input id="officer" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. A. Rao, Compliance Officer" />
        </div>
        <button className="btn-primary" disabled={busy || left > 0 || !name.trim()} onClick={submit}>
          {busy && <Loader2 size={16} className="animate-spin" />} Record decisions
        </button>
      </div>
      <ErrorBox error={error} />
    </section>
  );
}

export function DirectionCard({ d, tasks, onChange }: { d: Direction; tasks: Bundle["tasks"]; onChange: () => void }) {
  const [receipt, setReceipt] = useState(d.date_of_receipt ?? "");
  const [stay, setStay] = useState({ court: "", date: "", order_no: "" });
  const [showStay, setShowStay] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const patch = async (json: unknown) => {
    try { await api(`/api/directions/${d.id}`, { method: "PATCH", json }); onChange(); } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); }
  };
  if (d.status === "rejected") return null;
  return (
    <div className="rounded-2xl border border-line p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-lg bg-ink px-2 py-0.5 text-xs font-semibold text-white">{d.label}</span>
        <span className="font-medium">{d.summary}</span>
        <span className="ml-auto flex items-center gap-2"><Countdown days={d.days_remaining} /><StatusBadge status={d.task_status} /></span>
      </div>
      <p className="mt-2 text-sm text-muted">
        Owner: <b className="text-ink">{d.owner_office ?? "—"}</b>{d.owner_source === "judgment" ? " (named in judgment)" : d.owner_source === "human" ? " (set by officer)" : ""}
        {d.effective_deadline && <> · Deadline <b className="text-ink">{d.effective_deadline}</b></>}
        {d.review_date && d.task_status === "no_deadline" && <> · Review on <b className="text-ink">{d.review_date}</b></>}
        {" "}· para {d.paragraph}
      </p>
      {d.task_status === "date_pending" && (
        <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl bg-violet-50 p-3">
          <div><label className="label text-xs">Date the certified copy was received</label><input type="date" className="input" value={receipt} onChange={(e) => setReceipt(e.target.value)} /></div>
          <button className="btn-primary" disabled={!receipt} onClick={() => patch({ date_of_receipt: receipt })}>Compute deadline</button>
        </div>
      )}
      {d.stay_details ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-sky-900"><PauseCircle size={16} /> Stay: {d.stay_details.court}, {d.stay_details.date}, Order {d.stay_details.order_no}
          <button className="ml-2 text-xs underline" onClick={() => patch({ clear_stay: true })}>Stay vacated</button></p>
      ) : (
        <button className="mt-2 text-xs text-muted underline" onClick={() => setShowStay(!showStay)}>Stay obtained?</button>
      )}
      {showStay && !d.stay_details && (
        <div className="mt-2 grid gap-2 sm:grid-cols-4">
          <input className="input" placeholder="Court" value={stay.court} onChange={(e) => setStay({ ...stay, court: e.target.value })} />
          <input className="input" type="date" value={stay.date} onChange={(e) => setStay({ ...stay, date: e.target.value })} />
          <input className="input" placeholder="Order no." value={stay.order_no} onChange={(e) => setStay({ ...stay, order_no: e.target.value })} />
          <button className="btn-primary" disabled={!stay.court || !stay.date || !stay.order_no} onClick={() => patch({ stay_details: stay })}>Record stay</button>
        </div>
      )}
      {tasks.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {tasks.map((t) => <li key={t.id} className="flex justify-between gap-3 border-t border-line pt-1"><span>{t.title}</span><span className="shrink-0 text-muted">{t.due_date ?? "—"}</span></li>)}
        </ul>
      )}
      <ErrorBox error={err} />
    </div>
  );
}

export function AuditTrail({ b }: { b: Bundle }) {
  return (
    <section className="card overflow-x-auto p-6">
      <h2 className="mb-1 text-lg font-semibold">Audit trail</h2>
      <p className="mb-3 text-sm text-muted">What the AI extracted, what the critic said, and what the human decided — kept separately, never overwritten.</p>
      <table className="w-full text-left text-xs">
        <thead className="bg-lavender">
          <tr>{["ID", "AI: authority / deadline", "Code checks", "Critic", "Human decision", "Corrected values", "By / when"].map((h) => <th key={h} className="px-2 py-2 font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody>
          {b.directions.map((d) => (
            <tr key={d.id} className="border-t border-line align-top">
              <td className="px-2 py-2 font-semibold">{d.label}</td>
              <td className="px-2 py-2">{d.responsible_authority}<br />{d.deadline_date ?? d.deadline_status}</td>
              <td className="px-2 py-2">{d.quote_verified ? "quote ✓" : "quote ✗"}{d.date_check_note && <><br />{d.date_check_note}</>}</td>
              <td className="px-2 py-2"><CriticBadge result={d.critic_result} />{d.critic_flags?.length > 0 && <div className="mt-1 text-muted">{d.critic_flags.join(", ")}</div>}</td>
              <td className="px-2 py-2">{d.human_decision ?? "—"}</td>
              <td className="px-2 py-2">{[d.corrected_authority, d.corrected_deadline_date, d.corrected_trigger, d.corrected_period].filter(Boolean).join(" · ") || "—"}</td>
              <td className="px-2 py-2">{d.decided_by ?? "—"}<br />{d.decided_at ? new Date(d.decided_at).toLocaleString() : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {b.calls.length > 0 && (
        <details className="mt-4 text-xs">
          <summary className="cursor-pointer text-muted">{b.calls.length} live AI calls for this case</summary>
          <ul className="mt-2 space-y-1">
            {b.calls.map((c) => <li key={c.id}>{new Date(c.ts).toLocaleTimeString()} · {c.agent} · {c.provider}/{c.model} · {c.ok ? `${((c.duration_ms ?? 0) / 1000).toFixed(1)}s` : `failed: ${c.error}`}</li>)}
          </ul>
        </details>
      )}
    </section>
  );
}

