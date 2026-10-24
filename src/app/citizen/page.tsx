"use client";

import { useState } from "react";
import { UploadBox } from "@/components/UploadBox";
import { LANGUAGES } from "@/lib/pipeline";
import { PageHeader } from "@/components/Shell";

export default function CitizenPage() {
  const [lang, setLang] = useState(() => (typeof window === "undefined" ? "English" : localStorage.getItem("nirdesh.lang") ?? "English"));
  const pick = (l: string) => {
    setLang(l);
    localStorage.setItem("nirdesh.lang", l);
  };
  return (
    <div className="space-y-8">
      <PageHeader title="Understand your court order" subtitle={<>Upload the order you won. Nirdesh will tell you, in simple words, what the government must do, by when, and what you can do.</>} />

      <section className="space-y-3">
        <h2>1. Choose your language</h2>
        <div className="flex flex-wrap gap-2">
          {LANGUAGES.map((l) => (
            <button key={l.id} onClick={() => pick(l.id)}
              className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${lang === l.id ? "border-dusk bg-dusk text-paper-raised" : "border-mist-line bg-paper-raised text-ink-soft hover:bg-haze"}`}>
              {l.native}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2>2. Upload your court order</h2>
        <UploadBox role="citizen" />
      </section>

      <p className="text-sm text-muted">
        This is a summary for your understanding. It is not legal advice. For free legal help, contact your nearest District Legal Services Authority (DLSA).
      </p>
    </div>
  );
}
