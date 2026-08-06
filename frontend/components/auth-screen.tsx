"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Eye, EyeOff, LogIn, UserRound, X } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getDesktopBridge, isDesktopApp } from "@/lib/desktop";
import { getLastDisplayName, getLastUsername, setLastUser } from "@/lib/last-user";
import { cn } from "@/lib/utils";

type Phase = "greet" | "form";

type Props = {
  hasUsers: boolean;
  onAuthenticated: (token: string, username: string, opts?: { guest?: boolean }) => void;
};

/**
 * Returning users only (first install uses FirstTimeSetup).
 * Greet by name → Log in | Guest | Close → simple username/password form.
 */
export function AuthScreen({ hasUsers, onAuthenticated }: Props) {
  const [phase, setPhase] = useState<Phase>("greet");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [desktop, setDesktop] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    setPhase(hasUsers ? "greet" : "form");
  }, [hasUsers]);

  useEffect(() => {
    setDesktop(isDesktopApp());
    setDisplayName(getLastDisplayName());
    const lastUser = getLastUsername();
    if (lastUser) setUsername(lastUser);
    const id = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  // Soft re-enter when switching greet ↔ form
  useEffect(() => {
    setEntered(false);
    const id = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(id);
  }, [phase]);

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
    setBusy(true);
    try {
      const res = await api.auth.login({ username: u, password });
      try {
        const { setAuthToken } = await import("@/lib/api");
        setAuthToken(res.token);
        const prof = await api.profiles.active();
        const person =
          (prof.full_name && prof.full_name.trim()) ||
          (prof.business_name && prof.business_name.trim()) ||
          res.username;
        setLastUser({ username: res.username, displayName: person });
      } catch {
        setLastUser({ username: res.username, displayName: res.username });
      }
      onAuthenticated(res.token, res.username);
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

  function closeApp() {
    void getDesktopBridge()?.windowClose?.();
  }

  function goToLogin() {
    setError(null);
    setPassword("");
    setShowPw(false);
    setPhase("form");
  }

  function backToWelcome() {
    setError(null);
    setPassword("");
    setShowPw(false);
    setPhase("greet");
  }

  // ── Returning user greeting ──────────────────────────────────────────
  if (phase === "greet") {
    const greetAs = displayName || "there";
    return (
      <div className="flex min-h-full flex-col bg-black text-white">
        <div
          className={cn(
            "flex flex-1 flex-col items-center justify-center px-6 py-12 transition-all duration-700",
            entered ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
          )}
        >
          <BrandLogo />
          <p className="mt-5 text-xs uppercase tracking-[0.2em] text-white/40">LedgerFlow</p>
          <h1 className="mt-4 text-center text-3xl font-medium tracking-tight sm:text-4xl">
            Welcome back, {greetAs}
          </h1>
          <p className="mx-auto mt-4 max-w-md text-center text-sm leading-relaxed text-white/55">
            Log in to continue your books, or enter as Guest to test bank import and the full app
            without creating an account first.
          </p>

          {error && <ErrorBox message={error} />}

          <div className="mx-auto mt-10 flex w-full max-w-sm flex-col gap-3">
            <Button
              type="button"
              className="h-11 w-full gap-2 bg-white text-black hover:bg-white/90"
              disabled={busy}
              onClick={goToLogin}
            >
              <LogIn className="h-4 w-4" />
              Log in
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full gap-2 border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
              disabled={busy}
              onClick={() => void enterAsGuest()}
            >
              <UserRound className="h-4 w-4" />
              {busy ? "Please wait…" : "Continue as Guest"}
            </Button>
            <p className="text-center text-[11px] leading-relaxed text-white/40">
              Guest can use the full app (upload, ledgers, reports). Create an account when you want
              a password-protected login on this device.
            </p>
          </div>
        </div>

        <div className="flex shrink-0 justify-center pb-10 pt-2">
          {desktop ? (
            <Button
              type="button"
              variant="outline"
              className="min-w-[10rem] gap-2 border-white/15 bg-transparent text-white/70 hover:border-red-400/50 hover:bg-red-500/15 hover:text-red-100"
              disabled={busy}
              onClick={closeApp}
            >
              <X className="h-4 w-4" />
              Close
            </Button>
          ) : (
            <p className="text-[11px] text-white/30">Close the browser tab when you are done.</p>
          )}
        </div>
      </div>
    );
  }

  // ── Simple log in (username + password only) ─────────────────────────
  return (
    <div className="flex min-h-full flex-col bg-black text-white">
      <div
        className={cn(
          "flex flex-1 flex-col items-center justify-center px-6 py-12 transition-all duration-700",
          entered ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
        )}
      >
        <BrandLogo />
        <p className="mt-5 text-xs uppercase tracking-[0.2em] text-white/40">LedgerFlow</p>
        <h1 className="mt-4 text-center text-3xl font-medium tracking-tight sm:text-4xl">
          Log in
        </h1>
        <p className="mx-auto mt-4 max-w-md text-center text-sm leading-relaxed text-white/55">
          Enter your username and password to open your books.
        </p>

        <form
          className="mx-auto mt-10 w-full max-w-sm space-y-4"
          onSubmit={(e) => void submit(e)}
        >
          <div className="space-y-1.5">
            <Label htmlFor="auth-user" className="text-white/70">
              Username
            </Label>
            <Input
              id="auth-user"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Your username"
              required
              className="h-11 border-white/15 bg-white/5 text-white placeholder:text-white/35 focus-visible:ring-white/30"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="auth-pass" className="text-white/70">
              Password
            </Label>
            <div className="relative">
              <Input
                id="auth-pass"
                type={showPw ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 border-white/15 bg-white/5 pr-10 font-mono text-white placeholder:text-white/35 focus-visible:ring-white/30"
                placeholder="Your password"
                required
              />
              <button
                type="button"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/45 hover:text-white"
                onClick={() => setShowPw((s) => !s)}
                aria-label={showPw ? "Hide password" : "Show password"}
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && <ErrorBox message={error} className="mt-0" />}

          <Button
            type="submit"
            className="h-11 w-full gap-2 bg-white text-black hover:bg-white/90"
            disabled={busy}
          >
            <LogIn className="h-4 w-4" />
            {busy ? "Please wait…" : "Log in"}
          </Button>

          <Button
            type="button"
            variant="outline"
            className="h-11 w-full gap-2 border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
            disabled={busy}
            onClick={backToWelcome}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to welcome
          </Button>
        </form>
      </div>
    </div>
  );
}

function BrandLogo() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/splash-logo.svg"
      alt="LedgerFlow"
      className="mx-auto h-auto w-[min(140px,36vw)] drop-shadow-[0_0_28px_rgba(92,225,255,0.25)]"
    />
  );
}

function ErrorBox({ message, className }: { message: string; className?: string }) {
  return (
    <div
      className={cn(
        "mx-auto mt-6 max-w-sm rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-100",
        className
      )}
    >
      {message}
    </div>
  );
}
