"use client";

import { REPORTS } from "@/lib/reports-meta";
import { HubTile } from "@/components/hub-tile";
import { MonthlyComparisonChart } from "@/components/monthly-comparison-chart";

/** Reporting hub — chart + report tiles only. Each report opens on its own page. */
export default function ReportsHubPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-[hsl(var(--neon-lime))]">
          Insights
        </p>
        <h1 className="page-title">Reporting</h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          SA-oriented management reports (ZAR · March financial year by default). Choose a report
          below to open it on a dedicated screen — they are not official SARS eFiling forms.
        </p>
      </div>

      <MonthlyComparisonChart />

      <div className="space-y-2">
        <h2 className="text-sm font-semibold tracking-tight">Choose a report</h2>
        <p className="text-xs text-muted-foreground">
          Opens a full report page with period controls and detail tables.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {REPORTS.map((r) => (
            <HubTile
              key={r.key}
              href={r.href}
              title={r.title}
              description={r.description}
              icon={r.icon}
              accent={r.accent}
              className="min-h-[160px]"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
