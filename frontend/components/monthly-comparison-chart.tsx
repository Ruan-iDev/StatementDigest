"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileDown } from "lucide-react";
import { api, type MonthlyComparisonPoint, type MonthlyComparisonReport } from "@/lib/api";
import { cn, formatMoney } from "@/lib/utils";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const CHART_TYPE_KEY = "ledgerflow-monthly-chart-type";

export type ChartType = "grouped" | "stacked" | "line" | "area";

const CHART_TYPES: { value: ChartType; label: string; hint: string }[] = [
  { value: "grouped", label: "Grouped bars", hint: "Side-by-side bars per month" },
  { value: "stacked", label: "Stacked bars", hint: "Income & spending stacked" },
  { value: "line", label: "Line chart", hint: "Trends across the year" },
  { value: "area", label: "Area chart", hint: "Filled trends" },
];

/** Actuals only — budget is not graphed (partial ledger budgets would mislead). */
const SERIES = {
  income: { key: "income" as const, label: "Income", color: "hsl(152 76% 48%)" },
  expenses: { key: "expenses" as const, label: "Spending", color: "hsl(320 85% 58%)" },
};

const ALL_SERIES = [SERIES.income, SERIES.expenses];

function num(v: string | undefined | null): number {
  if (v == null || v === "") return 0;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function loadChartType(): ChartType {
  if (typeof window === "undefined") return "grouped";
  const raw = localStorage.getItem(CHART_TYPE_KEY);
  // Migrate away from removed "combo" style
  if (raw === "combo") return "grouped";
  if (raw && CHART_TYPES.some((t) => t.value === raw)) return raw as ChartType;
  return "grouped";
}

function saveChartType(t: ChartType) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CHART_TYPE_KEY, t);
}

function valueOf(m: MonthlyComparisonPoint, key: string): number {
  return num((m as unknown as Record<string, string | null | undefined>)[key]);
}

type Layout = {
  w: number;
  h: number;
  pad: { t: number; r: number; b: number; l: number };
  innerW: number;
  innerH: number;
  groupW: number;
  months: MonthlyComparisonPoint[];
  max: number;
  yTicks: { y: number; label: string }[];
  currency: string;
  primaryLabel: string;
};

function buildLayout(data: MonthlyComparisonReport, chartType: ChartType): Layout {
  const months = [...data.months].sort((a, b) => a.month_index - b.month_index);
  const values: number[] = [];

  if (chartType === "stacked") {
    for (const m of months) {
      values.push(num(m.income) + num(m.expenses));
    }
  } else {
    for (const m of months) {
      values.push(num(m.income), num(m.expenses));
    }
  }

  const rawMax = Math.max(...values, 1);
  const max = rawMax * 1.12;

  const yTickLabels = [0, 0.25, 0.5, 0.75, 1].map((t) =>
    formatMoney(max * t, data.currency).replace(/\.00$/, "")
  );
  const AXIS_TITLE_GUTTER = 20;
  const longestTick = Math.max(...yTickLabels.map((s) => s.length), 6);
  const tickColW = Math.min(120, Math.max(56, Math.ceil(longestTick * 5.5) + 10));
  const pad = { t: 20, r: 16, b: 40, l: AXIS_TITLE_GUTTER + tickColW + 10 };
  const w = 780;
  const h = 300;
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const groupW = innerW / 12;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t, i) => ({
    y: pad.t + innerH * (1 - t),
    label: yTickLabels[i] ?? formatMoney(max * t, data.currency),
  }));

  return {
    w,
    h,
    pad,
    innerW,
    innerH,
    groupW,
    months,
    max,
    yTicks,
    currency: data.currency,
    primaryLabel: data.primary_label,
  };
}

function ChartGrid({ layout }: { layout: Layout }) {
  const axisTitleX = 11;
  const midY = layout.pad.t + layout.innerH / 2;
  const tickLabelX = layout.pad.l - 8;

  return (
    <>
      {layout.yTicks.map((t) => (
        <g key={t.y}>
          <line
            x1={layout.pad.l}
            x2={layout.w - layout.pad.r}
            y1={t.y}
            y2={t.y}
            stroke="currentColor"
            strokeOpacity={0.08}
          />
          <text
            x={tickLabelX}
            y={t.y + 3}
            textAnchor="end"
            className="fill-muted-foreground"
            style={{ fontSize: 9 }}
          >
            {t.label}
          </text>
        </g>
      ))}
      <text
        x={axisTitleX}
        y={midY}
        textAnchor="middle"
        className="fill-muted-foreground"
        style={{ fontSize: 9, fontWeight: 600 }}
        transform={`rotate(-90 ${axisTitleX} ${midY})`}
      >
        Amount ({layout.currency})
      </text>
      <line
        x1={layout.pad.l}
        x2={layout.pad.l}
        y1={layout.pad.t}
        y2={layout.pad.t + layout.innerH}
        stroke="currentColor"
        strokeOpacity={0.2}
      />
      <line
        x1={layout.pad.l}
        x2={layout.w - layout.pad.r}
        y1={layout.pad.t + layout.innerH}
        y2={layout.pad.t + layout.innerH}
        stroke="currentColor"
        strokeOpacity={0.25}
      />
      {layout.months.map((m, i) => (
        <text
          key={m.month}
          x={layout.pad.l + i * layout.groupW + layout.groupW / 2}
          y={layout.h - 14}
          textAnchor="middle"
          className="fill-muted-foreground"
          style={{ fontSize: 10, fontWeight: 600 }}
        >
          {m.month_name}
        </text>
      ))}
    </>
  );
}

function GroupedBars({ layout }: { layout: Layout }) {
  const series = ALL_SERIES;
  const barW = Math.min(16, Math.max(7, (layout.groupW - 12) / series.length));
  const gap = 2;

  return (
    <>
      {layout.months.map((m, i) => {
        const blockW = series.length * (barW + gap) - gap;
        const startX = layout.pad.l + i * layout.groupW + (layout.groupW - blockW) / 2;
        return series.map((s, si) => {
          const v = valueOf(m, s.key);
          const bh = (v / layout.max) * layout.innerH;
          return (
            <rect
              key={`${m.month}-${s.key}`}
              x={startX + si * (barW + gap)}
              y={layout.pad.t + layout.innerH - bh}
              width={barW}
              height={Math.max(bh, v > 0 ? 2 : 0)}
              fill={s.color}
              opacity={0.95}
              rx={2}
            >
              <title>
                {layout.primaryLabel} · {m.month_name} · {s.label}:{" "}
                {formatMoney(v, layout.currency)}
              </title>
            </rect>
          );
        });
      })}
    </>
  );
}

function StackedBars({ layout }: { layout: Layout }) {
  const barW = Math.min(28, layout.groupW * 0.55);

  return (
    <>
      {layout.months.map((m, i) => {
        let yBase = layout.pad.t + layout.innerH;
        return (
          <g key={m.month}>
            {ALL_SERIES.map((s) => {
              const v = valueOf(m, s.key);
              const bh = (v / layout.max) * layout.innerH;
              yBase -= bh;
              return (
                <rect
                  key={s.key}
                  x={layout.pad.l + i * layout.groupW + (layout.groupW - barW) / 2}
                  y={yBase}
                  width={barW}
                  height={Math.max(bh, v > 0 ? 1 : 0)}
                  fill={s.color}
                  opacity={0.95}
                  rx={1}
                >
                  <title>
                    {layout.primaryLabel} · {m.month_name} · {s.label}:{" "}
                    {formatMoney(v, layout.currency)}
                  </title>
                </rect>
              );
            })}
          </g>
        );
      })}
    </>
  );
}

function pathForSeries(layout: Layout, key: string, closed: boolean): string {
  const pts = layout.months.map((m, i) => {
    const v = valueOf(m, key);
    const x = layout.pad.l + i * layout.groupW + layout.groupW / 2;
    const y = layout.pad.t + layout.innerH - (v / layout.max) * layout.innerH;
    return { x, y, v };
  });
  if (!pts.length) return "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    d += ` L ${pts[i].x} ${pts[i].y}`;
  }
  if (closed) {
    const baseY = layout.pad.t + layout.innerH;
    d += ` L ${pts[pts.length - 1].x} ${baseY} L ${pts[0].x} ${baseY} Z`;
  }
  return d;
}

function LineOrArea({ layout, area }: { layout: Layout; area: boolean }) {
  return (
    <>
      {area &&
        ALL_SERIES.map((s) => (
          <path
            key={`a-${s.key}`}
            d={pathForSeries(layout, s.key, true)}
            fill={s.color}
            opacity={0.18}
            stroke="none"
          />
        ))}
      {ALL_SERIES.map((s) => (
        <g key={`l-${s.key}`}>
          <path
            d={pathForSeries(layout, s.key, false)}
            fill="none"
            stroke={s.color}
            strokeWidth={2.25}
            strokeOpacity={0.95}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {layout.months.map((m, i) => {
            const v = valueOf(m, s.key);
            const x = layout.pad.l + i * layout.groupW + layout.groupW / 2;
            const y = layout.pad.t + layout.innerH - (v / layout.max) * layout.innerH;
            return (
              <circle
                key={`${s.key}-${m.month}`}
                cx={x}
                cy={y}
                r={v > 0 ? 3 : 1.5}
                fill={s.color}
                opacity={0.95}
              >
                <title>
                  {layout.primaryLabel} · {m.month_name} · {s.label}:{" "}
                  {formatMoney(v, layout.currency)}
                </title>
              </circle>
            );
          })}
        </g>
      ))}
    </>
  );
}

function ChartBody({ layout, chartType }: { layout: Layout; chartType: ChartType }) {
  switch (chartType) {
    case "stacked":
      return <StackedBars layout={layout} />;
    case "line":
      return <LineOrArea layout={layout} area={false} />;
    case "area":
      return <LineOrArea layout={layout} area />;
    case "grouped":
    default:
      return <GroupedBars layout={layout} />;
  }
}

const LEGEND = [
  { key: "income", label: "Income", color: SERIES.income.color },
  { key: "expenses", label: "Spending", color: SERIES.expenses.color },
];

export function MonthlyComparisonChart() {
  const [data, setData] = useState<MonthlyComparisonReport | null>(null);
  const [primaryFy, setPrimaryFy] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartType, setChartType] = useState<ChartType>("grouped");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setChartType(loadChartType());
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: { fy_start_year?: number } = {};
      if (primaryFy != null) params.fy_start_year = primaryFy;
      const r = await api.reports.monthlyComparison(params);
      setData(r);
      if (primaryFy == null) setPrimaryFy(r.primary_fy_start_year);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load chart");
    } finally {
      setLoading(false);
    }
  }, [primaryFy]);

  useEffect(() => {
    void load();
  }, [load]);

  function selectYear(y: number) {
    setPrimaryFy(y);
  }

  function onChartTypeChange(v: string) {
    const t = (CHART_TYPES.find((c) => c.value === v)?.value || "grouped") as ChartType;
    setChartType(t);
    saveChartType(t);
  }

  async function exportPdf() {
    setExporting(true);
    setError(null);
    try {
      await api.reports.downloadMonthlyOverviewPdf(
        primaryFy != null ? { fy_start_year: primaryFy } : {}
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "PDF export failed");
    } finally {
      setExporting(false);
    }
  }

  const layout = useMemo(() => {
    if (!data?.months?.length) return null;
    return buildLayout(data, chartType);
  }, [data, chartType]);

  const emptyShell =
    !loading &&
    data &&
    data.months.every((m) => num(m.income) === 0 && num(m.expenses) === 0);

  const yearButtons = useMemo(() => {
    if (!data) return [];
    return [...data.available_years].sort((a, b) => b.fy_start_year - a.fy_start_year);
  }, [data]);

  return (
    <Card className="neon-cyan border-2">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="min-w-0 truncate">Monthly overview</CardTitle>
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            <Label
              htmlFor="chart-type"
              className="hidden text-[10px] text-muted-foreground sm:inline"
            >
              Graph
            </Label>
            <Select
              id="chart-type"
              value={chartType}
              onChange={(e) => onChartTypeChange(e.target.value)}
              title={CHART_TYPES.find((t) => t.value === chartType)?.hint}
              className="h-7 w-[11rem] border-[hsl(var(--neon-cyan)/0.35)] bg-background px-1.5 py-0 text-[11px] shadow-none"
            >
              {CHART_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 px-2 text-[11px]"
              disabled={loading || exporting || !data}
              onClick={() => void exportPdf()}
              title="Download landscape PDF for meetings"
            >
              <FileDown className="h-3.5 w-3.5" />
              {exporting ? "Exporting…" : "Export PDF"}
            </Button>
          </div>
        </div>
        <CardDescription className="pt-1">
          Selected financial year · months left → right. Income and Spending from allocated
          transactions only.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm">
            {error}
          </div>
        )}

        {data && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Financial year</span>
              <span>
                Showing: <strong className="text-foreground">{data.primary_label}</strong>
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {yearButtons.map((y) => {
                const active = y.fy_start_year === data.primary_fy_start_year;
                return (
                  <button
                    key={y.fy_start_year}
                    type="button"
                    onClick={() => selectYear(y.fy_start_year)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-semibold transition-all",
                      active
                        ? "border-[hsl(var(--neon-cyan))] bg-[hsl(var(--neon-cyan)/0.18)] text-foreground shadow-[0_0_10px_hsl(var(--neon-cyan)/0.25)]"
                        : "border-border/70 bg-muted/30 text-muted-foreground hover:border-border hover:text-foreground"
                    )}
                    title={`${y.label}: ${y.date_from} → ${y.date_to}${
                      y.has_data ? "" : " (no transactions yet)"
                    }`}
                  >
                    {y.label}
                    {y.is_current ? " · current" : ""}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Click a year to view that period. Graph style is remembered on this device.
            </p>
          </div>
        )}

        {loading && !data && <p className="text-sm text-muted-foreground">Loading chart…</p>}

        {emptyShell && (
          <p className="text-sm text-muted-foreground">
            Empty year skeleton — no categorised activity yet for{" "}
            <strong className="text-foreground">{data?.primary_label}</strong>. Months still show
            left to right for the full financial year.
          </p>
        )}

        {layout && (
          <>
            <div className="w-full overflow-x-auto">
              <svg
                viewBox={`0 0 ${layout.w} ${layout.h}`}
                className="h-[300px] w-full min-w-[680px] overflow-visible"
                style={{ overflow: "visible" }}
                role="img"
                aria-label={`Financial year ${chartType} chart`}
              >
                <ChartGrid layout={layout} />
                <ChartBody layout={layout} chartType={chartType} />
              </svg>
            </div>
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
              {LEGEND.map((s) => (
                <span key={s.key} className="inline-flex items-center gap-1.5">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-sm"
                    style={{ background: s.color }}
                  />
                  {s.label}
                </span>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
