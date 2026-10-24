import { z } from "zod";
import { db, jsonError, logSkill } from "@/lib/server/db";

const AICall = z.object({
  kind: z.literal("ai_call"),
  agent: z.string(),
  provider: z.string().nullish(),
  model: z.string().nullish(),
  ref_id: z.string().uuid().nullish(),
  request_summary: z.string().nullish(),
  response_text: z.string().nullish(),
  ok: z.boolean(),
  error: z.string().nullish(),
  duration_ms: z.number().int().nullish(),
});
const Skill = z.object({
  kind: z.literal("skill"),
  skill: z.string(),
  event: z.enum(["started", "processing", "completed", "failed"]),
  detail: z.string().nullish(),
  ref_id: z.string().uuid().nullish(),
});

/** Activity log: AI calls (what was sent / received — never the key) and skill events. */
export async function POST(req: Request) {
  try {
    const body = z.discriminatedUnion("kind", [AICall, Skill]).parse(await req.json());
    if (body.kind === "skill") {
      await logSkill(body.skill, body.event, body.detail ?? undefined, body.ref_id ?? undefined);
    } else {
      const { kind: _kind, ...row } = body;
      void _kind;
      await db().from("ai_calls").insert({ ...row, response_text: row.response_text?.slice(0, 50000) });
    }
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}

/** Recent AI calls, for the Settings "AI activity log". */
export async function GET(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get("id");
    const sb = db();
    if (id) {
      const { data } = await sb.from("ai_calls").select("*").eq("id", id).single();
      return Response.json({ call: data });
    }
    const { data } = await sb.from("ai_calls").select("id, agent, provider, model, ref_id, ok, error, duration_ms, ts, request_summary").order("ts", { ascending: false }).limit(100);
    return Response.json({ calls: data ?? [] });
  } catch (e) {
    return jsonError(e);
  }
}
