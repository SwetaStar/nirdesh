import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";
import { db, jsonError, logSkill, must } from "@/lib/server/db";
import { withStatus } from "@/lib/server/directions";

export const maxDuration = 60;

// A text PDF yields hundreds of characters per page; a scan yields almost none.
const MIN_CHARS_PER_PAGE = 200;

/** Upload a judgment: store the file, pull its text, create the court order. */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const role = form.get("role") === "citizen" ? "citizen" : "officer";
    if (!(file instanceof File)) return jsonError("No file uploaded.", 400);
    const name = file.name;
    const buf = new Uint8Array(await file.arrayBuffer());
    const sb = db();

    await logSkill("user-intake-routing", "started", `${role} uploaded ${name}`);

    let text = "";
    let pages = 0;
    if (/\.pdf$/i.test(name) || file.type === "application/pdf") {
      const pdf = await getDocumentProxy(buf);
      pages = pdf.numPages;
      const out = await extractText(pdf, { mergePages: false });
      text = out.text.map((t, i) => `[Page ${i + 1}]\n${t}`).join("\n\n");
    } else if (/\.docx$/i.test(name)) {
      text = (await mammoth.extractRawText({ buffer: Buffer.from(buf) })).value;
      pages = 1;
    } else {
      return jsonError("Please upload a PDF or Word (.docx) file.", 400);
    }
    const realChars = text.replace(/\[Page \d+\]/g, "").replace(/\s+/g, "").length;
    const needsOcr = pages > 0 && realChars / pages < MIN_CHARS_PER_PAGE;

    const path = `${crypto.randomUUID()}/${name.replace(/[^\w.\-]+/g, "_")}`;
    const up = await sb.storage.from("judgments").upload(path, buf, { contentType: file.type || "application/octet-stream" });
    if (up.error) throw new Error(`Storage: ${up.error.message}`);

    const order = must(
      await sb
        .from("court_orders")
        .insert({
          file_name: name,
          file_ref: path,
          extracted_text: needsOcr ? null : text,
          user_role: role,
          pipeline_stage: needsOcr ? "needs_ocr" : "uploaded",
        })
        .select("id, pipeline_stage")
        .single(),
    );
    await logSkill("user-intake-routing", "completed", needsOcr ? "Scanned PDF — text must be read by the AI" : "Routed to Direction Extraction", order.id);
    await sb.from("hours_saved_log").insert({ kind: "judgment_read", minutes: 45, ref_id: order.id });

    return Response.json({ id: order.id, stage: order.pipeline_stage, needsOcr, pages });
  } catch (e) {
    return jsonError(e);
  }
}

/** List court orders with their directions (for the dashboard and queues). */
export async function GET() {
  try {
    const sb = db();
    const orders = must(
      await sb
        .from("court_orders")
        .select("id, case_number, court, judgment_date, petitioners, respondents, file_name, user_role, pipeline_stage, correction_round, directions_total, directions_approved, source_channel, is_sample, created_at, updated_at")
        .order("created_at", { ascending: false }),
    );
    const dirs = must(await sb.from("directions").select("*"));
    return Response.json({
      orders: orders.map((o) => ({ ...o, directions: dirs.filter((d) => d.court_order_id === o.id).map(withStatus) })),
    });
  } catch (e) {
    return jsonError(e);
  }
}
