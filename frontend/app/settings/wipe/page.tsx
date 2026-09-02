"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WipeTransactionsModal } from "@/components/wipe-transactions-modal";
import { useLicenseOptional } from "@/components/license-provider";

export default function WipeTransactionsPage() {
  const [open, setOpen] = useState(false);
  const license = useLicenseOptional();
  const readOnly = Boolean(license?.readOnly);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link
          href="/settings"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Settings
        </Link>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-[hsl(var(--neon-amber))]">
          Ledger Flow · Data
        </p>
        <h1 className="page-title">Wipe transactions</h1>
        <p className="page-subtitle max-w-xl">
          Remove imported bank transactions for a year or a month so you can re-import cleanly. Ledgers,
          rules, and Work Flow (clients, projects, quotes) stay put.
        </p>
      </header>

      <Card className="max-w-xl border-2 border-[hsl(var(--neon-amber)/0.45)]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Eraser className="h-4 w-4 text-[hsl(var(--neon-amber))]" />
            Permanent delete
          </CardTitle>
          <CardDescription>
            This cannot be undone. Use it when a statement imported wrong and you want that period gone
            before you upload again.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant="outline"
            disabled={readOnly}
            title={readOnly ? "Read-only — wipe locked" : undefined}
            onClick={() => setOpen(true)}
          >
            Choose year or month to wipe
          </Button>
        </CardContent>
      </Card>

      <WipeTransactionsModal
        open={open}
        onClose={() => setOpen(false)}
        onWiped={() => {
          if (typeof window === "undefined") return;
          const path = window.location.pathname;
          if (path.startsWith("/pending") || path === "/" || path.startsWith("/reports")) {
            window.setTimeout(() => window.location.reload(), 400);
          }
        }}
      />
    </div>
  );
}
