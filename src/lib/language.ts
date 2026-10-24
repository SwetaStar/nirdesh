// Language checks done in code: the answer must actually be in the language the citizen chose.

const SCRIPT: Record<string, RegExp> = {
  Hindi: /[ऀ-ॿ]/g,
  Marathi: /[ऀ-ॿ]/g,
  Kannada: /[ಀ-೿]/g,
  Telugu: /[ఀ-౿]/g,
};

/** Language implied by the script the question is typed in (null for Latin script). */
export function languageOfText(text: string, selected: string): string | null {
  const count = (re: RegExp) => (text.match(re) ?? []).length;
  const deva = count(/[ऀ-ॿ]/g), kn = count(/[ಀ-೿]/g), te = count(/[ఀ-౿]/g);
  const max = Math.max(deva, kn, te);
  if (max < 3) return null;
  if (max === kn) return "Kannada";
  if (max === te) return "Telugu";
  // Devanagari: Hindi or Marathi — keep the user's choice if it is one of them.
  return selected === "Marathi" ? "Marathi" : "Hindi";
}

/** True if at least half of the letters are in the expected script (English: mostly Latin). */
export function isInLanguage(text: string, language: string): boolean {
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  if (!letters) return true;
  if (language === "English") return (text.match(/[A-Za-z]/g) ?? []).length / letters > 0.6;
  const re = SCRIPT[language];
  return re ? (text.match(re) ?? []).length / letters > 0.5 : true;
}
