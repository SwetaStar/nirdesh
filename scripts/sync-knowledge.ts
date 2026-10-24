/**
 * Nightly law-library update check (run by .github/workflows/sync-knowledge.yml).
 *
 * For every ACTIVE library entry with an official download link:
 *   - download the file and compare its SHA-256 with the stored one;
 *   - unchanged  -> record "unchanged";
 *   - changed    -> read the new PDF, split into sections, save as a PENDING version that a
 *                   person must approve on the Law library page before answers quote it;
 *   - failure    -> record the error; the current version stays in use.
 * It never edits or deletes the active version.
 *
 * Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/sync-knowledge.ts
 */
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { extractText, getDocumentProxy } from "unpdf";
import { chunkAct } from "../src/lib/chunk";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });
const TIMEOUT_MS = 180_000;
const UA = "Mozilla/5.0 (compatible; NirdeshLawLibraryCheck/1.0; +https://github.com/SwetaStar/nirdesh)";

async function download(link: string): Promise<Uint8Array> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(link, { headers: { "User-Agent": UA, Accept: "application/pdf,*/*" }, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "follow" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.length < 5 || String.fromCharCode(...buf.slice(0, 5)) !== "%PDF-") throw Object.assign(new Error("Link did not return a PDF"), { notPdf: true });
      return buf;
    } catch (e) {
      lastErr = e;
      if ((e as { notPdf?: boolean }).notPdf) break;
      await new Promise((r) => setTimeout(r, 10_000 * attempt));
    }
  }
  throw lastErr;
}

async function activity(event: "started" | "completed" | "failed", detail: string, ref?: string) {
  await sb.from("skill_activities").insert({ skill: "knowledge-sync", event, detail, ref_id: ref ?? null });
}

async function main() {
  const { data: docs, error } = await sb.from("knowledge_documents").select("*").eq("status", "active").not("source_url", "is", null);
  if (error) throw error;
  console.log(`Checking ${docs.length} document(s) with an official link.`);
  await activity("started", `Nightly check of ${docs.length} Act(s)`);
  let changed = 0, failed = 0;

  for (const d of docs) {
    const now = new Date().toISOString();
    const mark = (patch: Record<string, unknown>) => sb.from("knowledge_documents").update({ last_checked_at: now, ...patch }).eq("id", d.id);
    try {
      const buf = await download(d.source_url);
      const checksum = createHash("sha256").update(buf).digest("hex");
      if (checksum === d.checksum) {
        await mark({ last_check_status: "unchanged", last_check_error: null });
        console.log(`= ${d.title}: unchanged`);
        continue;
      }
      // Already waiting for review with this exact file? Don't add a duplicate.
      const { data: dup } = await sb.from("knowledge_documents").select("id").eq("status", "pending").eq("supersedes", d.id).eq("checksum", checksum);
      if (dup?.length) {
        await mark({ last_check_status: "new_version_pending", last_check_error: null });
        continue;
      }
      const pdf = await getDocumentProxy(buf);
      const text = (await extractText(pdf, { mergePages: true })).text;
      if (text.replace(/\s+/g, "").length / Math.max(pdf.numPages, 1) < 200) {
        await mark({ last_check_status: "scanned", last_check_error: "The new file has no text layer; upload it by hand so the AI can read it." });
        continue;
      }
      const chunks = chunkAct(text);
      const { data: pending, error: e1 } = await sb
        .from("knowledge_documents")
        .insert({
          title: d.title, type: d.type, act_year: d.act_year, assigned_skills: d.assigned_skills, source_url: d.source_url,
          version_note: `Downloaded automatically on ${now.slice(0, 10)} from the official link — awaiting review`,
          checksum, file_bytes: buf.length, status: "pending", supersedes: d.id,
        })
        .select("id")
        .single();
      if (e1) throw e1;
      for (let i = 0; i < chunks.length; i += 300) {
        const { error: e2 } = await sb.from("knowledge_chunks").insert(chunks.slice(i, i + 300).map((c) => ({ ...c, document_id: pending.id })));
        if (e2) throw e2;
      }
      await mark({ last_check_status: "new_version_pending", last_check_error: null });
      await activity("completed", `New version of ${d.title} found (${chunks.length} sections) — awaiting human review`, pending.id);
      changed++;
      console.log(`! ${d.title}: new version saved for review (${chunks.length} sections)`);
    } catch (e) {
      failed++;
      const msg = e instanceof Error ? `${e.name === "TimeoutError" ? "Timed out" : e.message}` : String(e);
      await mark({ last_check_status: (e as { notPdf?: boolean }).notPdf ? "not_pdf" : "failed", last_check_error: msg.slice(0, 300) });
      console.log(`x ${d.title}: ${msg}`);
    }
  }
  await activity(failed && !changed ? "failed" : "completed", `Nightly check done: ${docs.length - changed - failed} unchanged, ${changed} new version(s), ${failed} failed`);
}

main().catch(async (e) => {
  console.error(e);
  await activity("failed", `Nightly check crashed: ${e instanceof Error ? e.message : e}`).catch(() => {});
  process.exit(1);
});
