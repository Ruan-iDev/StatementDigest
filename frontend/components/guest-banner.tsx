"use client";

import { UserRound } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { TrialBadge } from "@/components/trial-gate";

/** Sticky notice when browsing without an account — nothing is saved. */
export function GuestBanner() {
  const { isGuest, logout } = useAuth();
  if (!isGuest) return null;

  return (
    <div className="border-b border-[hsl(var(--neon-amber)/0.55)] bg-[hsl(var(--neon-amber)/0.14)] px-4 py-2 text-sm text-foreground">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
        <p className="flex items-start gap-2 text-xs leading-snug sm:text-sm">
          <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--neon-amber))]" />
          <span>
            <strong>Guest mode</strong> — nothing is saved. You can look around; create an account
            to upload statements and keep your ledgers.
          </span>
        </p>
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <TrialBadge />
          <button
            type="button"
            className="text-xs font-semibold underline underline-offset-2"
            onClick={() => void logout()}
          >
            Exit guest &amp; sign in
          </button>
        </div>
      </div>
    </div>
  );
}
