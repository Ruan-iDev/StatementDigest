"use client";

import { useEffect, useState } from "react";
import { Upload, ListTodo, FileBarChart, Settings } from "lucide-react";
import { api, type DashboardStats } from "@/lib/api";
import { HubTile } from "@/components/hub-tile";
import { MonthlyComparisonChart } from "@/components/monthly-comparison-chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .dashboard()
      .then(setStats)
      .catch((e) => setError(e.message || "Failed to load. Is the API running on :8000?"))
      .finally(() => setLoading(false));
  }, []);

  const pending = stats?.pending_count ?? 0;

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-[hsl(var(--neon-violet))]">
          Main menu · Dashboard
        </p>
        <h1 className="page-title">What would you like to do?</h1>
        <p className="page-subtitle max-w-xl">
          Four clear hubs. Upload statements, clear the queue, report progress, or tune your setup —
          no clutter.
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
        <HubTile
          href="/upload"
          title="Upload Statement"
          description="Pick your bank, then import a PDF or CSV statement."
          icon={Upload}
          accent="cyan"
        />
        <HubTile
          href="/pending"
          title="Transactions"
          description="Review and categorise transactions that still need a ledger."
          icon={ListTodo}
          accent="magenta"
          badge={loading ? "…" : pending > 0 ? pending : "0"}
          pulse={!loading && pending > 0}
        />
        <HubTile
          href="/reports"
          title="Reporting"
          description="Profit & loss, budgets, and PDF exports for your books."
          icon={FileBarChart}
          accent="lime"
        />
        <HubTile
          href="/settings"
          title="Settings"
          description="Bank profiles, ledger accounts, rules, and preferences."
          icon={Settings}
          accent="violet"
        />
      </div>

      {/* Same MonthlyComparisonChart as Reporting — one shared component, not a fork */}
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
