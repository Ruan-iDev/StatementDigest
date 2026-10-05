"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate, formatMoney } from "@/lib/utils";
import { cabinetApi } from "@/modules/cabinet/lib/api";
import type { CabinetJob } from "@/modules/cabinet/lib/types";
import { practiceApi } from "@/modules/practice/lib/api";
import { tradingAsLine } from "@/modules/practice/pages/client-picker";
import type { PracticeParty } from "@/modules/practice/lib/types";

export function CabinetClientFilePage() {
  const router = useRouter();
  const params = useSearchParams();
  const id = Number(params.get("id"));
  const validId = Number.isFinite(id) && id > 0;
  const [client, setClient] = useState<PracticeParty | null>(null);
  const [jobs, setJobs] = useState<CabinetJob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!validId) return;
    practiceApi.parties
      .get(id)
      .then((row) => {
        if (row.kind !== "client") {
          setError("This file is for clients.");
          setClient(null);
          return;
        }
        setClient(row);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not open client"));
    cabinetApi.jobs
      .list({ partyId: id })
      .then(setJobs)
      .catch(() => setJobs([]));
  }, [id, validId]);

  async function reloadJobs() {
    if (!validId) return;
    setJobs(await cabinetApi.jobs.list({ partyId: id }));
  }

  async function newJobcard() {
    if (!client) return;
    setBusy(true);
    try {
      setError(null);
      const created = await cabinetApi.jobs.create(client.id);
      router.push(`/cabinet/jobcard?id=${created.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not open a jobcard");
      setBusy(false);
    }
  }

  async function duplicateJob(job: CabinetJob) {
    setBusy(true);
    try {
      setError(null);
      await cabinetApi.jobs.duplicate(job.id);
      await reloadJobs();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not duplicate the jobcard");
    } finally {
      setBusy(false);
    }
  }

  async function deleteJob(job: CabinetJob) {
    if (!window.confirm(`Delete ${job.number}? This removes the jobcard.`)) return;
    setBusy(true);
    try {
      setError(null);
      await cabinetApi.jobs.remove(job.id);
      await reloadJobs();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not delete the jobcard");
    } finally {
      setBusy(false);
    }
  }

  if (!validId) {
    return <p className="text-sm text-muted-foreground">Open a client from Cabinet Flow.</p>;
  }
  if (!client) {
    return <p className="text-sm text-muted-foreground">{error || "Opening client…"}</p>;
  }

  const ta = tradingAsLine(client.name, client.trading_name);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link
          href="/cabinet/clients"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Clients
        </Link>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-[hsl(var(--neon-cyan))]">
          Cabinet Flow · Job library
        </p>
        <h1 className="page-title">{client.name}</h1>
        {ta ? <p className="text-sm font-medium">{ta}</p> : null}
        <p className="text-sm text-muted-foreground">
          {[client.contact_name, client.phone, client.email, client.city].filter(Boolean).join(" · ") ||
            "No contact details on this card yet."}
        </p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Jobs</h2>
          <p className="text-sm text-muted-foreground">
            Current and previous jobs for this client. A job can be assigned to a project, and that
            project folder then shows it.
          </p>
        </div>
        <Button type="button" disabled={busy} onClick={() => void newJobcard()}>
          New jobcard
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {jobs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No jobs yet.</p>
      ) : (
        <div className="space-y-2">
          {jobs.map((job) => (
            <Card key={job.id}>
              <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-3 py-3">
                <div className="w-40 shrink-0 text-xs text-muted-foreground">
                  <div>Created {formatDate(job.created_at)}</div>
                  <div>Last edited {formatDate(job.updated_at)}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{job.number}</div>
                  <div className="text-xs text-muted-foreground">
                    {job.job_reference || "No job reference"}
                  </div>
                </div>
                <div className="ml-auto flex shrink-0 items-center gap-3">
                  <div className="w-36 text-right">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Total
                    </div>
                    <div className="font-medium tabular-nums">{formatMoney(job.total)}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void duplicateJob(job)}
                    >
                      Duplicate
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => router.push(`/cabinet/jobcard?id=${job.id}`)}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      disabled={busy}
                      onClick={() => void deleteJob(job)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
