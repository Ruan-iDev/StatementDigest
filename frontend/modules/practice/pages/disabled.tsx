"use client";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function FeatureOffPage({ title }: { title: string }) {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-[hsl(var(--neon-amber))]">
          Module off
        </p>
        <h1 className="page-title">{title}</h1>
      </header>
      <Card className="section-panel neon-amber border-2">
        <CardHeader>
          <CardTitle>{title} is switched off</CardTitle>
          <CardDescription>
            This workspace has {title.toLowerCase()} disabled. Existing records stay in the
            database.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/settings/modules">
            <Button type="button">Open Modules</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
