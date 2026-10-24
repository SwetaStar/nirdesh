import { db, jsonError, logSkill, must } from "@/lib/server/db";
import { CriticOutput } from "@/lib/schemas";
import { CORRECTION_ROUNDS } from "@/lib/rules";

/**
 * Save the Critic's verdict for round N (1-based). Code-level checks (verbatim quote,
 * date arithmetic) are added as flags so a model "approved" cannot hide them.
 * After the last round, anything still wrong becomes "unresolved" — never approved.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const round: number = body.round;
    const out = CriticOutput.parse(body.output);
    const sb = db();
    const dirs = must(await sb.from("directions").select("id, label, quote_verified, date_check_note").eq("court_order_id", id));
    // Round 1 + up to CORRECTION_ROUNDS re-checks; the last critic round is final.
    const isFinal = round > CORRECTION_ROUNDS;
    const needsFix: { label: string; flags: string[]; problem: string | null; correct_value: unknown }[] = [];

    for (const d of dirs) {
      const check = out.checks.find((c) => c.id === d.label);
      const flags = new Set(check?.flags ?? []);
      const problems: string[] = check?.problem ? [check.problem] : [];
      if (d.quote_verified === false) {
        flags.add("quote_mismatch");
        problems.push("Code check: this quote was not found word for word in the judgment text.");
      }
      if (d.date_check_note) {
        flags.add("deadline_error");
        problems.push(`Code check: ${d.date_check_note}`);
      }
      let result = check?.result ?? "needs_correction";
      if (!check) problems.push("The critic did not review this direction.");
      if (flags.size && result === "approved") result = "needs_correction";
      if (result === "needs_correction" && isFinal) result = "unresolved";
      if (result !== "approved") needsFix.push({ label: d.label, flags: [...flags], problem: problems.join(" "), correct_value: check?.correct_value ?? null });

      must(
        await sb
          .from("directions")
          .update({
            critic_result: result,
            critic_flags: [...flags],
            critic_problem: problems.join(" ") || null,
            flags_for_human: out.flags_for_human.filter((f) => f.id === d.label),
          })
          .eq("id", d.id),
      );
    }

    const missed = out.missed_directions.filter((q) => q.trim());
    const moreRounds = !isFinal && (needsFix.length > 0 || missed.length > 0);
    must(
      await sb
        .from("court_orders")
        .update({
          critic_raw: out,
          missed_directions: missed,
          pipeline_stage: moreRounds ? `correcting_${round}` : "awaiting_gate",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id),
    );
    await logSkill(
      "extraction-verification",
      "completed",
      moreRounds ? `Round ${round}: ${needsFix.length} item(s) sent back for correction` : `Round ${round}: ready for the verification gate`,
      id,
    );
    if (!moreRounds) await logSkill("verification-gate", "started", "Waiting for the officer's decision on every item", id);
    return Response.json({ ok: true, needsFix, missed, nextStage: moreRounds ? `correcting_${round}` : "awaiting_gate" });
  } catch (e) {
    return jsonError(e);
  }
}
