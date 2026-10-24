"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { Download, Loader2, Scale } from "lucide-react";
import { LANGUAGES, runExplainer } from "@/lib/pipeline";
import { CaseHeader, Gate, Progress, useCase, type Bundle } from "@/components/case";
import { ErrorBox, Markdown, download } from "@/components/ui";

const CARD_STYLES = ["border-brand bg-brand-soft", "border-emerald-300 bg-emerald-50", "border-line bg-white", "border-amber-300 bg-amber-50"];

/** Split the explainer's markdown into its four "## " sections (plus any closing disclaimer). */
function splitLayers(md: string) {
  const parts = md.split(/^##\s+/m).map((p) => p.trim()).filter(Boolean);
  const sections = parts.map((p) => {
    const [title, ...rest] = p.split("\n");
    return { title: title.replace(/[*#]/g, "").trim(), body: rest.join("\n").trim() };
  });
  // Text before the first heading (rare) is kept as a preface.
  if (!md.trimStart().startsWith("##") && sections.length) sections[0] = { title: "", body: parts[0] };
  return sections;
}

function legalAidSummary(b: Bundle, explanation: string | undefined) {
  const o = b.order;
  const lines = [
    "# Case summary for legal aid",
    "",
    "_Prepared with Nirdesh. Facts below come from the court order as checked by the user; please verify against the certified copy._",
    "",
    `**Court:** ${o.court ?? "[COURT]"}  `,
    `**Case number:** ${o.case_number ?? "[CASE NUMBER]"}  `,
    `**Judgment date:** ${o.judgment_date ?? "[DATE]"}  `,
    `**Parties:** ${o.petitioners ?? "[PETITIONER]"} vs ${o.respondents ?? "[RESPONDENT]"}`,
    "",
    "## Directions to the government",
    ...b.directions.filter((d) => d.status === "verified").map((d) =>
      `- **${d.label}** (para ${d.paragraph ?? "?"}): "${d.quote}" — office: ${d.corrected_authority ?? d.responsible_authority ?? "[OFFICE]"}; deadline: ${d.effective_deadline ?? d.task_status?.replace("_", " ") ?? "[DEADLINE]"}`),
    "",
    "## Facts to add",
    "- Date the copy of the order was sent / received: [DATE]",
    "- What the office has done so far: [DETAILS]",
    "",
    "## Open questions for the lawyer / DLSA",
    "- Has the government complied, appealed or obtained a stay?",
    "- If the deadline has passed: should a contempt petition be filed, and by when (generally within one year of the missed deadline, Contempt of Courts Act s.20)?",
    ...(explanation ? ["", "## Plain-language explanation given to the user", "", explanation] : []),
  ];
  return lines.join("\n");
}

export default function CitizenCase() {
  const { id } = useParams<{ id: string }>();
  const { b, error, live, run, reload } = useCase(id);
  const [lang, setLang] = useState(() => (typeof window === "undefined" ? "English" : localStorage.getItem("nirdesh.lang") ?? "English"));
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!b) return error ? <ErrorBox error={error} /> : <Loader2 className="animate-spin text-brand" />;
  const stage = b.order.pipeline_stage;
  const explanation = b.drafts.find((d) => d.type === "citizen_explanation" && d.language === lang);

  async function explain() {
    setBusy(true);
    setErr(null);
    try {
      localStorage.setItem("nirdesh.lang", lang);
      await runExplainer(id, lang, question);
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const layers = explanation ? splitLayers(explanation.content) : [];
  const words = explanation ? explanation.content.split(/\s+/).filter(Boolean).length : 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <CaseHeader b={b} />
      <Progress stage={stage} live={live} error={error} onRetry={run} />

      {stage === "no_directions" && (
        <div className="card p-6 text-lg">
          <p className="font-semibold">This order does not tell the government to do anything.</p>
          <p className="mt-2 text-base text-muted">{b.order.extractor_notes}</p>
          <p className="mt-2 text-base">If you think this is wrong, please show the order to your nearest District Legal Services Authority (free legal aid) or a lawyer.</p>
        </div>
      )}

      {stage === "awaiting_gate" && (
        <>
          <div className="card p-5 text-base">
            <b>Please check what we found.</b> For each item, choose <i>Approve</i> if it matches your order, <i>Correct</i> to fix it, or <i>Reject</i> if it is wrong. A legal-aid volunteer can help you with this step.
          </div>
          <Gate b={b} onDone={reload} />
        </>
      )}

      {(stage === "verified" || stage === "planned") && (
        <section className="space-y-5">
          <div className="card space-y-4 p-6">
            <div className="flex flex-wrap gap-2">
              {LANGUAGES.map((l) => (
                <button key={l.id} onClick={() => setLang(l.id)}
                  className={`rounded-xl border-2 px-4 py-2 ${lang === l.id ? "border-brand bg-brand-soft font-semibold text-brand" : "border-line"}`}>
                  {l.native}
                </button>
              ))}
            </div>
            <input className="input text-base" placeholder="Your question (optional) — e.g. When will I get my arrears?" value={question} onChange={(e) => setQuestion(e.target.value)} />
            <button className="btn-primary px-6 py-3 text-base" disabled={busy} onClick={explain}>
              {busy && <Loader2 size={18} className="animate-spin" />} {explanation ? "Explain again" : "Explain my order"}
            </button>
            <ErrorBox error={err} />
          </div>

          {explanation && (
            <>
              <div className="grid gap-4">
                {layers.map((l, i) => (
                  <div key={i} className={`rounded-2xl border-2 p-5 ${CARD_STYLES[i] ?? "border-line bg-white"}`}>
                    {l.title && <h3 className="mb-2 text-lg font-semibold">{l.title}</h3>}
                    <div className="text-base [&_.prose-nirdesh]:text-base"><Markdown>{l.body}</Markdown></div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted">
                {words} words · {explanation.model_used} · {new Date(explanation.created_at).toLocaleString()} · live AI output
              </p>
            </>
          )}

          <button className="btn-ghost w-full py-4 text-base" onClick={() => download(`legal-aid-summary-${b.order.case_number ?? "case"}.md`, legalAidSummary(b, explanation?.content))}>
            <Scale size={18} /> Prepare for legal aid <Download size={16} />
          </button>
        </section>
      )}
    </div>
  );
}
