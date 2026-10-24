import Link from "next/link";
import { BookOpen, Gavel, ShieldCheck, Users } from "lucide-react";
import { PageHeader } from "@/components/Shell";

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
    <div>
      <PageHeader title="Welcome" subtitle="Nirdesh · निर्देश · direction" />

      <p className="max-w-2xl font-display text-[28px] leading-tight text-ink [font-variation-settings:'opsz'_144]">
        Court orders, <span className="text-dusk italic">actually</span> done on time — and citizens who know their rights.
      </p>
      <p className="mt-2 flex items-center gap-1.5 text-sm text-mist">
        <ShieldCheck className="h-4 w-4 text-dusk" /> The AI reads, checks, reminds and drafts. Humans decide.
      </p>

      <h2 className="mt-8">Where would you like to start?</h2>
      <p className="mt-0.5 text-xs text-mist">Choose one. You can switch any time from the sidebar.</p>
      <section className="mt-4 grid gap-3 md:grid-cols-3">
        {DOORS.map(({ href, icon: Icon, title, body, cta }) => (
          <Link key={href} href={href} className="card group flex flex-col p-4 transition-colors hover:border-dusk">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-haze text-dusk">
              <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
            </span>
            <p className="mt-3 text-sm font-semibold text-ink">{title}</p>
            <p className="mt-1.5 flex-1 text-sm text-ink-soft">{body}</p>
            <span className="mt-4 self-start rounded-lg bg-dusk px-4 py-2 text-sm font-medium text-paper-raised group-hover:bg-dusk-deep">{cta}</span>
          </Link>
        ))}
      </section>

      <p className="mt-8 text-xs text-mist">
        Nirdesh gives general information, not legal advice. It never files anything, never decides whether to appeal, and never states an action was taken unless you confirm it.
      </p>
    </div>
  );
}
