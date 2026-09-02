"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type ModalProps = {
  open: boolean;
  onClose?: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  /** Hide the X button (e.g. forced gate). */
  hideClose?: boolean;
  /** When false, clicking the dimmed backdrop does not close. Default true. */
  closeOnOutside?: boolean;
  /** When false, Escape does not close. Defaults to the same as closeOnOutside. */
  closeOnEscape?: boolean;
};

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  className,
  hideClose,
  closeOnOutside = true,
  closeOnEscape,
}: ModalProps) {
  const allowEscape = closeOnEscape ?? closeOnOutside;
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && onClose && !hideClose && allowEscape) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, hideClose, allowEscape]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onMouseDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (onClose && !hideClose && closeOnOutside) onClose();
        }}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border-2 border-[hsl(var(--neon-cyan)/0.45)] bg-card shadow-neon-cyan",
          className
        )}
      >
        {(title || !hideClose) && (
          <div className="flex items-start justify-between gap-3 border-b border-border/80 px-5 py-4">
            <div className="min-w-0 space-y-1">
              {title && <h2 className="text-lg font-semibold tracking-tight">{title}</h2>}
              {description && <p className="text-sm text-muted-foreground">{description}</p>}
            </div>
            {!hideClose && onClose && (
              <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
