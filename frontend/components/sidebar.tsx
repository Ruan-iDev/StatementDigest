"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Upload,
  ListTodo,
  FileBarChart,
  Settings,
  Moon,
  Sun,
  Sparkles,
  Eraser,
  ScrollText,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";
import { useProfile } from "@/components/profile-provider";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { WipeTransactionsModal } from "@/components/wipe-transactions-modal";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, accent: "violet" as const },
  { href: "/upload", label: "Upload", icon: Upload, accent: "cyan" as const },
  { href: "/pending", label: "Transactions", icon: ListTodo, accent: "magenta" as const },
  { href: "/reports", label: "Reporting", icon: FileBarChart, accent: "lime" as const },
  { href: "/settings", label: "Settings", icon: Settings, accent: "violet" as const },
];

const ACCENT_DOT: Record<string, string> = {
  cyan: "bg-[hsl(var(--neon-cyan))] shadow-[0_0_8px_hsl(var(--neon-cyan))]",
  magenta: "bg-[hsl(var(--neon-magenta))] shadow-[0_0_8px_hsl(var(--neon-magenta))]",
  lime: "bg-[hsl(var(--neon-lime))] shadow-[0_0_8px_hsl(var(--neon-lime))]",
  violet: "bg-[hsl(var(--neon-violet))] shadow-[0_0_8px_hsl(var(--neon-violet))]",
};

const ACTIVE_BORDER: Record<string, string> = {
  cyan: "border-[hsl(var(--neon-cyan)/0.6)] bg-[hsl(var(--neon-cyan)/0.1)] text-foreground",
  magenta: "border-[hsl(var(--neon-magenta)/0.6)] bg-[hsl(var(--neon-magenta)/0.1)] text-foreground",
  lime: "border-[hsl(var(--neon-lime)/0.6)] bg-[hsl(var(--neon-lime)/0.1)] text-foreground",
  violet: "border-[hsl(var(--neon-violet)/0.6)] bg-[hsl(var(--neon-violet)/0.1)] text-foreground",
};

export function Sidebar() {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const { active, profiles, switchProfile } = useProfile();
  const { username, logout, isGuest } = useAuth();
  const [wipeOpen, setWipeOpen] = useState(false);

  return (
    <aside className="sticky top-0 z-40 flex h-full w-56 shrink-0 flex-col overflow-y-auto border-r border-border/80 bg-card/80 backdrop-blur-md">
      <div className="flex h-14 items-center gap-2.5 border-b border-border/80 px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl border-2 border-[hsl(var(--neon-cyan)/0.7)] bg-[hsl(var(--neon-cyan)/0.12)] text-[hsl(var(--neon-cyan))] shadow-[0_0_12px_hsl(var(--neon-cyan)/0.35)]">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold leading-none tracking-tight">LedgerFlow</div>
          <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
            {isGuest ? "Guest · nothing saved" : active ? active.name : "local · private"}
          </div>
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
              if (id && id !== active?.id) void switchProfile(id);
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
        {NAV.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-xl border border-transparent px-2.5 py-2 text-sm transition-all",
                active
                  ? ACTIVE_BORDER[item.accent]
                  : "text-muted-foreground hover:border-border hover:bg-accent/60 hover:text-foreground"
              )}
            >
              <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", ACCENT_DOT[item.accent])} />
              <Icon className="h-4 w-4 shrink-0 opacity-90" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="space-y-1 border-t border-border/80 p-2.5">
        {!isGuest && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 rounded-xl text-amber-700 hover:bg-amber-500/10 hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-300"
            onClick={() => setWipeOpen(true)}
          >
            <Eraser className="h-4 w-4" />
            Wipe transactions
          </Button>
        )}
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
      {!isGuest && (
        <WipeTransactionsModal
          open={wipeOpen}
          onClose={() => setWipeOpen(false)}
          onWiped={() => {
            if (typeof window !== "undefined") {
              const path = window.location.pathname;
              if (
                path.startsWith("/pending") ||
                path === "/" ||
                path.startsWith("/reports")
              ) {
                window.setTimeout(() => window.location.reload(), 400);
              }
            }
          }}
        />
      )}
    </aside>
  );
}
