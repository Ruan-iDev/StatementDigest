"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/utils";
import { optionMatches } from "@/components/ui/typeahead-select";
import type { PracticeProduct } from "@/modules/practice/lib/types";

type Props = {
  value: string;
  items: PracticeProduct[];
  onChange: (next: string) => void;
  onPick: (item: PracticeProduct) => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  itemIndex?: number;
};

export function ProductItemField({
  value,
  items,
  onChange,
  onPick,
  onKeyDown,
  placeholder,
  itemIndex,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(
    null
  );

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.max(36, el.scrollHeight)}px`;
  }, [value]);

  const matches = useMemo(() => {
    if (!items.length) return [];
    const term = value.trim();
    const filtered = term
      ? items.filter((item) =>
          optionMatches(
            {
              id: String(item.id),
              label: item.name,
              hint: [item.category, item.supplier_stock_code, item.description].filter(Boolean).join(" "),
            },
            term
          )
        )
      : items;
    return filtered.slice(0, 12);
  }, [items, value]);

  function placeMenu() {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 4;
    const spaceBelow = window.innerHeight - r.bottom - gap - 8;
    const spaceAbove = r.top - gap - 8;
    const openUp = spaceBelow < 160 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(120, Math.min(260, openUp ? spaceAbove : spaceBelow));
    const top = openUp ? r.top - gap - maxHeight : r.bottom + gap;
    let left = r.left;
    const width = Math.max(r.width, 260);
    if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - 8 - width);
    setPos({ top, left, width, maxHeight });
  }

  useLayoutEffect(() => {
    if (!open || matches.length === 0) {
      setPos(null);
      return;
    }
    placeMenu();
    const onMove = () => placeMenu();
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open, matches.length, value]);

  useEffect(() => {
    setHighlight((h) => (matches.length === 0 ? 0 : Math.min(h, matches.length - 1)));
  }, [matches.length]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function pick(item: PracticeProduct) {
    onPick(item);
    setOpen(false);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape" && open) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      return;
    }
    if (open && matches.length) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlight((h) => (h + 1) % matches.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlight((h) => (h - 1 + matches.length) % matches.length);
        return;
      }
      if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const hit = matches[highlight];
        if (hit) pick(hit);
        return;
      }
    }
    onKeyDown(e);
  }

  const showMenu = open && mounted && pos && matches.length > 0;

  return (
    <div className="relative">
      <textarea
        ref={ref}
        rows={1}
        data-line-item={itemIndex}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => {
          if (items.length) setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        className="min-h-[36px] w-full min-w-0 resize-none overflow-hidden rounded-md border border-input bg-background px-2 py-1.5 text-left text-sm leading-snug shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        style={{ textAlign: "left", verticalAlign: "top" }}
      />
      {showMenu
        ? createPortal(
            <div
              ref={menuRef}
              role="listbox"
              className="fixed z-[9999] overflow-hidden rounded-xl border-2 border-border bg-card shadow-lg"
              style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxHeight }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <ul className="overflow-y-auto py-1" style={{ maxHeight: pos.maxHeight }}>
                {matches.map((item, i) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={highlight === i}
                      className={cn(
                        "flex w-full flex-col items-start px-3 py-1.5 text-left text-sm hover:bg-accent",
                        highlight === i && "bg-accent"
                      )}
                      onMouseEnter={() => setHighlight(i)}
                      onMouseDown={(ev) => {
                        ev.preventDefault();
                        pick(item);
                      }}
                    >
                      <span>{item.name}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {[
                          item.category || null,
                          item.supplier_stock_code ? `Code ${item.supplier_stock_code}` : null,
                          formatMoney(item.retail_price),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
