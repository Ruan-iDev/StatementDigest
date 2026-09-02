"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { formatDate, formatMoney } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { practiceApi } from "@/modules/practice/lib/api";
import { useModuleFlags } from "@/modules/practice/flags-provider";
import { FeatureOffPage } from "@/modules/practice/pages/disabled";
import type { ProjectStatement } from "@/modules/practice/lib/types";

function entryDate(entry: { occurred_on?: string | null; created_at: string }): string {
  return formatDate(entry.occurred_on || entry.created_at.slice(0, 10));
}

export function PracticeStatementPage() {
  const { flags, ready } = useModuleFlags();
  const search = useSearchParams();
  const id = Number(search.get("id") || "");
  const [data, setData] = useState<ProjectStatement | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !flags.projects_enabled) return;
    if (!Number.isFinite(id) || id <= 0) {
      setError("Open a project statement from the project file.");
      return;
    }
    practiceApi.projects
      .statement(id)
      .then(async (st) => {
        setData(st);
        if (st.has_logo) {
          const url = await practiceApi.branding.logoObjectUrl();
          setLogoUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return url;
          });
        }
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not pull statement"));
    return () => {
      setLogoUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [id, ready, flags.projects_enabled]);

  if (ready && !flags.projects_enabled) {
    return <FeatureOffPage title="Projects" />;
  }

  if (!data) {
    return (
      <div className="space-y-3">
        <Link
          href={id ? `/practice/file?id=${id}` : "/practice/projects"}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Back
        </Link>
        <p className="text-sm text-muted-foreground">{error || "Pulling statement…"}</p>
      </div>
    );
  }

  const currency = data.currency || "ZAR";

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link
          href={`/practice/file?id=${data.project.id}`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Project file
        </Link>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-[hsl(var(--neon-cyan))]">
          Project statement
        </p>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="page-title">{data.project.name}</h1>
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-14 w-auto max-w-[160px] object-contain" />
          )}
        </div>
        <p className="page-subtitle">
          {[
            data.project.reference,
            data.project.client_name,
            data.project.status.replace("_", " "),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader>
            <CardDescription>Quoted</CardDescription>
            <CardTitle className="text-lg tabular-nums">{formatMoney(data.totals.quotes, currency)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Invoiced</CardDescription>
            <CardTitle className="text-lg tabular-nums">{formatMoney(data.totals.invoices, currency)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Running costs</CardDescription>
            <CardTitle className="text-lg tabular-nums">{formatMoney(data.totals.expenses, currency)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Received</CardDescription>
            <CardTitle className="text-lg tabular-nums">
              {formatMoney(data.totals.payments || 0, currency)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="section-panel neon-lime border-2">
          <CardHeader>
            <CardDescription>Invoiced less costs</CardDescription>
            <CardTitle className="text-lg tabular-nums">{formatMoney(data.totals.net, currency)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
          <CardDescription>Date-stamped paper trail notes</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.notes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No notes yet.</p>
          ) : (
            data.notes.map((n) => (
              <div key={n.id} className="border-b border-border/60 pb-3 last:border-0 last:pb-0">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="text-sm font-medium">{n.title}</span>
                  <time className="text-[11px] tabular-nums text-muted-foreground">{entryDate(n)}</time>
                </div>
                {n.body && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{n.body}</p>}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quotes</CardTitle>
          <CardDescription>Reference and value</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.quotes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No quotes on this file.</p>
          ) : (
            data.quotes.map((q) => (
              <div key={q.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  <span className="font-medium tabular-nums">{q.number}</span>
                  <span className="text-muted-foreground"> · {q.title}</span>
                  {q.issued_on && (
                    <span className="text-muted-foreground"> · {formatDate(q.issued_on)}</span>
                  )}
                </span>
                <span className="tabular-nums font-semibold">{formatMoney(q.amount, currency)}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
          <CardDescription>Reference, value, and income ledger</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">No invoices on this file.</p>
          ) : (
            data.invoices.map((inv) => (
              <div key={inv.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  <span className="font-medium tabular-nums">{inv.number}</span>
                  <span className="text-muted-foreground"> · {inv.title}</span>
                  {inv.source_quote_number && (
                    <span className="text-muted-foreground"> · from {inv.source_quote_number}</span>
                  )}
                  {inv.issued_on && (
                    <span className="text-muted-foreground"> · {formatDate(inv.issued_on)}</span>
                  )}
                  {inv.income_ledger_name && (
                    <span className="text-muted-foreground"> · {inv.income_ledger_name}</span>
                  )}
                </span>
                <span className="tabular-nums font-semibold">{formatMoney(inv.amount, currency)}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Running costs</CardTitle>
          <CardDescription>Expenses assigned to core ledger accounts</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.expenses.length === 0 ? (
            <p className="text-sm text-muted-foreground">No running costs yet.</p>
          ) : (
            data.expenses.map((ex) => (
              <div key={ex.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  <span className="font-medium">{ex.description}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {[ex.supplier_name || ex.vendor_name, ex.ledger_name || "Ledger", ex.incurred_on ? formatDate(ex.incurred_on) : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className="tabular-nums font-semibold">{formatMoney(ex.amount, currency)}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Received payments</CardTitle>
          <CardDescription>Money recorded on the paper trail</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {!data.payments?.length ? (
            <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
          ) : (
            data.payments.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  <span className="font-medium">{p.title}</span>
                  <span className="text-muted-foreground"> · {entryDate(p)}</span>
                  {p.body && <span className="text-muted-foreground"> · {p.body}</span>}
                </span>
                <span className="tabular-nums font-semibold">
                  {formatMoney(p.amount, currency)}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
