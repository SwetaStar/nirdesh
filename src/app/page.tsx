import Link from "next/link";
import { BookOpen, Gavel, ShieldCheck, Users } from "lucide-react";

const DOORS = [
  {
    href: "/officer",
    icon: Gavel,
    title: "I'm a government officer",
    body: "Upload a judgment. Nirdesh finds every direction, checks it twice, waits for your approval, then plans tasks, deadlines and drafts.",
    cta: "Process a judgment",
  },
  {
    href: "/citizen",
    icon: Users,
    title: "I'm a citizen or legal-aid volunteer",
    body: "Won a case? Understand what the government must do, by when, and what you can do — in English, Hindi, Kannada, Marathi or Telugu.",
    cta: "Explain my court order",
  },
  {
    href: "/law",
    icon: BookOpen,
    title: "I have a question about a law or a filing",
    body: "Ask about an Act, a Rule or a filing in plain words. No upload needed. Hard questions are handed to legal aid with a ready summary.",
    cta: "Ask about a law",
  },
];

export default function Home() {
  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <p className="text-sm font-semibold tracking-widest text-brand uppercase">Nirdesh · निर्देश · direction</p>
        <h1 className="max-w-3xl text-3xl leading-tight md:text-4xl">
          When a court orders the government to act, Nirdesh makes sure it gets done on time — and that the citizen who won knows their rights.
        </h1>
        <p className="flex items-center gap-2 text-muted">
          <ShieldCheck size={18} className="text-brand" /> The AI reads, checks, reminds and drafts. Humans decide.
        </p>
      </section>

      <section className="grid gap-5 md:grid-cols-3">
        {DOORS.map(({ href, icon: Icon, title, body, cta }) => (
          <Link key={href} href={href} className="card group flex flex-col gap-4 p-6 transition hover:-translate-y-0.5 hover:border-brand">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-soft text-brand">
              <Icon size={22} />
            </span>
            <h2>{title}</h2>
            <p className="flex-1 text-sm text-muted">{body}</p>
            <span className="btn-primary self-start">{cta}</span>
          </Link>
        ))}
      </section>

      <p className="text-xs text-muted">
        Nirdesh gives general information, not legal advice. It never files anything, never decides whether to appeal, and never states an action was taken unless you confirm it.
      </p>
    </div>
  );
}
