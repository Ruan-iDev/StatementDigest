"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cn, formatDate, formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { practiceApi } from "@/modules/practice/lib/api";
import {
  documentEditorHref,
  type WorkflowReport,
  type WorkflowReportLine,
} from "@/modules/practice/lib/types";

function num(v: string | number | undefined | null): number {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function ReportTable({
  rows,
  currency,
  empty,
  hrefFor,
}: {
  rows: WorkflowReportLine[];
  currency: string;
  empty: string;
  hrefFor?: (row: WorkflowReportLine) => string | null;
}) {
  const router = useRouter();
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-border/70 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Date</th>
            <th className="py-2 pr-3 font-medium">Ref / title</th>
            <th className="py-2 pr-3 font-medium">Client</th>
            <th className="py-2 pr-3 font-medium">Project</th>
            <th className="py-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const href = hrefFor?.(row) ?? null;
            return (
              <tr
                key={`${row.kind}-${row.id}`}
                className={cn(
                  "border-b border-border/40 last:border-0",
                  href && "cursor-pointer hover:bg-accent/40"
                )}
                onClick={() => {
                  if (href) router.push(href);
                }}
              >
                <td className="py-2 pr-3 tabular-nums text-muted-foreground">
                  {formatDate(row.occurred_on)}
                </td>
                <td className="py-2 pr-3">
                  <span className="font-medium">{row.number || row.title}</span>
                  {row.number && row.title ? (
                    <span className="text-muted-foreground"> · {row.title}</span>
                  ) : null}
                  {row.status ? (
                    <span className="ml-2 text-[11px] uppercase text-muted-foreground">{row.status}</span>
                  ) : null}
                </td>
                <td className="py-2 pr-3 text-muted-foreground">{row.client_name || "—"}</td>
                <td className="py-2 pr-3 text-muted-foreground">{row.project_name || "—"}</td>
                <td className="py-2 text-right font-semibold tabular-nums">
                  {formatMoney(row.amount, currency)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function PracticeReportsPage() {
  const [data, setData] = useState<WorkflowReport | null>(null);
  const [fy, setFy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const next = await practiceApi.reports(fy ?? undefined);
      setData(next);
      if (fy == null) setFy(next.primary_fy_start_year);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not load Work Flow reports");
    }
  }, [fy]);

  useEffect(() => {
    void load();
  }, [load]);

  const years = useMemo(() => {
    if (!data) return [];
    return [...data.available_years].sort((a, b) => b.fy_start_year - a.fy_start_year);
  }, [data]);

  const currency = data?.currency || "ZAR";

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link
          href="/practice"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Work Flow
        </Link>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-[hsl(var(--neon-lime))]">
          Work Flow · Reports
        </p>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="page-title">Work Flow reports</h1>
            <p className="page-subtitle max-w-2xl">
              Quotes, invoices, payments received, project expenses and salaries for the selected
              financial year. This is a Work Flow check-list — it does not change Ledger Flow.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => window.print()}>
            Print
          </Button>
        </div>
      </header>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {data && (
        <div className="flex flex-wrap gap-2">
          {years.map((y) => {
            const active = y.fy_start_year === data.primary_fy_start_year;
            return (
              <button
                key={y.fy_start_year}
                type="button"
                onClick={() => setFy(y.fy_start_year)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-semibold transition-all",
                  active
                    ? "border-[hsl(var(--neon-lime))] bg-[hsl(var(--neon-lime)/0.18)] text-foreground"
                    : "border-border/70 bg-muted/30 text-muted-foreground hover:border-border hover:text-foreground"
                )}
              >
                {y.label}
                {y.is_current ? " · current" : ""}
              </button>
            );
          })}
        </div>
      )}

      {data && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Card className="section-panel neon-lime border-2">
            <CardHeader className="pb-2">
              <CardDescription>Quotes</CardDescription>
              <CardTitle className="text-lg tabular-nums">
                {formatMoney(num(data.totals.quotes), currency)}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card className="section-panel neon-magenta border-2">
            <CardHeader className="pb-2">
              <CardDescription>Invoices</CardDescription>
              <CardTitle className="text-lg tabular-nums">
                {formatMoney(num(data.totals.invoices), currency)}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card className="section-panel neon-cyan border-2">
            <CardHeader className="pb-2">
              <CardDescription>Payments received</CardDescription>
              <CardTitle className="text-lg tabular-nums">
                {formatMoney(num(data.totals.payments), currency)}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card className="section-panel neon-amber border-2">
            <CardHeader className="pb-2">
              <CardDescription>Expenses</CardDescription>
              <CardTitle className="text-lg tabular-nums">
                {formatMoney(num(data.totals.expenses), currency)}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card className="section-panel neon-cyan border-2">
            <CardHeader className="pb-2">
              <CardDescription>Salaries</CardDescription>
              <CardTitle className="text-lg tabular-nums">
                {formatMoney(num(data.totals.wages), currency)}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      {!data && !error && <p className="text-sm text-muted-foreground">Loading report…</p>}

      {data && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Quotes</CardTitle>
              <CardDescription>{data.quotes.length} in {data.primary_label}</CardDescription>
            </CardHeader>
            <CardContent>
              <ReportTable
                rows={data.quotes}
                currency={currency}
                empty="No quotes in this year."
                hrefFor={(row) => documentEditorHref({ kind: "quote", id: row.id })}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Invoices</CardTitle>
              <CardDescription>{data.invoices.length} in {data.primary_label}</CardDescription>
            </CardHeader>
            <CardContent>
              <ReportTable
                rows={data.invoices}
                currency={currency}
                empty="No invoices in this year."
                hrefFor={(row) => documentEditorHref({ kind: "invoice", id: row.id })}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payments received</CardTitle>
              <CardDescription>{data.payments.length} in {data.primary_label}</CardDescription>
            </CardHeader>
            <CardContent>
              <ReportTable
                rows={data.payments}
                currency={currency}
                empty="No payments recorded in this year."
                hrefFor={(row) => (row.project_id ? `/practice/file?id=${row.project_id}` : null)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Expenses</CardTitle>
              <CardDescription>{data.expenses.length} in {data.primary_label}</CardDescription>
            </CardHeader>
            <CardContent>
              <ReportTable
                rows={data.expenses}
                currency={currency}
                empty="No project expenses in this year."
                hrefFor={(row) => (row.project_id ? `/practice/file?id=${row.project_id}` : null)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Salaries</CardTitle>
              <CardDescription>{(data.wages || []).length} in {data.primary_label}</CardDescription>
            </CardHeader>
            <CardContent>
              <ReportTable
                rows={data.wages || []}
                currency={currency}
                empty="No salaries loaded on project files in this year."
                hrefFor={(row) => (row.project_id ? `/practice/file?id=${row.project_id}` : null)}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
