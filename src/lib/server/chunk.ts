import "server-only";

export interface Chunk {
  section_ref: string;
  heading: string;
  content: string;
}

const MAX = 6000; // characters per chunk; long sections are split into parts

/**
 * Split a Bare Act into sections. Indian Acts print sections as
 * "12. Exclusion of time in legal proceedings.—(1) ..." at the start of a line.
 * The arrangement-of-sections index at the top repeats these headings, so
 * very short matches (index lines) are merged into a single "Index" chunk.
 */
export function chunkAct(text: string): Chunk[] {
  const clean = text.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n");
  const re = /^\s*(\d{1,3}[A-Z]{0,2})\.\s+(?=[A-Z(\[])/gm;
  const starts: { idx: number; num: string }[] = [];
  for (let m = re.exec(clean); m; m = re.exec(clean)) starts.push({ idx: m.index, num: m[1] });

  // Numbered entries after "THE SCHEDULE" are Articles (e.g. Limitation Act), not sections.
  const sched = clean.search(/^\s*THE\s+(FIRST\s+)?SCHEDULE\s*$/im);

  const chunks: Chunk[] = [];
  const preface = clean.slice(0, starts[0]?.idx ?? clean.length).trim();
  if (preface) chunks.push({ section_ref: "Preamble", heading: preface.split("\n")[0].slice(0, 200), content: preface });

  for (let i = 0; i < starts.length; i++) {
    const body = clean.slice(starts[i].idx, starts[i + 1]?.idx ?? clean.length).trim();
    const heading = body.split(/\.—|\.-|\n/)[0].slice(0, 200);
    const kind = sched !== -1 && starts[i].idx > sched ? "Article" : "Section";
    chunks.push({ section_ref: `${kind} ${starts[i].num}`, heading, content: body });
  }

  // Merge index-style one-liners (arrangement of sections) so they don't crowd search results.
  const out: Chunk[] = [];
  let index: string[] = [];
  for (const c of chunks) {
    if (c.content.length < 120 && c.section_ref !== "Preamble") {
      index.push(c.content);
      continue;
    }
    if (index.length) {
      out.push({ section_ref: "Arrangement of sections", heading: "Arrangement of sections", content: index.join("\n") });
      index = [];
    }
    if (c.content.length <= MAX) out.push(c);
    else for (let p = 0, n = 1; p < c.content.length; p += MAX, n++)
      out.push({ section_ref: `${c.section_ref} (part ${n})`, heading: c.heading, content: c.content.slice(p, p + MAX) });
  }
  if (index.length) out.push({ section_ref: "Arrangement of sections", heading: "Arrangement of sections", content: index.join("\n") });
  return out;
}

const STOP = new Set(
  "a an the of to in on for and or is are was be by with as at from that this it i my me we our you your can do does should what when how who which whom am under any if not no".split(" "),
);
export function keywords(q: string): string[] {
  return [...new Set(q.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)))].slice(0, 12);
}
