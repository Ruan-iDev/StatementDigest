"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Minus, Square, X } from "lucide-react";
import { getDesktopBridge, isDesktopApp } from "@/lib/desktop";
import { cn } from "@/lib/utils";

/**
 * Frameless Electron title strip: drag region + min / max / close.
 * Hidden in the browser; only mounts inside the desktop shell.
 */
export function DesktopTitlebar() {
  const [active, setActive] = useState(false);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!isDesktopApp()) return;
    setActive(true);
    const bridge = getDesktopBridge();

    void (async () => {
      try {
        const m = await bridge?.windowIsMaximized?.();
        if (typeof m === "boolean") setMaximized(m);
      } catch {
        /* ignore */
      }
    })();

    const unsub = bridge?.onMaximizedChanged?.((value) => setMaximized(value));
    return () => {
      unsub?.();
    };
  }, []);

  if (!active) return null;

  const bridge = getDesktopBridge();

  return (
    <div className="desktop-titlebar flex h-9 shrink-0 select-none items-center border-b border-border/70 bg-card/90 backdrop-blur-md">
      <div className="flex min-w-0 flex-1 items-center gap-2 px-3">
        <span className="truncate text-[11px] font-medium tracking-wide text-muted-foreground">
          LedgerFlow
        </span>
      </div>

      <div className="desktop-no-drag flex h-full items-stretch">
        <TitleBtn
          aria-label="Minimize"
          onClick={() => void bridge?.windowMinimize?.()}
        >
          <Minus className="h-3.5 w-3.5" strokeWidth={2} />
        </TitleBtn>
        <TitleBtn
          aria-label={maximized ? "Restore" : "Maximize"}
          onClick={async () => {
            try {
              const next = await bridge?.windowMaximizeToggle?.();
              if (typeof next === "boolean") setMaximized(next);
            } catch {
              /* ignore */
            }
          }}
        >
          {maximized ? <RestoreIcon /> : <Square className="h-3 w-3" strokeWidth={2} />}
        </TitleBtn>
        <TitleBtn
          aria-label="Close"
          danger
          onClick={() => void bridge?.windowClose?.()}
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} />
        </TitleBtn>
      </div>
    </div>
  );
}

function RestoreIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <rect x="3.5" y="1.5" width="7" height="7" rx="0.75" stroke="currentColor" strokeWidth="1.25" />
      <path
        d="M8.5 4.5H2.25A.75.75 0 0 0 1.5 5.25v5.5c0 .41.34.75.75.75h5.5c.41 0 .75-.34.75-.75V4.5Z"
        stroke="currentColor"
        strokeWidth="1.25"
        fill="none"
      />
    </svg>
  );
}

function TitleBtn({
  children,
  onClick,
  danger,
  "aria-label": ariaLabel,
}: {
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
  "aria-label": string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className={cn(
        "flex h-9 w-11 items-center justify-center text-muted-foreground transition-colors",
        danger
          ? "hover:bg-destructive hover:text-destructive-foreground"
          : "hover:bg-muted hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}
