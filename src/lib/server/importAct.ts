import "server-only";
import { createHash } from "node:crypto";
import { extractText, getDocumentProxy } from "unpdf";
import { chunkAct } from "@/lib/chunk";
import { OFFICIAL_SOURCES } from "@/lib/sources";
import { db, must } from "@/lib/server/db";

const OFFICIAL_HOSTS = [...new Set(OFFICIAL_SOURCES.map((o) => new URL(o.url).hostname.replace(/^www\./, "")))];

/** Only official Indian government sites may be imported from. */
export function isOfficialUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const h = u.hostname.toLowerCase().replace(/^www\./, "");
    return OFFICIAL_HOSTS.some((d) => h === d || h.endsWith(`.${d}`)) || /\.(gov|nic)\.in$/.test(h);
  } catch {
    return false;
  }
}

/** "THE CONTEMPT OF COURTS ACT, 1971" -> { title, year } from the first page of the Act. */
export function titleFromText(text: string): { title: string | null; year: number | null } {
  const head = text.slice(0, 2500).replace(/\s+/g, " ");
  const m = head.match(/\b(THE\s+.{3,250}?\b(?:ACT|CODE|SANHITA|ADHINIYAM|RULES|REGULATIONS|ORDER|NOTIFICATION))\s*,?\s*((?:19|20)\d{2})/i);
  if (!m) return { title: null, year: null };
  let title = m[1]
    .replace(/^THE\s+/i, "")
    .replace(/\([^)]*[^\x00-\x7F][^)]*\)/g, "") // drop bracketed Hindi names
    .replace(/\s+/g, " ")
    .trim();
  // Only re-case titles printed in capitals ("THE LIMITATION ACT"); keep mixed-case titles as printed.
  if (title === title.toUpperCase())
    title = title.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/\b(Of|And|For|To|In|On|The)\b/g, (w) => w.toLowerCase());
  return { title: title.charAt(0).toUpperCase() + title.slice(1), year: Number(m[2]) };
}

export interface ImportResult {
  ok: boolean;
  id?: string;
  title?: string;
  year?: number | null;
  sections?: number;
  pages?: number;
  error?: string;
}

/** Download an official PDF, read it, split it into sections and add it to the library as active. */
export async function importOfficialAct(opts: {
  url: string; title?: string | null; year?: number | null; version_note?: string | null; assigned_skills?: string[]; timeoutMs?: number;
}): Promise<ImportResult> {
  if (!isOfficialUrl(opts.url)) return { ok: false, error: "Not an official government website. Only .gov.in / .nic.in and the listed official sites are allowed." };
  let buf: Uint8Array;
  try {
    const res = await fetch(opts.url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; NirdeshLawLibrary/1.0)", Accept: "application/pdf,*/*" },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 90_000),
      redirect: "follow",
    });
    if (!res.ok) return { ok: false, error: `The official site answered with error ${res.status}${res.status === 504 ? " (its server timed out — try again later)" : ""}.` };
    buf = new Uint8Array(await res.arrayBuffer());
  } catch (e) {
    const timedOut = e instanceof Error && (e.name === "TimeoutError" || /timeout|aborted/i.test(e.message));
    return { ok: false, error: timedOut ? "The official site did not respond in time. Try again later." : `Could not download: ${e instanceof Error ? e.message : e}` };
  }
  if (String.fromCharCode(...buf.slice(0, 5)) !== "%PDF-") return { ok: false, error: "The link did not return a PDF. Use the direct PDF link (on India Code: the file under 'View/Open')." };

  const pdf = await getDocumentProxy(buf);
  const text = (await extractText(pdf, { mergePages: true })).text;
  if (text.replace(/\s+/g, "").length / Math.max(pdf.numPages, 1) < 200)
    return { ok: false, pages: pdf.numPages, error: "This PDF is a scan without text. Download it and add it with the file upload above, so the AI can read it." };

  const found = titleFromText(text);
  const title = opts.title?.trim() || found.title;
  const year = opts.year ?? found.year;
  if (!title) return { ok: false, pages: pdf.numPages, error: "Could not read the Act's title from the PDF. Add a title and try again." };

  const sb = db();
  const checksum = createHash("sha256").update(buf).digest("hex");
  const dup = must(await sb.from("knowledge_documents").select("id, title").eq("checksum", checksum).in("status", ["active", "pending"]));
  if (dup.length) return { ok: false, title, year, error: `Already in the library (${dup[0].title}).` };

  const chunks = chunkAct(text);
  const doc = must(
    await sb
      .from("knowledge_documents")
      .insert({
        title, type: /rules|regulations/i.test(title) ? "rules" : "act", act_year: year,
        version_note: opts.version_note?.trim() || `Official text downloaded from ${new URL(opts.url).hostname} on ${new Date().toISOString().slice(0, 10)}`,
        assigned_skills: opts.assigned_skills?.length ? opts.assigned_skills : ["know-your-law"],
        source_url: opts.url, checksum, file_bytes: buf.length, status: "importing",
      })
      .select("id")
      .single(),
  );
  try {
    for (let i = 0; i < chunks.length; i += 300)
      must(await sb.from("knowledge_chunks").insert(chunks.slice(i, i + 300).map((c) => ({ ...c, document_id: doc.id }))));
    must(await sb.from("knowledge_documents").update({ status: "active", last_checked_at: new Date().toISOString(), last_check_status: "unchanged" }).eq("id", doc.id));
  } catch (e) {
    await sb.from("knowledge_documents").delete().eq("id", doc.id);
    throw e;
  }
  return { ok: true, id: doc.id, title, year, sections: chunks.length, pages: pdf.numPages };
}
