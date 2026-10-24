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
  /** Set when the PDF link was found on this official page. */
  followedFrom?: string;
}): Promise<ImportResult> {
  if (!isOfficialUrl(opts.url)) return { ok: false, error: "Not an official government website. Only .gov.in / .nic.in and the listed official sites are allowed." };
  // India Code's file server often times out (504) on a first request; retry while time allows.
  let buf: Uint8Array | null = null;
  let lastError = "";
  const deadline = Date.now() + (opts.timeoutMs ?? 90_000);
  for (let attempt = 1; attempt <= 3 && !buf && Date.now() < deadline - 5_000; attempt++) {
    try {
      const res = await fetch(opts.url, {
        headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130 Safari/537.36", Accept: "application/pdf,*/*" },
        signal: AbortSignal.timeout(Math.max(5_000, deadline - Date.now())),
        redirect: "follow",
      });
      if (res.ok) buf = new Uint8Array(await res.arrayBuffer());
      else lastError = `The official site answered with error ${res.status}${res.status === 504 ? " (its server timed out)" : ""}.`;
    } catch (e) {
      const timedOut = e instanceof Error && (e.name === "TimeoutError" || /timeout|aborted/i.test(e.message));
      lastError = timedOut ? "The official site did not respond in time." : `Could not download: ${e instanceof Error ? e.message : e}`;
    }
  }
  if (!buf) return { ok: false, error: `${lastError} Tried several times — try again later, or download the PDF in your browser and use the file upload.` };

  // Given an Act's page instead of its PDF (e.g. indiacode.nic.in/handle/123456789/2065), find the PDF on the page.
  if (String.fromCharCode(...buf.slice(0, 5)) !== "%PDF-" && !opts.followedFrom) {
    const html = new TextDecoder().decode(buf);
    const page = new URL(opts.url);
    const handle = page.pathname.match(/handle\/(\d+\/\d+)/)?.[1];
    const links = [...html.matchAll(/href=["']([^"']+?\.pdf)(?:\?[^"']*)?["']/gi)]
      .map((m) => { try { return new URL(m[1].replace(/&amp;/g, "&"), page).toString(); } catch { return null; } })
      .filter((u): u is string => !!u && isOfficialUrl(u));
    // Prefer the file that belongs to this Act's record.
    const pdf = (handle && links.find((u) => u.includes(`/bitstream/${handle}/`))) || links.find((u) => u.includes("/bitstream/")) || links[0];
    if (!pdf) return { ok: false, error: "No PDF found on that page. Open it in a browser and copy the PDF link (under 'View/Open')." };
    return importOfficialAct({ ...opts, url: pdf, followedFrom: opts.url });
  }
  if (String.fromCharCode(...buf.slice(0, 5)) !== "%PDF-") return { ok: false, error: "The link did not return a PDF. Use the direct PDF link (on India Code: the file under 'View/Open')." };
  // When the PDF was found on an Act page, keep the PDF link (checked nightly) and note the page.

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
  const sameLink = must(await sb.from("knowledge_documents").select("id, title").eq("source_url", opts.url).in("status", ["active", "pending"]));
  if (sameLink.length) return { ok: false, title, year, error: `Already in the library (${sameLink[0].title}).` };
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
