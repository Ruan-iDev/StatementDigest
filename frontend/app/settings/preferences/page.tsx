"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, SlidersHorizontal } from "lucide-react";
import { api, type AppSettings } from "@/lib/api";
import { useProfile } from "@/components/profile-provider";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CurrencySelect } from "@/components/currency-select";

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

export default function PreferencesPage() {
  const router = useRouter();
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
      setMessage("Preferences saved");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-[hsl(var(--neon-violet))]">
            Settings
          </p>
          <h1 className="page-title">Preferences</h1>
          <p className="page-subtitle">
            Local only — financial year and currency for this workspace.
            {active ? (
              <>
                {" "}
                Active: <strong>{active.name}</strong>.
              </>
            ) : null}
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => router.push("/settings")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Settings
        </Button>
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

      {!settings && !error && (
        <p className="text-sm text-muted-foreground">Loading preferences…</p>
      )}

      {settings && (
        <Card className="section-panel neon-violet border-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4" />
              Workspace preferences
            </CardTitle>
            <CardDescription>No cloud accounts — saved on this PC only</CardDescription>
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
              ISO currency code used on reports and money formatting.
            </p>
            <Button onClick={() => void save()}>Save preferences</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
