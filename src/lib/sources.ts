// Official government sources for Know Your Law. Shown as links only — Nirdesh does not
// use government emblems or logos (State Emblem of India (Prohibition of Improper Use) Act, 2005).

export type SourceIcon =
  | "book" | "landmark" | "receipt" | "scale" | "building" | "briefcase" | "banknote" | "globe"
  | "shield" | "users" | "lightbulb" | "cpu" | "newspaper" | "leaf" | "gavel" | "search";

export interface OfficialSource {
  id: string;
  name: string;
  url: string;
  icon: SourceIcon;
  topics: string[]; // shown to users
  keywords: string[]; // used to match an Act title or question to this source
  group: "Start here" | "Citizen laws" | "Business & finance" | "Courts & tribunals" | "Check the latest";
}

export const OFFICIAL_SOURCES: OfficialSource[] = [
  {
    id: "indiacode", name: "India Code", url: "https://www.indiacode.nic.in", icon: "book", group: "Start here",
    topics: ["Every Central Act and its Rules", "FCRA, RTI, Consumer Protection, Legal Services, Trusts, Labour Codes, VB-G RAM G Act"],
    keywords: ["act", "rules", "fcra", "police", "arrest", "fir", "bail", "criminal", "bnss", "crpc", "ipc", "bns", "sanhita", "foreign contribution", "right to information", "rti", "consumer", "legal services", "trust", "contempt", "limitation", "social security", "wages", "rozgar", "employment guarantee", "mgnrega", "vb-g ram g"],
  },
  {
    id: "egazette", name: "e-Gazette of India", url: "https://egazette.gov.in", icon: "newspaper", group: "Check the latest",
    topics: ["Final authority if anything conflicts", "New Acts, amendments and notifications"],
    keywords: ["gazette", "notification", "amendment", "commencement"],
  },
  {
    id: "pib", name: "Press Information Bureau", url: "https://pib.gov.in", icon: "newspaper", group: "Check the latest",
    topics: ["Government press releases", "Confirm dates and commencement"],
    keywords: ["press release", "announcement"],
  },
  {
    id: "incometax", name: "Income Tax Department", url: "https://www.incometaxindia.gov.in", icon: "receipt", group: "Citizen laws",
    topics: ["Income-tax Act, 2025", "Income-tax Rules, 2026", "ITR filing"],
    keywords: ["income-tax", "income tax", "itr", "tds", "tax return", "pan"],
  },
  {
    id: "labour", name: "Ministry of Labour & Employment", url: "https://labour.gov.in", icon: "users", group: "Citizen laws",
    topics: ["Code on Wages", "Industrial Relations Code", "Code on Social Security", "Occupational Safety Code"],
    keywords: ["labour", "wages", "social security", "industrial relations", "occupational safety", "gratuity", "provident fund", "epf", "esi"],
  },
  {
    id: "moefcc", name: "MoEFCC Environment Clearance", url: "https://environmentclearance.nic.in/report/EIA_Notifications.aspx", icon: "leaf", group: "Citizen laws",
    topics: ["EIA Notification, 2006 and amendments", "Environment clearance"],
    keywords: ["eia", "environment", "environmental impact", "clearance", "public hearing"],
  },
  {
    id: "legislative", name: "Legislative Department", url: "https://lddashboard.legislative.gov.in/documents/pre-legislative-consultation-policy", icon: "landmark", group: "Citizen laws",
    topics: ["Pre-Legislative Consultation Policy, 2014", "Draft laws and consultations"],
    keywords: ["pre-legislative", "consultation", "draft bill", "draft rules"],
  },
  {
    id: "meity", name: "Ministry of Electronics and IT", url: "https://www.meity.gov.in", icon: "cpu", group: "Citizen laws",
    topics: ["Digital Personal Data Protection Act, 2023 and Rules", "IT Act, 2000"],
    keywords: ["data protection", "dpdp", "personal data", "information technology", "it act", "privacy", "cyber"],
  },
  {
    id: "ecourts", name: "eCourts Judgment Search", url: "https://judgments.ecourts.gov.in", icon: "search", group: "Courts & tribunals",
    topics: ["High Court judgments", "Find your court order"],
    keywords: ["judgment", "high court", "court order", "case status"],
  },
  {
    id: "nclt", name: "NCLT", url: "https://nclt.gov.in", icon: "gavel", group: "Courts & tribunals",
    topics: ["National Company Law Tribunal", "Company disputes, insolvency cases"],
    keywords: ["nclt", "company law tribunal", "oppression", "mismanagement"],
  },
  {
    id: "nclat", name: "NCLAT", url: "https://nclat.nic.in", icon: "gavel", group: "Courts & tribunals",
    topics: ["Appeals from NCLT and CCI"],
    keywords: ["nclat", "appellate tribunal"],
  },
  {
    id: "mca", name: "Ministry of Corporate Affairs", url: "https://www.mca.gov.in", icon: "building", group: "Business & finance",
    topics: ["Companies Act, 2013 and Rules", "LLP Act, 2008", "Company filing forms and circulars"],
    keywords: ["company", "companies act", "llp", "limited liability partnership", "director", "roc", "incorporation", "mca"],
  },
  {
    id: "ibbi", name: "Insolvency and Bankruptcy Board of India", url: "https://ibbi.gov.in", icon: "scale", group: "Business & finance",
    topics: ["Insolvency and Bankruptcy Code, 2016", "IBBI Regulations"],
    keywords: ["insolvency", "bankruptcy", "ibc", "liquidation", "resolution professional"],
  },
  {
    id: "sebi", name: "SEBI", url: "https://www.sebi.gov.in", icon: "briefcase", group: "Business & finance",
    topics: ["SEBI Act, 1992", "LODR, ICDR, Takeover, Insider Trading Regulations"],
    keywords: ["sebi", "securities", "listed", "shares", "insider trading", "takeover", "ipo", "mutual fund"],
  },
  {
    id: "rbi", name: "Reserve Bank of India", url: "https://www.rbi.org.in", icon: "banknote", group: "Business & finance",
    topics: ["FEMA, 1999 regulations", "RBI Master Directions", "Banking complaints"],
    keywords: ["rbi", "fema", "foreign exchange", "bank", "loan", "master direction", "nri", "remittance"],
  },
  {
    id: "dpiit", name: "DPIIT", url: "https://dpiit.gov.in", icon: "globe", group: "Business & finance",
    topics: ["Consolidated FDI Policy", "Startup recognition"],
    keywords: ["fdi", "foreign direct investment", "startup", "dpiit"],
  },
  {
    id: "ed", name: "Enforcement Directorate", url: "https://enforcementdirectorate.gov.in", icon: "shield", group: "Business & finance",
    topics: ["FEMA and PMLA enforcement"],
    keywords: ["enforcement directorate", "money laundering", "pmla"],
  },
  {
    id: "fiu", name: "Financial Intelligence Unit – India", url: "https://fiuindia.gov.in", icon: "shield", group: "Business & finance",
    topics: ["PMLA reporting obligations"],
    keywords: ["fiu", "pmla", "suspicious transaction", "reporting entity"],
  },
  {
    id: "cci", name: "Competition Commission of India", url: "https://www.cci.gov.in", icon: "scale", group: "Business & finance",
    topics: ["Competition Act, 2002", "Merger (combination) regulations"],
    keywords: ["competition", "cartel", "merger", "combination", "abuse of dominance"],
  },
  {
    id: "cbic", name: "CBIC", url: "https://www.cbic.gov.in", icon: "receipt", group: "Business & finance",
    topics: ["GST Acts and Rules", "Customs"],
    keywords: ["gst", "cgst", "sgst", "igst", "customs", "indirect tax", "e-way bill"],
  },
  {
    id: "ipindia", name: "Patents, Designs & Trade Marks Office", url: "https://ipindia.gov.in", icon: "lightbulb", group: "Business & finance",
    topics: ["Patents, Trade Marks, Designs", "Copyright"],
    keywords: ["patent", "trade mark", "trademark", "design", "copyright", "intellectual property"],
  },
];

/** Official sources relevant to a piece of text (an Act title or a question), best matches first. */
export function sourcesFor(text: string, limit = 3): OfficialSource[] {
  const t = ` ${text.toLowerCase().replace(/[^a-z0-9\s-]/g, " ")} `;
  // Whole-word match, so "procedure" does not match the company keyword "roc".
  const has = (k: string) => t.includes(` ${k} `) || new RegExp(`\\b${k.replace(/[-]/g, "\\-")}\\b`).test(t);
  return OFFICIAL_SOURCES.map((s) => ({ s, n: s.keywords.filter(has).length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, limit)
    .map((x) => x.s);
}
