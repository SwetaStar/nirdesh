"use client";

import { useState } from "react";
import {
  Banknote, BookOpen, Briefcase, Building2, ChevronDown, ChevronRight, Cpu, ExternalLink, Gavel, Globe,
  Landmark, Leaf, Lightbulb, Newspaper, Receipt, Scale, Search, ShieldCheck, Users,
} from "lucide-react";
import { OFFICIAL_SOURCES, type OfficialSource, type SourceIcon } from "@/lib/sources";

const ICONS: Record<SourceIcon, typeof BookOpen> = {
  book: BookOpen, landmark: Landmark, receipt: Receipt, scale: Scale, building: Building2, briefcase: Briefcase,
  banknote: Banknote, globe: Globe, shield: ShieldCheck, users: Users, lightbulb: Lightbulb, cpu: Cpu,
  newspaper: Newspaper, leaf: Leaf, gavel: Gavel, search: Search,
};

const host = (url: string) => new URL(url).hostname.replace(/^www\./, "");

/** Small link pill to an official site, used inside answers. */
export function SourceChip({ source, label }: { source: OfficialSource; label?: string }) {
  const Icon = ICONS[source.icon];
  return (
    <a href={source.url} target="_blank" rel="noreferrer"
      className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1 text-xs hover:border-brand hover:text-brand">
      <Icon size={13} className="text-brand" /> {label ?? source.name} <span className="text-muted">· {host(source.url)}</span> <ExternalLink size={11} />
    </a>
  );
}

export function SourceCard({ s }: { s: OfficialSource }) {
  const Icon = ICONS[s.icon];
  return (
    <a href={s.url} target="_blank" rel="noreferrer" className="group flex gap-3 rounded-2xl border border-line bg-white p-3 transition hover:border-brand">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand"><Icon size={18} /></span>
      <span className="min-w-0">
        <span className="flex items-center gap-1 text-sm font-medium group-hover:text-brand">{s.name} <ExternalLink size={12} /></span>
        <span className="block text-xs text-muted">{host(s.url)}</span>
        <span className="mt-1 block text-xs">{s.topics.join(" · ")}</span>
      </span>
    </a>
  );
}

/** Collapsible directory of official government sources, grouped. */
export function SourcesPanel({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const groups = [...new Set(OFFICIAL_SOURCES.map((s) => s.group))];
  return (
    <section className="card p-5">
      <button className="flex w-full items-center justify-between text-left" onClick={() => setOpen(!open)}>
        <span>
          <span className="block font-semibold">Official government sources</span>
          <span className="text-sm text-muted">Where to read the official text yourself — {OFFICIAL_SOURCES.length} sites. Links open the government website.</span>
        </span>
        {open ? <ChevronDown /> : <ChevronRight />}
      </button>
      {open && (
        <div className="mt-4 space-y-4">
          {groups.map((g) => (
            <div key={g}>
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">{g}</h3>
              <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                {OFFICIAL_SOURCES.filter((s) => s.group === g).map((s) => <SourceCard key={s.id} s={s} />)}
              </div>
            </div>
          ))}
          <p className="text-xs text-muted">Nirdesh is not affiliated with these websites. If texts conflict, the e-Gazette of India is the final authority.</p>
        </div>
      )}
    </section>
  );
}
