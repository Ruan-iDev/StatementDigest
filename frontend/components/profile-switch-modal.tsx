"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { KeyRound, Lock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  profileName: string;
  /** Extra client workspace — username + password required */
  requiresPassword: boolean;
  /** Known workspace username (not secret) — prefills the field. */
  workspaceUsername?: string | null;
  onClose: () => void;
  onForgotPassword?: () => void;
  onConfirm: (creds: { username: string; password: string }) => Promise<void>;
};

/**
 * Full-app gate when switching workspaces.
 * Extra client profiles need workspace username + password; Cancel stays put.
 * On success the parent reloads with only that profile’s data.
 */
export function ProfileSwitchModal({
  open,
  profileName,
  requiresPassword,
  workspaceUsername,
  onClose,
  onForgotPassword,
  onConfirm,
}: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<"form" | "loading">("form");
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    setUsername((workspaceUsername || "").trim());
    setPassword("");
    setError(null);
    setBusy(false);
    setPhase("form");
  }, [open, workspaceUsername]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (requiresPassword) {
      if (!username.trim()) {
        setError("Enter the workspace username.");
        return;
      }
      if (!password) {
        setError("Enter the workspace password.");
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      setPhase("loading");
      await onConfirm({ username: username.trim(), password });
    } catch (err: unknown) {
      setPhase("form");
      setError(err instanceof Error ? err.message : "Could not switch profile");
      setBusy(false);
    }
  }

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="desktop-no-drag fixed inset-0 z-[400] flex flex-col items-center justify-center bg-black/85 px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-switch-title"
    >
      <div
        className={cn(
          "relative z-10 w-full max-w-md rounded-2xl border-2 border-[hsl(var(--neon-violet)/0.55)]",
          "bg-card px-6 py-7 shadow-[0_0_48px_hsl(var(--neon-violet)/0.2)]"
        )}
      >
        {phase === "loading" ? (
          <div className="space-y-4 py-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border-2 border-[hsl(var(--neon-violet)/0.45)] bg-[hsl(var(--neon-violet)/0.12)]">
              <KeyRound className="h-5 w-5 animate-pulse text-[hsl(var(--neon-violet))]" />
            </div>
            <h2 id="profile-switch-title" className="text-lg font-semibold tracking-tight">
              Loading workspace…
            </h2>
            <p className="text-sm text-muted-foreground">
              Switching to <strong className="text-foreground">{profileName}</strong>. Only this
              profile’s data will be shown.
            </p>
          </div>
        ) : (
          <form className="space-y-5" onSubmit={(e) => void submit(e)}>
            <div className="space-y-2 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border-2 border-[hsl(var(--neon-violet)/0.45)] bg-[hsl(var(--neon-violet)/0.12)]">
                <Lock className="h-5 w-5 text-[hsl(var(--neon-violet))]" />
              </div>
              <h2 id="profile-switch-title" className="text-lg font-semibold tracking-tight">
                {requiresPassword ? "Unlock workspace" : "Switch workspace"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {requiresPassword ? (
                  <>
                    Enter the workspace username and password for{" "}
                    <strong className="text-foreground">“{profileName}”</strong>. Cancel stays on
                    your current profile.
                  </>
                ) : (
                  <>
                    Switch to <strong className="text-foreground">“{profileName}”</strong>? The app
                    will reload with only that profile’s data.
                  </>
                )}
              </p>
            </div>

            {requiresPassword && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="profile-switch-user">Workspace username</Label>
                  <Input
                    id="profile-switch-user"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="h-11"
                    autoFocus
                    disabled={busy}
                    placeholder="Username for this profile"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="profile-switch-pw">Workspace password</Label>
                  <Input
                    id="profile-switch-pw"
                    type="password"
                    autoComplete="off"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11 font-mono"
                    disabled={busy}
                    placeholder="Password for this profile"
                  />
                </div>
                {onForgotPassword && (
                  <button
                    type="button"
                    className="text-left text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    onClick={onForgotPassword}
                  >
                    Forgot this workspace password? Reset it on My Profile.
                  </button>
                )}
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
                {error}
              </div>
            )}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                className="h-11 gap-2 sm:min-w-[7rem]"
                disabled={busy}
                onClick={onClose}
              >
                <X className="h-4 w-4" />
                Cancel
              </Button>
              <Button type="submit" className="h-11 gap-2 sm:min-w-[10rem]" disabled={busy}>
                <KeyRound className="h-4 w-4" />
                {busy
                  ? "Please wait…"
                  : requiresPassword
                    ? "Unlock & switch"
                    : "Switch now"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
}
