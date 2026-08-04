"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, FileBarChart } from "lucide-react";
import {
  api,
  type FinancialYearOption,
  type PLLineItem,
  type PLReport,
} from "@/lib/api";
import { cn, formatMoney } from "@/lib/utils";
import type { ReportKey, ReportMeta } from "@/lib/reports-meta";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlMatrixView } from "@/components/pl-matrix-view";
import { BudgetMatrixView } from "@/components/budget-matrix-view";

function trafficBadge(light: string) {
  if (light === "green") return <Badge variant="success">green</Badge>;
  if (light === "amber") return <Badge variant="warning">amber</Badge>;
  if (light === "red") return <Badge variant="danger">red</Badge>;
  return <Badge variant="secondary">—</Badge>;
}

/** Calendar months for a financial year starting at fyStartMonth (1–12). */
function fyMonths(fyStartYear: number, fyStartMonth: number): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  let y = fyStartYear;
  let m = fyStartMonth;
  for (let i = 0; i < 12; i++) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    const label = new Date(y, m - 1, 1).toLocaleString("en", { month: "short", year: "numeric" });
    out.push({ key, label });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

function monthEnd(ym: string): string {
  const [ys, ms] = ym.split("-");
  const y = Number(ys);
  const m = Number(ms);
  const last = new Date(y, m, 0).getDate();
  return `${ys}-${ms}-${String(last).padStart(2, "0")}`;
}

type Props = {
  reportKey: ReportKey;
  meta: ReportMeta;
};

/** Full-screen report detail — period controls + body for one report type. */
export function ReportDetailView({ reportKey, meta }: Props) {
  // P&L + Budget use full-year matrix layouts
  if (reportKey === "pl") {
    return <MatrixReportShell meta={meta} body={<PlMatrixView />} />;
  }
  if (reportKey === "budget") {
    return <MatrixReportShell meta={meta} body={<BudgetMatrixView />} />;
  }
  return <PeriodBasedReportView reportKey={reportKey} meta={meta} />;
}

function MatrixReportShell({ meta, body }: { meta: ReportMeta; body: ReactNode }) {
  const Icon = meta.icon;
  return (
    <div className="flex w-full min-w-0 max-w-full flex-col gap-3">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <Link
            href="/reports"
            className="inline-flex -ml-2 h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Reporting hub
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <Icon className="h-5 w-5 shrink-0 opacity-90" />
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{meta.title}</h1>
          </div>
        </div>
      </div>
      {body}
    </div>
  );
}

function PeriodBasedReportView({ reportKey, meta }: Props) {
  const [years, setYears] = useState<FinancialYearOption[]>([]);
  const [fyStartMonth, setFyStartMonth] = useState(3);
  const [fyYear, setFyYear] = useState<number | null>(null);
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [report, setReport] = useState<PLReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [yearsLoading, setYearsLoading] = useState(true);

  const monthOptions = useMemo(() => {
    if (fyYear == null) return [];
    return fyMonths(fyYear, fyStartMonth);
  }, [fyYear, fyStartMonth]);

  // Load recorded financial years (same source as monthly graph)
  useEffect(() => {
    let cancelled = false;
    setYearsLoading(true);
    api.reports
      .monthlyComparison({})
      .then((r) => {
        if (cancelled) return;
        setFyStartMonth(r.fy_start_month || 3);
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
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load financial years");
        }
      })
      .finally(() => {
        if (!cancelled) setYearsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // When FY changes, select all 12 months by default
  useEffect(() => {
    if (fyYear == null) return;
    const keys = fyMonths(fyYear, fyStartMonth).map((m) => m.key);
    setSelectedMonths(keys);
  }, [fyYear, fyStartMonth]);

  const load = useCallback(async () => {
    if (fyYear == null || selectedMonths.length === 0) {
      setReport(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const sorted = [...selectedMonths].sort();
      const date_from = `${sorted[0]}-01`;
      const date_to = monthEnd(sorted[sorted.length - 1]);
      setReport(
        await api.reports.pl({
          period: "custom",
          date_from,
          date_to,
          months: sorted.join(","),
        })
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load report");
    } finally {
      setLoading(false);
    }
  }, [fyYear, selectedMonths]);

  useEffect(() => {
    void load();
  }, [load]);

  const [exporting, setExporting] = useState(false);

  async function exportPdf() {
    if (selectedMonths.length === 0) return;
    setExporting(true);
    setError(null);
    try {
      const sorted = [...selectedMonths].sort();
      await api.reports.downloadPlPdf({
        report_type: reportKey, // turnover | expenses | budget | cashflow
        period: "custom",
        date_from: `${sorted[0]}-01`,
        date_to: monthEnd(sorted[sorted.length - 1]),
        months: sorted.join(","),
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "PDF export failed");
    } finally {
      setExporting(false);
    }
  }

  function toggleMonth(key: string) {
    setSelectedMonths((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key].sort()
    );
  }

  function selectAllMonths() {
    setSelectedMonths(monthOptions.map((m) => m.key));
  }

  function clearMonths() {
    setSelectedMonths([]);
  }

  const budgetLines = useMemo(() => {
    if (!report) return [] as PLLineItem[];
    return [...report.income_lines, ...report.expense_lines, ...report.other_lines].filter(
      (l) => l.budget != null
    );
  }, [report]);

  const Icon = meta.icon;
  const allSelected =
    monthOptions.length > 0 && selectedMonths.length === monthOptions.length;

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
              Report
            </p>
            <h1 className="page-title flex items-center gap-2">
              <Icon className="h-6 w-6 shrink-0 opacity-90" />
              {meta.title}
            </h1>
            <p className="page-subtitle max-w-2xl">{meta.sarsNote}</p>
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => void exportPdf()}
          disabled={!report || loading || exporting || selectedMonths.length === 0}
        >
          {exporting ? "Exporting…" : "Export PDF"}
        </Button>
      </div>

      <Card className="border-2 border-[hsl(var(--neon-lime)/0.4)]">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <FileBarChart className="h-4 w-4" />
            Financial year &amp; months
          </CardTitle>
          <CardDescription>
            Pick a recorded year, then tick the months to include (or keep all for a full-year view).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {yearsLoading ? (
            <p className="text-sm text-muted-foreground">Loading financial years…</p>
          ) : years.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No financial years found yet. Allocate transactions first.
            </p>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Financial year</Label>
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
                        title={`${y.date_from} → ${y.date_to}`}
                      >
                        {y.label}
                        {y.is_current ? " · current" : ""}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label className="text-xs text-muted-foreground">
                    Months in this year ({selectedMonths.length} of {monthOptions.length})
                  </Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={selectAllMonths}
                      disabled={allSelected}
                    >
                      Select all
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={clearMonths}
                      disabled={selectedMonths.length === 0}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {monthOptions.map((m) => {
                    const on = selectedMonths.includes(m.key);
                    return (
                      <label
                        key={m.key}
                        className={cn(
                          "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                          on
                            ? "border-[hsl(var(--neon-cyan)/0.55)] bg-[hsl(var(--neon-cyan)/0.12)] text-foreground"
                            : "border-border/60 bg-card/40 text-muted-foreground hover:border-border"
                        )}
                      >
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 accent-[hsl(var(--neon-cyan))]"
                          checked={on}
                          onChange={() => toggleMonth(m.key)}
                        />
                        {m.label}
                      </label>
                    );
                  })}
                </div>
                {selectedMonths.length === 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Tick at least one month to load the report.
                  </p>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm">
          {error}
        </div>
      )}

      {loading && !report && (
        <p className="text-sm text-muted-foreground">Loading report…</p>
      )}

      {report && reportKey === "turnover" && (
        <div className="space-y-4">
          <PeriodStrip report={report} />
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Gross turnover</CardTitle>
              <CardDescription>
                Sum of income ledgers in the period (categorised inflows only).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold tabular-nums text-[hsl(var(--neon-cyan))]">
                {formatMoney(report.total_income, report.currency)}
              </p>
            </CardContent>
          </Card>
          <Section
            title="Income / receipts by ledger"
            lines={report.income_lines}
            total={report.total_income}
            currency={report.currency}
            totalLabel="Total turnover"
            showBudget={false}
          />
        </div>
      )}

      {report && reportKey === "expenses" && (
        <div className="space-y-4">
          <PeriodStrip report={report} />
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Total expenses</CardTitle>
              <CardDescription>Categorised outflows for deduction-style review.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold tabular-nums text-[hsl(var(--neon-magenta))]">
                {formatMoney(report.total_expenses, report.currency)}
              </p>
            </CardContent>
          </Card>
          <Section
            title="Expenses by ledger"
            lines={report.expense_lines}
            total={report.total_expenses}
            currency={report.currency}
            totalLabel="Total expenses"
          />
        </div>
      )}

      {report && reportKey === "budget" && (
        <div className="space-y-4">
          <PeriodStrip report={report} />
          {budgetLines.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">
                No budgets set for active ledgers in this period. Add monthly or annual budgets under
                Ledger Account Management.
              </CardContent>
            </Card>
          ) : (
            <Section
              title="Budget vs actual (ledgers with budgets)"
              lines={budgetLines}
              total={report.total_expenses}
              currency={report.currency}
              totalLabel="Expense total (context)"
            />
          )}
        </div>
      )}

      {report && reportKey === "cashflow" && (
        <div className="space-y-4">
          <PeriodStrip report={report} />
          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile
              label="Inflows (income)"
              value={formatMoney(report.total_income, report.currency)}
              accent="text-[hsl(var(--neon-lime))]"
            />
            <StatTile
              label="Outflows (expenses)"
              value={formatMoney(report.total_expenses, report.currency)}
              accent="text-[hsl(var(--neon-magenta))]"
            />
            <StatTile
              label="Net cash movement"
              value={formatMoney(report.net_result, report.currency)}
              accent={
                parseFloat(report.net_result) >= 0 ? "text-emerald-400" : "text-red-400"
              }
            />
          </div>
          {report.other_lines.length > 0 && (
            <Section
              title="Transfers / capital / other"
              lines={report.other_lines}
              total={report.other_lines
                .reduce((s, l) => s + parseFloat(l.amount), 0)
                .toFixed(2)}
              currency={report.currency}
              totalLabel="Total other movements"
            />
          )}
          <NetCard report={report} />
        </div>
      )}
    </div>
  );
}

function PeriodStrip({ report }: { report: PLReport }) {
  return (
    <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
      <span>
        <strong className="text-foreground">{report.period_label}</strong>
      </span>
      <span>
        {report.date_from} → {report.date_to}
      </span>
      <span>{report.currency}</span>
    </div>
  );
}

function NetCard({ report }: { report: PLReport }) {
  return (
    <Card className="border-primary/30 bg-primary text-primary-foreground">
      <CardContent className="flex items-center justify-between py-4">
        <span className="font-semibold">Net Profit / (Loss)</span>
        <span
          className={`text-xl font-bold tabular-nums ${
            parseFloat(report.net_result) >= 0 ? "text-emerald-300" : "text-red-300"
          }`}
        >
          {formatMoney(report.net_result, report.currency)}
        </span>
      </CardContent>
    </Card>
  );
}

function StatTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-1 py-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-xl font-bold tabular-nums ${accent}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function Section({
  title,
  lines,
  total,
  currency,
  totalLabel,
  showBudget = true,
}: {
  title: string;
  lines: PLLineItem[];
  total: string;
  currency: string;
  totalLabel: string;
  showBudget?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {lines.length === 0 ? "No non-zero activity" : `${lines.length} ledger(s)`}
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        {lines.length > 0 && (
          <table className="table-dense w-full min-w-[640px]">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="p-2 font-medium">Ledger</th>
                <th className="font-medium text-right">Amount</th>
                {showBudget && (
                  <>
                    <th className="font-medium text-right">Budget</th>
                    <th className="font-medium text-right">Variance</th>
                    <th className="font-medium text-right">%</th>
                    <th className="font-medium">Status</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.ledger_id} className="border-b border-border/40">
                  <td className="p-2 font-medium">{line.ledger_name}</td>
                  <td className="text-right tabular-nums">
                    {formatMoney(line.amount, currency)}
                  </td>
                  {showBudget && (
                    <>
                      <td className="text-right tabular-nums text-muted-foreground">
                        {line.budget != null ? formatMoney(line.budget, currency) : "—"}
                      </td>
                      <td className="text-right tabular-nums text-muted-foreground">
                        {line.variance != null ? formatMoney(line.variance, currency) : "—"}
                      </td>
                      <td className="text-right tabular-nums text-muted-foreground">
                        {line.budget_pct != null
                          ? `${parseFloat(line.budget_pct).toFixed(0)}%`
                          : "—"}
                      </td>
                      <td>{trafficBadge(line.traffic_light)}</td>
                    </>
                  )}
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="p-2">{totalLabel}</td>
                <td className="text-right tabular-nums">{formatMoney(total, currency)}</td>
                {showBudget && <td colSpan={4} />}
              </tr>
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
