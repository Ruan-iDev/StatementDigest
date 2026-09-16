"use client";

import { Archive } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function CabinetFlowHubPage() {
  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-[hsl(var(--neon-cyan))]">
          Module · Cabinet Flow
        </p>
        <h1 className="page-title">Cabinet Flow</h1>
        <p className="page-subtitle max-w-2xl">
          Next module beside Ledger Flow and Work Flow. The product brief is still to come —
          this hub is here so you can see it on the side bar.
        </p>
      </header>

      <Card className="section-panel neon-cyan border-2 max-w-xl">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-[hsl(var(--neon-cyan)/0.55)] bg-[hsl(var(--neon-cyan)/0.12)] text-[hsl(var(--neon-cyan))]">
              <Archive className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>Coming soon</CardTitle>
              <CardDescription>Named. Not built yet.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Nothing to open here until the Cabinet Flow brief lands. Ledger Flow and Work Flow keep
          working as they are.
        </CardContent>
      </Card>
    </div>
  );
}
