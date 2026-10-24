"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, STAGE_LABEL } from "@/lib/pipeline";
import { ErrorBox } from "@/components/ui";
import { UploadBox } from "@/components/UploadBox";

interface OrderRow {
  id: string; case_number: string | null; court: string | null; file_name: string; pipeline_stage: string;
  directions_total: number; directions_approved: number; created_at: string; user_role: string;
}

export default function OfficerPage() {
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ orders: OrderRow[] }>("/api/orders")
      .then((r) => setOrders(r.orders.filter((o) => o.user_role === "officer")))
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h1>Process a judgment</h1>
        <p className="text-muted">
          Extractor → Critic (up to 2 correction rounds) → <b>your verification</b> → compliance plan and drafts.
        </p>
      </div>
      <UploadBox role="officer" />

      <section className="space-y-3">
        <h2 className="font-semibold">Cases</h2>
        <ErrorBox error={error} />
        {orders?.length === 0 && <p className="text-sm text-muted">No cases yet.</p>}
        <div className="grid gap-3">
          {orders?.map((o) => (
            <Link key={o.id} href={`/officer/case/${o.id}`} className="card flex flex-wrap items-center gap-4 p-4 hover:border-brand">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{o.case_number ?? o.file_name}</p>
                <p className="truncate text-sm text-muted">{o.court ?? "Court not yet read"}</p>
              </div>
              <span className="text-sm text-muted">{o.directions_approved}/{o.directions_total} verified</span>
              <span className={`rounded-full px-3 py-1 text-xs font-medium ${o.pipeline_stage === "awaiting_gate" ? "bg-brand text-white" : "bg-lavender text-ink"}`}>
                {STAGE_LABEL[o.pipeline_stage] ?? o.pipeline_stage}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
