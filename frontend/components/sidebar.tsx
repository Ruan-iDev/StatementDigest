"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Moon,
  Sun,
  Sparkles,
  ScrollText,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useTheme } from "@/components/theme-provider";
import { useProfile } from "@/components/profile-provider";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { TrialBadge } from "@/components/trial-gate";
import { APP_MODULES, moduleForPath } from "@/modules/registry";

const ACCENT_DOT: Record<string, string> = {
  cyan: "bg-[hsl(var(--neon-cyan))] shadow-[0_0_8px_hsl(var(--neon-cyan))]",
  magenta: "bg-[hsl(var(--neon-magenta))] shadow-[0_0_8px_hsl(var(--neon-magenta))]",
  lime: "bg-[hsl(var(--neon-lime))] shadow-[0_0_8px_hsl(var(--neon-lime))]",
  violet: "bg-[hsl(var(--neon-violet))] shadow-[0_0_8px_hsl(var(--neon-violet))]",
  amber: "bg-[hsl(var(--neon-amber))] shadow-[0_0_8px_hsl(var(--neon-amber))]",
};

const ACTIVE_BORDER: Record<string, string> = {
  cyan: "border-[hsl(var(--neon-cyan)/0.6)] bg-[hsl(var(--neon-cyan)/0.1)] text-foreground",
  magenta: "border-[hsl(var(--neon-magenta)/0.6)] bg-[hsl(var(--neon-magenta)/0.1)] text-foreground",
  lime: "border-[hsl(var(--neon-lime)/0.6)] bg-[hsl(var(--neon-lime)/0.1)] text-foreground",
  violet: "border-[hsl(var(--neon-violet)/0.6)] bg-[hsl(var(--neon-violet)/0.1)] text-foreground",
  amber: "border-[hsl(var(--neon-amber)/0.6)] bg-[hsl(var(--neon-amber)/0.1)] text-foreground",
};

export function Sidebar() {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const { active, profiles, requestSwitchProfile } = useProfile();
  const { username, logout, isGuest } = useAuth();
  const [unallocatedCount, setUnallocatedCount] = useState(0);

  const refreshUnallocated = useCallback(async () => {
    try {
      const s = await api.dashboard();
      setUnallocatedCount(s.pending_count ?? 0);
    } catch {
      /* offline / not ready — leave last known */
    }
  }, []);

  useEffect(() => {
    void refreshUnallocated();
    const id = window.setInterval(() => void refreshUnallocated(), 20000);
    const onFocus = () => void refreshUnallocated();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshUnallocated, active?.id, pathname]);

  return (
    <aside className="sticky top-0 z-40 flex h-full w-56 shrink-0 flex-col overflow-y-auto border-r border-border/80 bg-card/80 backdrop-blur-md">
      <div className="border-b border-border/80 px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border-2 border-[hsl(var(--neon-cyan)/0.7)] bg-[hsl(var(--neon-cyan)/0.12)] text-[hsl(var(--neon-cyan))] shadow-[0_0_12px_hsl(var(--neon-cyan)/0.35)]">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold leading-none tracking-tight">LedgerFlow</div>
            <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
              {isGuest ? "Guest · full access" : active ? active.name : "local · private"}
            </div>
          </div>
        </div>
        {/* Trial days — visible for every session including Guest */}
        <div className="mt-2 flex justify-start">
          <TrialBadge />
        </div>
      </div>
      {profiles.length > 1 && (
        <div className="border-b border-border/80 px-2.5 py-2">
          <label className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">
            Active profile
          </label>
          <select
            className="h-8 w-full rounded-lg border border-input bg-background px-2 text-xs"
            value={active?.id ?? ""}
            onChange={(e) => {
              const id = Number(e.target.value);
              if (id && id !== active?.id) requestSwitchProfile(id);
              // Reset select if modal cancelled — refresh will restore active
              e.target.value = String(active?.id ?? "");
            }}
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <nav className="flex-1 space-y-1 p-2.5">
        {APP_MODULES.map((mod) => {
          const current = moduleForPath(pathname);
          const navActive = current?.id === mod.id;
          const Icon = mod.icon;
          const pulseTx = mod.id === "ledger-flow" && unallocatedCount > 0 && !navActive;
          return (
            <Link
              key={mod.id}
              href={mod.href}
              className={cn(
                "flex items-center gap-2.5 rounded-xl border border-transparent px-2.5 py-2 text-sm transition-all",
                navActive
                  ? ACTIVE_BORDER[mod.accent]
                  : "text-muted-foreground hover:border-border hover:bg-accent/60 hover:text-foreground",
                pulseTx && "nav-pulse-unallocated"
              )}
              title={
                pulseTx
                  ? `${unallocatedCount} unallocated transaction${unallocatedCount === 1 ? "" : "s"}`
                  : mod.description
              }
            >
              <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", ACCENT_DOT[mod.accent])} />
              <Icon className="h-4 w-4 shrink-0 opacity-90" />
              <span className="min-w-0 flex-1">
                <span className="block truncate leading-tight">{mod.name}</span>
                {mod.subtitle ? (
                  <span className="mt-0.5 block truncate text-[10px] leading-tight text-muted-foreground">
                    {mod.subtitle}
                  </span>
                ) : null}
              </span>
              {mod.id === "ledger-flow" && unallocatedCount > 0 && (
                <span className="nav-unallocated-badge">{unallocatedCount > 99 ? "99+" : unallocatedCount}</span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="space-y-1 border-t border-border/80 p-2.5">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 rounded-xl"
          onClick={toggle}
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </Button>
        <Link
          href="/terms"
          className={cn(
            "flex w-full items-center gap-2 rounded-xl border border-transparent px-2.5 py-2 text-sm transition-all",
            pathname === "/terms" || pathname.startsWith("/terms/")
              ? "border-[hsl(var(--neon-cyan)/0.55)] bg-[hsl(var(--neon-cyan)/0.12)] text-foreground shadow-[0_0_12px_hsl(var(--neon-cyan)/0.2)]"
              : "text-muted-foreground hover:border-[hsl(var(--neon-cyan)/0.35)] hover:bg-[hsl(var(--neon-cyan)/0.08)] hover:text-foreground"
          )}
        >
          <ScrollText className="h-4 w-4 shrink-0 text-[hsl(var(--neon-cyan))]" />
          Terms
        </Link>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 rounded-xl text-muted-foreground"
          onClick={() => void logout()}
          title={username ? `Signed in as ${username}` : "Log out"}
        >
          <LogOut className="h-4 w-4" />
          {isGuest ? "Exit guest" : `Log out${username ? ` (${username})` : ""}`}
        </Button>
      </div>
    </aside>
  );
}
