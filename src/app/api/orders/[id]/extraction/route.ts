import { db, jsonError, logSkill, must } from "@/lib/server/db";
import { ExtractorOutput, type ExtractedDirection } from "@/lib/schemas";
import { checkDeadline, quoteAppears } from "@/lib/rules";

function toRow(d: ExtractedDirection, orderId: string, text: string, judgmentDate: string | null) {
  const date = checkDeadline(d, judgmentDate);
  return {
    court_order_id: orderId,
    label: d.id,
    summary: d.summary,
    quote: d.quote,
    paragraph: d.paragraph,
    responsible_authority: d.responsible_authority,
    action_type: d.action_type,
    period: d.period,
    trigger: d.trigger,
    // Code wins on arithmetic; receipt-of-copy and unclear triggers never get a date.
    deadline_date: d.deadline_status === "calculated" ? (date.computed ?? d.deadline_date) : null,
    deadline_status: d.deadline_status,
    beneficiary: d.beneficiary,
    confidence: d.confidence,
    quote_verified: quoteAppears(d.quote, text),
    date_check_note: date.note,
    status: "unverified",
  };
}

/**
 * Save Direction Extractor output.
 * round 0 = first extraction (replaces any earlier attempt);
 * round 1..2 = correction round: only the labels in `corrected` are updated, new labels are added.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const round: number = body.round ?? 0;
    const out = ExtractorOutput.parse(body.output);
    const sb = db();
    const order = must(await sb.from("court_orders").select("extracted_text, judgment_date").eq("id", id).single());
    const text = order.extracted_text ?? "";
    const jd = out.case.judgment_date ?? order.judgment_date;

    if (round === 0) {
      must(await sb.from("directions").delete().eq("court_order_id", id));
      if (out.directions.length)
        must(await sb.from("directions").insert(out.directions.map((d) => toRow(d, id, text, jd))));
    } else {
      const flagged: string[] = body.corrected ?? [];
      const existing = must(await sb.from("directions").select("id, label").eq("court_order_id", id));
      const byLabel = new Map(existing.map((e) => [e.label, e.id]));
      for (const d of out.directions) {
        const row = toRow(d, id, text, jd);
        const rowId = byLabel.get(d.id);
        if (rowId && flagged.includes(d.id)) must(await sb.from("directions").update(row).eq("id", rowId));
        else if (!rowId) must(await sb.from("directions").insert(row));
      }
      // A flagged item the extractor dropped on correction (e.g. not an order) is removed.
      const returned = new Set(out.directions.map((d) => d.id));
      for (const label of flagged) {
        const rowId = byLabel.get(label);
        if (rowId && !returned.has(label)) must(await sb.from("directions").delete().eq("id", rowId));
      }
    }

    const count = must(await sb.from("directions").select("id").eq("court_order_id", id)).length;
    must(
      await sb
        .from("court_orders")
        .update({
          court: out.case.court,
          case_number: out.case.case_number,
          judgment_date: jd,
          petitioners: out.case.petitioners,
          respondents: out.case.respondents,
          extractor_notes: out.notes,
          directions_total: count,
          correction_round: round,
          // No government directions -> nothing for the critic or gate to do.
          pipeline_stage: count === 0 && round === 0 ? "no_directions" : `critic_round_${round + 1}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id),
    );
    await logSkill("direction-extraction", "completed", `${count} direction(s)${round ? `, correction round ${round}` : ""}`, id);
    return Response.json({ ok: true, count });
  } catch (e) {
    return jsonError(e);
  }
}
