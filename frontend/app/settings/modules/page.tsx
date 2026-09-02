"use client";

import Link from "next/link";
import { ArrowLeft, FileText, FolderOpen, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { useModuleFlags } from "@/modules/practice/flags-provider";
import type { PracticeFlags } from "@/modules/practice/lib/types";

const ROWS: {
  key: keyof PracticeFlags;
  title: string;
  description: string;
  icon: typeof FileText;
  configure?: string;
}[] = [
  {
    key: "quotes_enabled",
    title: "Quotes",
    description:
      "Draft quotes from the Quotes library or a project file. Independent of invoices and projects.",
    icon: FileText,
    configure: "/practice/configuration?kind=quote",
  },
  {
    key: "invoices_enabled",
    title: "Invoices",
    description:
      "Raise invoices and assign them to a sales income ledger. Can be created from a quote when both are on.",
    icon: Receipt,
    configure: "/practice/configuration?kind=invoice",
  },
  {
    key: "projects_enabled",
    title: "Projects",
    description:
      "Job files with an info sheet, paper trail, running expenses, and a pull-able statement.",
    icon: FolderOpen,
  },
];

export default function ModulesSettingsPage() {
  const { flags, ready, setFlag } = useModuleFlags();

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
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-[hsl(var(--neon-violet))]">
          Settings · Value added
        </p>
        <h1 className="page-title">Modules</h1>
        <p className="page-subtitle max-w-2xl">
          Switch features on or off for this workspace. They do not depend on each other — except
          you can still turn a quote into an invoice when both are on.
        </p>
      </header>

      {!ready && <p className="text-sm text-muted-foreground">Loading module switches…</p>}

      <div className="space-y-3">
        {ROWS.map((row) => {
          const Icon = row.icon;
          const on = flags[row.key];
          return (
            <Card key={row.key} className="section-panel neon-violet border-2">
              <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    {row.title}
                  </CardTitle>
                  <CardDescription className="max-w-xl">{row.description}</CardDescription>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <ToggleSwitch
                    checked={on}
                    onChange={(next) => void setFlag(row.key, next)}
                    disabled={!ready}
                  />
                  {row.configure && (
                    <Link href={row.configure}>
                      <Button type="button" size="sm" variant="outline">
                        Configure
                      </Button>
                    </Link>
                  )}
                </div>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {on
                  ? "On — this feature is available in Work Flow and on project files."
                  : "Off — hidden in the app. Existing records stay in the database."}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Link href="/practice">
        <Button type="button" variant="outline">
          Open Work Flow
        </Button>
      </Link>
    </div>
  );
}
