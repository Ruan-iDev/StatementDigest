"use client";

import { scorePassword } from "@/lib/password-strength";
import { cn } from "@/lib/utils";

type Props = {
  password: string;
  className?: string;
};

export function PasswordStrengthMeter({ password, className }: Props) {
  const s = scorePassword(password);

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all duration-300", s.barClass)}
          style={{ width: `${s.percent}%` }}
        />
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
        <span className={cn("text-xs font-semibold", s.textClass)}>Strength: {s.label}</span>
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">{s.hint}</p>
    </div>
  );
}
