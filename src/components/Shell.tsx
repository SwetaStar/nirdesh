"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BookOpen, Gavel, Home, KeyRound, LayoutDashboard, LifeBuoy, Network, Settings, Users } from "lucide-react";
import { activeConfig, isConfigured, loadSettings } from "@/lib/ai/providers";

const NAV = [
  { href: "/", label: "Home", icon: Home },
  { href: "/officer", label: "Officer", icon: Gavel },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/citizen", label: "Citizen", icon: Users },
  { href: "/law", label: "Know Your Law", icon: BookOpen },
  { href: "/how-it-works", label: "How it works", icon: Network },
  { href: "/help", label: "Help & About", icon: LifeBuoy },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Logo({ small = false }: { small?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <svg viewBox="0 0 32 32" className={small ? "h-7 w-7" : "h-8 w-8"} aria-hidden>
        <rect width="32" height="32" rx="9" fill="#c2185b" />
        {/* A signpost: one pole, one direction */}
        <path d="M15 7h2v18h-2z" fill="#fff" />
        <path d="M9 9h11l3 3-3 3H9z" fill="#fff" />
        <path d="M23 17H12l-3 3 3 3h11z" fill="#fce4ec" />
      </svg>
      {!small && <span className="text-lg font-semibold tracking-tight text-ink">Nirdesh</span>}
    </span>
  );
}

export function useAIStatus() {
  const [state, setState] = useState<{ ready: boolean; label: string } | null>(null);
  useEffect(() => {
    const read = () => {
      const s = loadSettings();
      const c = activeConfig(s);
      setState({ ready: isConfigured(s), label: `${c.info.label.split(" (")[0]} · ${c.model ?? "no model"}` });
    };
    read();
    window.addEventListener("nirdesh-settings", read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener("nirdesh-settings", read);
      window.removeEventListener("storage", read);
    };
  }, []);
  return state;
}

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const ai = useAIStatus();
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-white px-3 py-5 md:flex">
        <Link href="/" className="mb-6 px-2">
          <Logo />
        </Link>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? path === "/" : path.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${
                  active ? "bg-brand-soft font-medium text-brand" : "text-ink hover:bg-lavender"
                }`}
              >
                <Icon size={18} />
                {label}
              </Link>
            );
          })}
        </nav>
        <Link href="/settings" className="mt-4 rounded-xl border border-line px-3 py-2 text-xs text-muted hover:border-brand">
          <span className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${ai?.ready ? "bg-emerald-500" : "bg-amber-500"}`} />
            {ai?.ready ? ai.label : "No AI key — add one"}
          </span>
        </Link>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="flex items-center justify-between border-b border-line bg-white px-4 py-3 md:hidden">
          <Link href="/"><Logo /></Link>
          <div className="flex gap-3 text-muted">
            {NAV.slice(1).map(({ href, icon: Icon, label }) => (
              <Link key={href} href={href} aria-label={label} className={path.startsWith(href) ? "text-brand" : ""}>
                <Icon size={20} />
              </Link>
            ))}
          </div>
        </header>
        {ai && !ai.ready && path !== "/settings" && (
          <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-6 py-2 text-sm text-amber-900">
            <span className="flex items-center gap-2">
              <KeyRound size={16} /> Nirdesh uses your own AI key. Add one to start — Gemini offers a free key.
            </span>
            <Link href="/settings" className="font-medium text-brand underline">Add a key</Link>
          </div>
        )}
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 md:px-8">{children}</main>
      </div>
    </div>
  );
}
