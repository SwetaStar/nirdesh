"use client";

import { useState } from "react";
import { UploadBox } from "@/components/UploadBox";
import { LANGUAGES } from "@/lib/pipeline";

export default function CitizenPage() {
  const [lang, setLang] = useState(() => (typeof window === "undefined" ? "English" : localStorage.getItem("nirdesh.lang") ?? "English"));
  const pick = (l: string) => {
    setLang(l);
    localStorage.setItem("nirdesh.lang", l);
  };
  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1>Understand your court order</h1>
        <p className="mt-2 text-lg text-muted">Upload the order you won. Nirdesh will tell you, in simple words, what the government must do, by when, and what you can do.</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">1. Choose your language</h2>
        <div className="flex flex-wrap gap-3">
          {LANGUAGES.map((l) => (
            <button key={l.id} onClick={() => pick(l.id)}
              className={`rounded-2xl border-2 px-5 py-3 text-lg ${lang === l.id ? "border-brand bg-brand-soft font-semibold text-brand" : "border-line bg-white"}`}>
              {l.native}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">2. Upload your court order</h2>
        <UploadBox role="citizen" />
      </section>

      <p className="text-sm text-muted">
        This is a summary for your understanding. It is not legal advice. For free legal help, contact your nearest District Legal Services Authority (DLSA).
      </p>
    </div>
  );
}
