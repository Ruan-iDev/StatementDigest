"use client";

import { REPORTS, reportsByGroup } from "@/lib/reports-meta";
import { HubTile } from "@/components/hub-tile";
import { MonthlyComparisonChart } from "@/components/monthly-comparison-chart";
import { Badge } from "@/components/ui/badge";

const GROUPS: { key: "management" | "individual" | "companies" | "cross"; title: string; blurb: string }[] = [
  {
    key: "management",
    title: "Management reports",
    blurb: "Existing P&L, turnover, expenses, budget and cashflow snapshot.",
  },
  {
    key: "individual",
    title: "Individual · tax support",
    blurb: "Worksheets for taxable income, interest, medical, motor, capital and provisional tax.",
  },
  {
    key: "companies",
    title: "Companies · VAT & books",
    blurb: "VAT 201 pack, related-party, trial balance, GL, cash-flow and payroll placeholders.",
  },
  {
    key: "cross",
    title: "Year-end & multi-profile",
    blurb: "FY pack PDF index and consolidation stub.",
  },
];

/** Reporting hub — chart + report tiles. Each report opens on its own page. */
export default function ReportsHubPage() {
  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-[hsl(var(--neon-lime))]">
          Insights
        </p>
        <h1 className="page-title">Reporting</h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          SA-oriented management and tax-support reports (ZAR · March financial year by default).
          Choose a report below — they are not official SARS eFiling forms.{" "}
          <span className="text-foreground/80">{REPORTS.length} reports</span> on this hub.
        </p>
      </div>

      <MonthlyComparisonChart />

      {GROUPS.map((g) => {
        const items = reportsByGroup(g.key);
        if (!items.length) return null;
        return (
          <div key={g.key} className="space-y-2">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold tracking-tight">{g.title}</h2>
                <p className="text-xs text-muted-foreground">{g.blurb}</p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((r) => (
                <div key={r.key} className="relative">
                  {r.status ? (
                    <span className="absolute right-3 top-3 z-10">
                      {r.status === "live" ? (
                        <Badge variant="success">live</Badge>
                      ) : r.status === "partial" ? (
                        <Badge variant="warning">partial</Badge>
                      ) : (
                        <Badge variant="secondary">stub</Badge>
                      )}
                    </span>
                  ) : null}
                  <HubTile
                    href={r.href}
                    title={r.title}
                    description={r.description}
                    icon={r.icon}
                    accent={r.accent}
                    className="min-h-[160px]"
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
