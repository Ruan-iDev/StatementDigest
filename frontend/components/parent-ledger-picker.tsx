"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronsUpDown, Search } from "lucide-react";
import type { Ledger } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  ledgers: Ledger[];
  value: number | null;
  onChange: (parentId: number | null) => void;
  /** Exclude these ids from selection (e.g. self when editing) */
  excludeIds?: number[];
  disabled?: boolean;
  label?: string;
};

function indentLabel(l: Ledger): string {
  const depth = l.depth ?? 0;
  const pad = depth > 0 ? `${"— ".repeat(depth)}` : "";
  return `${pad}${l.name}`;
}

type MenuPos = { top: number; left: number; width: number; maxHeight: number };

export function ParentLedgerPicker({
  ledgers,
  value,
  onChange,
  excludeIds = [],
  disabled,
  label = "Parent ledger",
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [pos, setPos] = useState<MenuPos | null>(null);
  const [mounted, setMounted] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const options = useMemo(() => {
    const ex = new Set(excludeIds);
    return ledgers.filter((l) => !l.is_archived && !ex.has(l.id));
  }, [ledgers, excludeIds]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return options;
    return options.filter(
      (l) =>
        l.name.toLowerCase().includes(term) ||
        (l.parent_name || "").toLowerCase().includes(term) ||
        l.type.toLowerCase().includes(term)
    );
  }, [options, q]);

  const selected = options.find((l) => l.id === value) || null;

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 4;
    const preferredMax = 240; // ~ max-h-60
    const spaceBelow = window.innerHeight - r.bottom - gap - 8;
    const spaceAbove = r.top - gap - 8;
    const openUp = spaceBelow < 160 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(120, Math.min(preferredMax, openUp ? spaceAbove : spaceBelow));
    const top = openUp ? r.top - gap - maxHeight : r.bottom + gap;
    setPos({
      top,
      left: r.left,
      width: Math.max(r.width, 260),
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
    // capture scroll from any ancestor (main, etc.)
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

  const menu =
    open && mounted && pos
      ? createPortal(
          <div
            ref={menuRef}
            role="listbox"
            className="fixed z-[9999] overflow-hidden rounded-xl border-2 border-[hsl(var(--neon-lime)/0.55)] bg-card shadow-2xl"
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
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Type to search ledgers…"
                className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
              />
            </div>
            <ul className="overflow-y-auto py-1" style={{ maxHeight: pos.maxHeight - 44 }}>
              {filtered.length === 0 ? (
                <li className="px-3 py-2 text-xs text-muted-foreground">No matches</li>
              ) : (
                filtered.map((l) => (
                  <li key={l.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={value === l.id}
                      className={cn(
                        "flex w-full flex-col items-start px-3 py-1.5 text-left text-sm hover:bg-muted/60",
                        value === l.id && "bg-[hsl(var(--neon-lime)/0.12)]"
                      )}
                      onClick={() => {
                        onChange(l.id);
                        setOpen(false);
                        setQ("");
                      }}
                    >
                      <span className="font-medium">{indentLabel(l)}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {l.type}
                        {l.parent_name ? ` · under ${l.parent_name}` : " · top level"}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>,
          document.body
        )
      : null;

  return (
    <div ref={rootRef} className="relative z-20 min-w-[220px] flex-1 space-y-1">
      <Label>{label}</Label>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-sm shadow-sm",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          disabled && "cursor-not-allowed opacity-50"
        )}
      >
        <span className={cn("truncate", !selected && "text-muted-foreground")}>
          {selected ? indentLabel(selected) : "Search and select parent…"}
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
      </button>
      {menu}
    </div>
  );
}
