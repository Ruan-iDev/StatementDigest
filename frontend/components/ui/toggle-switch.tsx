"use client";

import { cn } from "@/lib/utils";

type Props = {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  labelOn?: string;
  labelOff?: string;
};

export function ToggleSwitch({
  checked,
  onChange,
  disabled,
  labelOn = "On",
  labelOff = "Off",
}: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border-2 px-1 py-1 transition-colors",
        checked
          ? "border-[hsl(var(--neon-lime)/0.65)] bg-[hsl(var(--neon-lime)/0.12)]"
          : "border-border bg-muted/40",
        disabled && "opacity-50"
      )}
    >
      <span
        className={cn(
          "flex h-6 w-11 items-center rounded-full px-0.5 transition-colors",
          checked ? "bg-[hsl(var(--neon-lime)/0.35)]" : "bg-muted"
        )}
      >
        <span
          className={cn(
            "h-5 w-5 rounded-full bg-card shadow-sm transition-transform",
            checked && "translate-x-5"
          )}
        />
      </span>
      <span
        className={cn(
          "pr-2 text-xs font-semibold uppercase tracking-wide",
          checked ? "text-[hsl(var(--neon-lime))]" : "text-muted-foreground"
        )}
      >
        {checked ? labelOn : labelOff}
      </span>
    </button>
  );
}
