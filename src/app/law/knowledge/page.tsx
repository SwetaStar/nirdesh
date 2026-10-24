"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock, ExternalLink, Loader2, Pencil, Trash2, Upload, XCircle } from "lucide-react";
import { api, runAgent } from "@/lib/pipeline";
import { activeConfig } from "@/lib/ai/providers";
import { chunkAct, type Chunk } from "@/lib/chunk";
import { ErrorBox } from "@/components/ui";

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

const SYNC_URL = "https://github.com/SwetaStar/nirdesh/actions/workflows/sync-knowledge.yml";

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

  const pending = docs?.filter((d) => d.status === "pending") ?? [];
  const current = docs?.filter((d) => d.status !== "pending") ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1>Law library</h1>
        <p className="text-muted">Bare Acts and Rules that LawGuide may quote. Upload the official text (e.g. from India Code). Nirdesh never invents legal text.</p>
      </div>

      {pending.length > 0 && (
        <section className="card space-y-3 border-amber-300 p-6">
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

      <section className="card space-y-4 p-6">
        <h2 className="font-semibold">Add an Act or Rules</h2>
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

      <section className="card overflow-x-auto p-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">In the library</h2>
          <a href={SYNC_URL} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-muted hover:text-brand">
            <Clock size={14} /> Update check runs nightly at 2:00 AM IST · run it now <ExternalLink size={12} />
          </a>
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
