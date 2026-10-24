"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, BadgeCheck, Download, Library, Loader2, Scale } from "lucide-react";
import { LANGUAGES, runLawGuide, type LawAnswer } from "@/lib/pipeline";
import { isConfigured } from "@/lib/ai/providers";
import { ErrorBox, download } from "@/components/ui";

type Result = Awaited<ReturnType<typeof runLawGuide>>;

function handoffMarkdown(question: string, a: LawAnswer, r: Result) {
  const la = a.legal_aid;
  return [
    "# Question for legal aid",
    "",
    "_Prepared with Nirdesh Know Your Law. General information, not legal advice._",
    "",
    "## The question",
    question,
    "",
    "## Facts given",
    ...(la?.facts_given?.length ? la.facts_given.map((f) => `- ${f}`) : ["- [ADD YOUR FACTS]"]),
    "",
    "## Relevant sections (quoted from the uploaded Bare Acts)",
    ...a.law_says.map((l) => `- **${l.act}, ${l.section}:** "${l.quote}"`),
    ...(la?.sections?.length ? ["", ...la.sections.map((s) => `- ${s}`)] : []),
    "",
    "## Why this needs a professional",
    a.uncertain_reason ?? la?.summary ?? "",
    "",
    "## Open questions",
    ...(la?.open_questions ?? []).map((q) => `- ${q}`),
    "",
    "## Law versions used",
    ...r.documents.map((d) => `- ${d.title}${d.act_year ? ` (${d.act_year})` : ""}${d.version_note ? ` — ${d.version_note}` : ""}, uploaded ${d.uploaded_at.slice(0, 10)}`),
    "",
    "Free legal aid: your nearest District Legal Services Authority (DLSA) or a law-school legal-aid clinic.",
  ].join("\n");
}

export default function LawPage() {
  const [question, setQuestion] = useState("");
  const [lang, setLang] = useState(() => (typeof window === "undefined" ? "English" : localStorage.getItem("nirdesh.lang") ?? "English"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [r, setR] = useState<Result | null>(null);
  const [asked, setAsked] = useState("");

  async function ask() {
    setError(null);
    if (!isConfigured()) return setError("Add your AI key in Settings first.");
    setBusy(true);
    setR(null);
    try {
      localStorage.setItem("nirdesh.lang", lang);
      setAsked(question);
      setR(await runLawGuide(question, lang));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const a = r?.answer;
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Know Your Law</h1>
          <p className="mt-1 text-lg text-muted">Ask about an Act, a Rule or a filing in plain words. No upload needed.</p>
        </div>
        <Link href="/law/knowledge" className="btn-ghost"><Library size={16} /> Acts in the library</Link>
      </div>

      <section className="card space-y-4 p-6">
        <div className="flex flex-wrap gap-2">
          {LANGUAGES.map((l) => (
            <button key={l.id} onClick={() => setLang(l.id)}
              className={`rounded-xl border-2 px-4 py-2 ${lang === l.id ? "border-brand bg-brand-soft font-semibold text-brand" : "border-line"}`}>{l.native}</button>
          ))}
        </div>
        <textarea className="input min-h-28 text-base" value={question} onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. I work at IIM Visakhapatnam. Am I a government servant for the purpose of being a trustee in an NGO applying for FCRA registration?" />
        <button className="btn-primary px-6 py-3 text-base" disabled={busy || question.trim().length < 8} onClick={ask}>
          {busy && <Loader2 size={18} className="animate-spin" />} {busy ? "Reading the law…" : "Ask"}
        </button>
        <ErrorBox error={error} />
      </section>

      {a && r && (
        <section className="space-y-4">
          {a.uncertain && (
            <div className="flex gap-3 rounded-2xl border-2 border-orange-300 bg-orange-50 p-5">
              <AlertTriangle className="shrink-0 text-orange-700" />
              <div>
                <p className="font-semibold text-orange-900">This needs a human expert.</p>
                <p className="text-orange-900">{a.uncertain_reason}</p>
              </div>
            </div>
          )}
          <div className="rounded-2xl border-2 border-brand bg-brand-soft p-5">
            <h3 className="mb-1 text-sm font-semibold tracking-wide text-brand uppercase">In one line</h3>
            <p className="text-lg">{a.in_one_line}</p>
          </div>
          <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-5">
            <h3 className="mb-2 text-sm font-semibold tracking-wide text-emerald-800 uppercase">What you should do</h3>
            <ol className="list-decimal space-y-1 pl-5 text-base">{a.what_to_do.map((s, i) => <li key={i}>{s}</li>)}</ol>
          </div>
          <div className="rounded-2xl border-2 border-line bg-white p-5">
            <h3 className="mb-2 text-sm font-semibold tracking-wide text-muted uppercase">The law says</h3>
            {a.law_says.length === 0 && <p className="text-muted">No section from the uploaded Acts answers this directly.</p>}
            <ul className="space-y-3">
              {a.law_says.map((l, i) => {
                const ok = r.quoteChecks[i]?.verbatim;
                return (
                  <li key={i}>
                    <p className="text-sm font-semibold">{l.act} — {l.section}</p>
                    <blockquote className="mt-1 border-l-4 border-brand-soft pl-3 italic">&ldquo;{l.quote}&rdquo;</blockquote>
                    <p className={`mt-1 flex items-center gap-1 text-xs ${ok ? "text-emerald-700" : "text-red-700"}`}>
                      {ok ? <><BadgeCheck size={14} /> Quote found word for word in the uploaded Act</> : <><AlertTriangle size={14} /> Could not match this quote word for word — check the Act before relying on it</>}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5">
            <h3 className="mb-2 text-sm font-semibold tracking-wide text-amber-800 uppercase">Be careful</h3>
            <p className="text-base whitespace-pre-line">{a.be_careful}</p>
          </div>

          <button className={`w-full py-4 text-base ${a.uncertain ? "btn-primary" : "btn-ghost"}`} onClick={() => download("legal-aid-question.md", handoffMarkdown(asked, a, r))}>
            <Scale size={18} /> Prepare for legal aid <Download size={16} />
          </button>

          <div className="text-xs text-muted">
            <p>
              Based on:{" "}
              {r.documents.length
                ? r.documents.map((d) => `${d.title}${d.act_year ? ` (${d.act_year})` : ""}${d.version_note ? ` — ${d.version_note}` : ""}, as uploaded on ${d.uploaded_at.slice(0, 10)}`).join("; ")
                : "no Acts uploaded yet"}
            </p>
            <p className="mt-1">This is general information, not legal advice. Live AI answer.</p>
          </div>
        </section>
      )}
    </div>
  );
}
