"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { CalendarRange, FileDown } from "lucide-react";
import {
  api,
  type FinancialYearOption,
  type PLMatrixLedgerRow,
  type PLMatrixMonthCol,
  type PLMatrixReport,
} from "@/lib/api";
import { currencySymbol } from "@/lib/currencies";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PlDrilldownModal, type PlDrillTarget } from "@/components/pl-drilldown-modal";

/** First/last calendar day for YYYY-MM */
function monthDateBounds(ym: string): { from: string; to: string } {
  const [ys, ms] = ym.split("-");
  const y = Number(ys);
  const m = Number(ms);
  const last = new Date(y, m, 0).getDate();
  return {
    from: `${ys}-${ms}-01`,
    to: `${ys}-${ms}-${String(last).padStart(2, "0")}`,
  };
}

/**
 * Stable palette so each FY start-year keeps the same colour across sessions.
 * Consecutive years map to different hues (palette length ≥ 8).
 */
const FY_COLOURS = [
  { name: "cyan", h: 185, s: 100, l: 48 },
  { name: "magenta", h: 318, s: 100, l: 58 },
  { name: "lime", h: 145, s: 100, l: 45 },
  { name: "violet", h: 268, s: 100, l: 62 },
  { name: "amber", h: 42, s: 100, l: 50 },
  { name: "blue", h: 210, s: 100, l: 55 },
  { name: "rose", h: 350, s: 90, l: 58 },
  { name: "teal", h: 168, s: 85, l: 42 },
] as const;

function fyColour(year: number) {
  const idx = Math.abs((year * 7 + 3) % FY_COLOURS.length);
  const c = FY_COLOURS[idx];
  const base = `${c.h} ${c.s}% ${c.l}%`;
  return {
    name: c.name,
    solid: `hsl(${base})`,
    soft: `hsl(${c.h} ${c.s}% ${c.l}% / 0.14)`,
    softStrong: `hsl(${c.h} ${c.s}% ${c.l}% / 0.22)`,
    border: `hsl(${c.h} ${c.s}% ${c.l}% / 0.55)`,
    borderStrong: `hsl(${c.h} ${c.s}% ${c.l}% / 0.85)`,
    glow: `0 0 16px hsl(${c.h} ${c.s}% ${c.l}% / 0.35)`,
    text: `hsl(${c.h} ${Math.min(c.s, 92)}% ${Math.max(Math.min(c.l, 58), 42)}%)`,
  };
}

/** Format number only (no currency) for the right side of an accounting cell. */
function formatAmountNumber(value: string | number): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(n)) return "";
  const abs = Math.abs(n).toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  // Accounting: negatives as (1,234.56)
  return n < 0 ? `(${abs})` : abs;
}

function parseAmt(value: string | number): number {
  return typeof value === "string" ? parseFloat(value) : value;
}

function AmountCell({
  amount,
  symbol,
  muteZero = true,
  bold = false,
  onClick,
  title,
}: {
  amount: string | number;
  symbol: string;
  muteZero?: boolean;
  bold?: boolean;
  /** When set, cell is clickable (drill-down to source transactions). */
  onClick?: () => void;
  title?: string;
}) {
  const n = parseAmt(amount);
  const empty = muteZero !== false && (n === 0 || Number.isNaN(n));
  const negative = !empty && n < 0;
  const numText = empty ? "" : formatAmountNumber(amount);
  const clickable = Boolean(onClick) && !empty;

  return (
    <td className={cn("min-w-0 px-1 py-1.5 align-middle sm:px-1.5", bold && "font-semibold")}>
      {empty ? (
        <span className="block h-4" />
      ) : (
        <button
          type="button"
          disabled={!clickable}
          onClick={onClick}
          title={title || (clickable ? "View transactions for this amount" : undefined)}
          className={cn(
            "flex w-full min-w-0 items-baseline justify-between gap-0.5 rounded-sm tabular-nums text-[10px] leading-snug sm:gap-1 sm:text-[11px] lg:text-xs",
            bold && "font-semibold",
            negative ? "text-red-500" : "text-foreground",
            clickable &&
              "cursor-pointer hover:bg-[hsl(var(--neon-cyan)/0.12)] hover:ring-1 hover:ring-[hsl(var(--neon-cyan)/0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            !clickable && "cursor-default"
          )}
        >
          <span className="shrink-0 text-muted-foreground/75">{symbol}</span>
          <span className="min-w-0 truncate text-right underline-offset-2 group-hover:underline">
            {numText}
          </span>
        </button>
      )}
    </td>
  );
}

function LedgerNameCell({
  children,
  indent = false,
  bold = false,
  section = false,
}: {
  children: ReactNode;
  indent?: boolean;
  bold?: boolean;
  section?: boolean;
}) {
  return (
    <td
      className={cn(
        "sticky left-0 z-20 max-w-[9rem] truncate bg-background px-2 py-1.5 text-left text-[11px] leading-snug sm:max-w-[11rem] sm:px-2.5 sm:text-xs",
        indent && "pl-3 sm:pl-4",
        bold && "font-semibold",
        section &&
          "bg-muted/30 font-bold uppercase tracking-wide text-[10px] text-muted-foreground sm:text-[11px]"
      )}
      title={typeof children === "string" ? children : undefined}
    >
      {children}
    </td>
  );
}

function SectionBlock({
  title,
  rows,
  monthTotals,
  sectionTotal,
  months,
  symbol,
  colCount,
  fyDateFrom,
  fyDateTo,
  sectionTypes,
  onDrill,
}: {
  title: string;
  rows: PLMatrixLedgerRow[];
  monthTotals: string[];
  sectionTotal: string;
  months: PLMatrixMonthCol[];
  symbol: string;
  colCount: number;
  fyDateFrom: string;
  fyDateTo: string;
  /** Ledger types included in this section (for total-row drill-down). */
  sectionTypes: string[];
  onDrill: (target: PlDrillTarget) => void;
}) {
  return (
    <>
      <tr className="border-t border-border/40">
        <LedgerNameCell section>{title}</LedgerNameCell>
        {months.map((m) => (
          <td key={m.month} className="bg-muted/15 px-1 py-1.5 sm:px-1.5" />
        ))}
        <td className="bg-muted/15 px-1 py-1.5 sm:px-1.5" />
      </tr>

      {rows.length === 0 ? (
        <tr>
          <LedgerNameCell indent>
            <span className="font-normal text-muted-foreground/50">—</span>
          </LedgerNameCell>
          {Array.from({ length: colCount - 1 }).map((_, i) => (
            <td key={i} className="px-1 py-1.5 sm:px-1.5" />
          ))}
        </tr>
      ) : (
        rows.map((row) => (
          <tr key={row.ledger_id} className="border-t border-border/15 hover:bg-muted/10">
            <LedgerNameCell indent>{row.ledger_name}</LedgerNameCell>
            {row.amounts.map((a, i) => {
              const m = months[i];
              const bounds = monthDateBounds(m.month);
              return (
                <AmountCell
                  key={i}
                  amount={a}
                  symbol={symbol}
                  title={`${row.ledger_name} · ${m.label} — click to view transactions`}
                  onClick={() =>
                    onDrill({
                      title: `${row.ledger_name} · ${m.label}`,
                      ledgerId: row.ledger_id,
                      dateFrom: bounds.from,
                      dateTo: bounds.to,
                    })
                  }
                />
              );
            })}
            <AmountCell
              amount={row.total}
              symbol={symbol}
              bold
              title={`${row.ledger_name} · full year — click to view transactions`}
              onClick={() =>
                onDrill({
                  title: `${row.ledger_name} · year total`,
                  ledgerId: row.ledger_id,
                  dateFrom: fyDateFrom,
                  dateTo: fyDateTo,
                })
              }
            />
          </tr>
        ))
      )}

      {/* Total: bold · single line above · double line below (accounting style) */}
      <tr className="bg-muted/10 font-bold [&>td]:border-t [&>td]:border-t-foreground/70 [&>td]:border-b-[3px] [&>td]:border-b-double [&>td]:border-b-foreground/80">
        <LedgerNameCell bold>Total {title}</LedgerNameCell>
        {monthTotals.map((a, i) => {
          const m = months[i];
          const bounds = monthDateBounds(m.month);
          return (
            <AmountCell
              key={i}
              amount={a}
              symbol={symbol}
              bold
              title={`Total ${title} · ${m.label}`}
              onClick={() =>
                onDrill({
                  title: `Total ${title} · ${m.label}`,
                  ledgerTypes: sectionTypes,
                  dateFrom: bounds.from,
                  dateTo: bounds.to,
                })
              }
            />
          );
        })}
        <AmountCell
          amount={sectionTotal}
          symbol={symbol}
          bold
          title={`Total ${title} · full year`}
          onClick={() =>
            onDrill({
              title: `Total ${title} · year`,
              ledgerTypes: sectionTypes,
              dateFrom: fyDateFrom,
              dateTo: fyDateTo,
            })
          }
        />
      </tr>
    </>
  );
}

/** Profit & Loss — clean accounting layout (FY months × ledgers). */
export function PlMatrixView() {
  const [fyYear, setFyYear] = useState<number | null>(null);
  const [useCurrentDefault, setUseCurrentDefault] = useState(true);
  const [report, setReport] = useState<PLMatrixReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params =
        !useCurrentDefault && fyYear != null ? { fy_start_year: fyYear } : {};
      const r = await api.reports.plMatrix(params);
      setReport(r);
      setFyYear(r.fy_start_year);
      setUseCurrentDefault(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load P&L");
    } finally {
      setLoading(false);
    }
  }, [fyYear, useCurrentDefault]);

  useEffect(() => {
    void load();
  }, [load]);

  const [exporting, setExporting] = useState(false);
  const [drillOpen, setDrillOpen] = useState(false);
  const [drillTarget, setDrillTarget] = useState<PlDrillTarget | null>(null);

  function openDrill(target: PlDrillTarget) {
    setDrillTarget(target);
    setDrillOpen(true);
  }

  async function exportPdf() {
    if (!report) return;
    setExporting(true);
    setError(null);
    try {
      await api.reports.downloadPlPdf({
        fy_start_year: report.fy_start_year,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "PDF export failed");
    } finally {
      setExporting(false);
    }
  }

  const colCount = report ? report.months.length + 2 : 14;
  const symbol = report ? currencySymbol(report.currency) : "R";
  /** Equal share of remaining width for each month + total column */
  const amountColPct = report ? `${(100 - 14) / (report.months.length + 1)}%` : "6%";

  const activeColour = useMemo(
    () => (report ? fyColour(report.fy_start_year) : null),
    [report]
  );

  const years: FinancialYearOption[] = report?.available_years ?? [];

  return (
    <div className="flex w-full min-w-0 max-w-full flex-col gap-2.5">
      {report && activeColour && (
        <div
          className="w-full min-w-0 overflow-hidden rounded-xl border bg-card/80 shadow-sm"
          style={{
            borderColor: activeColour.border,
            boxShadow: `inset 3px 0 0 ${activeColour.solid}`,
          }}
        >
          <div className="flex flex-wrap items-center gap-2 p-2.5 sm:gap-3 sm:p-3">
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <div
                className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg text-center"
                style={{
                  background: activeColour.softStrong,
                  border: `2px solid ${activeColour.borderStrong}`,
                }}
              >
                <span
                  className="text-base font-black leading-none tabular-nums"
                  style={{ color: activeColour.text }}
                >
                  {String(report.fy_start_year).slice(-2)}
                </span>
                <span
                  className="text-[8px] font-bold uppercase tracking-wider opacity-80"
                  style={{ color: activeColour.text }}
                >
                  FY
                </span>
              </div>
              <div className="min-w-0 space-y-0.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h2 className="text-sm font-bold tracking-tight sm:text-base">{report.label}</h2>
                  {report.is_current_fy && (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                      style={{
                        background: activeColour.softStrong,
                        color: activeColour.text,
                        border: `1px solid ${activeColour.border}`,
                      }}
                    >
                      Current
                    </span>
                  )}
                </div>
                <p className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                  <CalendarRange
                    className="h-3 w-3 shrink-0"
                    style={{ color: activeColour.solid }}
                  />
                  <span className="tabular-nums">
                    {report.date_from} → {report.date_to}
                  </span>
                  <span className="text-muted-foreground/60">·</span>
                  <span className="font-medium text-foreground">{symbol}</span>
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

          <div
            className="flex flex-wrap items-center gap-1.5 border-t px-2.5 py-2 sm:px-3"
            style={{
              borderColor: activeColour.border,
              background: activeColour.soft,
            }}
          >
            <span className="mr-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
              Years
            </span>
            {years.length === 0 ? (
              <span className="text-xs text-muted-foreground">None yet</span>
            ) : (
              years.map((y) => {
                const col = fyColour(y.fy_start_year);
                const active = y.fy_start_year === report.fy_start_year;
                return (
                  <button
                    key={y.fy_start_year}
                    type="button"
                    onClick={() => {
                      setUseCurrentDefault(false);
                      setFyYear(y.fy_start_year);
                    }}
                    title={`${y.date_from} → ${y.date_to}`}
                    className={cn(
                      "inline-flex h-7 items-center gap-1.5 rounded-lg border px-2 text-xs font-bold tabular-nums transition-all sm:h-8 sm:px-2.5 sm:text-sm",
                      active ? "scale-[1.02]" : "opacity-90 hover:opacity-100"
                    )}
                    style={{
                      background: active ? col.softStrong : "transparent",
                      borderColor: active ? col.borderStrong : col.border,
                      color: col.text,
                    }}
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: col.solid }}
                      aria-hidden
                    />
                    {y.label}
                    {y.is_current && (
                      <span className="text-[8px] font-semibold uppercase opacity-70">now</span>
                    )}
                  </button>
                );
              })
            )}
            {report && !report.is_current_fy && (
              <button
                type="button"
                onClick={() => {
                  setUseCurrentDefault(true);
                  setFyYear(null);
                }}
                className="inline-flex h-7 items-center rounded-lg border border-dashed border-border/70 px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:border-border hover:text-foreground sm:h-8"
              >
                Current FY
              </button>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="rounded border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs">
          {error}
        </div>
      )}

      {loading && !report && (
        <p className="text-xs text-muted-foreground">Loading…</p>
      )}

      {report && (
        <div className="w-full min-w-0 overflow-x-auto rounded-xl bg-card/30">
          {/*
            table-fixed + w-full: columns share the viewport width (relative layout).
            Horizontal scroll only if the viewport is too narrow for readable amounts.
          */}
          <table className="w-full min-w-0 table-fixed border-separate border-spacing-0">
            <colgroup>
              <col style={{ width: "14%" }} />
              {report.months.map((m) => (
                <col key={m.month} style={{ width: amountColPct }} />
              ))}
              <col style={{ width: amountColPct }} />
            </colgroup>
            <thead>
              <tr className="border-b border-border/40">
                <th className="sticky left-0 z-30 bg-background/95 px-2 py-1.5 text-left text-[10px] font-bold uppercase tracking-wide text-muted-foreground sm:px-2.5 sm:text-[11px]">
                  Ledger
                </th>
                {report.months.map((m) => (
                  <th
                    key={m.month}
                    title={m.label}
                    className="px-1 py-1.5 text-center text-[10px] font-bold uppercase tracking-wide text-muted-foreground sm:px-1.5 sm:text-[11px]"
                  >
                    {m.month_name}
                  </th>
                ))}
                <th className="px-1 py-1.5 text-center text-[10px] font-bold uppercase tracking-wide text-foreground sm:px-1.5 sm:text-[11px]">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              <SectionBlock
                title="Income"
                rows={report.income_rows}
                monthTotals={report.month_income_totals}
                sectionTotal={report.total_income}
                months={report.months}
                symbol={symbol}
                colCount={colCount}
                fyDateFrom={report.date_from}
                fyDateTo={report.date_to}
                sectionTypes={["income"]}
                onDrill={openDrill}
              />
              <SectionBlock
                title="Expenses"
                rows={report.expense_rows}
                monthTotals={report.month_expense_totals}
                sectionTotal={report.total_expenses}
                months={report.months}
                symbol={symbol}
                colCount={colCount}
                fyDateFrom={report.date_from}
                fyDateTo={report.date_to}
                sectionTypes={["expense"]}
                onDrill={openDrill}
              />
              <SectionBlock
                title="Transfers"
                rows={report.transfer_rows}
                monthTotals={report.month_transfer_totals}
                sectionTotal={report.total_transfers}
                months={report.months}
                symbol={symbol}
                colCount={colCount}
                fyDateFrom={report.date_from}
                fyDateTo={report.date_to}
                sectionTypes={["transfer", "capital", "other"]}
                onDrill={openDrill}
              />

              {/* Net: bold · single line above · double line below — not drillable (mixed ledgers) */}
              <tr className="bg-muted/15 font-bold [&>td]:border-t [&>td]:border-t-foreground/70 [&>td]:border-b-[3px] [&>td]:border-b-double [&>td]:border-b-foreground/80">
                <LedgerNameCell bold section>
                  Net profit / (loss)
                </LedgerNameCell>
                {report.month_net_totals.map((a, i) => (
                  <AmountCell key={i} amount={a} symbol={symbol} muteZero={false} bold />
                ))}
                <AmountCell
                  amount={report.net_result}
                  symbol={symbol}
                  muteZero={false}
                  bold
                />
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <PlDrilldownModal
        open={drillOpen}
        target={drillTarget}
        currency={report?.currency || "ZAR"}
        onClose={() => {
          setDrillOpen(false);
          setDrillTarget(null);
        }}
        onChanged={() => void load()}
      />
    </div>
  );
}
