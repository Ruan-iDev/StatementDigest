"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate, formatMoney } from "@/lib/utils";
import { cabinetApi } from "@/modules/cabinet/lib/api";
import type { CabinetJob } from "@/modules/cabinet/lib/types";

function jobcardNumber(value: string): number {
  const match = /^JC-(\d+)$/i.exec(value.trim());
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

export function CabinetJobcardsPage() {
  const [jobs, setJobs] = useState<CabinetJob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    cabinetApi.jobs
      .list()
      .then((rows) =>
        setJobs(
          [...rows].sort(
            (a, b) => jobcardNumber(a.number) - jobcardNumber(b.number) || a.number.localeCompare(b.number),
          ),
        ),
      )
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load jobcards"))
      .finally(() => setReady(true));
  }, []);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link
          href="/cabinet"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Cabinet Flow
        </Link>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-[hsl(var(--neon-cyan))]">
          Cabinet Flow · Jobcards
        </p>
        <h1 className="page-title">Jobcards</h1>
        <p className="text-sm text-muted-foreground">Every jobcard on the system, in jobcard number order.</p>
      </header>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {!ready && !error ? (
        <p className="text-sm text-muted-foreground">Opening jobcards…</p>
      ) : jobs.length === 0 && !error ? (
        <p className="text-sm text-muted-foreground">No jobcards yet.</p>
      ) : (
        <div className="space-y-2">
          {jobs.map((job) => (
            <Card key={job.id}>
              <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-3 py-3">
                <div className="w-24 shrink-0 font-medium">{job.number}</div>
                <div className="w-40 shrink-0 text-xs text-muted-foreground">
                  <div>Created {formatDate(job.created_at)}</div>
                  <div>Last edited {formatDate(job.updated_at)}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <Link href={`/cabinet/jobcard?id=${job.id}`} className="font-medium hover:underline">
                    {job.client_name}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {job.job_reference || "No job reference"}
                  </div>
                </div>
                <div className="ml-auto w-36 text-right">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Total
                  </div>
                  <div className="font-medium tabular-nums">{formatMoney(job.total)}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
