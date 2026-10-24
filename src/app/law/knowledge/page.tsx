"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock, Loader2, Pencil, RefreshCw, Trash2, Upload, XCircle } from "lucide-react";
import { api, runAgent } from "@/lib/pipeline";
import { activeConfig } from "@/lib/ai/providers";
import { chunkAct, type Chunk } from "@/lib/chunk";
import { ErrorBox } from "@/components/ui";
import { ACT_CATALOGUE } from "@/lib/actCatalogue";
import { PageHeader } from "@/components/Shell";

interface Doc {
  id: string; title: string; type: string; act_year: number | null; version_note: string | null; uploaded_at: string;
  assigned_skills: string[]; chunks: number; status: "importing" | "active" | "pending" | "superseded";
  source_url: string | null; supersedes: string | null; last_checked_at: string | null; last_check_status: string | null;
  last_check_error: string | null; approved_by: string | null; approved_at: string | null;
}

const SKILLS = [
  ["know-your-law", "Know Your Law"],
  ["compliance-planning-drafting", "Planner"],
  ["citizen-explainer", "Citizen Explainer"],
  ["direction-extraction", "Extractor"],
] as const;


const STATUS_STYLE: Record<Doc["status"], string> = {
  active: "bg-emerald-100 text-emerald-800",
  pending: "bg-amber-100 text-amber-900",
  superseded: "bg-zinc-100 text-zinc-500",
  importing: "bg-sky-100 text-sky-800",
};
const CHECK_LABEL: Record<string, string> = {
  unchanged: "No change",
  new_version_pending: "New version found — review below",
  new_version_discarded: "New version discarded",
  failed: "Check failed",
  not_pdf: "Link did not return a PDF",
  scanned: "New file is scanned — upload by hand",
  superseded: "Replaced by a newer version",
  removed_at_source: "Removed from the official site — not used in answers",
};

async function sha256(buf: ArrayBuffer) {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function toBase64(buf: Uint8Array) {
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}
/** Batches small enough for one request each (Vercel accepts ~4.5 MB per request). */
function batches(chunks: Chunk[], maxChars = 1_500_000, maxItems = 300) {
  const out: Chunk[][] = [[]];
  let size = 0;
  for (const c of chunks) {
    const cur = out[out.length - 1];
    if (cur.length && (size + c.content.length > maxChars || cur.length >= maxItems)) { out.push([]); size = 0; }
    out[out.length - 1].push(c);
    size += c.content.length;
  }
  return out.filter((b) => b.length);
}

type CheckRow = { id: string; title: string; state: "waiting" | "working" | "unchanged" | "updated" | "removed_at_source" | "failed" | "scanned" | "not_pdf"; detail?: string };
const CHECK_STYLE: Record<CheckRow["state"], string> = {
  waiting: "text-mist", working: "text-dusk", unchanged: "text-success", updated: "text-dusk-deep font-medium",
  removed_at_source: "text-danger", failed: "text-warning", scanned: "text-warning", not_pdf: "text-warning",
};
const CHECK_LABEL_SHORT: Record<CheckRow["state"], string> = {
  waiting: "Waiting", working: "Checking the official site…", unchanged: "No change", updated: "Updated",
  removed_at_source: "Removed at source", failed: "Could not check", scanned: "Changed (scan)", not_pdf: "Link changed",
};

type LinkRow = { url: string; state: "waiting" | "working" | "ok" | "fail"; msg?: string };

/** One-click import of the recommended Acts from India Code. */
function RecommendedActs({ docs, onDone }: { docs: Doc[]; onDone: () => void }) {
  const inLibrary = (url: string, title: string) =>
    docs.some((d) => d.status !== "superseded" && (d.source_url === url || d.title.toLowerCase().startsWith(title.toLowerCase().slice(0, 20))));
  const [pick, setPick] = useState<string[]>(() => ACT_CATALOGUE.map((a) => a.url));
  const [state, setState] = useState<Record<string, { s: "working" | "ok" | "fail"; msg?: string }>>({});
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    for (const a of ACT_CATALOGUE.filter((x) => pick.includes(x.url) && !inLibrary(x.url, x.title))) {
      setState((st) => ({ ...st, [a.url]: { s: "working", msg: "Downloading from India Code…" } }));
      try {
        const r = await api<{ ok: boolean; sections?: number; pages?: number; error?: string }>("/api/knowledge/import", {
          method: "POST",
          json: { url: a.url, title: a.title, act_year: a.year, assigned_skills: a.skills },
        });
        setState((st) => ({ ...st, [a.url]: r.ok ? { s: "ok", msg: `${r.pages} pages, ${r.sections} sections added` } : { s: "fail", msg: r.error } }));
      } catch (e) {
        setState((st) => ({ ...st, [a.url]: { s: "fail", msg: e instanceof Error ? e.message : "Failed" } }));
      }
      onDone();
    }
    setBusy(false);
  }

  const todo = ACT_CATALOGUE.filter((a) => pick.includes(a.url) && !inLibrary(a.url, a.title)).length;
  return (
    <section className="card space-y-3 p-4">
      <div>
        <h2 className="text-sm font-semibold">Recommended Acts from India Code</h2>
        <p className="mt-1 text-xs text-mist">Official texts for the questions citizens ask most. Nirdesh downloads each from indiacode.nic.in and keeps the link for the nightly update check.</p>
      </div>
      <ul className="grid gap-1.5 md:grid-cols-2">
        {ACT_CATALOGUE.map((a) => {
          const have = inLibrary(a.url, a.title);
          const st = state[a.url];
          return (
            <li key={a.url} className="flex items-start gap-2 rounded-lg border border-mist-line px-3 py-2 text-sm">
              <input type="checkbox" className="mt-1" disabled={have || busy} checked={have || pick.includes(a.url)}
                onChange={(e) => setPick(e.target.checked ? [...pick, a.url] : pick.filter((u) => u !== a.url))} />
              <span className="min-w-0 flex-1">
                <span className="font-medium text-ink">{a.title}, {a.year}</span>
                <span className="block text-xs text-mist">{a.why}</span>
                {st && <span className={`block text-xs ${st.s === "fail" ? "text-danger" : st.s === "ok" ? "text-success" : "text-dusk"}`}>{st.msg}</span>}
              </span>
              {have ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" />
                : st?.s === "working" ? <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin text-dusk" />
                : st?.s === "fail" ? <XCircle size={16} className="mt-0.5 shrink-0 text-danger" /> : null}
            </li>
          );
        })}
      </ul>
      <button className="btn-primary" disabled={busy || todo === 0} onClick={run}>
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} {todo ? `Import ${todo} Act${todo > 1 ? "s" : ""}` : "All selected Acts are in the library"}
      </button>
    </section>
  );
}

/** Paste official PDF links (one per line); the server downloads, reads and stores each Act. */
function ImportFromLinks({ skills, onDone }: { skills: string[]; onDone: () => void }) {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<LinkRow[]>([]);
  const [busy, setBusy] = useState(false);

  async function run() {
    const urls = [...new Set(text.split(/\s+/).map((u) => u.trim()).filter((u) => /^https?:\/\//.test(u)))];
    if (!urls.length) return;
    setBusy(true);
    const list: LinkRow[] = urls.map((url) => ({ url, state: "waiting" }));
    setRows([...list]);
    for (let i = 0; i < list.length; i++) {
      list[i] = { ...list[i], state: "working", msg: "Downloading from the official site…" };
      setRows([...list]);
      try {
        const r = await api<{ ok: boolean; title?: string; year?: number | null; sections?: number; pages?: number; error?: string }>(
          "/api/knowledge/import",
          { method: "POST", json: { url: list[i].url, assigned_skills: skills } },
        );
        list[i] = r.ok
          ? { ...list[i], state: "ok", msg: `${r.title}${r.year ? ` (${r.year})` : ""} — ${r.pages} pages, ${r.sections} sections added` }
          : { ...list[i], state: "fail", msg: r.error };
      } catch (e) {
        list[i] = { ...list[i], state: "fail", msg: e instanceof Error ? e.message : "Failed" };
      }
      setRows([...list]);
      onDone();
    }
    setBusy(false);
  }

  return (
    <section className="card space-y-3 p-4">
      <div>
        <h2 className="text-sm font-semibold">Add from official links</h2>
        <p className="mt-1 text-xs text-mist">
          Paste links from official sites (India Code, e-Gazette, ministries), one per line — the PDF itself or the Act&apos;s India Code page. Nirdesh downloads each file, reads the
          title and year from it, splits it into sections and keeps the link for the nightly update check. Only government sites are accepted.
        </p>
      </div>
      <textarea className="input min-h-28 font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)}
        placeholder={"https://www.indiacode.nic.in/bitstream/123456789/2098/1/A201042.pdf\nhttps://www.indiacode.nic.in/bitstream/123456789/1514/1/A1971-70.pdf"} />
      <button className="btn-primary" disabled={busy || !text.trim()} onClick={run}>
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} Fetch and add
      </button>
      {rows.length > 0 && (
        <ul className="space-y-1.5 text-sm">
          {rows.map((r) => (
            <li key={r.url} className="flex items-start gap-2">
              {r.state === "ok" ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" />
                : r.state === "fail" ? <XCircle size={16} className="mt-0.5 shrink-0 text-danger" />
                : r.state === "working" ? <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin text-dusk" />
                : <Clock size={16} className="mt-0.5 shrink-0 text-mist" />}
              <span className="min-w-0">
                <span className="block truncate font-mono text-xs text-mist">{r.url}</span>
                {r.msg && <span className={r.state === "fail" ? "text-danger" : "text-ink"}>{r.msg}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function KnowledgePage() {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [form, setForm] = useState({ title: "", act_year: "", version_note: "", type: "act", source_url: "" });
  const [skills, setSkills] = useState<string[]>(["know-your-law"]);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => api<{ documents: Doc[] }>("/api/knowledge").then((r) => setDocs(r.documents)).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  async function add() {
    if (!file) return;
    setError(null);
    let docId: string | null = null;
    try {
      setBusy("Reading the PDF in your browser…");
      const buf = await file.arrayBuffer();
      const checksum = await sha256(buf);
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(buf.slice(0)));
      let text = (await extractText(pdf, { mergePages: true })).text;
      let note = form.version_note;
      if (text.replace(/\s+/g, "").length / Math.max(pdf.numPages, 1) < 200) {
        if (!activeConfig().info.readsPdf) throw new Error("This PDF is scanned. Switch to Claude or Gemini in Settings so the AI can read it.");
        setBusy(`Scanned PDF (${pdf.numPages} pages) — the AI is reading it, this can take a few minutes…`);
        text = (await runAgent("OCR", {
          system: "You transcribe scanned Indian Bare Acts. Output the full text exactly as printed. Keep every section number at the start of its line (e.g. '20. Limitation for actions for contempt.—'). Do not summarise, correct or add anything.",
          user: "Transcribe this Act verbatim.",
          pdfBase64: toBase64(new Uint8Array(buf)),
          maxTokens: 64000,
        })).text;
        note = `${note ? note + "; " : ""}text read from scan by AI — spot-check before relying on quotes`;
      }
      const chunks = chunkAct(text);
      if (!chunks.length) throw new Error("No sections found in this PDF.");

      setBusy(`Saving ${chunks.length} sections…`);
      const { document } = await api<{ document: Doc }>("/api/knowledge", {
        method: "POST",
        json: { ...form, version_note: note || null, act_year: form.act_year || null, assigned_skills: skills, checksum, file_bytes: file.size },
      });
      docId = document.id;
      const parts = batches(chunks);
      for (let i = 0; i < parts.length; i++) {
        setBusy(`Saving sections… (${i + 1}/${parts.length})`);
        await api(`/api/knowledge/${docId}/chunks`, { method: "POST", json: { chunks: parts[i] } });
      }
      await api(`/api/knowledge/${docId}`, { method: "PATCH", json: { action: "finish" } });
      setForm({ title: "", act_year: "", version_note: "", type: "act", source_url: "" });
      setFile(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      if (docId) await api(`/api/knowledge?id=${docId}`, { method: "DELETE" }).catch(() => {});
    } finally {
      setBusy(null);
      load();
    }
  }

  async function act(id: string, json: unknown) {
    setError(null);
    try { await api(`/api/knowledge/${id}`, { method: "PATCH", json }); } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    load();
  }
  async function approve(d: Doc) {
    const name = prompt("Your name (recorded as the person who approved this version):", localStorage.getItem("nirdesh.officer") ?? "");
    if (!name?.trim()) return;
    localStorage.setItem("nirdesh.officer", name);
    act(d.id, { action: "approve", approved_by: name.trim() });
  }
  async function editSource(d: Doc) {
    const url = prompt("Official download link for this Act (PDF). Leave empty to stop nightly checks.", d.source_url ?? "");
    if (url === null) return;
    act(d.id, { action: "set_source", source_url: url.trim() });
  }
  async function remove(id: string) {
    if (!confirm("Remove this document and its sections from the library?")) return;
    await api(`/api/knowledge?id=${id}`, { method: "DELETE" });
    load();
  }

  const [checks, setChecks] = useState<CheckRow[] | null>(null);
  const [checking, setChecking] = useState(false);

  /** "Check for updates": re-check every active document that has an official link, one at a time. */
  async function checkAll() {
    const list = (docs ?? []).filter((d) => d.status === "active" && d.source_url);
    const rows: CheckRow[] = list.map((d) => ({ id: d.id, title: d.title, state: "waiting" }));
    setChecks([...rows]);
    setChecking(true);
    for (let i = 0; i < rows.length; i++) {
      rows[i] = { ...rows[i], state: "working" };
      setChecks([...rows]);
      try {
        const r = await api<{ outcome: CheckRow["state"]; detail: string }>(`/api/knowledge/${rows[i].id}/check`, { method: "POST", json: {} });
        rows[i] = { ...rows[i], state: r.outcome, detail: r.detail };
      } catch (e) {
        rows[i] = { ...rows[i], state: "failed", detail: e instanceof Error ? e.message : "Failed" };
      }
      setChecks([...rows]);
    }
    setChecking(false);
    load();
  }

  const pending = docs?.filter((d) => d.status === "pending") ?? [];
  const current = docs?.filter((d) => d.status !== "pending") ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="Law library" subtitle={<>Bare Acts and Rules that LawGuide may quote. Upload the official text (e.g. from India Code). Nirdesh never invents legal text.</>}
        action={
          <button className="btn-primary" disabled={checking || !docs?.length} onClick={checkAll} title="Re-check every Act against its official link">
            <RefreshCw size={16} className={checking ? "animate-spin" : ""} /> {checking ? "Checking…" : "Check for updates"}
          </button>
        }
      />

      {checks && (
        <section className="card space-y-2 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Update check {checking ? "in progress" : "finished"}</h2>
            {!checking && <button className="text-xs text-mist underline" onClick={() => setChecks(null)}>Close</button>}
          </div>
          <p className="text-xs text-mist">
            Each Act is compared with the file on its official site. Changed → the new text replaces it (the old version is kept as superseded).
            Removed at the source → taken out of answers (record kept). Site down → nothing changes.
          </p>
          <ul className="divide-y divide-mist-line text-sm">
            {checks.map((c) => (
              <li key={c.id} className="flex flex-wrap items-baseline gap-x-3 py-1.5">
                <span className="min-w-0 flex-1 truncate">{c.title}</span>
                <span className={CHECK_STYLE[c.state]}>{c.state === "working" && <Loader2 size={12} className="mr-1 inline animate-spin" />}{CHECK_LABEL_SHORT[c.state]}</span>
                {c.detail && c.state !== "unchanged" && <span className="w-full text-xs text-mist">{c.detail}</span>}
              </li>
            ))}
          </ul>
          {!checking && (
            <p className="text-xs text-ink-soft">
              {checks.filter((c) => c.state === "unchanged").length} unchanged · {checks.filter((c) => c.state === "updated").length} updated ·{" "}
              {checks.filter((c) => c.state === "removed_at_source").length} removed at source · {checks.filter((c) => !["unchanged", "updated", "removed_at_source"].includes(c.state)).length} could not be checked
            </p>
          )}
        </section>
      )}

      {pending.length > 0 && (
        <section className="card space-y-3 border-amber-300 p-4">
          <h2 className="font-semibold text-amber-900">New versions waiting for review ({pending.length})</h2>
          <p className="text-sm text-muted">The nightly check found a changed file on the official site. It is <b>not</b> used in answers until a person approves it. The current version stays in use meanwhile.</p>
          {pending.map((d) => {
            const old = docs?.find((o) => o.id === d.supersedes);
            return (
              <div key={d.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{d.title}</p>
                  <p className="text-xs text-muted">Found {d.uploaded_at.slice(0, 10)} · {d.chunks} sections (current: {old?.chunks ?? "?"}) · {d.version_note}</p>
                </div>
                <button className="btn-primary" onClick={() => approve(d)}><CheckCircle2 size={16} /> Approve</button>
                <button className="btn-ghost" onClick={() => confirm("Discard this new version?") && act(d.id, { action: "discard" })}><XCircle size={16} /> Discard</button>
              </div>
            );
          })}
        </section>
      )}

      <RecommendedActs docs={docs ?? []} onDone={load} />
      <ImportFromLinks skills={skills} onDone={load} />

      <section className="card space-y-4 p-4">
        <h2 className="text-sm font-semibold">Or upload a PDF from your computer</h2>
        <div className="grid gap-3 sm:grid-cols-4">
          <input className="input sm:col-span-2" placeholder="Title, e.g. Foreign Contribution (Regulation) Act" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <input className="input" placeholder="Year, e.g. 2010" value={form.act_year} onChange={(e) => setForm({ ...form, act_year: e.target.value })} />
          <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="act">Act</option><option value="rules">Rules</option><option value="orgchart">Org chart</option>
          </select>
          <input className="input sm:col-span-2" placeholder="Version note, e.g. as amended up to 2020 (India Code)" value={form.version_note} onChange={(e) => setForm({ ...form, version_note: e.target.value })} />
          <input className="input sm:col-span-2" placeholder="Official PDF link (optional — checked every night)" value={form.source_url} onChange={(e) => setForm({ ...form, source_url: e.target.value })} />
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <span className="text-muted">Used by:</span>
          {SKILLS.map(([k, label]) => (
            <label key={k} className="flex items-center gap-1">
              <input type="checkbox" checked={skills.includes(k)} onChange={(e) => setSkills(e.target.checked ? [...skills, k] : skills.filter((s) => s !== k))} /> {label}
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input type="file" accept=".pdf,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
          <button className="btn-primary" disabled={!file || !form.title || !!busy} onClick={add}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} Add to library
          </button>
          {busy && <span className="text-sm text-brand">{busy}</span>}
        </div>
        <p className="text-xs text-muted">The PDF is read in your browser, so large Acts (e.g. the Income-tax Act) work. Only the text is sent to the database.</p>
        <ErrorBox error={error} />
      </section>

      <section className="card overflow-x-auto p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">In the library</h2>
          <span className="flex items-center gap-1 text-xs text-mist">
            <Clock size={14} /> Checked automatically every day at 2:00 AM IST · or use “Check for updates” above
          </span>
        </div>
        {current.length === 0 && <p className="text-sm text-muted">No Acts yet. Until you add some, LawGuide will say the law is not in its knowledge base and offer a legal-aid handover.</p>}
        {current.length > 0 && (
          <table className="w-full text-left text-sm">
            <thead className="bg-lavender"><tr>{["Title", "Status", "Version", "Sections", "Official link", "Last update check", ""].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
            <tbody>
              {current.map((d) => (
                <Fragment key={d.id}>
                  <tr className={`border-t border-line align-top ${d.status === "superseded" ? "opacity-60" : ""}`}>
                    <td className="px-3 py-2">
                      <p className="font-medium">{d.title}{d.act_year ? ` (${d.act_year})` : ""}</p>
                      <p className="text-xs text-muted">{d.assigned_skills.join(", ")}</p>
                    </td>
                    <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[d.status]}`}>{d.status}</span></td>
                    <td className="px-3 py-2 text-xs">
                      {d.version_note ?? "—"}<br /><span className="text-muted">added {d.uploaded_at.slice(0, 10)}{d.approved_by ? ` · approved by ${d.approved_by}` : ""}</span>
                    </td>
                    <td className="px-3 py-2">{d.chunks}</td>
                    <td className="max-w-48 px-3 py-2 text-xs">
                      {d.source_url ? <a href={d.source_url} target="_blank" rel="noreferrer" className="break-all text-brand underline">{new URL(d.source_url).hostname}</a> : <span className="text-muted">none</span>}
                      {d.status === "active" && <button onClick={() => editSource(d)} className="ml-1 text-muted hover:text-brand" aria-label="Edit link"><Pencil size={12} /></button>}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {d.last_checked_at ? (
                        <>
                          <span className={d.last_check_status === "unchanged" ? "text-emerald-700" : d.last_check_status === "new_version_pending" ? "text-amber-800" : "text-red-700"}>
                            {CHECK_LABEL[d.last_check_status ?? ""] ?? d.last_check_status}
                          </span>
                          <br /><span className="text-muted">{new Date(d.last_checked_at).toLocaleString()}</span>
                          {d.last_check_error && <><br /><span className="text-muted">{d.last_check_error}</span></>}
                        </>
                      ) : <span className="text-muted">{d.source_url ? "not yet checked" : "—"}</span>}
                    </td>
                    <td className="px-3 py-2"><button onClick={() => remove(d.id)} className="text-muted hover:text-red-700" aria-label="Remove"><Trash2 size={16} /></button></td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
