import "server-only";
import { createHash } from "node:crypto";
import { extractText, getDocumentProxy } from "unpdf";
import { chunkAct } from "@/lib/chunk";
import { db, logSkill, must } from "@/lib/server/db";
import { isOfficialUrl } from "@/lib/server/importAct";

export type CheckOutcome = "unchanged" | "updated" | "removed_at_source" | "failed" | "scanned" | "not_pdf";

export interface CheckResult {
  id: string;
  title: string;
  outcome: CheckOutcome;
  detail: string;
  newId?: string;
}

/**
 * Re-check one library document against its official link.
 * - same file            -> unchanged
 * - changed file         -> new version becomes active; old one kept as "superseded" (not used in answers)
 * - 404 / 410 at source  -> taken out of answers ("removed at source"); record kept for the audit trail
 * - site down / timeout  -> nothing changes
 */
export async function checkDocument(id: string, timeoutMs = 100_000): Promise<CheckResult> {
  const sb = db();
  const doc = must(await sb.from("knowledge_documents").select("*").eq("id", id).single());
  const base = { id, title: doc.title as string };
  const now = new Date().toISOString();
  const mark = (patch: Record<string, unknown>) => sb.from("knowledge_documents").update({ last_checked_at: now, ...patch }).eq("id", id);

  if (!doc.source_url) return { ...base, outcome: "failed", detail: "No official link stored for this document." };
  if (!isOfficialUrl(doc.source_url)) return { ...base, outcome: "failed", detail: "Stored link is not an official government site." };

  let buf: Uint8Array | null = null;
  let status = 0;
  let error = "";
  const deadline = Date.now() + timeoutMs;
  for (let attempt = 1; attempt <= 2 && !buf && Date.now() < deadline - 5_000; attempt++) {
    try {
      const res = await fetch(doc.source_url, {
        headers: { "User-Agent": "NirdeshLawLibrary/1.0 (+https://nirdesh-rouge.vercel.app)", Accept: "application/pdf,*/*" },
        signal: AbortSignal.timeout(Math.max(5_000, deadline - Date.now())),
        redirect: "follow",
      });
      status = res.status;
      if (res.ok) buf = new Uint8Array(await res.arrayBuffer());
      else if (status === 404 || status === 410) break;
      else error = `The official site answered with error ${status}.`;
    } catch (e) {
      error = e instanceof Error && (e.name === "TimeoutError" || /timeout|aborted/i.test(e.message)) ? "The official site did not respond in time." : `Could not reach the site: ${e instanceof Error ? e.message : e}`;
    }
  }

  if (!buf && (status === 404 || status === 410)) {
    await mark({ status: "superseded", last_check_status: "removed_at_source", last_check_error: `The official link now returns ${status}. Taken out of answers; the record is kept for the audit trail.` });
    await logSkill("knowledge-sync", "completed", `${doc.title}: removed at the official source (${status})`, id);
    return { ...base, outcome: "removed_at_source", detail: `The official link returns ${status} — taken out of answers.` };
  }
  if (!buf) {
    await mark({ last_check_status: "failed", last_check_error: error });
    return { ...base, outcome: "failed", detail: `${error} Nothing was changed.` };
  }
  if (String.fromCharCode(...buf.slice(0, 5)) !== "%PDF-") {
    await mark({ last_check_status: "not_pdf", last_check_error: "The link no longer returns a PDF (the site may have moved the file)." });
    return { ...base, outcome: "not_pdf", detail: "The link no longer returns a PDF. Nothing was changed." };
  }

  const checksum = createHash("sha256").update(buf).digest("hex");
  if (checksum === doc.checksum) {
    await mark({ last_check_status: "unchanged", last_check_error: null });
    return { ...base, outcome: "unchanged", detail: "Same as the official file." };
  }

  const pdf = await getDocumentProxy(buf);
  const text = (await extractText(pdf, { mergePages: true })).text;
  if (text.replace(/\s+/g, "").length / Math.max(pdf.numPages, 1) < 200) {
    await mark({ last_check_status: "scanned", last_check_error: "The official file changed but is a scan without text — upload it by hand." });
    return { ...base, outcome: "scanned", detail: "Changed, but the new file is a scan. Upload it by hand." };
  }

  // Documents first loaded without a checksum: record it rather than treat it as a change.
  if (!doc.checksum) {
    await mark({ checksum, file_bytes: buf.length, last_check_status: "unchanged", last_check_error: null });
    return { ...base, outcome: "unchanged", detail: "Fingerprint recorded for future checks." };
  }

  const chunks = chunkAct(text);
  const fresh = must(
    await sb
      .from("knowledge_documents")
      .insert({
        title: doc.title, type: doc.type, act_year: doc.act_year, assigned_skills: doc.assigned_skills, source_url: doc.source_url,
        version_note: `Updated from the official source on ${now.slice(0, 10)} (previous version kept as superseded). ${doc.version_note ?? ""}`.trim(),
        checksum, file_bytes: buf.length, status: "importing", supersedes: id, last_checked_at: now, last_check_status: "unchanged",
      })
      .select("id")
      .single(),
  );
  try {
    for (let i = 0; i < chunks.length; i += 300)
      must(await sb.from("knowledge_chunks").insert(chunks.slice(i, i + 300).map((c) => ({ ...c, document_id: fresh.id }))));
  } catch (e) {
    await sb.from("knowledge_documents").delete().eq("id", fresh.id);
    throw e;
  }
  must(await sb.from("knowledge_documents").update({ status: "active" }).eq("id", fresh.id));
  await mark({ status: "superseded", last_check_status: "superseded", last_check_error: null });
  await logSkill("knowledge-sync", "completed", `${doc.title}: updated from the official source (${chunks.length} sections)`, fresh.id);
  return { ...base, outcome: "updated", detail: `Updated: ${chunks.length} sections from the new official file. Previous version kept.`, newId: fresh.id };
}
