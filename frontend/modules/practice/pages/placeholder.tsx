"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  title: string;
  eyebrow: string;
  body: string;
};

export function PracticePlaceholderPage({ title, eyebrow, body }: Props) {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link
          href="/practice"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Work Flow
        </Link>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-[hsl(var(--neon-amber))]">
          {eyebrow}
        </p>
        <h1 className="page-title">{title}</h1>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Next slice of Practice</CardTitle>
          <CardDescription>The module is in place. This library is not built yet.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>{body}</p>
          <p>
            Quotes and invoices will attach to a project file so they appear on the same dated paper
            trail as notes.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
