"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Trash2, Upload } from "lucide-react";
import { api, runAgent } from "@/lib/pipeline";
import { activeConfig } from "@/lib/ai/providers";
import { ErrorBox } from "@/components/ui";

interface Doc {
  id: string; title: string; type: string; act_year: number | null; version_note: string | null;
  uploaded_at: string; assigned_skills: string[]; chunks: number;
}

const SKILLS = [
  ["know-your-law", "Know Your Law"],
  ["compliance-planning-drafting", "Planner"],
  ["citizen-explainer", "Citizen Explainer"],
  ["direction-extraction", "Extractor"],
] as const;

async function toBase64(f: File) {
  const buf = new Uint8Array(await f.arrayBuffer());
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

export default function KnowledgePage() {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [form, setForm] = useState({ title: "", act_year: "", version_note: "", type: "act" });
  const [skills, setSkills] = useState<string[]>(["know-your-law"]);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => api<{ documents: Doc[] }>("/api/knowledge").then((r) => setDocs(r.documents)).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  async function add() {
    if (!file) return;
    setError(null);
    setBusy("Reading the PDF…");
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      fd.append("assigned_skills", skills.join(","));
      fd.append("file", file);
      let r = await api<{ needsOcr?: boolean; chunks?: number }>("/api/knowledge", { method: "POST", body: fd });
      if (r.needsOcr) {
        if (!activeConfig().info.readsPdf) throw new Error("This PDF is scanned. Switch to Claude or Gemini in Settings so the AI can read it.");
        setBusy("Scanned PDF — the AI is reading it (this can take a few minutes)…");
        const { text } = await runAgent("OCR", {
          system: "You transcribe scanned Indian Bare Acts. Output the full text exactly as printed. Keep every section number at the start of its line (e.g. '20. Limitation for actions for contempt.—'). Do not summarise, correct or add anything.",
          user: "Transcribe this Act verbatim.",
          pdfBase64: await toBase64(file),
          maxTokens: 64000,
        });
        const fd2 = new FormData();
        Object.entries(form).forEach(([k, v]) => fd2.append(k, v));
        fd2.append("assigned_skills", skills.join(","));
        fd2.append("version_note", `${form.version_note ? form.version_note + "; " : ""}text read from scan by AI — spot-check before relying on quotes`);
        fd2.append("text", text);
        r = await api("/api/knowledge", { method: "POST", body: fd2 });
      }
      setForm({ title: "", act_year: "", version_note: "", type: "act" });
      setFile(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    if (!confirm("Remove this document from the library?")) return;
    await api(`/api/knowledge?id=${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Law library</h1>
        <p className="text-muted">Bare Acts and Rules that LawGuide may quote. Upload official text from India Code (indiacode.nic.in). Nirdesh never invents legal text.</p>
      </div>

      <section className="card space-y-4 p-6">
        <h2 className="font-semibold">Add an Act or Rules</h2>
        <div className="grid gap-3 sm:grid-cols-4">
          <input className="input sm:col-span-2" placeholder="Title, e.g. Foreign Contribution (Regulation) Act" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <input className="input" placeholder="Year, e.g. 2010" value={form.act_year} onChange={(e) => setForm({ ...form, act_year: e.target.value })} />
          <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="act">Act</option><option value="rules">Rules</option><option value="orgchart">Org chart</option>
          </select>
          <input className="input sm:col-span-4" placeholder="Version note, e.g. as amended up to 2020 (from India Code)" value={form.version_note} onChange={(e) => setForm({ ...form, version_note: e.target.value })} />
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
        <ErrorBox error={error} />
      </section>

      <section className="card overflow-x-auto p-6">
        <h2 className="mb-3 font-semibold">In the library</h2>
        {docs?.length === 0 && <p className="text-sm text-muted">No Acts yet. Until you add some, LawGuide will say the law is not in its knowledge base and offer a legal-aid handover.</p>}
        {docs && docs.length > 0 && (
          <table className="w-full text-left text-sm">
            <thead className="bg-lavender"><tr>{["Title", "Year", "Version", "Sections", "Used by", "Uploaded", ""].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id} className="border-t border-line">
                  <td className="px-3 py-2 font-medium">{d.title}</td>
                  <td className="px-3 py-2">{d.act_year ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">{d.version_note ?? "—"}</td>
                  <td className="px-3 py-2">{d.chunks}</td>
                  <td className="px-3 py-2 text-xs">{d.assigned_skills.join(", ")}</td>
                  <td className="px-3 py-2 text-xs">{d.uploaded_at.slice(0, 10)}</td>
                  <td className="px-3 py-2"><button onClick={() => remove(d.id)} className="text-muted hover:text-red-700" aria-label="Remove"><Trash2 size={16} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
