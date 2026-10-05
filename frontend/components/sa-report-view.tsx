"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FileBarChart } from "lucide-react";
import {
  api,
  type FinancialYearOption,
  type SaSupportReport,
} from "@/lib/api";
import { cn, formatDate, formatMoney } from "@/lib/utils";
import type { ReportMeta, SaReportKey } from "@/lib/reports-meta";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlDrilldownModal, type PlDrillTarget } from "@/components/pl-drilldown-modal";

type Props = {
  reportKey: SaReportKey;
  meta: ReportMeta;
};

function statusBadge(status: string) {
  if (status === "live") return <Badge variant="success">live</Badge>;
  if (status === "partial") return <Badge variant="warning">partial</Badge>;
  return <Badge variant="secondary">stub</Badge>;
}

export function SaReportView({ reportKey, meta }: Props) {
  const [years, setYears] = useState<FinancialYearOption[]>([]);
  const [fyYear, setFyYear] = useState<number | null>(null);
  const [report, setReport] = useState<SaSupportReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [yearsLoading, setYearsLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [drill, setDrill] = useState<PlDrillTarget | null>(null);

  useEffect(() => {
    let cancelled = false;
    setYearsLoading(true);
    api.reports
      .monthlyComparison({})
      .then((r) => {
        if (cancelled) return;
        const withData = r.available_years.filter((y) => y.has_data);
        const list = withData.length ? withData : r.available_years;
        setYears(list);
        const preferred =
          list.find((y) => y.fy_start_year === r.primary_fy_start_year)?.fy_start_year ??
          list.find((y) => y.has_data)?.fy_start_year ??
          list[0]?.fy_start_year ??
          null;
        setFyYear(preferred);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load years");
      })
      .finally(() => {
        if (!cancelled) setYearsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    if (fyYear == null && reportKey !== "consolidation") {
      // still allow consolidation / current FY default via API
    }
    setLoading(true);
    setError(null);
    try {
      const data = await api.reports.sa(reportKey, {
        fy_start_year: fyYear ?? undefined,
      });
      setReport(data);
      if (data.available_years?.length && years.length === 0) {
        setYears(data.available_years);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load report");
    } finally {
      setLoading(false);
    }
  }, [fyYear, reportKey, years.length]);

  useEffect(() => {
    if (yearsLoading) return;
    void load();
  }, [load, yearsLoading]);

  async function exportPdf() {
    setExporting(true);
    setError(null);
    try {
      await api.reports.downloadSaPdf(reportKey, {
        fy_start_year: fyYear ?? undefined,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "PDF export failed");
    } finally {
      setExporting(false);
    }
  }

  const Icon = meta.icon;
  const currency = report?.currency || "ZAR";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Link
            href="/reports"
            className="inline-flex -ml-2 h-8 items-center gap-1.5 rounded-md px-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Reporting hub
          </Link>
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-[hsl(var(--neon-lime))]">
              SA support report
            </p>
            <h1 className="page-title flex flex-wrap items-center gap-2">
              <Icon className="h-6 w-6 shrink-0 opacity-90" />
              {meta.title}
              {report ? statusBadge(report.status) : null}
            </h1>
            <p className="page-subtitle max-w-2xl">{meta.sarsNote}</p>
          </div>
        </div>
        <Button size="sm" onClick={() => void exportPdf()} disabled={!report || loading || exporting}>
          {exporting ? "Exporting…" : "Export PDF"}
        </Button>
      </div>

      <Card className="border-2 border-[hsl(var(--neon-lime)/0.4)]">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <FileBarChart className="h-4 w-4" />
            Financial year
          </CardTitle>
          <CardDescription>Reports default to the full SA financial year (March–February).</CardDescription>
        </CardHeader>
        <CardContent>
          {yearsLoading ? (
            <p className="text-sm text-muted-foreground">Loading financial years…</p>
          ) : years.length === 0 ? (
            <p className="text-sm text-muted-foreground">No years yet — allocate transactions first.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {years.map((y) => {
                const active = y.fy_start_year === fyYear;
                return (
                  <button
                    key={y.fy_start_year}
                    type="button"
                    onClick={() => setFyYear(y.fy_start_year)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-semibold transition-all",
                      active
                        ? "border-[hsl(var(--neon-lime))] bg-[hsl(var(--neon-lime)/0.18)] text-foreground shadow-[0_0_10px_hsl(var(--neon-lime)/0.2)]"
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
        </CardContent>
      </Card>

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : loading ? (
        <p className="text-sm text-muted-foreground">Loading report…</p>
      ) : !report ? (
        <p className="text-sm text-muted-foreground">No data.</p>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                {report.period_label} · {report.date_from} → {report.date_to}
              </CardTitle>
              <CardDescription>
                {report.notes.map((n) => (
                  <span key={n} className="mr-2 inline-block text-xs">
                    • {n}
                  </span>
                ))}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(report.totals).map(([k, v]) => (
                  <div
                    key={k}
                    className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2"
                  >
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {k.replace(/_/g, " ")}
                    </p>
                    <p className="text-sm font-semibold tabular-nums">
                      {formatMoney(v, currency)}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {report.sections.map((sec) => (
            <Card key={sec.key}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{sec.title}</CardTitle>
                {sec.stub_message ? (
                  <CardDescription>{sec.stub_message}</CardDescription>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-4">
                {sec.summary && Object.keys(sec.summary).length > 0 ? (
                  <dl className="grid gap-2 sm:grid-cols-2">
                    {Object.entries(sec.summary).map(([k, v]) => (
                      <div key={k} className="rounded border border-border/50 px-3 py-2 text-sm">
                        <dt className="text-[11px] uppercase text-muted-foreground">
                          {k.replace(/_/g, " ")}
                        </dt>
                        <dd className="font-medium tabular-nums">{String(v)}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}

                {sec.lines.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[520px] text-sm">
                      <thead>
                        <tr className="border-b border-border/70 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                          <th className="py-2 pr-3 font-medium">Ledger</th>
                          <th className="py-2 pr-3 font-medium">Type</th>
                          <th className="py-2 text-right font-medium">Amount</th>
                          <th className="py-2 text-right font-medium">Debit</th>
                          <th className="py-2 text-right font-medium">Credit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sec.lines.map((ln) => (
                          <tr
                            key={`${sec.key}-${ln.ledger_id}-${ln.ledger_name}`}
                            className="cursor-pointer border-b border-border/40 hover:bg-accent/40"
                            onClick={() => {
                              if (!report) return;
                              setDrill({
                                title: ln.ledger_name,
                                ledgerId: ln.ledger_id,
                                dateFrom: report.date_from,
                                dateTo: report.date_to,
                              });
                            }}
                            title="Open source transactions"
                          >
                            <td className="py-2 pr-3 font-medium">
                              {ln.ledger_name}
                              {ln.note ? (
                                <span className="ml-2 text-xs text-muted-foreground">{ln.note}</span>
                              ) : null}
                            </td>
                            <td className="py-2 pr-3 text-muted-foreground">{ln.ledger_type}</td>
                            <td className="py-2 text-right tabular-nums">
                              {formatMoney(ln.amount, currency)}
                            </td>
                            <td className="py-2 text-right tabular-nums text-muted-foreground">
                              {Number(ln.debit) ? formatMoney(ln.debit, currency) : "—"}
                            </td>
                            <td className="py-2 text-right tabular-nums text-muted-foreground">
                              {Number(ln.credit) ? formatMoney(ln.credit, currency) : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}

                {sec.transactions.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead>
                        <tr className="border-b border-border/70 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                          <th className="py-2 pr-3 font-medium">Date</th>
                          <th className="py-2 pr-3 font-medium">Description</th>
                          <th className="py-2 pr-3 font-medium">Ledger</th>
                          <th className="py-2 text-right font-medium">Amount</th>
                          <th className="py-2 text-right font-medium">Running</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sec.transactions.slice(0, 200).map((tx) => (
                          <tr
                            key={tx.transaction_id}
                            className="cursor-pointer border-b border-border/40 hover:bg-accent/40"
                            onClick={() => {
                              if (!report || tx.drill_ledger_id == null) return;
                              setDrill({
                                title: tx.ledger_name || "Transactions",
                                ledgerId: tx.drill_ledger_id,
                                dateFrom: report.date_from,
                                dateTo: report.date_to,
                              });
                            }}
                          >
                            <td className="py-2 pr-3 tabular-nums text-muted-foreground">
                              {formatDate(tx.date)}
                            </td>
                            <td className="py-2 pr-3">{tx.description}</td>
                            <td className="py-2 pr-3 text-muted-foreground">
                              {tx.ledger_name || "—"}
                            </td>
                            <td className="py-2 text-right font-semibold tabular-nums">
                              {formatMoney(tx.amount, currency)}
                            </td>
                            <td className="py-2 text-right tabular-nums text-muted-foreground">
                              {tx.running_balance != null
                                ? formatMoney(tx.running_balance, currency)
                                : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {sec.transactions.length > 200 ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Showing first 200 of {sec.transactions.length} transactions. Use drill-down
                        or filter by ledger for the full list.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </>
      )}

      <PlDrilldownModal
        open={drill != null}
        target={drill}
        currency={currency}
        onClose={() => setDrill(null)}
        onChanged={() => {
          void load();
        }}
      />
    </div>
  );
}
