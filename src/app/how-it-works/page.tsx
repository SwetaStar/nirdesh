import { PageHeader } from "@/components/Shell";
const SKILLS = [
  "User intake & routing", "Direction extraction", "Extraction verification", "Verification gate (human)",
  "Compliance planning & drafting", "Citizen explainer", "Policy insights", "Live compliance dashboard", "Know Your Law",
];
const AGENTS = [
  { name: "Direction Extractor", role: "Reads the judgment; returns every direction with the exact quote, paragraph, authority and deadline." },
  { name: "Critic", role: "Re-reads independently; checks quote, order vs observation, authority, deadline and missed items." },
  { name: "Planner & Drafter", role: "Explains owners, tasks and dates; drafts office notes, affidavits, reminders and escalations." },
  { name: "Citizen Explainer", role: "Explains the order in 5 languages, in four layers, under 200 words." },
  { name: "LawGuide", role: "Answers questions on Acts, Rules and filings from uploaded Bare Acts; hands hard ones to legal aid." },
];
const PIPELINE = [
  ["Upload", "PDF or Word. Scanned pages are read by the AI."],
  ["Extract", "Direction Extractor (live AI call)."],
  ["Check", "Critic + code: verbatim quote match and date arithmetic. Up to 2 correction rounds; leftovers are “unresolved”."],
  ["Human gate", "Officer or citizen approves, corrects or rejects every item. Nothing moves until all are decided."],
  ["Plan / explain", "Officer: tasks and dates computed in code, explained by the Planner, plus drafts. Citizen: plain-language explanation."],
  ["Track", "Dashboard with statuses for today, countdowns, audit trail and systemic issues."],
];

const C = 300; // centre of the 600×600 canvas

function ring(n: number, r: number, offset = -90) {
  return Array.from({ length: n }, (_, i) => {
    const a = ((offset + (360 / n) * i) * Math.PI) / 180;
    return { x: C + r * Math.cos(a), y: C + r * Math.sin(a) };
  });
}

export default function HowItWorks() {
  const inner = ring(SKILLS.length, 150);
  const outer = ring(AGENTS.length, 255, -54);
  return (
    <div className="space-y-6">
      <PageHeader title="How Nirdesh works" subtitle={<>One orchestrator coordinates 9 skills that call 5 specialist agents. The orchestrator is code (a state machine), not a free-form AI router — so the human gate can never be skipped.</>} />

      <section className="card overflow-x-auto p-4">
        <svg viewBox="0 0 600 600" className="mx-auto w-full max-w-2xl" role="img" aria-label="Nirdesh orchestrator, skills and agents">
          <circle cx={C} cy={C} r={255} fill="none" stroke="#f8bbd0" strokeWidth={1.5} />
          <circle cx={C} cy={C} r={150} fill="none" stroke="#e7e3f0" strokeDasharray="4 4" />
          {inner.map((p, i) => <line key={`l${i}`} x1={C} y1={C} x2={p.x} y2={p.y} stroke="#d9d4e6" strokeDasharray="3 4" />)}
          {outer.map((p, i) => <line key={`o${i}`} x1={C} y1={C} x2={p.x} y2={p.y} stroke="#f8bbd0" strokeDasharray="2 5" />)}

          {inner.map((p, i) => (
            <g key={SKILLS[i]}>
              <circle cx={p.x} cy={p.y} r={17} fill={i === 3 ? "#6a1b9a" : "#0e7490"} />
              <text x={p.x} y={p.y + 5} textAnchor="middle" fontSize="13" fill="#fff" fontWeight="600">{i + 1}</text>
              <text x={p.x} y={p.y + 32} textAnchor="middle" fontSize="10" fill="#1f1b2d">{SKILLS[i]}</text>
            </g>
          ))}
          {outer.map((p, i) => (
            <g key={AGENTS[i].name}>
              <rect x={p.x - 18} y={p.y - 18} width={36} height={36} rx={10} fill="#c2185b" />
              <text x={p.x} y={p.y + 5} textAnchor="middle" fontSize="12" fill="#fff" fontWeight="700">AI</text>
              <text x={p.x} y={p.y + 33} textAnchor="middle" fontSize="11" fill="#1f1b2d" fontWeight="600">{AGENTS[i].name}</text>
            </g>
          ))}
          <circle cx={C} cy={C} r={48} fill="#fff" stroke="#c2185b" strokeWidth={2} />
          <text x={C} y={C - 2} textAnchor="middle" fontSize="16" fontWeight="700" fill="#c2185b">Nirdesh</text>
          <text x={C} y={C + 16} textAnchor="middle" fontSize="10" fill="#6b6680">orchestrator</text>
        </svg>
        <p className="text-center text-xs text-muted">
          <span className="mr-3"><span className="mr-1 inline-block h-2 w-2 rounded-full bg-cyan-700" />skill</span>
          <span className="mr-3"><span className="mr-1 inline-block h-2 w-2 rounded-full bg-plum" />human checkpoint</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded bg-brand" />AI agent</span>
        </p>
      </section>

      <section className="card p-4">
        <h2 className="mb-4 text-lg font-semibold">What happens to a judgment</h2>
        <ol className="grid gap-3 md:grid-cols-3">
          {PIPELINE.map(([t, d], i) => (
            <li key={t} className={`rounded-2xl border p-4 ${t === "Human gate" ? "border-plum bg-violet-50" : "border-line"}`}>
              <p className="text-xs text-muted">Step {i + 1}</p>
              <p className="font-semibold">{t}</p>
              <p className="mt-1 text-sm text-muted">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="card p-4">
        <h2 className="mb-4 text-lg font-semibold">The agents</h2>
        <ul className="grid gap-3 md:grid-cols-2">
          {AGENTS.map((a) => <li key={a.name} className="rounded-2xl border border-line p-4"><p className="font-semibold">{a.name}</p><p className="text-sm text-muted">{a.role}</p></li>)}
        </ul>
        <p className="mt-4 text-sm text-muted">Every AI output in Nirdesh is a live call to the model you choose in Settings. Nothing is pre-written. See the AI activity log in Settings for exactly what was sent and received.</p>
      </section>
    </div>
  );
}
