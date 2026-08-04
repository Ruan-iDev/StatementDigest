"use client";

import { useState, type ReactNode } from "react";
import { KeyRound, Lock, Timer, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLicense } from "@/components/license-provider";

type Props = {
  children: ReactNode;
};

/**
 * Option C: after trial, app stays open in read-only with a banner + unlock panel.
 * User can still view their data; writes/exports are blocked by API + UI.
 */
export function TrialGate({ children }: Props) {
  const { status, ready, readOnly, activate } = useLicense();
  const [showKey, setShowKey] = useState(false);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onActivate() {
    setBusy(true);
    setError(null);
    try {
      await activate(key.trim());
      setKey("");
      setShowKey(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Invalid unlock key");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center bg-background text-sm text-muted-foreground">
        Checking access…
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {readOnly && status && (
        <div className="shrink-0 border-b border-[hsl(var(--neon-amber)/0.45)] bg-[hsl(var(--neon-amber)/0.12)] px-4 py-2.5">
          <div className="mx-auto flex max-w-5xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-2 text-sm">
              <Eye className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--neon-amber))]" />
              <div>
                <p className="font-medium text-foreground">Read-only mode</p>
                <p className="text-xs text-muted-foreground">
                  {status.message} View your books on screen — no uploads, allocations, rules, or
                  exports until you unlock.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {!showKey ? (
                <Button
                  type="button"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setShowKey(true)}
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  Enter unlock key
                </Button>
              ) : (
                <div className="flex w-full flex-col gap-1.5 sm:w-auto sm:flex-row sm:items-center">
                  <Input
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    placeholder="LF-LIFE-…"
                    className="h-8 font-mono text-xs sm:w-56"
                    autoComplete="off"
                  />
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy || key.trim().length < 4}
                    onClick={() => void onActivate()}
                  >
                    {busy ? "…" : "Activate"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setShowKey(false);
                      setError(null);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          </div>
          {error && <p className="mx-auto mt-1 max-w-5xl text-xs text-destructive">{error}</p>}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}

/** Compact badge — days remaining / read-only / licensed (all sessions, including Guest). */
export function TrialBadge() {
  const { status, ready } = useLicense();

  if (!ready) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground">
        <Timer className="h-3 w-3 animate-pulse" />
        Checking access…
      </span>
    );
  }

  if (!status) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground"
        title="Could not load trial status — is the API running?"
      >
        <Timer className="h-3 w-3" />
        Trial status unavailable
      </span>
    );
  }

  if (status.licensed) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--neon-lime)/0.5)] bg-[hsl(var(--neon-lime)/0.12)] px-2.5 py-1 text-[11px] font-semibold text-[hsl(var(--neon-lime))]">
        <KeyRound className="h-3 w-3" />
        Licensed
      </span>
    );
  }

  if (status.read_only || status.expired) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--neon-amber)/0.55)] bg-[hsl(var(--neon-amber)/0.12)] px-2.5 py-1 text-[11px] font-semibold text-[hsl(var(--neon-amber))]">
        <Lock className="h-3 w-3" />
        Read-only
      </span>
    );
  }

  const urgent = status.days_remaining <= 7;
  return (
    <span
      className={
        urgent
          ? "inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--neon-amber)/0.55)] bg-[hsl(var(--neon-amber)/0.12)] px-2.5 py-1 text-[11px] font-semibold text-[hsl(var(--neon-amber))]"
          : "inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
      }
      title={status.message}
    >
      <Timer className="h-3 w-3" />
      {status.days_remaining} day{status.days_remaining === 1 ? "" : "s"} remaining
    </span>
  );
}
