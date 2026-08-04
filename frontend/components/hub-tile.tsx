"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type NeonAccent = "cyan" | "magenta" | "lime" | "violet" | "amber";

const ACCENT_CLASS: Record<NeonAccent, string> = {
  cyan: "neon-cyan",
  magenta: "neon-magenta",
  lime: "neon-lime",
  violet: "neon-violet",
  amber: "neon-amber",
};

const BADGE_CLASS: Record<NeonAccent, string> = {
  cyan: "bg-[hsl(var(--neon-cyan)/0.15)] text-[hsl(var(--neon-cyan))] border-[hsl(var(--neon-cyan)/0.4)]",
  magenta:
    "bg-[hsl(var(--neon-magenta)/0.15)] text-[hsl(var(--neon-magenta))] border-[hsl(var(--neon-magenta)/0.4)]",
  lime: "bg-[hsl(var(--neon-lime)/0.15)] text-[hsl(var(--neon-lime))] border-[hsl(var(--neon-lime)/0.4)]",
  violet:
    "bg-[hsl(var(--neon-violet)/0.15)] text-[hsl(var(--neon-violet))] border-[hsl(var(--neon-violet)/0.4)]",
  amber:
    "bg-[hsl(var(--neon-amber)/0.15)] text-[hsl(var(--neon-amber))] border-[hsl(var(--neon-amber)/0.4)]",
};

type HubTileBase = {
  title: string;
  description: string;
  icon: LucideIcon;
  accent: NeonAccent;
  badge?: string | number | null;
  className?: string;
  /** Highlight as the active choice (report hub, etc.) */
  selected?: boolean;
  /** Draw attention (e.g. unallocated transactions waiting) */
  pulse?: boolean;
};

type HubTileLinkProps = HubTileBase & {
  href: string;
  onClick?: never;
};

type HubTileButtonProps = HubTileBase & {
  href?: never;
  onClick: () => void;
};

export type HubTileProps = HubTileLinkProps | HubTileButtonProps;

function TileInner({
  title,
  description,
  icon: Icon,
  accent,
  badge,
  selected,
  pulse,
  showArrow,
}: HubTileBase & { showArrow: boolean }) {
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className={cn("hub-tile-icon", pulse && "hub-tile-icon-pulse")}>
          <Icon className="h-7 w-7" strokeWidth={1.75} />
        </div>
        <div className="flex items-center gap-1.5">
          {selected && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                BADGE_CLASS[accent]
              )}
            >
              <Check className="h-3 w-3" />
              Active
            </span>
          )}
          {badge != null && badge !== "" && (
            <span
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs font-semibold tabular-nums",
                BADGE_CLASS[accent],
                pulse && "hub-tile-badge-pulse"
              )}
            >
              {badge}
            </span>
          )}
        </div>
      </div>
      <div className="mt-auto space-y-1.5">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          {showArrow && (
            <ArrowUpRight className="h-4 w-4 opacity-40 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100" />
          )}
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
        {pulse && (
          <p className="text-xs font-medium text-[hsl(var(--neon-magenta))]">
            Needs attention — unallocated items waiting
          </p>
        )}
      </div>
    </>
  );
}

export function HubTile(props: HubTileProps) {
  const { title, description, icon, accent, badge, className, selected, pulse } = props;
  const shell = cn(
    "hub-tile group min-h-[180px] text-left",
    ACCENT_CLASS[accent],
    selected && "ring-2 ring-offset-2 ring-offset-background",
    selected && accent === "lime" && "ring-[hsl(var(--neon-lime)/0.7)]",
    selected && accent === "cyan" && "ring-[hsl(var(--neon-cyan)/0.7)]",
    selected && accent === "magenta" && "ring-[hsl(var(--neon-magenta)/0.7)]",
    selected && accent === "violet" && "ring-[hsl(var(--neon-violet)/0.7)]",
    selected && accent === "amber" && "ring-[hsl(var(--neon-amber)/0.7)]",
    pulse && "hub-tile-pulse",
    className
  );

  if ("onClick" in props && props.onClick) {
    return (
      <button type="button" onClick={props.onClick} className={shell}>
        <TileInner
          title={title}
          description={description}
          icon={icon}
          accent={accent}
          badge={badge}
          selected={selected}
          pulse={pulse}
          showArrow={false}
        />
      </button>
    );
  }

  return (
    <Link href={(props as HubTileLinkProps).href} className={shell}>
      <TileInner
        title={title}
        description={description}
        icon={icon}
        accent={accent}
        badge={badge}
        selected={selected}
        pulse={pulse}
        showArrow
      />
    </Link>
  );
}
