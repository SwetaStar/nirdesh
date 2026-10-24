"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Activity, Loader2 } from "lucide-react";
import { api, STAGE_LABEL } from "@/lib/pipeline";
import { Countdown, CriticBadge, ErrorBox, StatusBadge } from "@/components/ui";
import type { TaskStatus } from "@/lib/rules";
import { PageHeader } from "@/components/Shell";

interface Dir {
  id: string; label: string; summary: string | null; status: string; critic_result: string | null; human_decision: string | null;
  task_status: TaskStatus | null; days_remaining: number | null; effective_deadline: string | null; owner_office: string | null; paragraph: string | null;
}
interface Order {
  id: string; case_number: string | null; court: string | null; file_name: string; user_role: string; pipeline_stage: string;
  directions_total: number; directions_approved: number; is_sample: boolean; updated_at: string; directions: Dir[];
}
interface Data {
  stats: Record<string, number> & { hours_basis: { judgments: number; drafts: number; per_judgment: number; per_draft: number } };
  by_channel: { upload: number; email: number };
  orders: Order[];
  skills: { skill: string; status: string; invocation_count: number; last_run: string | null }[];
  activity: { id: number; skill: string; event: string; detail: string | null; ts: string; ref_id: string | null }[];
  issues: { id: string; department: string; direction_type: string; case_count: number; status: string }[];
}

const SKILL_LABEL: Record<string, string> = {
  "user-intake-routing": "User intake & routing",
  "direction-extraction": "Direction extraction",
  "extraction-verification": "Extraction verification",
  "verification-gate": "Verification gate",
  "compliance-planning-drafting": "Compliance planning & drafting",
  "citizen-explainer": "Citizen explainer",
  "policy-insights": "Policy insights",
  "live-compliance-dashboard": "Live compliance dashboard",
  "know-your-law": "Know Your Law",
};
const SKILL_ORDER = Object.keys(SKILL_LABEL);
const RUNNING = new Set(["needs_ocr", "uploaded", "critic_round_1", "correcting_1", "critic_round_2", "correcting_2", "critic_round_3"]);
const URGENCY: Record<string, number> = { overdue: 0, urgent: 1, due_soon: 2, date_pending: 3, on_track: 4, no_deadline: 5, paused: 6 };

type Tab = "live" | "needs" | "completed" | "all";

function needsYou(o: Order) {
  return (
    o.pipeline_stage === "awaiting_gate" ||
    o.directions.some((d) => d.task_status === "date_pending" || d.task_status === "overdue" || (d.status === "unverified" && d.critic_result === "unresolved"))
  );
}

export default function Dashboard() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("needs");

  const load = useCallback(() => api<Data>("/api/dashboard").then(setData).catch((e) => setError(e.message)), []);
  useEffect(() => {
    load();
    const t = setInterval(load, 5000); // live: refresh every 5 s
    return () => clearInterval(t);
  }, [load]);

  if (!data) return error ? <ErrorBox error={error} /> : <Loader2 className="animate-spin text-brand" />;
  const s = data.stats;
  const officerOrders = data.orders.filter((o) => o.user_role === "officer");
  const lists: Record<Tab, Order[]> = {
    live: officerOrders.filter((o) => RUNNING.has(o.pipeline_stage)),
    needs: officerOrders.filter(needsYou),
    completed: officerOrders.filter((o) => o.pipeline_stage === "planned" || o.pipeline_stage === "no_directions"),
    all: officerOrders,
  };
  const KPIS: [string, number, string][] = [
    ["Total directions", s.total, "text-ink"],
    ["Overdue", s.overdue, "text-red-700"],
    ["Due soon", s.due_soon, "text-amber-700"],
    ["Urgent", s.urgent, "text-rose-700"],
    ["Verified", s.verified, "text-emerald-700"],
    ["Date pending", s.date_pending, "text-violet-700"],
    ["No deadline", s.no_deadline, "text-slate-600"],
    ["Unresolved", s.unresolved, "text-orange-700"],
    ["Paused (stay)", s.paused, "text-sky-700"],
  ];

  return (
    <div className="grid gap-6 xl:grid-cols-[14rem_1fr_16rem]">
      {/* Left: orchestrator skills */}
      <aside className="card h-fit p-4">
        <h2 className="mb-3 text-sm font-semibold">Orchestrator skills</h2>
        <ul className="space-y-2">
          {SKILL_ORDER.map((k) => {
            const sk = data.skills.find((x) => x.skill === k);
            const running = sk?.status === "running";
            return (
              <li key={k} className="flex items-center gap-2 text-xs">
                <span className={`h-2 w-2 shrink-0 rounded-full ${running ? "pulse-dot bg-emerald-500" : "bg-zinc-300"}`} />
                <span className="flex-1">{SKILL_LABEL[k]}</span>
                <span className="text-muted">{sk?.invocation_count ?? 0}</span>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* Main */}
      <div className="min-w-0 space-y-6">
        <PageHeader title="Live compliance dashboard" subtitle={<>{s.overdue > 0 ? `${s.overdue} direction(s) overdue. ` : "Nothing overdue. "}
            {s.awaiting_gate > 0 ? `${s.awaiting_gate} awaiting verification.` : ""}</>} />

        <section className="card p-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            {KPIS.map(([label, n, color]) => (
              <div key={label}><p className={`text-2xl font-semibold ${color}`}>{n}</p><p className="text-xs text-muted">{label}</p></div>
            ))}
            <div>
              <p className="text-2xl font-semibold text-brand">{s.hours_saved}*</p>
              <p className="text-xs text-muted">Estimated hours saved</p>
            </div>
          </div>
          <p className="mt-4 border-t border-line pt-2 text-xs text-muted">
            * Estimate, not a measurement: ~{s.hours_basis.per_judgment} min manual reading per judgment ({s.hours_basis.judgments}) + {s.hours_basis.per_draft} min per drafted document ({s.hours_basis.drafts}).
            {data.by_channel.email > 0 && <> · By channel: {data.by_channel.upload} upload, {data.by_channel.email} email.</>}
          </p>
        </section>

        <section className="space-y-3">
          <div className="flex gap-1 rounded-xl bg-white p-1 text-sm">
            {([["live", "Live"], ["needs", "Needs you"], ["completed", "Completed"], ["all", "All"]] as [Tab, string][]).map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)} className={`flex-1 rounded-lg px-3 py-2 ${tab === k ? "bg-brand text-white" : "hover:bg-lavender"}`}>
                {label} <span className="opacity-70">({lists[k].length})</span>
              </button>
            ))}
          </div>
          {lists[tab].length === 0 && <p className="card p-4 text-sm text-muted">Nothing here.</p>}
          {lists[tab].map((o) => (
            <Link key={o.id} href={`/officer/case/${o.id}`} className="card block p-4 hover:border-brand">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{o.case_number ?? o.file_name} {o.is_sample && <span className="ml-1 rounded bg-amber-100 px-1 text-xs text-amber-800">SAMPLE</span>}</p>
                  <p className="truncate text-xs text-muted">{o.court ?? "—"}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs ${o.pipeline_stage === "awaiting_gate" ? "bg-brand text-white" : "bg-lavender"}`}>
                  {RUNNING.has(o.pipeline_stage) && <Loader2 size={12} className="mr-1 inline animate-spin" />}
                  {STAGE_LABEL[o.pipeline_stage] ?? o.pipeline_stage}
                </span>
              </div>
              {o.directions.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {[...o.directions].sort((a, b) => (URGENCY[a.task_status ?? ""] ?? 9) - (URGENCY[b.task_status ?? ""] ?? 9)).map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center gap-2 border-t border-line pt-1 text-xs">
                      <span className="font-semibold">{d.label}</span>
                      <span className="min-w-0 flex-1 truncate">{d.summary}</span>
                      {d.status === "unverified" ? <CriticBadge result={d.critic_result} /> : <><Countdown days={d.days_remaining} /><StatusBadge status={d.task_status} /></>}
                    </li>
                  ))}
                </ul>
              )}
            </Link>
          ))}
        </section>

        <section className="card p-4">
          <h2 className="mb-2 font-semibold">Systemic issues</h2>
          {data.issues.length === 0 ? (
            <p className="text-sm text-muted">None yet. When 3 or more judgments contain similar directions, Nirdesh flags a systemic issue and drafts a policy note.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {data.issues.map((i) => (
                <li key={i.id} className="flex justify-between border-t border-line pt-2"><span><b>{i.direction_type}</b> · {i.department}</span><span className="text-muted">{i.case_count} cases · {i.status.replace("_", " ")}</span></li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Right: live activity feed */}
      <aside className="card h-fit p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Activity size={16} className="text-brand" /> Live activity</h2>
        {data.activity.length === 0 && <p className="text-xs text-muted">No activity yet.</p>}
        <ul className="space-y-3">
          {data.activity.map((a) => (
            <li key={a.id} className="text-xs">
              <p className="flex items-center gap-1">
                <span className={`h-1.5 w-1.5 rounded-full ${a.event === "failed" ? "bg-red-500" : a.event === "completed" ? "bg-emerald-500" : "bg-amber-500"}`} />
                <b>{SKILL_LABEL[a.skill] ?? a.skill}</b> <span className="text-muted">{a.event}</span>
              </p>
              {a.detail && <p className="text-muted">{a.detail}</p>}
              <p className="text-[10px] text-muted">{new Date(a.ts).toLocaleTimeString()}</p>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
