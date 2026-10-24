import { jsonError } from "@/lib/server/db";
import { checkDocument } from "@/lib/server/checkDoc";

export const maxDuration = 300;
// Official Indian sites answer Indian servers far better than overseas ones.
export const preferredRegion = "bom1";

/** "Check for updates" button: re-check one document against its official link. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    return Response.json(await checkDocument(id, 240_000));
  } catch (e) {
    return jsonError(e);
  }
}
