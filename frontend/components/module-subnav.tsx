"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { useModuleFlags } from "@/modules/practice/flags-provider";
import {
  LEDGER_FLOW,
  WORK_FLOW,
  itemIsActive,
  moduleForPath,
  type ModuleNavItem,
} from "@/modules/registry";

function visibleWorkFlowItems(
  items: ModuleNavItem[],
  flags: { quotes_enabled: boolean; invoices_enabled: boolean; projects_enabled: boolean }
): ModuleNavItem[] {
  return items.filter((item) => {
    if (item.href === "/practice/quotes") return flags.quotes_enabled;
    if (item.href === "/practice/invoices") return flags.invoices_enabled;
    if (item.href === "/practice/projects") return flags.projects_enabled;
    return true;
  });
}

export function ModuleSubnav() {
  const pathname = usePathname() || "/";
  const search = useSearchParams();
  const { flags } = useModuleFlags();
  const mod = moduleForPath(pathname);
  if (!mod) return null;

  const items =
    mod.id === "work-flow" ? visibleWorkFlowItems(mod.items, flags) : mod.items;

  const kind = search.get("kind");
  const onDocument = pathname.startsWith("/practice/document");

  return (
    <div className="border-b border-border/70 bg-card/70 backdrop-blur-md">
      <div className="flex flex-wrap items-center gap-1 px-3 py-2 md:px-6 lg:px-8">
        <span className="mr-2 hidden text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground sm:inline">
          {mod.name}
          {mod.subtitle ? (
            <span className="ml-1 font-normal normal-case tracking-normal">({mod.subtitle})</span>
          ) : null}
        </span>
        <Link
          href={mod.href}
          className={cn(
            "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
            pathname === mod.href
              ? "border-[hsl(var(--neon-cyan)/0.5)] bg-[hsl(var(--neon-cyan)/0.12)] text-foreground"
              : "border-transparent text-muted-foreground hover:border-border hover:bg-accent/60 hover:text-foreground"
          )}
        >
          Home
        </Link>
        {items.map((item) => {
          const Icon = item.icon;
          let active = itemIsActive(item, pathname);
          if (onDocument) {
            active =
              (item.href === "/practice/quotes" && kind === "quote") ||
              (item.href === "/practice/invoices" && kind === "invoice");
          }
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
                active
                  ? "border-[hsl(var(--neon-cyan)/0.5)] bg-[hsl(var(--neon-cyan)/0.12)] text-foreground"
                  : "border-transparent text-muted-foreground hover:border-border hover:bg-accent/60 hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export { LEDGER_FLOW, WORK_FLOW };
