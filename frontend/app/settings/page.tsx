"use client";

import { useEffect, useState } from "react";
import { Building2, BookOpen, Zap, UserRound } from "lucide-react";
import { api, type AppSettings } from "@/lib/api";
import { HubTile } from "@/components/hub-tile";
import { useProfile } from "@/components/profile-provider";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CurrencySelect } from "@/components/currency-select";
// OTA updates UI — re-enable when update channel is live (see docs/UPDATES.md + TODO)
// import { AppUpdatesCard } from "@/components/app-updates-card";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export default function SettingsPage() {
  const { active } = useProfile();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.settings
      .get()
      .then(setSettings)
      .catch((e) => setError(e.message));
  }, [active?.id]);

  async function save() {
    if (!settings) return;
    try {
      const updated = await api.settings.update(settings);
      setSettings(updated);
      setMessage("Settings saved");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function reapplyRules() {
    try {
      const res = await api.rules.applyAll();
      setMessage(res.message);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-[hsl(var(--neon-violet))]">
          Setup
        </p>
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle max-w-xl">
          Configure how statements are read, how accounts are structured, and how rules auto-allocate.
          {active ? (
            <>
              {" "}
              Active workspace: <strong>{active.name}</strong>.
            </>
          ) : null}
        </p>
      </header>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <HubTile
          href="/profiles"
          title="My Profile"
          description="Personal details, local data file location, and switch workspaces (never mixed)."
          icon={UserRound}
          accent="violet"
        />
        <HubTile
          href="/bank-profiles"
          title="Setup Bank Profile"
          description="Teach LedgerFlow how to read each bank’s statement format."
          icon={Building2}
          accent="cyan"
        />
        <HubTile
          href="/ledgers"
          title="Ledger Account Management"
          description="Create, archive, and budget the accounts you categorise into."
          icon={BookOpen}
          accent="lime"
        />
        <HubTile
          href="/rules"
          title="Rule Management"
          description="Auto-strip recurring merchants into the right ledger."
          icon={Zap}
          accent="magenta"
        />
      </div>

      {message && (
        <div className="rounded-xl border-2 border-[hsl(var(--neon-lime)/0.45)] bg-[hsl(var(--neon-lime)/0.08)] px-4 py-2.5 text-sm">
          {message}
        </div>
      )}
      {error && (
        <div className="rounded-xl border-2 border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm">
          {error}
        </div>
      )}

      {settings && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="section-panel neon-violet border-2">
            <CardHeader>
              <CardTitle>Preferences</CardTitle>
              <CardDescription>Local only — no cloud accounts</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label>Financial year start month</Label>
                <Select
                  value={String(settings.fy_start_month)}
                  onChange={(e) =>
                    setSettings({ ...settings, fy_start_month: Number(e.target.value) })
                  }
                >
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </Select>
              </div>
              <CurrencySelect
                value={settings.currency || "ZAR"}
                onChange={(code) => setSettings({ ...settings, currency: code })}
                label="Default currency"
              />
              <p className="text-[11px] leading-snug text-muted-foreground">
                ISO currency code used on reports and money formatting. Name and country appear in
                grey for clarity.
              </p>
              <Button onClick={save}>Save preferences</Button>
            </CardContent>
          </Card>

          <Card className="section-panel neon-amber border-2">
            <CardHeader>
              <CardTitle>Rules maintenance</CardTitle>
              <CardDescription>
                Re-run all active rules against the uncategorised queue
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button variant="secondary" onClick={reapplyRules}>
                Re-run rules on pending
              </Button>
              <p className="text-xs text-muted-foreground">
                SQLite and uploads live under the project <code className="rounded bg-muted px-1">data/</code>{" "}
                folder on this machine.
              </p>
            </CardContent>
          </Card>

        </div>
      )}

      {!settings && !error && (
        <p className="text-sm text-muted-foreground">Loading preferences…</p>
      )}

      {/* App updates (Check for updates / OTA) — hidden until air-update channel is ready.
          Uncomment AppUpdatesCard import + block below. See docs/UPDATES.md and TODO. */}
      {/*
      <div className="grid gap-4 lg:grid-cols-2">
        <AppUpdatesCard />
      </div>
      */}
    </div>
  );
}
