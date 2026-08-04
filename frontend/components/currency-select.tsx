"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import {
  currencyHelper,
  findCurrency,
  sortedCurrencies,
  type CurrencyInfo,
} from "@/lib/currencies";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  value: string;
  onChange: (code: string) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
};

type MenuPos = { top: number; left: number; width: number; maxHeight: number };

export function CurrencySelect({
  value,
  onChange,
  label = "Default currency",
  disabled,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [pos, setPos] = useState<MenuPos | null>(null);
  const [mounted, setMounted] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const list = useMemo(() => sortedCurrencies(), []);

  useEffect(() => {
    setMounted(true);
  }, []);

  const selected = findCurrency(value) || null;

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return list;
    return list.filter(
      (c) =>
        c.code.toLowerCase().includes(term) ||
        c.name.toLowerCase().includes(term) ||
        c.country.toLowerCase().includes(term)
    );
  }, [list, q]);

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 4;
    const preferredMax = 320;
    const spaceBelow = window.innerHeight - r.bottom - gap - 8;
    const spaceAbove = r.top - gap - 8;
    const openUp = spaceBelow < 200 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(160, Math.min(preferredMax, openUp ? spaceAbove : spaceBelow));
    const top = openUp ? Math.max(8, r.top - gap - maxHeight) : r.bottom + gap;
    setPos({
      top,
      left: r.left,
      width: Math.max(r.width, 300),
      maxHeight,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    updatePosition();
    const onScrollOrResize = () => updatePosition();
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(c: CurrencyInfo) {
    onChange(c.code);
    setOpen(false);
    setQ("");
  }

  const menu =
    open && mounted && pos
      ? createPortal(
          <div
            ref={menuRef}
            role="listbox"
            aria-label="Currencies"
            className="fixed z-[9999] overflow-hidden rounded-xl border-2 border-[hsl(var(--neon-violet)/0.5)] bg-card text-card-foreground shadow-2xl"
            style={{
              top: pos.top,
              left: pos.left,
              width: Math.min(pos.width, window.innerWidth - 16),
              maxWidth: "min(100vw - 16px, 420px)",
            }}
          >
            <div className="flex items-center gap-2 border-b border-border/70 bg-muted/40 px-2 py-1.5">
              <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <Input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search code, name, or country…"
                className="h-8 border-0 bg-transparent px-0 text-foreground shadow-none placeholder:text-muted-foreground focus-visible:ring-0"
              />
            </div>
            <ul
              className="overflow-y-auto py-1"
              style={{ maxHeight: Math.max(120, pos.maxHeight - 48) }}
            >
              {filtered.length === 0 ? (
                <li className="px-3 py-3 text-xs text-muted-foreground">No currencies match</li>
              ) : (
                filtered.map((c) => {
                  const active = c.code === value?.toUpperCase();
                  return (
                    <li key={c.code}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={active}
                        className={cn(
                          "flex w-full items-start gap-2 px-3 py-2 text-left transition-colors",
                          "hover:bg-accent hover:text-accent-foreground",
                          active && "bg-[hsl(var(--neon-violet)/0.12)]"
                        )}
                        onClick={() => pick(c)}
                      >
                        <span className="mt-0.5 w-4 shrink-0 text-[hsl(var(--neon-violet))]">
                          {active ? <Check className="h-3.5 w-3.5" /> : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="font-mono text-sm font-semibold tracking-wide text-foreground">
                            {c.code}
                          </span>
                          <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                            {currencyHelper(c)}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>,
          document.body
        )
      : null;

  return (
    <div ref={rootRef} className={cn("relative z-20 space-y-1", className)}>
      {label ? <Label>{label}</Label> : null}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-auto min-h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-left text-sm shadow-sm",
          "text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50"
        )}
      >
        <span className="min-w-0 flex-1">
          {selected ? (
            <>
              <span className="font-mono font-semibold tracking-wide text-foreground">
                {selected.code}
              </span>
              <span className="mt-0.5 block truncate text-[11px] leading-snug text-muted-foreground">
                {currencyHelper(selected)}
              </span>
            </>
          ) : (
            <>
              <span className="font-mono font-semibold text-foreground">
                {(value || "—").toUpperCase()}
              </span>
              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                Unknown or custom code — pick from the list
              </span>
            </>
          )}
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-70" />
      </button>
      {menu}
    </div>
  );
}
