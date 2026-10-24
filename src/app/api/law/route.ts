import { z } from "zod";
import { db, jsonError, logSkill, must } from "@/lib/server/db";
import { keywords } from "@/lib/chunk";
import { normaliseForMatch } from "@/lib/rules";

// Short names people use for Acts -> words in the Act's title (used to boost that Act).
const ACT_ALIASES: [RegExp, string][] = [
  [/\bfcra\b|foreign contribution|foreign donation|foreign fund/i, "foreign contribution"],
  [/\brti\b|right to information/i, "right to information"],
  [/\bdpdp\b|data protection|personal data/i, "personal data"],
  [/\bibc\b|insolvenc|bankrupt/i, "insolvency"],
  [/\bdlsa\b|\bnalsa\b|\bslsa\b|legal aid|free legal|lok adalat/i, "legal services"],
  [/\beia\b|environment(al)? (impact|clearance)|public hearing/i, "environment impact"],
  [/\blimitation\b|time.?barred|condonation of delay/i, "limitation"],
  [/mgnrega|nrega|vb-?g|ram g|job card|rural employment|rozgar/i, "rozgar"],
  [/consumer/i, "consumer protection"],
  [/\bbnss\b|\bcrpc\b|arrest|\bfir\b|\bbail\b|police/i, "nagarik suraksha"],
  [/\bbns\b|\bipc\b|offence|punishment/i, "nyaya sanhita"],
  [/contempt/i, "contempt"],
  [/senior citizen|old age|parents.*maintenance|maintenance.*parents/i, "senior citizens"],
  [/\bsebi\b|securities|stock market/i, "securities and exchange"],
];
// Everyday words -> the words Acts use.
const SYNONYMS: Record<string, string[]> = {
  employ: ["servant", "employee"], employee: ["servant"], employed: ["servant"], job: ["employment"],
  ngo: ["association", "organisation"], trustee: ["trust"], donation: ["contribution"], fund: ["contribution"],
  complaint: ["complaint"], refund: ["refund"], lawyer: ["advocate"], arrested: ["arrest"],
};
const stemOf = (w: string) => (w.length > 5 ? w.replace(/(ies|es|s|ed|ing)$/, "") : w);

/**
 * Keyword retrieval over Bare Act sections (handoff section 9: keyword search is enough
 * for the demo and keeps quotes exact). Any-term match in Postgres, ranked here by term hits.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("q") ?? "";
    const terms = keywords(q);
    const sb = db();
    // Only the active version of each Act is quoted; versions awaiting review are excluded.
    const docs = must(await sb.from("knowledge_documents").select("*"));
    const lawDocs = docs
      .filter((d) => (d.assigned_skills as string[]).includes("know-your-law") && (d.status ?? "active") === "active")
      .map((d) => ({ id: d.id, title: d.title, act_year: d.act_year, version_note: d.version_note, uploaded_at: d.uploaded_at, source_url: d.source_url ?? null }));
    if (!terms.length || !lawDocs.length) return Response.json({ chunks: [], documents: lawDocs });

    const base = terms.map((t) => t.replace(/[^a-z0-9]/g, "")).filter(Boolean);
    const words = [...new Set([...base, ...base.flatMap((w) => SYNONYMS[w] ?? [])])];
    // Acts the question names (by title or common short name) get a strong boost.
    const named = new Set(ACT_ALIASES.filter(([re]) => re.test(q)).map(([, t]) => t));
    const boostDocs = new Set(lawDocs.filter((d) => [...named].some((t) => d.title.toLowerCase().includes(t))).map((d) => d.id));
    const ids = lawDocs.map((d) => d.id);
    const query = (tsq: string, limit: number) =>
      sb.from("knowledge_chunks").select("id, document_id, section_ref, heading, content").in("document_id", ids).textSearch("tsv", tsq, { config: "english" }).limit(limit);
    // Sections containing ALL key words are the strongest candidates; a wide ANY-word pool fills the rest.
    const [all, any, inNamed] = await Promise.all([
      query(base.join(" & "), 60),
      query(words.join(" | "), 500),
      // Always include the named Acts' matching sections, even if other Acts match more words.
      boostDocs.size
        ? sb.from("knowledge_chunks").select("id, document_id, section_ref, heading, content").in("document_id", [...boostDocs]).textSearch("tsv", words.join(" | "), { config: "english" }).limit(200)
        : Promise.resolve({ data: [], error: null }),
    ]);
    const pool = new Map<string, { id: string; document_id: string; section_ref: string; heading: string; content: string }>();
    for (const r of [...must(all), ...must(any), ...must(inNamed)]) pool.set(r.id, r);
    // Rank: named Act first, then distinct key words present (whole words, light stemming),
    // words in the section title, then how often they occur. "professor" must not match "professional".
    const scored = [...pool.values()]
      .map((r) => {
        const head = r.heading.toLowerCase();
        const body = r.content.toLowerCase();
        let score = boostDocs.has(r.document_id) ? 12 : 0;
        for (const w of words) {
          const re = new RegExp(`\\b${stemOf(w)}(s|es|ed|ing|ies|ment|ments|ion|ions|ee|ees|al)?\\b`, "g");
          const hits = (body.match(re) ?? []).length;
          if (hits || re.test(head)) score += 3;
          re.lastIndex = 0;
          if (re.test(head)) score += 4;
          score += Math.min(3, hits) * 0.3;
        }
        // Index pages and very long fragments are rarely the best answer.
        if (/arrangement of sections/i.test(r.section_ref)) score -= 5;
        return { ...r, score };
      })
      .sort((x, y) => y.score - x.score)
      .slice(0, Number(url.searchParams.get("k") ?? 10));
    return Response.json({
      chunks: scored.map((c) => ({ ...c, document: lawDocs.find((d) => d.id === c.document_id) })),
      documents: lawDocs,
    });
  } catch (e) {
    return jsonError(e);
  }
}

const Save = z.object({
  question: z.string(),
  language: z.string(),
  user_role: z.string().nullish(),
  answer_layers: z.unknown(),
  acts_cited: z.array(z.unknown()).default([]),
  uncertain: z.boolean(),
  model_used: z.string().nullish(),
  quotes: z.array(z.object({ text: z.string(), chunk_ids: z.array(z.string()) })).default([]),
  handoff: z
    .object({ summary: z.string(), sections: z.array(z.unknown()), open_questions: z.array(z.string()) })
    .nullish(),
});

/** Save a Know Your Law answer; verify each quoted passage appears verbatim in the retrieved sections. */
export async function POST(req: Request) {
  try {
    const b = Save.parse(await req.json());
    const sb = db();
    const ids = [...new Set(b.quotes.flatMap((q) => q.chunk_ids))];
    const chunks = ids.length ? must(await sb.from("knowledge_chunks").select("id, content").in("id", ids)) : [];
    const corpus = normaliseForMatch(chunks.map((c) => c.content).join("\n"));
    const quote_checks = b.quotes.map((q) => {
      const n = normaliseForMatch(q.text).replace(/^["'“]|["'”]$/g, "");
      return { text: q.text, verbatim: n.length > 10 && corpus.includes(n) };
    });
    const row = must(
      await sb
        .from("law_queries")
        .insert({
          question: b.question, language: b.language, user_role: b.user_role ?? "citizen",
          answer_layers: b.answer_layers, acts_cited: b.acts_cited, uncertain: b.uncertain, model_used: b.model_used,
        })
        .select("id")
        .single(),
    );
    let handoff_id: string | null = null;
    if (b.handoff) {
      const h = must(
        await sb
          .from("legal_aid_handoffs")
          .insert({ source: "law_query", source_id: row.id, summary: b.handoff.summary, sections: b.handoff.sections, open_questions: b.handoff.open_questions })
          .select("id")
          .single(),
      );
      handoff_id = h.id;
    }
    await logSkill("know-your-law", "completed", `${b.uncertain ? "Flagged for legal aid: " : ""}${b.question.slice(0, 80)}`, row.id);
    return Response.json({ id: row.id, quote_checks, handoff_id });
  } catch (e) {
    return jsonError(e);
  }
}
