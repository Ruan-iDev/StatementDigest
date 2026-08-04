"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound, LogIn, RefreshCw, Shield, Sparkles, UserPlus, UserRound, X } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PasswordStrengthMeter } from "@/components/password-strength-meter";
import { getDesktopBridge, isDesktopApp } from "@/lib/desktop";
import { cn } from "@/lib/utils";

type AuthMode = "login" | "register";

type Props = {
  hasUsers: boolean;
  onAuthenticated: (token: string, username: string, opts?: { guest?: boolean }) => void;
};

export function AuthScreen({ hasUsers, onAuthenticated }: Props) {
  // Always offer Log in + Register + Guest. Prefer Log in when accounts exist.
  const [mode, setMode] = useState<AuthMode>(hasUsers ? "login" : "register");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestNote, setSuggestNote] = useState<string | null>(null);
  const [desktop, setDesktop] = useState(false);

  useEffect(() => {
    setMode(hasUsers ? "login" : "register");
  }, [hasUsers]);

  useEffect(() => {
    setDesktop(isDesktopApp());
  }, []);

  function switchMode(next: AuthMode) {
    if (next === mode) return;
    setMode(next);
    setError(null);
    setSuggestNote(null);
    setPassword("");
    setConfirm("");
    setShowPw(false);
  }

  const refreshSuggestion = useCallback(async () => {
    setError(null);
    try {
      const s = await api.auth.suggestPassword();
      setPassword(s.password);
      setConfirm(s.password);
      setSuggestNote(s.note);
      setShowPw(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not generate password");
    }
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const u = username.trim();
    if (u.length < 2) {
      setError("Username must be at least 2 characters");
      return;
    }
    if (!password) {
      setError("Please enter a password");
      return;
    }
    if (mode === "register") {
      if (password !== confirm) {
        setError("Password and confirmation do not match");
        return;
      }
    }
    setBusy(true);
    try {
      if (mode === "register") {
        const res = await api.auth.register({ username: u, password });
        onAuthenticated(res.token, res.username);
      } else {
        const res = await api.auth.login({ username: u, password });
        onAuthenticated(res.token, res.username);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  async function enterAsGuest() {
    setError(null);
    setBusy(true);
    try {
      const res = await api.auth.guest();
      onAuthenticated(res.token, res.username, { guest: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not start guest session");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-4">
        <div className="flex items-center justify-center gap-2 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-[hsl(var(--neon-cyan)/0.7)] bg-[hsl(var(--neon-cyan)/0.12)] text-[hsl(var(--neon-cyan))] shadow-[0_0_14px_hsl(var(--neon-cyan)/0.3)]">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="text-left">
            <p className="text-lg font-semibold tracking-tight">LedgerFlow</p>
            <p className="text-xs text-muted-foreground">local · private · locked</p>
          </div>
        </div>

        <Card className="border-2 border-[hsl(var(--neon-violet)/0.45)] shadow-[0_0_24px_hsl(var(--neon-violet)/0.15)]">
          <CardHeader className="space-y-3">
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-[hsl(var(--neon-violet))]" />
              Welcome
            </CardTitle>
            <CardDescription>
              Log in with an existing account, register a new user, or continue as a guest.
            </CardDescription>

            {/* Always-visible mode switch: Log in | Register */}
            <div
              className="grid grid-cols-2 gap-1 rounded-xl border-2 border-border bg-muted/40 p-1"
              role="tablist"
              aria-label="Authentication mode"
            >
              <button
                type="button"
                role="tab"
                aria-selected={mode === "login"}
                disabled={busy}
                onClick={() => switchMode("login")}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  mode === "login"
                    ? "bg-card text-foreground shadow-sm border border-[hsl(var(--neon-violet)/0.45)]"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <LogIn className="h-3.5 w-3.5" />
                Log in
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "register"}
                disabled={busy}
                onClick={() => switchMode("register")}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  mode === "register"
                    ? "bg-card text-foreground shadow-sm border border-[hsl(var(--neon-violet)/0.45)]"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <UserPlus className="h-3.5 w-3.5" />
                Register
              </button>
            </div>
          </CardHeader>

          <CardContent>
            <form className="space-y-3" onSubmit={submit}>
              <div className="space-y-1">
                <Label htmlFor="auth-user">Username</Label>
                <Input
                  id="auth-user"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={mode === "register" ? "Choose a username" : "Your username"}
                  required
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="auth-pass">Password</Label>
                  {mode === "register" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 text-xs"
                      onClick={() => void refreshSuggestion()}
                    >
                      <RefreshCw className="h-3 w-3" />
                      Suggest 15-key
                    </Button>
                  )}
                </div>
                <div className="relative">
                  <Input
                    id="auth-pass"
                    type={showPw ? "text" : "password"}
                    autoComplete={mode === "register" ? "new-password" : "current-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pr-10 font-mono"
                    placeholder={mode === "register" ? "Create a strong password" : "Your password"}
                    required
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPw((s) => !s)}
                    aria-label={showPw ? "Hide password" : "Show password"}
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {(mode === "register" || password.length > 0) && (
                  <PasswordStrengthMeter password={password} className="pt-1" />
                )}
              </div>

              {mode === "register" && (
                <>
                  <div className="space-y-1">
                    <Label htmlFor="auth-confirm">Confirm password</Label>
                    <Input
                      id="auth-confirm"
                      type={showPw ? "text" : "password"}
                      autoComplete="new-password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      className="font-mono"
                      placeholder="Repeat password"
                      required
                    />
                  </div>
                  <div className="rounded-xl border-2 border-[hsl(var(--neon-amber)/0.55)] bg-[hsl(var(--neon-amber)/0.1)] px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
                    <p className="font-semibold text-foreground">Back up this password first</p>
                    <p className="mt-1">
                      Write it down or store it in a password manager before you create the account.
                      There is <strong className="text-foreground">no forgot-password recovery</strong>
                      . If you lose this password, the account stays locked forever (you can only
                      change it later by proving the current password).
                    </p>
                    {suggestNote && <p className="mt-2 text-[11px] opacity-90">{suggestNote}</p>}
                  </div>
                </>
              )}

              {error && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={busy}>
                {mode === "register" ? (
                  <UserPlus className="mr-2 h-4 w-4" />
                ) : (
                  <KeyRound className="mr-2 h-4 w-4" />
                )}
                {busy
                  ? "Please wait…"
                  : mode === "register"
                    ? "Create account & enter"
                    : "Log in"}
              </Button>
            </form>

            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-[10px] uppercase tracking-wide">
                <span className="bg-card px-2 text-muted-foreground">or</span>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full border-[hsl(var(--neon-cyan)/0.45)]"
              disabled={busy}
              onClick={() => void enterAsGuest()}
            >
              <UserRound className="mr-2 h-4 w-4" />
              Log in as Guest
            </Button>
            <p className="mt-2 text-center text-[11px] leading-snug text-muted-foreground">
              Browse the app without an account.{" "}
              <strong className="text-foreground">Nothing is saved</strong> — uploads and edits are
              blocked until you register.
            </p>
          </CardContent>
        </Card>

        {desktop && (
          <div className="flex justify-center pt-1">
            <Button
              type="button"
              variant="outline"
              className="min-w-[10rem] gap-2 border-border/80 text-muted-foreground hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive"
              disabled={busy}
              onClick={() => void getDesktopBridge()?.windowClose?.()}
            >
              <X className="h-4 w-4" />
              Close
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
