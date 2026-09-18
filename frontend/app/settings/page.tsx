"use client";

import { BookOpen, Zap, UserRound, SlidersHorizontal, Blocks, Palette, Eraser, HardDrive } from "lucide-react";
import { HubTile } from "@/components/hub-tile";
import { useProfileOptional } from "@/components/profile-provider";

export default function SettingsPage() {
  const active = useProfileOptional()?.active;

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-[hsl(var(--neon-violet))]">
          Setup
        </p>
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle max-w-xl">
          App-wide setup for this PC — profile, look, modules, and the local database. Ledger Flow
          account lists stay here too.
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
          description="Personal details and switch workspaces (never mixed)."
          icon={UserRound}
          accent="violet"
        />
        <HubTile
          href="/settings/data"
          title="Database"
          description="Where data lives on this PC. Backup and restore when you move devices."
          icon={HardDrive}
          accent="lime"
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
        <HubTile
          href="/settings/modules"
          title="Modules"
          description="Turn Quotes, Invoices, and Projects on or off for this workspace."
          icon={Blocks}
          accent="cyan"
        />
        <HubTile
          href="/settings/appearance"
          title="Appearance"
          description="Theme pack and light / dark. The whole app follows your choice."
          icon={Palette}
          accent="magenta"
        />
        <HubTile
          href="/settings/wipe"
          title="Wipe transactions"
          description="Permanently delete imported transactions for a year or month. Does not touch Work Flow."
          icon={Eraser}
          accent="amber"
        />
      </div>
    </div>
  );
}
