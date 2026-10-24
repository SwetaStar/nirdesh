// Recommended Acts for the law library, all from India Code (the official repository of Central Acts).
// `url` is the official PDF where known, otherwise the Act's India Code page (the importer finds the PDF on it).

export interface CatalogueAct {
  title: string;
  year: number;
  url: string;
  why: string;
  skills: string[];
}

const KYL = ["know-your-law"];

export const ACT_CATALOGUE: CatalogueAct[] = [
  { title: "Foreign Contribution (Regulation) Act", year: 2010, url: "https://www.indiacode.nic.in/bitstream/123456789/2098/1/A201042.pdf", why: "FCRA registration, NGO trustees", skills: KYL },
  { title: "Right to Information Act", year: 2005, url: "https://www.indiacode.nic.in/bitstream/123456789/2065/1/aa2005.pdf", why: "Filing RTI requests and appeals", skills: KYL },
  { title: "Consumer Protection Act", year: 2019, url: "https://www.indiacode.nic.in/bitstream/123456789/18964/1/cpa.pdf", why: "Consumer complaints", skills: KYL },
  { title: "Bharatiya Nagarik Suraksha Sanhita", year: 2023, url: "https://indiacode.nic.in/bitstream/123456789/20099/3/A2023-46.pdf", why: "Arrest, FIR, bail (replaced CrPC)", skills: KYL },
  { title: "Bharatiya Nyaya Sanhita", year: 2023, url: "https://www.indiacode.nic.in/bitstream/123456789/20062/1/a202345.pdf", why: "Offences and punishments (replaced IPC)", skills: KYL },
  { title: "Contempt of Courts Act", year: 1971, url: "https://www.indiacode.nic.in/bitstream/123456789/1514/1/A1971-70.pdf", why: "Contempt petitions (s.20 limitation)", skills: ["know-your-law", "compliance-planning-drafting", "citizen-explainer"] },
  { title: "Digital Personal Data Protection Act", year: 2023, url: "https://www.indiacode.nic.in/bitstream/123456789/22037/2/a2023-22.pdf", why: "Personal data rights", skills: KYL },
  { title: "Viksit Bharat – Guarantee for Rozgar and Ajeevika Mission (Gramin) Act", year: 2025, url: "https://www.indiacode.nic.in/bitstream/123456789/22478/1/a2025-36.pdf", why: "Rural employment guarantee", skills: ["know-your-law", "citizen-explainer"] },
  { title: "Code on Social Security", year: 2020, url: "https://www.indiacode.nic.in/handle/123456789/16823", why: "Pensions, PF, gratuity, maternity benefit", skills: KYL },
  { title: "Indian Trusts Act", year: 1882, url: "https://www.indiacode.nic.in/bitstream/123456789/2327/3/A1882-02.pdf", why: "Private trusts and trustees", skills: KYL },
];
