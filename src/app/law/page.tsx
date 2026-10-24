"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, BadgeCheck, Download, Library, Loader2, Scale } from "lucide-react";
import { LANGUAGES, runLawGuide, type LawAnswer } from "@/lib/pipeline";
import { isConfigured } from "@/lib/ai/providers";
import { ErrorBox, download } from "@/components/ui";
import { SourceChip, SourcesPanel } from "@/components/Sources";
import { OFFICIAL_SOURCES, sourcesFor, type OfficialSource } from "@/lib/sources";
import { PageHeader } from "@/components/Shell";

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
    "## Where to read the official text",
    ...answerSources(question, a).map((o) => `- ${o.name}: ${o.url}`),
    "",
    "## Law versions used",
    ...r.documents.map((d) => `- ${d.title}${d.act_year ? ` (${d.act_year})` : ""}${d.version_note ? ` — ${d.version_note}` : ""}, uploaded ${d.uploaded_at.slice(0, 10)}`),
    "",
    "Free legal aid: your nearest District Legal Services Authority (DLSA) or a law-school legal-aid clinic.",
  ].join("\n");
}

/** Official sites for this answer: the ones LawGuide named, plus keyword matches on the question. */
function answerSources(question: string, a: LawAnswer): OfficialSource[] {
  const named = a.official_sources.map((id) => OFFICIAL_SOURCES.find((o) => o.id === id)).filter((o): o is OfficialSource => !!o);
  const out = [...named];
  for (const o of [...a.law_says.flatMap((l) => sourcesFor(l.act, 1)), ...sourcesFor(question)]) if (!out.some((x) => x.id === o.id)) out.push(o);
  return out.slice(0, 5);
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
    <div className="space-y-6">
      <PageHeader title="Know Your Law" subtitle={<>Ask about an Act, a Rule or a filing in plain words. No upload needed.</>}>
        <div className="mt-3"><Link href="/law/knowledge" className="btn-ghost"><Library size={16} /> Acts in the library</Link></div>
      </PageHeader>

      <section className="card space-y-4 p-4">
        <div className="flex flex-wrap gap-2">
          {LANGUAGES.map((l) => (
            <button key={l.id} onClick={() => setLang(l.id)}
              className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${lang === l.id ? "border-dusk bg-dusk text-paper-raised" : "border-mist-line bg-paper-raised text-ink-soft hover:bg-haze"}`}>{l.native}</button>
          ))}
        </div>
        <textarea className="input min-h-24" value={question} onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. I work at IIM Visakhapatnam. Am I a government servant for the purpose of being a trustee in an NGO applying for FCRA registration?" />
        <button className="btn-primary" disabled={busy || question.trim().length < 8} onClick={ask}>
          {busy && <Loader2 size={18} className="animate-spin" />} {busy ? "Reading the law…" : "Ask"}
        </button>
        <ErrorBox error={error} />
      </section>

      {a && r && (
        <section className="space-y-4">
          {r.live && (
            <div className="notice">
              <span>
                <b>Answered from official government websites (live search)</b> — not from Nirdesh&apos;s law library, so the exact wording is not checked.
                Open the official pages below before relying on it.
              </span>
            </div>
          )}
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
            <p className="text-sm font-medium text-ink">{a.in_one_line}</p>
          </div>
          <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-5">
            <h3 className="mb-2 text-sm font-semibold tracking-wide text-emerald-800 uppercase">What you should do</h3>
            <ol className="list-decimal space-y-1 pl-5 text-sm">{a.what_to_do.map((s, i) => <li key={i}>{s}</li>)}</ol>
          </div>
          <div className="rounded-2xl border-2 border-line bg-white p-5">
            <h3 className="mb-2 text-sm font-semibold tracking-wide text-muted uppercase">The law says</h3>
            {a.law_says.length === 0 && r.related.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs text-mist">Related sections found in Nirdesh&apos;s library (official text, unedited):</p>
                {r.related.map((x, i) => (
                  <div key={i}>
                    <p className="text-sm font-semibold">{x.act} — {x.section}</p>
                    <pre className="mt-1 max-h-60 overflow-auto rounded-lg bg-paper p-3 font-sans text-xs whitespace-pre-wrap">{x.text}</pre>
                  </div>
                ))}
              </div>
            )}
            {a.law_says.length === 0 && r.related.length === 0 && (
              <p className="text-sm text-mist">
                {r.notInLibrary
                  ? "This law is not in Nirdesh's library, so nothing is quoted. Read the official text using the links below."
                  : "No section from the uploaded Acts answers this directly."}
              </p>
            )}
            {r.removedQuotes > 0 && (
              <p className="mt-2 flex items-center gap-1 text-xs text-danger">
                <AlertTriangle size={14} /> {r.removedQuotes} quotation{r.removedQuotes > 1 ? "s" : ""} from the AI {r.removedQuotes > 1 ? "were" : "was"} removed because {r.removedQuotes > 1 ? "they are" : "it is"} not in the uploaded Acts word for word.
              </p>
            )}
            <ul className="space-y-3">
              {a.law_says.map((l, i) => {
                const ok = r.quoteChecks[i]?.verbatim;
                if (r.live)
                  // Live search: plain-language summary with the official page, never presented as a quotation.
                  return (
                    <li key={i}>
                      <p className="text-sm font-semibold">{l.act} — {l.section}</p>
                      <p className="mt-1 text-sm">{l.quote}</p>
                      {/^https?:\/\//.test(l.chunk) && (
                        <a href={l.chunk} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-dusk underline">Official page</a>
                      )}
                    </li>
                  );
                return (
                  <li key={i}>
                    <p className="text-sm font-semibold">{l.act} — {l.section}</p>
                    <blockquote className="mt-1 border-l-4 border-brand-soft pl-3 italic">&ldquo;{l.quote}&rdquo;</blockquote>
                    <p className={`mt-1 flex items-center gap-1 text-xs ${ok ? "text-emerald-700" : "text-red-700"}`}>
                      {ok ? <><BadgeCheck size={14} /> Quote found word for word in the uploaded Act</> : <><AlertTriangle size={14} /> Could not match this quote word for word — check the Act before relying on it</>}
                    </p>
                    <OfficialTextLink act={l.act} chunk={r.sources[Number(l.chunk.replace(/\D/g, "")) - 1]} />
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5">
            <h3 className="mb-2 text-sm font-semibold tracking-wide text-amber-800 uppercase">Be careful</h3>
            <p className="text-sm whitespace-pre-line">{a.be_careful}</p>
          </div>

          {answerSources(asked, a).length > 0 && (
            <div className="rounded-2xl border border-line bg-white p-4">
              <h3 className="mb-2 text-sm font-semibold">Read the official text / file officially</h3>
              <div className="flex flex-wrap gap-2">{answerSources(asked, a).map((o) => <SourceChip key={o.id} source={o} />)}</div>
            </div>
          )}

          <button className={`w-full ${a.uncertain ? "btn-primary" : "btn-ghost"}`} onClick={() => download("legal-aid-question.md", handoffMarkdown(asked, a, r))}>
            <Scale size={18} /> Prepare for legal aid <Download size={16} />
          </button>

          {r.live && (
            <div className="rounded-2xl border border-line bg-white p-4">
              <h3 className="mb-2 text-sm font-semibold">Official pages used ({r.live.sources.length})</h3>
              <ul className="space-y-1 text-sm">
                {r.live.sources.map((s) => (
                  <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer" className="text-dusk underline">{s.title || s.url}</a></li>
                ))}
              </ul>
            </div>
          )}

          <div className="text-xs text-muted">
            <p>
              Based on:{" "}
              {r.live
                ? `live search of official government websites (${r.live.model}), ${new Date().toLocaleDateString("en-GB")}`
                : r.documents.length
                ? r.documents.map((d) => `${d.title}${d.act_year ? ` (${d.act_year})` : ""}${d.version_note ? ` — ${d.version_note}` : ""}, as uploaded on ${d.uploaded_at.slice(0, 10)}`).join("; ")
                : "no Acts uploaded yet"}
            </p>
            <p className="mt-1">This is general information, not legal advice. Live AI answer.</p>
          </div>
        </section>
      )}

      <SourcesPanel defaultOpen={!r} />
    </div>
  );
}

function OfficialTextLink({ act, chunk }: { act: string; chunk?: Result["sources"][number] }) {
  if (chunk?.document.source_url)
    return (
      <a href={chunk.document.source_url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-brand underline">
        Official text of {chunk.document.title}
      </a>
    );
  const s = sourcesFor(act, 1)[0];
  return s ? <div className="mt-1"><SourceChip source={s} label={`Official text: ${s.name}`} /></div> : null;
}
