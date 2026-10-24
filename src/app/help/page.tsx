import Link from "next/link";
import { STATUS_META } from "@/lib/rules";
import { PageHeader } from "@/components/Shell";

const EVIDENCE = [
  {
    text: "High Courts have about 1.43 lakh pending contempt cases; the Supreme Court about 1,852. The government told Parliament that reasons for non-compliance are not centrally documented.",
    src: "Kashmir Life (Lok Sabha / NJDG data)",
    url: "https://kashmirlife.net/over-5200-contempt-cases-pending-in-jammu-kashmir-high-court-386841/",
  },
  {
    text: "The state is the largest litigant — over half of pending litigation.",
    src: "Scroll.in",
    url: "https://scroll.in/article/1077398/how-government-delays-in-filing-replies-is-leading-to-courts-getting-jammed",
  },
  {
    text: "Karnataka: Tahsildars' vehicles were seized over contempt; the state is appointing compliance officers and a Chief Secretary–led committee that meets monthly.",
    src: "Deccan Herald",
    url: "https://www.deccanherald.com/amp/story/india%2Fkarnataka%2Fkarnataka-contempt-cases-against-govt-significantly-down-says-minister-h-k-patil-3691685",
  },
  {
    text: "The Madras High Court started suo motu contempt against every Tamil Nadu Chief Secretary since September 2023.",
    src: "LiveLaw",
    url: "https://www.livelaw.in/amp/high-court/madras-high-court/madras-high-court-suo-motu-contempt-proceedings-chief-secretary-failure-to-comply-order-294588",
  },
  {
    text: "LIMBS (Department of Legal Affairs) tracks about 7.23 lakh Union of India cases — hearing dates and status — but does not read judgments and turn each direction into an owned, dated task.",
    src: "Civilsdaily on LIMBS",
    url: "https://www.civilsdaily.com/news/legal-information-management-and-briefing-system-limbs/",
  },
];

const LEGAL_AID = [
  ["Who does the work", "Human volunteers and lawyers", "AI agents with a human check"],
  ["Capacity", "Limited; one case at a time", "Unlimited first-level help, 24×7"],
  ["When", "After you find and approach them", "Instantly, whenever you have a question"],
  ["Strength", "Judgment, court representation", "Reading long laws and orders, tracking deadlines, plain-language explanation"],
  ["How they connect", "Receives clients who arrive prepared", "Hands over with a ready case summary when a lawyer is needed"],
];

const GLOSSARY = [
  ["Operative portion", "Final paragraphs where the court gives its orders"],
  ["Direction", "An order to do, pay, decide, consider, file, stop or report"],
  ["Forthwith", "Immediately; no fixed period"],
  ["Consider the representation", "Decide the petitioner's request by a reasoned order (not necessarily grant it)"],
  ["Liberty to apply", "Petitioner may return to court; not a direction to government"],
  ["Remand", "Sent back to an authority or lower court to decide again"],
  ["WP / WA / SLP", "Writ petition / writ appeal (division bench) / special leave petition (Supreme Court)"],
  ["Contempt petition", "Filed when an order is not complied with; s.20 Contempt of Courts Act — one year from the alleged contempt"],
  ["Compliance affidavit", "Sworn statement to the court that the direction was carried out"],
  ["Stay", "Order suspending the judgment; deadlines pause"],
  ["DLSA", "District Legal Services Authority (free legal aid, Legal Services Authorities Act 1987)"],
  ["LIMBS", "Legal Information Management and Briefing System (Dept. of Legal Affairs)"],
  ["Bare Act", "The plain text of an Act without commentary"],
];

const RULES = [
  "The AI reads, checks, reminds and drafts. Humans decide.",
  "Nirdesh never files anything and never decides whether to appeal. Asked \"should we appeal, yes or no?\", it lists the options instead.",
  "It never states an action was taken unless a user confirms it.",
  "Every direction carries the exact words of the court and its paragraph number; code checks the quote appears word for word.",
  "Deadlines and statuses are computed by code, not by the AI. Unclear triggers (e.g. receipt of a certified copy) go to a human.",
  "Nothing moves past the verification gate until an officer approves, corrects or rejects every item. AI output, critic verdict and human decision are stored separately.",
  "Every draft is labelled \"DRAFT – FOR REVIEW ONLY\" and uses [BLANKS] for facts it does not know.",
  "Citizen answers are not legal advice and always point to the District Legal Services Authority or a lawyer.",
];

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 text-lg font-semibold">{children}</h2>;
}

export default function HelpPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Help & About" subtitle={<>What Nirdesh does, why it exists, and how to use it.</>} />

      <section className="card p-4">
        <H2>The problem</H2>
        <p className="text-sm leading-relaxed">
          A retired teacher wins a High Court case. Paragraph 47 of a 30-page judgment says: <i>&ldquo;The department is directed to
          release the arrears within 8 weeks.&rdquo;</i> The judgment reaches a department desk with dozens of others. Nobody extracts
          that line, nobody owns it, nobody tracks the 8 weeks. The deadline passes; she must file contempt.
        </p>
        <p className="mt-3 text-sm leading-relaxed">
          This is a <b>policy implementation</b> failure — the gap between a decision and its delivery (Pressman &amp; Wildavsky,
          <i> Implementation</i>; Lipsky&apos;s street-level bureaucracy; Pritchett&apos;s &ldquo;flailing state&rdquo;; government as
          litigant under the National Litigation Policy, 2010).
        </p>
        <ul className="mt-4 space-y-2 text-sm">
          {EVIDENCE.map((e) => (
            <li key={e.url} className="border-l-4 border-brand-soft pl-3">
              {e.text}{" "}
              <a href={e.url} target="_blank" rel="noreferrer" className="text-brand underline">{e.src}</a>
            </li>
          ))}
        </ul>
      </section>

      <section className="card p-4">
        <H2>How to use it</H2>
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li><b>Add your AI key</b> in <Link href="/settings" className="text-brand underline">Settings</Link>. It stays in your browser and goes directly to the provider. Gemini offers a free key.</li>
          <li><b>Officers:</b> upload a judgment on the <Link href="/officer" className="text-brand underline">Officer</Link> page. Nirdesh extracts every direction, a second agent checks it (up to two correction rounds), then <b>you</b> approve, correct or reject each item. After that: a compliance plan with owners, tasks and dates, and drafts (office note, affidavit, reminder, escalation).</li>
          <li><b>After the plan:</b> enter the date a certified copy was received to compute a deadline; record a stay to pause one.</li>
          <li><b>Citizens:</b> upload the order on the <Link href="/citizen" className="text-brand underline">Citizen</Link> page and get a plain explanation in English, Hindi, Kannada, Marathi or Telugu.</li>
          <li><b>Questions about a law or filing:</b> use <Link href="/law" className="text-brand underline">Know Your Law</Link> — no upload needed.</li>
        </ol>
      </section>

      <section className="card overflow-x-auto p-4">
        <H2>Deadline statuses</H2>
        <table className="w-full text-left text-sm">
          <thead className="bg-lavender"><tr><th className="px-3 py-2">Status</th><th className="px-3 py-2">Meaning</th><th className="px-3 py-2">What to do</th></tr></thead>
          <tbody>
            {[
              ["on_track", "More than 14 days left"], ["due_soon", "1–14 days left"], ["overdue", "Deadline has passed"],
              ["urgent", "Court said “forthwith” or “at the earliest”"], ["date_pending", "Deadline runs from receipt of the copy; receipt date not yet entered"],
              ["no_deadline", "No time limit stated"], ["paused", "Stay obtained (court, date, order no.)"], ["unresolved", "Critic could not resolve after two rounds"],
            ].map(([k, meaning]) => {
              const m = STATUS_META[k as keyof typeof STATUS_META];
              return (
                <tr key={k} className="border-t border-line">
                  <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${m.color}`}>{m.label}</span></td>
                  <td className="px-3 py-2">{meaning}</td>
                  <td className="px-3 py-2">{m.action}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="card overflow-x-auto p-4">
        <H2>Nirdesh and legal aid</H2>
        <p className="mb-3 text-sm text-muted">Nirdesh complements legal-aid clinics and District Legal Services Authorities — it is the front door to legal aid, not a replacement.</p>
        <table className="w-full text-left text-sm">
          <thead className="bg-lavender"><tr><th className="px-3 py-2"></th><th className="px-3 py-2">Legal aid clinic / DLSA</th><th className="px-3 py-2">Nirdesh</th></tr></thead>
          <tbody>
            {LEGAL_AID.map(([k, a, b]) => (
              <tr key={k} className="border-t border-line"><td className="px-3 py-2 font-medium">{k}</td><td className="px-3 py-2">{a}</td><td className="px-3 py-2">{b}</td></tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card p-4">
        <H2>Rules Nirdesh always follows</H2>
        <ul className="list-disc space-y-1 pl-5 text-sm">{RULES.map((r) => <li key={r}>{r}</li>)}</ul>
      </section>

      <section className="card p-4">
        <H2>Privacy and limitations</H2>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>Your AI key is stored only in your browser and sent directly to the provider you choose. It never reaches the Nirdesh server.</li>
          <li>Uploaded judgments and results are stored in Nirdesh&apos;s database so the pipeline can resume and the audit trail is kept. Do not upload documents you are not allowed to share.</li>
          <li>On some free tiers (e.g. Gemini free tier) the provider may use your inputs to improve its products.</li>
          <li>Nirdesh is a hackathon prototype. It has been tested on published judgments, not yet with government officers. The org chart is a sample (Karnataka model). Appeal windows must be confirmed by the Government Pleader.</li>
          <li>Estimated hours saved assume ~45 minutes of manual reading per judgment and 20 minutes per drafted document. They are estimates, not measurements.</li>
        </ul>
      </section>

      <section className="card overflow-x-auto p-4">
        <H2>Glossary</H2>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[12rem_1fr]">
          {GLOSSARY.map(([t, d]) => (
            <div key={t} className="contents"><dt className="font-medium">{t}</dt><dd className="text-muted">{d}</dd></div>
          ))}
        </dl>
      </section>

      <p className="text-xs text-muted">
        Built by a team of IIM Visakhapatnam PGP students for the Agentic AI Hackathon (Area 10: Public Policy). Nirdesh gives general information, not legal advice.
      </p>
    </div>
  );
}
