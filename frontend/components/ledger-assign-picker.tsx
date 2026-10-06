"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { ChevronsUpDown, Plus, Search } from "lucide-react";
import type { Ledger } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export const ADD_NEW_LEDGER_VALUE = "__add_new_ledger__";

type Props = {
  ledgers: Ledger[];
  /** Selected ledger id as string, or "" for none. */
  value: string;
  onChange: (ledgerId: string) => void;
  /** Fired when user picks “Add new…” */
  onAddNew?: () => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Compact height for dense transaction rows */
  size?: "default" | "sm";
  /** Optional id for label association */
  id?: string;
  "aria-label"?: string;
};

function indentName(l: Ledger): string {
  const depth = l.depth ?? 0;
  const pad = depth > 0 ? `${"— ".repeat(depth)}` : "";
  return `${pad}${l.name}`;
}

function optionLabel(l: Ledger): string {
  return `[${l.type}] ${indentName(l)}`;
}

type MenuPos = { top: number; left: number; width: number; maxHeight: number };

/**
 * Searchable ledger picker for Assign / bulk / rule flows.
 * Opens a filterable list; typing narrows results immediately.
 */
export function LedgerAssignPicker({
  ledgers,
  value,
  onChange,
  onAddNew,
  placeholder = "Assign to Ledger…",
  disabled,
  className,
  size = "default",
  id,
  "aria-label": ariaLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const [mounted, setMounted] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const options = useMemo(
    () =>
      [...ledgers]
        // Double-entry engine ledgers (bank accounts, equity, suspense) are not categories
        .filter((l) => !l.is_archived && !l.system_role)
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
    [ledgers]
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return options;
    return options.filter(
      (l) =>
        l.name.toLowerCase().includes(term) ||
        (l.parent_name || "").toLowerCase().includes(term) ||
        l.type.toLowerCase().includes(term) ||
        optionLabel(l).toLowerCase().includes(term)
    );
  }, [options, q]);

  // +1 if Add new is shown as first navigable row when filter empty or always
  const showAddNew = Boolean(onAddNew);
  const itemCount = filtered.length + (showAddNew ? 1 : 0);

  const selected = options.find((l) => String(l.id) === value) || null;

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 4;
    const preferredMax = 280;
    const spaceBelow = window.innerHeight - r.bottom - gap - 8;
    const spaceAbove = r.top - gap - 8;
    const openUp = spaceBelow < 180 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(140, Math.min(preferredMax, openUp ? spaceAbove : spaceBelow));
    const top = openUp ? r.top - gap - maxHeight : r.bottom + gap;
    // Prefer staying on-screen horizontally
    const width = Math.max(r.width, 240);
    let left = r.left;
    if (left + width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - 8 - width);
    }
    setPos({ top, left, width, maxHeight });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    updatePosition();
    setHighlight(0);
    const t = window.setTimeout(() => searchRef.current?.focus(), 0);
    const onScrollOrResize = () => updatePosition();
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      window.clearTimeout(t);
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
      setQ("");
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    // Keep highlight in range when filter shrinks
    setHighlight((h) => (itemCount === 0 ? 0 : Math.min(h, itemCount - 1)));
  }, [itemCount]);

  function pickLedger(l: Ledger) {
    onChange(String(l.id));
    setOpen(false);
    setQ("");
  }

  function pickAddNew() {
    setOpen(false);
    setQ("");
    onAddNew?.();
  }

  function onSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setQ("");
      triggerRef.current?.focus();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (itemCount === 0 ? 0 : (h + 1) % itemCount));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (itemCount === 0 ? 0 : (h - 1 + itemCount) % itemCount));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (itemCount === 0) return;
      if (showAddNew && highlight === 0) {
        pickAddNew();
        return;
      }
      const idx = showAddNew ? highlight - 1 : highlight;
      const l = filtered[idx];
      if (l) pickLedger(l);
    }
  }

  const menu =
    open && mounted && pos
      ? createPortal(
          <div
            ref={menuRef}
            role="listbox"
            className="fixed z-[9999] overflow-hidden rounded-xl border-2 border-[hsl(var(--neon-cyan)/0.5)] bg-card shadow-2xl"
            style={{
              top: pos.top,
              left: pos.left,
              width: pos.width,
              maxWidth: "min(100vw - 16px, 420px)",
            }}
          >
            <div className="flex items-center gap-2 border-b border-border/70 px-2 py-1.5">
              <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <Input
                ref={searchRef}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setHighlight(0);
                }}
                onKeyDown={onSearchKeyDown}
                placeholder="Type to filter ledgers…"
                className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                aria-label="Filter ledgers"
              />
            </div>
            <ul className="overflow-y-auto py-1" style={{ maxHeight: pos.maxHeight - 44 }}>
              {showAddNew && (
                <li>
                  <button
                    type="button"
                    role="option"
                    aria-selected={highlight === 0}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-[hsl(var(--neon-lime))]",
                      "hover:bg-muted/60",
                      highlight === 0 && "bg-[hsl(var(--neon-lime)/0.12)]"
                    )}
                    onMouseEnter={() => setHighlight(0)}
                    onClick={pickAddNew}
                  >
                    <Plus className="h-3.5 w-3.5 shrink-0" />
                    Add new…
                  </button>
                </li>
              )}
              {filtered.length === 0 ? (
                <li className="px-3 py-2 text-xs text-muted-foreground">
                  {q.trim() ? "No matching ledgers" : "No ledgers yet"}
                </li>
              ) : (
                filtered.map((l, i) => {
                  const hi = showAddNew ? i + 1 : i;
                  const isSelected = value === String(l.id);
                  return (
                    <li key={l.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        className={cn(
                          "flex w-full flex-col items-start px-3 py-1.5 text-left text-sm hover:bg-muted/60",
                          isSelected && "bg-[hsl(var(--neon-cyan)/0.1)]",
                          highlight === hi && "bg-muted/70"
                        )}
                        onMouseEnter={() => setHighlight(hi)}
                        onClick={() => pickLedger(l)}
                      >
                        <span className="font-medium">{indentName(l)}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {l.type}
                          {l.parent_name ? ` · under ${l.parent_name}` : " · top level"}
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
    <div ref={rootRef} className={cn("relative min-w-0", className)}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel || placeholder}
        onClick={() => {
          if (disabled) return;
          setOpen((o) => {
            if (o) setQ("");
            return !o;
          });
        }}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-2 text-left text-sm shadow-sm",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          size === "sm" ? "h-9" : "h-9",
          disabled && "cursor-not-allowed opacity-50"
        )}
      >
        <span className={cn("truncate", !selected && "text-muted-foreground")}>
          {selected ? optionLabel(selected) : placeholder}
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
      </button>
      {menu}
    </div>
  );
}
