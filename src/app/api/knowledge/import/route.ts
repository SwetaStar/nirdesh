import { z } from "zod";
import { jsonError, logSkill } from "@/lib/server/db";
import { importOfficialAct } from "@/lib/server/importAct";

// Official sites can be slow; allow up to 5 minutes for one Act.
export const maxDuration = 300;
// India Code answers requests from India quickly but times out for overseas servers: run in Mumbai.
export const preferredRegion = "bom1";

const Body = z.object({
  url: z.string().url(),
  title: z.string().nullish(),
  act_year: z.coerce.number().int().nullish(),
  version_note: z.string().nullish(),
  assigned_skills: z.array(z.string()).optional(),
});

/** Import one Act from an official PDF link (the Law library page calls this once per link). */
export async function POST(req: Request) {
  try {
    const b = Body.parse(await req.json());
    const r = await importOfficialAct({ url: b.url, title: b.title, year: b.act_year ?? null, version_note: b.version_note, assigned_skills: b.assigned_skills, timeoutMs: 240_000 });
    await logSkill("knowledge-sync", r.ok ? "completed" : "failed", r.ok ? `Imported ${r.title} (${r.sections} sections) from ${new URL(b.url).hostname}` : `Import failed for ${b.url}: ${r.error}`, r.id);
    return Response.json(r);
  } catch (e) {
    return jsonError(e);
  }
}
