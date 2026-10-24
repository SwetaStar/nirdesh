"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BookOpen, Gavel, Home, KeyRound, LayoutDashboard, LifeBuoy, Network, PanelLeftClose, PanelLeftOpen, Settings, Users,
} from "lucide-react";
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
    <span className="flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="h-9 w-9 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="9" fill="#c2185b" />
        {/* A signpost: one pole, one direction */}
        <path d="M15 7h2v18h-2z" fill="#fff" />
        <path d="M9 9h11l3 3-3 3H9z" fill="#fff" />
        <path d="M23 17H12l-3 3 3 3h11z" fill="#fce4ec" />
      </svg>
      {!small && <span className="font-display text-[1.6rem] font-semibold tracking-tight text-brand">Nirdesh</span>}
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

/** "Sat 24 Oct · 16:27", refreshed every 30 s (client only, so no hydration mismatch). */
function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, []);
  if (!now) return null;
  const day = now.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).replace(",", "");
  const time = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return <span className="font-mono text-lg text-muted">{day} · {time}</span>;
}

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const ai = useAIStatus();
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read saved preference after hydration
    setCollapsed(localStorage.getItem("nirdesh.sidebar") === "collapsed");
  }, []);
  const toggle = () => {
    localStorage.setItem("nirdesh.sidebar", collapsed ? "open" : "collapsed");
    setCollapsed(!collapsed);
  };

  return (
    <div className="flex min-h-screen">
      <aside className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-line bg-white py-6 transition-[width] md:flex ${collapsed ? "w-20 px-3" : "w-72 px-4"}`}>
        <Link href="/" className="mb-8 px-2" aria-label="Nirdesh home">
          <Logo small={collapsed} />
        </Link>
        <nav className="flex flex-col gap-1.5">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? path === "/" : path.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                title={collapsed ? label : undefined}
                className={`flex items-center gap-3.5 rounded-xl px-3.5 py-3 text-[1.05rem] font-semibold transition ${
                  active ? "bg-brand text-white shadow-sm" : "text-ink hover:bg-lavender"
                } ${collapsed ? "justify-center px-0" : ""}`}
              >
                <Icon size={22} strokeWidth={1.8} />
                {!collapsed && label}
              </Link>
            );
          })}
        </nav>
        <button onClick={toggle} className={`mt-6 flex items-center gap-3 rounded-xl px-3.5 py-2 text-base font-semibold text-muted hover:text-ink ${collapsed ? "justify-center px-0" : ""}`}>
          {collapsed ? <PanelLeftOpen size={20} /> : <><PanelLeftClose size={20} /> Collapse</>}
        </button>
        <div className="flex-1" />
        <Link href="/settings" title={ai?.ready ? ai.label : "No AI key — add one"}
          className={`rounded-xl border border-line px-3 py-2.5 text-sm text-muted hover:border-brand ${collapsed ? "flex justify-center" : ""}`}>
          <span className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${ai?.ready ? "bg-emerald-500" : "bg-amber-500"}`} />
            {!collapsed && <span className="truncate">{ai?.ready ? ai.label : "No AI key — add one"}</span>}
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
          <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-8 py-3 text-base text-amber-900">
            <span className="flex items-center gap-2">
              <KeyRound size={18} /> Nirdesh uses your own AI key. Add one to start — Gemini offers a free key.
            </span>
            <Link href="/settings" className="font-semibold text-brand underline">Add a key</Link>
          </div>
        )}
        <main className="relative mx-auto w-full max-w-7xl flex-1 px-4 py-8 md:px-10 md:py-10">
          <div className="absolute top-11 right-10 hidden lg:block"><Clock /></div>
          {children}
        </main>
      </div>
    </div>
  );
}
