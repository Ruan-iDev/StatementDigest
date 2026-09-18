"use client";

import { useEffect, useState } from "react";
import { Building2, Contact, FileBarChart, FileText, FolderOpen, Package, Receipt, Settings2, Users } from "lucide-react";
import { HubTile } from "@/components/hub-tile";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { practiceApi } from "@/modules/practice/lib/api";
import { useModuleFlags } from "@/modules/practice/flags-provider";
import { WorkflowOverviewChart } from "@/modules/practice/pages/workflow-overview-chart";
import type { PracticeStatus } from "@/modules/practice/lib/types";

export function PracticeHubPage() {
  const { flags } = useModuleFlags();
  const [stats, setStats] = useState<PracticeStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    practiceApi
      .status()
      .then(setStats)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load Work Flow"));
  }, []);

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-[hsl(var(--neon-amber))]">
          Module · Work Flow
        </p>
        <h1 className="page-title">Work Flow</h1>
        <p className="page-subtitle max-w-2xl">
          The practice. Keep the people you work with, the products you quote, send the invoice,
          and open a file when the work starts. The chart is this year’s pulse — pick a card below
          to jump in.
        </p>
      </header>

      {error && (
        <Card className="border-2 border-[hsl(var(--neon-amber)/0.6)]">
          <CardHeader>
            <CardTitle>Work Flow is offline</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            The core app is fine. Restart the API if you just pulled this branch.
          </CardContent>
        </Card>
      )}

      <WorkflowOverviewChart />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <HubTile
          compact
          href="/practice/clients"
          title="Clients"
          description="People and businesses you bill."
          icon={Users}
          accent="amber"
          badge={stats ? stats.client_count : "…"}
        />
        <HubTile
          compact
          href="/practice/suppliers"
          title="Suppliers"
          description="People and businesses you pay."
          icon={Building2}
          accent="violet"
          badge={stats ? stats.supplier_count : "…"}
        />
        <HubTile
          compact
          href="/practice/staff"
          title="Staff"
          description="People you pay on jobs. Wages and later payslips."
          icon={Contact}
          accent="cyan"
          badge={stats ? stats.staff_count ?? 0 : "…"}
        />
        <HubTile
          compact
          href="/practice/products"
          title="Products"
          description="Goods, labour, and other lines you quote often."
          icon={Package}
          accent="lime"
          badge={stats ? stats.product_count ?? 0 : "…"}
        />
        {flags.projects_enabled && (
          <HubTile
            compact
            href="/practice/projects"
            title="Projects"
            description="Job files, trail, running costs."
            icon={FolderOpen}
            accent="cyan"
            badge={stats ? stats.open_project_count : "…"}
          />
        )}
        {flags.quotes_enabled && (
          <HubTile
            compact
            href="/practice/quotes"
            title="Quotes"
            description="Draft and send from a client or project."
            icon={FileText}
            accent="lime"
            badge={stats ? stats.quote_count : "…"}
          />
        )}
        {flags.invoices_enabled && (
          <HubTile
            compact
            href="/practice/invoices"
            title="Invoices"
            description="Bill to a sales income ledger."
            icon={Receipt}
            accent="magenta"
            badge={stats ? stats.invoice_count : "…"}
          />
        )}
        <HubTile
          compact
          href="/practice/reports"
          title="Reports"
          description="Quotes, invoices, payments and expenses for the year."
          icon={FileBarChart}
          accent="lime"
        />
        <HubTile
          compact
          href="/practice/configuration"
          title="Configuration"
          description="Company details, quote/invoice settings, and Work Flow ledgers."
          icon={Settings2}
          accent="violet"
        />
      </div>
    </div>
  );
}
