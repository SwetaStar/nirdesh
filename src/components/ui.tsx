"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { STATUS_META, type TaskStatus } from "@/lib/rules";

export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-nirdesh">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}

export function StatusBadge({ status }: { status: TaskStatus | "unresolved" | null | undefined }) {
  if (!status) return null;
  const m = STATUS_META[status];
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${m.color}`}>{m.label}</span>;
}

const CRITIC_COLORS: Record<string, string> = {
  approved: "bg-emerald-100 text-emerald-800",
  needs_correction: "bg-amber-100 text-amber-800",
  unresolved: "bg-orange-200 text-orange-900",
};
export function CriticBadge({ result }: { result: string | null }) {
  if (!result) return <span className="text-xs text-muted">—</span>;
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${CRITIC_COLORS[result] ?? "bg-zinc-100"}`}>
      {result.replace("_", " ")}
    </span>
  );
}

export function Countdown({ days }: { days: number | null | undefined }) {
  if (days === null || days === undefined) return null;
  if (days < 0) return <span className="text-xs font-semibold text-red-700">{-days} day{days === -1 ? "" : "s"} overdue</span>;
  if (days === 0) return <span className="text-xs font-semibold text-red-700">Due today</span>;
  return <span className="text-xs text-muted">{days} day{days === 1 ? "" : "s"} left</span>;
}

export function ErrorBox({ error }: { error: string | null }) {
  if (!error) return null;
  return <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>;
}

export function download(filename: string, content: string, type = "text/markdown") {
  const blob = new Blob([content], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
