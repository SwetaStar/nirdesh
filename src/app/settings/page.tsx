"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, Eye, EyeOff, Loader2, RefreshCw, XCircle } from "lucide-react";
import {
  PROVIDERS, callModel, listModels, loadSettings, saveSettings, type AISettings, type ProviderId,
} from "@/lib/ai/providers";

export default function SettingsPage() {
  const [s, setS] = useState<AISettings | null>(null);
  const [show, setShow] = useState(false);
  const [models, setModels] = useState<{ id: string; label: string }[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelErr, setModelErr] = useState<string | null>(null);
  const [test, setTest] = useState<{ state: "idle" | "running" | "ok" | "fail"; msg?: string }>({ state: "idle" });
  const [custom, setCustom] = useState(false);

  useEffect(() => {
    // Settings live in localStorage, which only exists after hydration.
    const loaded = loadSettings();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setS(loaded);
    setModels(PROVIDERS[loaded.provider].defaultModels);
    const k = loaded.keys[loaded.provider];
    if (k) void refreshModels(loaded.provider, k);
  }, []);
  const provider = s?.provider ?? "gemini";
  const info = PROVIDERS[provider];
  const key = s?.keys[provider] ?? "";
  const model = s?.model[provider] ?? info.defaultModels[0]?.id ?? "";

  if (!s) return null;

  function changeProvider(p: ProviderId) {
    update({ ...s!, provider: p });
    setModels(PROVIDERS[p].defaultModels);
    setModelErr(null);
    setTest({ state: "idle" });
    const k = s!.keys[p];
    if (k) void refreshModels(p, k);
  }

  function update(next: AISettings) {
    setS(next);
    saveSettings(next);
  }

  async function refreshModels(p: ProviderId, k: string) {
    setLoadingModels(true);
    setModelErr(null);
    try {
      const live = await listModels(p, k);
      const merged = [...PROVIDERS[p].defaultModels];
      for (const m of live) if (!merged.some((x) => x.id === m.id)) merged.push(m);
      setModels(merged);
    } catch (e) {
      setModelErr(e instanceof Error ? e.message.slice(0, 200) : "Could not load models");
    } finally {
      setLoadingModels(false);
    }
  }

  async function runTest() {
    setTest({ state: "running" });
    try {
      const r = await callModel({ system: "Reply with exactly: OK", user: "Say OK.", maxTokens: 2000, effort: "low" });
      setTest({ state: "ok", msg: `Connected — ${r.model} replied in ${(r.durationMs / 1000).toFixed(1)}s.` });
    } catch (e) {
      setTest({ state: "fail", msg: e instanceof Error ? e.message.slice(0, 300) : "Failed" });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1>Settings</h1>
        <p className="text-muted">Choose the AI that powers Nirdesh&apos;s agents.</p>
      </div>

      <section className="card space-y-5 p-6">
        <div>
          <h2 className="font-semibold">AI Provider</h2>
          <p className="text-sm text-muted">
            Your key is stored only in this browser and sent directly to the provider — never to the Nirdesh server.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="provider">Provider</label>
          <select
            id="provider"
            className="input"
            value={provider}
            onChange={(e) => changeProvider(e.target.value as ProviderId)}
          >
            {Object.values(PROVIDERS).map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className="label" htmlFor="key">{info.keyLabel}</label>
            <a href={info.keyUrl} target="_blank" rel="noreferrer" className="text-sm font-medium text-brand hover:underline">
              Get a key
            </a>
          </div>
          <div className="relative">
            <input
              id="key"
              className="input pr-10 font-mono"
              type={show ? "text" : "password"}
              autoComplete="off"
              placeholder="Paste your key"
              value={key}
              onChange={(e) => update({ ...s, keys: { ...s.keys, [provider]: e.target.value } })}
              onBlur={() => key && refreshModels(provider, key)}
            />
            <button type="button" className="absolute top-2 right-3 text-muted" onClick={() => setShow(!show)} aria-label="Show key">
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className="label" htmlFor="model">Model</label>
            <span className="flex gap-3 text-sm">
              {key && (
                <button className="flex items-center gap-1 text-brand" onClick={() => refreshModels(provider, key)}>
                  <RefreshCw size={14} className={loadingModels ? "animate-spin" : ""} /> Load models
                </button>
              )}
              <button className="text-muted underline" onClick={() => setCustom(!custom)}>
                {custom ? "Pick from list" : "Type a model ID"}
              </button>
            </span>
          </div>
          {custom || models.length === 0 ? (
            <input
              id="model"
              className="input font-mono"
              placeholder={key ? "e.g. a model ID from the provider" : "Add your key first, then load models"}
              value={model}
              onChange={(e) => update({ ...s, model: { ...s.model, [provider]: e.target.value } })}
            />
          ) : (
            <select
              id="model"
              className="input"
              value={model}
              onChange={(e) => update({ ...s, model: { ...s.model, [provider]: e.target.value } })}
            >
              {!models.some((m) => m.id === model) && model && <option value={model}>{model}</option>}
              {models.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          )}
          {modelErr && <p className="mt-1 text-xs text-red-700">{modelErr}</p>}
        </div>

        <p className="text-sm text-muted">{info.note}</p>

        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-primary" disabled={!key || !model || test.state === "running"} onClick={runTest}>
            {test.state === "running" && <Loader2 size={16} className="animate-spin" />} Test connection
          </button>
          {test.state === "ok" && <span className="flex items-center gap-1 text-sm text-emerald-700"><CheckCircle2 size={16} />{test.msg}</span>}
          {test.state === "fail" && <span className="flex items-center gap-1 text-sm text-red-700"><XCircle size={16} />{test.msg}</span>}
          {key && (
            <button
              className="ml-auto text-sm text-muted underline"
              onClick={() => update({ ...s, keys: { ...s.keys, [provider]: "" } })}
            >
              Remove key from this browser
            </button>
          )}
        </div>
      </section>

      <AILog />
    </div>
  );
}

interface CallRow {
  id: number; agent: string; provider: string | null; model: string | null; ok: boolean; error: string | null;
  duration_ms: number | null; ts: string; request_summary: string | null;
}

function AILog() {
  const [open, setOpen] = useState(false);
  const [calls, setCalls] = useState<CallRow[] | null>(null);
  const [detail, setDetail] = useState<Record<number, string>>({});
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try {
      const r = await fetch("/api/log").then((x) => x.json());
      if (r.error) throw new Error(r.error);
      setCalls(r.calls);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    }
  }

  async function expand(id: number) {
    if (detail[id] !== undefined) return setDetail((d) => { const next = { ...d }; delete next[id]; return next; });
    const r = await fetch(`/api/log?id=${id}`).then((x) => x.json());
    setDetail((d) => ({ ...d, [id]: `SENT (start):\n${r.call?.request_summary ?? ""}\n\nRECEIVED:\n${r.call?.response_text ?? r.call?.error ?? ""}` }));
  }

  return (
    <section className="card p-6">
      <button className="flex w-full items-center justify-between" onClick={() => { setOpen(!open); if (!calls) load(); }}>
        <div className="text-left">
          <h2 className="font-semibold">AI activity log</h2>
          <p className="text-sm text-muted">See exactly what each agent sent and got back. Every output is a live model call.</p>
        </div>
        {open ? <ChevronDown /> : <ChevronRight />}
      </button>
      {open && (
        <div className="mt-4 space-y-2">
          {err && <p className="text-sm text-red-700">{err}</p>}
          {calls?.length === 0 && <p className="text-sm text-muted">No AI calls yet.</p>}
          {calls?.map((c) => (
            <div key={c.id} className="rounded-xl border border-line">
              <button className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm" onClick={() => expand(c.id)}>
                <span className={`h-2 w-2 shrink-0 rounded-full ${c.ok ? "bg-emerald-500" : "bg-red-500"}`} />
                <span className="font-medium">{c.agent}</span>
                <span className="text-muted">{c.provider}/{c.model}</span>
                <span className="ml-auto text-xs text-muted">
                  {c.duration_ms ? `${(c.duration_ms / 1000).toFixed(1)}s · ` : ""}{new Date(c.ts).toLocaleString()}
                </span>
              </button>
              {detail[c.id] && (
                <pre className="max-h-96 overflow-auto border-t border-line bg-lavender p-3 text-xs whitespace-pre-wrap">{detail[c.id]}</pre>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
