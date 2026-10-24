"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { api } from "@/lib/pipeline";
import { activeConfig, isConfigured } from "@/lib/ai/providers";
import { ErrorBox } from "@/components/ui";

export function UploadBox({ role }: { role: "officer" | "citizen" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);

  async function upload(file: File) {
    setError(null);
    if (!isConfigured()) return setError("Add your AI key in Settings first.");
    if (file.size > 4 * 1024 * 1024) return setError("File is larger than 4 MB. Please upload a smaller PDF.");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("role", role);
      const r = await api<{ id: string; needsOcr: boolean }>("/api/orders", { method: "POST", body: fd });
      if (r.needsOcr && !activeConfig().info.readsPdf) {
        setError(`This is a scanned PDF. ${activeConfig().info.label} cannot read scanned pages — switch to Claude or Gemini in Settings, then open the case again.`);
      }
      router.push(`/${role === "officer" ? "officer" : "citizen"}/case/${r.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <label
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) upload(f); }}
        className={`card flex cursor-pointer flex-col items-center gap-3 border-2 border-dashed p-10 text-center transition ${drag ? "border-brand bg-brand-soft" : "hover:border-brand"}`}
      >
        {busy ? <Loader2 className="animate-spin text-brand" size={32} /> : <FileUp className="text-brand" size={32} />}
        <span className="font-medium">{busy ? "Uploading and reading the text…" : "Drop a judgment here, or click to choose"}</span>
        <span className="text-sm text-muted">PDF or Word (.docx), up to 4 MB. Scanned PDFs work with Claude or Gemini.</span>
        <input type="file" accept=".pdf,.docx,application/pdf" className="hidden" disabled={busy}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
      </label>
      <ErrorBox error={error} />
    </div>
  );
}
