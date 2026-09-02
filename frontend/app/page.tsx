"use client";

import { useEffect, useState } from "react";
import { api, type DashboardStats } from "@/lib/api";
import { HubTile } from "@/components/hub-tile";
import { MonthlyComparisonChart } from "@/components/monthly-comparison-chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LEDGER_FLOW } from "@/modules/registry";

export default function LedgerFlowHomePage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .dashboard()
      .then(setStats)
      .catch((e) => setError(e.message || "Failed to load. Is the API running on :8470?"))
      .finally(() => setLoading(false));
  }, []);

  const pending = stats?.pending_count ?? 0;

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-[hsl(var(--neon-violet))]">
          Module · Ledger Flow
        </p>
        <h1 className="page-title">Ledger Flow</h1>
        <p className="page-subtitle max-w-xl">
          The books. Upload statements, clear the queue, report, and tune setup. Work Flow sits
          next door — clients and billing stay out of statement upload.
        </p>
      </header>

      {error && (
        <Card className="border-2 border-[hsl(var(--neon-amber)/0.6)] shadow-[var(--glow-amber)]">
          <CardHeader>
            <CardTitle>Backend offline</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Start the API:{" "}
            <code className="rounded-md bg-muted px-1.5 py-0.5">cd backend &amp;&amp; python run.py</code>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        {LEDGER_FLOW.items.map((item) => {
          const isTx = item.href === "/pending";
          return (
            <HubTile
              key={item.href}
              href={item.href}
              title={item.label}
              description={
                item.href === "/upload"
                  ? "Pick your bank, then import a PDF or CSV statement."
                  : item.href === "/pending"
                    ? "Review and categorise transactions that still need a ledger."
                    : item.href === "/reports"
                      ? "Profit & loss, budgets, and PDF exports for your books."
                      : "Bank profiles, ledger accounts, rules, and preferences."
              }
              icon={item.icon}
              accent={item.accent}
              badge={isTx ? (loading ? "…" : pending > 0 ? pending : "0") : undefined}
              pulse={isTx && !loading && pending > 0}
            />
          );
        })}
      </div>

      {/* Same MonthlyComparisonChart as Reporting — visible on the Ledger Flow home, not a tile */}
      <MonthlyComparisonChart />

      {stats && !error && (
        <p className="text-center text-xs text-muted-foreground">
          {stats.total_transactions} transactions · {stats.ledger_count} ledgers ·{" "}
          {stats.rule_count} rules · everything stays on this machine
        </p>
      )}
    </div>
  );
}
