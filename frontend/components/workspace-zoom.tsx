"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "ledgerflow-workspace-zoom";
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 1.75;
const DEFAULT_ZOOM = 1;
const KEY_STEP = 0.05;

function isQuoteInvoiceWorkspace(pathname: string | null): boolean {
  const path = pathname || "";
  return (
    path.startsWith("/practice/quotes") ||
    path.startsWith("/practice/invoices") ||
    path.startsWith("/practice/document")
  );
}

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value * 100) / 100));
}

function readStoredZoom(): number {
  if (typeof window === "undefined") return DEFAULT_ZOOM;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? clampZoom(n) : DEFAULT_ZOOM;
  } catch {
    return DEFAULT_ZOOM;
  }
}

function persistZoom(value: number) {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    /* ignore quota / private mode */
  }
}

function modalOpen(): boolean {
  return Boolean(document.querySelector('[aria-modal="true"]'));
}

/**
 * Ctrl/Cmd + scroll zooms the quote/invoice working canvas.
 * App chrome (sidebar, module nav, title bar) stays at 100%.
 */
export function WorkspaceZoom({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const enabled = isQuoteInvoiceWorkspace(pathname);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [hint, setHint] = useState(false);
  const hintTimer = useRef<number | null>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  useEffect(() => {
    if (!enabled) return;
    setZoom(readStoredZoom());
  }, [enabled]);

  function flashHint() {
    setHint(true);
    if (hintTimer.current) window.clearTimeout(hintTimer.current);
    hintTimer.current = window.setTimeout(() => setHint(false), 1400);
  }

  function commitZoom(next: number) {
    const clamped = clampZoom(next);
    zoomRef.current = clamped;
    setZoom(clamped);
    persistZoom(clamped);
    flashHint();
    return clamped;
  }

  useEffect(() => {
    return () => {
      if (hintTimer.current) window.clearTimeout(hintTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      if (modalOpen()) return;
      const delta =
        e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 80 : e.deltaY;
      commitZoom(zoomRef.current * Math.exp(-delta * 0.0014));
    };

    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      if (e.altKey) return;
      const reset = e.key === "0" || e.code === "Digit0" || e.code === "Numpad0";
      const zoomIn =
        e.key === "=" || e.key === "+" || e.code === "Equal" || e.code === "NumpadAdd";
      const zoomOut =
        e.key === "-" || e.key === "_" || e.code === "Minus" || e.code === "NumpadSubtract";
      if (!reset && !zoomIn && !zoomOut) return;
      e.preventDefault();
      if (modalOpen()) return;
      if (reset) commitZoom(DEFAULT_ZOOM);
      else if (zoomIn) commitZoom(zoomRef.current + KEY_STEP);
      else commitZoom(zoomRef.current - KEY_STEP);
    };

    window.addEventListener("wheel", onWheel, { passive: false, capture: true });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("wheel", onWheel, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [enabled]);

  const showBadge = enabled && (hint || zoom !== DEFAULT_ZOOM);
  const pct = Math.round(zoom * 100);

  return (
    <div className="relative h-full min-h-0">
      {showBadge ? (
        <div className="pointer-events-none absolute right-3 top-2 z-30">
          <button
            type="button"
            className={cn(
              "pointer-events-auto rounded-md border border-border/80 bg-card/95 px-2 py-1",
              "text-[11px] font-medium tabular-nums text-muted-foreground shadow-sm backdrop-blur-sm",
              "hover:border-border hover:text-foreground"
            )}
            title="Reset canvas zoom (Ctrl+0)"
            aria-label={`Canvas zoom ${pct} percent. Click to reset.`}
            onClick={() => commitZoom(DEFAULT_ZOOM)}
          >
            {pct}%
          </button>
        </div>
      ) : null}
      <div className="h-full min-h-0 overflow-y-auto">
        <div
          className="mx-auto w-full max-w-full p-4 md:p-6 lg:px-8"
          style={enabled ? { zoom } : undefined}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
