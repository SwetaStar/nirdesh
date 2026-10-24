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
    <span className="flex items-center gap-2">
      <svg viewBox="0 0 32 32" className="h-7 w-7 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="8" fill="#c2185b" />
        {/* A signpost: one pole, one direction */}
        <path d="M15 7h2v18h-2z" fill="#fff" />
        <path d="M9 9h11l3 3-3 3H9z" fill="#fff" />
        <path d="M23 17H12l-3 3 3 3h11z" fill="#fbe3ec" />
      </svg>
      {!small && <span className="font-display text-lg font-semibold text-dusk-deep [font-variation-settings:'opsz'_144]">Nirdesh</span>}
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

/** "Sat 24 Oct · 16:27" — client only, so no hydration mismatch. */
export function Clock() {
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
  return <span className="shrink-0 font-mono text-xs font-medium text-mist sm:text-sm">{day} · {time}</span>;
}

/** DayPilot page header: serif title with the clock on the same line, small grey subtitle below. */
export function PageHeader({ title, subtitle, children }: { title: React.ReactNode; subtitle?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mb-6">
      <div className="flex items-baseline justify-between gap-2">
        <h1>{title}</h1>
        <Clock />
      </div>
      {subtitle && <p className="mt-1 text-sm text-mist">{subtitle}</p>}
      {children}
    </div>
  );
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
    <div className="flex min-h-screen bg-paper">
      <aside className={`sticky top-0 hidden h-screen shrink-0 overflow-x-hidden overflow-y-auto border-r border-mist-line bg-paper-raised py-6 transition-[width] duration-150 md:flex md:flex-col ${collapsed ? "w-16 px-2" : "w-64 px-3"}`}>
        <Link href="/" className={`mb-6 flex items-center gap-2 px-1 ${collapsed ? "justify-center" : ""}`} aria-label="Nirdesh home">
          <Logo small={collapsed} />
        </Link>
        <nav className="flex flex-col gap-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? path === "/" : path.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                title={collapsed ? label : undefined}
                aria-label={label}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${collapsed ? "justify-center px-0" : ""} ${
                  active ? "bg-dusk text-paper-raised" : "text-ink-soft hover:bg-haze hover:text-ink"
                }`}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={2} aria-hidden />
                {!collapsed && label}
              </Link>
            );
          })}
        </nav>
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={`mt-4 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-mist hover:bg-haze hover:text-ink-soft ${collapsed ? "justify-center px-0" : ""}`}
        >
          {collapsed ? <PanelLeftOpen className="h-[18px] w-[18px] shrink-0" strokeWidth={2} /> : <><PanelLeftClose className="h-[18px] w-[18px] shrink-0" strokeWidth={2} /> Collapse</>}
        </button>
        {!collapsed && (
          <Link href="/settings" className="mt-4 mx-1 flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-mist hover:bg-haze">
            <span className={`h-2 w-2 shrink-0 rounded-full ${ai?.ready ? "bg-success" : "bg-warning"}`} />
            <span className="truncate">{ai?.ready ? ai.label : "No AI key — add one"}</span>
          </Link>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col pb-16 md:pb-0">
        <main className="w-full flex-1 p-4 md:px-6 md:py-5">
          {ai && !ai.ready && path !== "/settings" && (
            <div className="notice mb-4">
              <span className="flex items-center gap-2"><KeyRound className="h-4 w-4" /> Nirdesh uses your own AI key. Add one to start — Gemini offers a free key.</span>
              <Link href="/settings" className="shrink-0 rounded-lg bg-dusk px-3 py-1.5 text-sm font-medium text-paper-raised hover:bg-dusk-deep">Add a key</Link>
            </div>
          )}
          {children}
        </main>
      </div>

      {/* Mobile bottom bar, like DayPilot */}
      <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-mist-line bg-paper-raised pb-[env(safe-area-inset-bottom)] md:hidden">
        {NAV.filter((n) => ["/", "/officer", "/citizen", "/law", "/settings"].includes(n.href)).map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <Link key={href} href={href} className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium ${active ? "text-dusk" : "text-mist"}`}>
              <Icon className="h-5 w-5" strokeWidth={2} />
              {label === "Know Your Law" ? "Law" : label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
