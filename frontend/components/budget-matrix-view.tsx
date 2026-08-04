"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarRange, FileDown } from "lucide-react";
import {
  api,
  type BudgetMatrixLedgerRow,
  type BudgetMatrixReport,
  type FinancialYearOption,
  type PLMatrixMonthCol,
} from "@/lib/api";
import { currencySymbol } from "@/lib/currencies";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

function formatAmountNumber(value: string | number): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(n)) return "";
  const abs = Math.abs(n).toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return n < 0 ? `(${abs})` : abs;
}

function parseAmt(value: string | number): number {
  return typeof value === "string" ? parseFloat(value) : value;
}

function MoneyPair({
  budget,
  actual,
  symbol,
  bold = false,
}: {
  budget: string | number;
  actual: string | number;
  symbol: string;
  bold?: boolean;
}) {
  const b = parseAmt(budget);
  const a = parseAmt(actual);
  const bEmpty = b === 0 || Number.isNaN(b);
  const aEmpty = a === 0 || Number.isNaN(a);

  return (
    <div
      className={cn(
        "grid min-w-0 grid-cols-2 gap-0.5 border-l border-border/25 first:border-l-0",
        bold && "font-semibold"
      )}
    >
      <div className="flex min-w-0 items-baseline justify-between gap-0.5 px-1 py-0.5 tabular-nums text-[9px] sm:text-[10px] lg:text-[11px]">
        <span className="shrink-0 text-muted-foreground/70">{symbol}</span>
        <span className={cn("truncate text-right", bEmpty && "text-muted-foreground/40")}>
          {bEmpty ? "—" : formatAmountNumber(budget)}
        </span>
      </div>
      <div
        className={cn(
          "flex min-w-0 items-baseline justify-between gap-0.5 border-l border-border/20 px-1 py-0.5 tabular-nums text-[9px] sm:text-[10px] lg:text-[11px]",
          a < 0 && "text-red-500"
        )}
      >
        <span className="shrink-0 text-muted-foreground/70">{symbol}</span>
        <span className={cn("truncate text-right", aEmpty && "text-muted-foreground/40")}>
          {aEmpty ? "—" : formatAmountNumber(actual)}
        </span>
      </div>
    </div>
  );
}

function SectionBlock({
  title,
  rows,
  months,
  monthBudgets,
  monthActuals,
  totalBudget,
  totalActual,
  symbol,
}: {
  title: string;
  rows: BudgetMatrixLedgerRow[];
  months: PLMatrixMonthCol[];
  monthBudgets: string[];
  monthActuals: string[];
  totalBudget: string;
  totalActual: string;
  symbol: string;
}) {
  return (
    <>
      <tr className="border-t border-border/40 bg-muted/20">
        <td
          colSpan={1 + months.length + 1}
          className="sticky left-0 z-20 bg-muted/30 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground sm:px-2.5 sm:text-[11px]"
        >
          {title}
          {rows.length === 0 && (
            <span className="ml-2 font-normal normal-case tracking-normal text-muted-foreground/70">
              — no ledgers with a budget in this section
            </span>
          )}
        </td>
      </tr>
      {rows.map((row) => (
        <tr key={row.ledger_id} className="border-t border-border/15 hover:bg-muted/10">
          <td className="sticky left-0 z-20 max-w-[8.5rem] truncate bg-background px-2 py-1.5 text-left text-[11px] sm:max-w-[11rem] sm:px-2.5 sm:text-xs">
            {row.ledger_name}
          </td>
          {months.map((m, i) => (
            <td key={m.month} className="min-w-0 p-0 align-middle">
              <MoneyPair
                budget={row.budgets[i] ?? "0"}
                actual={row.actuals[i] ?? "0"}
                symbol={symbol}
              />
            </td>
          ))}
          <td className="min-w-0 p-0 align-middle font-semibold">
            <MoneyPair
              budget={row.budget_total}
              actual={row.actual_total}
              symbol={symbol}
              bold
            />
          </td>
        </tr>
      ))}
      <tr className="bg-muted/10 font-bold [&>td]:border-t [&>td]:border-t-foreground/70 [&>td]:border-b-[3px] [&>td]:border-b-double [&>td]:border-b-foreground/80">
        <td className="sticky left-0 z-20 bg-muted/15 px-2 py-1.5 text-[11px] sm:px-2.5 sm:text-xs">
          Total {title}
        </td>
        {months.map((m, i) => (
          <td key={m.month} className="min-w-0 p-0 align-middle">
            <MoneyPair
              budget={monthBudgets[i] ?? "0"}
              actual={monthActuals[i] ?? "0"}
              symbol={symbol}
              bold
            />
          </td>
        ))}
        <td className="min-w-0 p-0 align-middle">
          <MoneyPair budget={totalBudget} actual={totalActual} symbol={symbol} bold />
        </td>
      </tr>
    </>
  );
}

/** Budget vs Actual — P&L-style matrix; only ledgers with a budget preset. */
export function BudgetMatrixView() {
  const [fyYear, setFyYear] = useState<number | null>(null);
  const [useCurrentDefault, setUseCurrentDefault] = useState(true);
  const [report, setReport] = useState<BudgetMatrixReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params =
        !useCurrentDefault && fyYear != null ? { fy_start_year: fyYear } : {};
      const r = await api.reports.budgetMatrix(params);
      setReport(r);
      setFyYear(r.fy_start_year);
      setUseCurrentDefault(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load budget report");
    } finally {
      setLoading(false);
    }
  }, [fyYear, useCurrentDefault]);

  useEffect(() => {
    void load();
  }, [load]);

  async function exportPdf() {
    if (!report) return;
    setExporting(true);
    setError(null);
    try {
      await api.reports.downloadPlPdf({
        report_type: "budget",
        period: "custom",
        date_from: report.date_from,
        date_to: report.date_to,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "PDF export failed");
    } finally {
      setExporting(false);
    }
  }

  const symbol = report ? currencySymbol(report.currency) : "R";
  const monthColPct = report ? `${(100 - 12) / (report.months.length + 1)}%` : "7%";

  const years: FinancialYearOption[] = report?.available_years ?? [];

  const hasAnyRows = useMemo(() => {
    if (!report) return false;
    return (
      report.income_rows.length > 0 ||
      report.expense_rows.length > 0 ||
      report.other_rows.length > 0
    );
  }, [report]);

  return (
    <div className="flex w-full min-w-0 max-w-full flex-col gap-2.5">
      {report && (
        <div className="w-full min-w-0 overflow-hidden rounded-xl border border-[hsl(var(--neon-amber)/0.45)] bg-card/80 shadow-sm">
          <div className="flex flex-wrap items-center gap-2 p-2.5 sm:gap-3 sm:p-3">
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg border-2 border-[hsl(var(--neon-amber)/0.55)] bg-[hsl(var(--neon-amber)/0.12)] text-center">
                <span className="text-base font-black leading-none tabular-nums text-[hsl(var(--neon-amber))]">
                  {String(report.fy_start_year).slice(-2)}
                </span>
                <span className="text-[8px] font-bold uppercase tracking-wider text-[hsl(var(--neon-amber))] opacity-80">
                  FY
                </span>
              </div>
              <div className="min-w-0 space-y-0.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h2 className="text-sm font-bold tracking-tight sm:text-base">{report.label}</h2>
                  {report.is_current_fy && (
                    <span className="rounded-full border border-[hsl(var(--neon-amber)/0.45)] bg-[hsl(var(--neon-amber)/0.12)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide">
                      Current
                    </span>
                  )}
                </div>
                <p className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                  <CalendarRange className="h-3 w-3 shrink-0 text-[hsl(var(--neon-amber))]" />
                  <span className="tabular-nums">
                    {report.date_from} → {report.date_to}
                  </span>
                  <span>·</span>
                  <span className="font-medium text-foreground">{symbol}</span>
                  <span className="text-muted-foreground/70">
                    · Budgeted ledgers only · each month: Bud | Act
                  </span>
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 px-2 text-[11px]"
              onClick={() => void exportPdf()}
              disabled={loading || exporting}
            >
              <FileDown className="h-3.5 w-3.5" />
              {exporting ? "Exporting…" : "Export PDF"}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 border-t border-[hsl(var(--neon-amber)/0.35)] bg-[hsl(var(--neon-amber)/0.08)] px-2.5 py-2 sm:px-3">
            <span className="mr-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
              Years
            </span>
            {years.map((y) => {
              const active = y.fy_start_year === report.fy_start_year;
              return (
                <button
                  key={y.fy_start_year}
                  type="button"
                  onClick={() => {
                    setUseCurrentDefault(false);
                    setFyYear(y.fy_start_year);
                  }}
                  className={cn(
                    "inline-flex h-7 items-center rounded-lg border px-2 text-xs font-bold tabular-nums transition-all sm:h-8 sm:px-2.5",
                    active
                      ? "border-[hsl(var(--neon-amber))] bg-[hsl(var(--neon-amber)/0.2)] text-foreground"
                      : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground"
                  )}
                >
                  {y.label}
                  {y.is_current ? " · now" : ""}
                </button>
              );
            })}
            {!report.is_current_fy && (
              <button
                type="button"
                onClick={() => {
                  setUseCurrentDefault(true);
                  setFyYear(null);
                }}
                className="inline-flex h-7 items-center rounded-lg border border-dashed border-border/70 px-2 text-[11px] text-muted-foreground sm:h-8"
              >
                Current FY
              </button>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="rounded border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs">{error}</div>
      )}
      {loading && !report && (
        <p className="text-xs text-muted-foreground">Loading budget vs actual…</p>
      )}

      {report && !hasAnyRows && !loading && (
        <p className="rounded-xl border border-border/60 bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
          No ledgers have a budget set. Add monthly or annual budgets under{" "}
          <strong className="text-foreground">Ledger Account Management</strong> — only those
          ledgers appear here.
        </p>
      )}

      {report && hasAnyRows && (
        <div className="w-full min-w-0 overflow-x-auto rounded-xl bg-card/30">
          <table className="w-full min-w-[720px] table-fixed border-separate border-spacing-0">
            <colgroup>
              <col style={{ width: "12%" }} />
              {report.months.map((m) => (
                <col key={m.month} style={{ width: monthColPct }} />
              ))}
              <col style={{ width: monthColPct }} />
            </colgroup>
            <thead>
              <tr>
                <th
                  rowSpan={2}
                  className="sticky left-0 z-30 border-b border-border/40 bg-background/95 px-2 py-1 text-left text-[10px] font-bold uppercase tracking-wide text-muted-foreground sm:px-2.5"
                >
                  Ledger
                </th>
                {report.months.map((m) => (
                  <th
                    key={m.month}
                    colSpan={1}
                    title={m.label}
                    className="border-b border-border/30 px-0.5 py-1 text-center text-[10px] font-bold uppercase tracking-wide text-muted-foreground"
                  >
                    {m.month_name}
                  </th>
                ))}
                <th className="border-b border-border/30 px-0.5 py-1 text-center text-[10px] font-bold uppercase tracking-wide text-foreground">
                  Year
                </th>
              </tr>
              <tr className="border-b border-border/40">
                {report.months.map((m) => (
                  <th key={`sub-${m.month}`} className="p-0">
                    <div className="grid grid-cols-2 gap-0 text-[8px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-[9px]">
                      <span className="border-l border-border/20 px-1 py-0.5 text-center first:border-l-0">
                        Bud
                      </span>
                      <span className="border-l border-border/20 px-1 py-0.5 text-center">Act</span>
                    </div>
                  </th>
                ))}
                <th className="p-0">
                  <div className="grid grid-cols-2 gap-0 text-[8px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-[9px]">
                    <span className="border-l border-border/20 px-1 py-0.5 text-center">Bud</span>
                    <span className="border-l border-border/20 px-1 py-0.5 text-center">Act</span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              <SectionBlock
                title="Income"
                rows={report.income_rows}
                months={report.months}
                monthBudgets={report.month_income_budgets}
                monthActuals={report.month_income_actuals}
                totalBudget={report.total_income_budget}
                totalActual={report.total_income_actual}
                symbol={symbol}
              />
              <SectionBlock
                title="Expenses"
                rows={report.expense_rows}
                months={report.months}
                monthBudgets={report.month_expense_budgets}
                monthActuals={report.month_expense_actuals}
                totalBudget={report.total_expense_budget}
                totalActual={report.total_expense_actual}
                symbol={symbol}
              />
              {report.other_rows.length > 0 && (
                <SectionBlock
                  title="Other"
                  rows={report.other_rows}
                  months={report.months}
                  monthBudgets={report.other_rows.reduce(
                    (acc, r) => r.budgets.map((b, i) => String(parseFloat(acc[i] || "0") + parseFloat(b || "0"))),
                    report.months.map(() => "0")
                  )}
                  monthActuals={report.other_rows.reduce(
                    (acc, r) =>
                      r.actuals.map((a, i) => String(parseFloat(acc[i] || "0") + parseFloat(a || "0"))),
                    report.months.map(() => "0")
                  )}
                  totalBudget={String(
                    report.other_rows.reduce((s, r) => s + parseFloat(r.budget_total || "0"), 0)
                  )}
                  totalActual={String(
                    report.other_rows.reduce((s, r) => s + parseFloat(r.actual_total || "0"), 0)
                  )}
                  symbol={symbol}
                />
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
