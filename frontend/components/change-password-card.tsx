"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PasswordStrengthMeter } from "@/components/password-strength-meter";

export function ChangePasswordCard() {
  const { logout } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (!next) {
      setError("Please enter a new password");
      return;
    }
    if (next !== confirm) {
      setError("New password and confirmation do not match");
      return;
    }
    setBusy(true);
    try {
      const res = await api.auth.changePassword({
        current_password: current,
        new_password: next,
      });
      setMessage(res.message);
      setCurrent("");
      setNext("");
      setConfirm("");
      // Force re-login with new password
      setTimeout(() => {
        void logout();
      }, 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Change failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-2 border-[hsl(var(--neon-amber)/0.45)]">
      <CardHeader>
        <CardTitle>Change login password</CardTitle>
        <CardDescription>
          This is the password that opens LedgerFlow (app login), not a workspace unlock. Enter your
          current password to change it. There is no email reset. Extra profile unlocks are reset
          with <strong>Reset login</strong> on the profile list above.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-3" onSubmit={submit}>
          <div className="space-y-1">
            <Label>Current password</Label>
            <Input
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <Label>New password</Label>
            <Input
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
            />
            <PasswordStrengthMeter password={next} className="pt-1" />
          </div>
          <div className="space-y-1">
            <Label>Confirm new password</Label>
            <Input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </div>
          {error && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
              {error}
            </div>
          )}
          {message && (
            <div className="rounded-lg border border-[hsl(var(--neon-lime)/0.45)] bg-[hsl(var(--neon-lime)/0.1)] px-3 py-2 text-sm">
              {message}
            </div>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? "Updating…" : "Update password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
