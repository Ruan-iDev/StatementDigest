"use client";

import Link from "next/link";
import { ArrowLeft, Boxes } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function CabinetLibraryPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link
          href="/cabinet"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Cabinet Flow
        </Link>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-[hsl(var(--neon-cyan))]">
          Cabinet Flow · Library
        </p>
        <h1 className="page-title">Cabinets</h1>
        <p className="page-subtitle max-w-xl">
          Default cabinets used by the system and on quotes.
        </p>
      </header>

      <Card className="section-panel max-w-xl border-2">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-[hsl(var(--neon-cyan)/0.55)] bg-[hsl(var(--neon-cyan)/0.12)] text-[hsl(var(--neon-cyan))]">
              <Boxes className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>Coming soon</CardTitle>
              <CardDescription>The constructor is not open yet.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          This is where default cabinets will be built for the system and for quoting. It waits for
          the brief before any units are added.
        </CardContent>
      </Card>
    </div>
  );
}
