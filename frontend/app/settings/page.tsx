"use client";

import { BookOpen, Zap, UserRound, SlidersHorizontal } from "lucide-react";
import { HubTile } from "@/components/hub-tile";
import { useProfile } from "@/components/profile-provider";

export default function SettingsPage() {
  const { active } = useProfile();

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-[hsl(var(--neon-violet))]">
          Setup
        </p>
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle max-w-xl">
          Profile, ledgers, rules, and preferences. Choose your bank when you upload statements.
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
        <HubTile
          href="/settings/preferences"
          title="Preferences"
          description="Financial year start and default currency — local only."
          icon={SlidersHorizontal}
          accent="amber"
        />
      </div>
    </div>
  );
}
