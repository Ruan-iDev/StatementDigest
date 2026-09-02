"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type TypeaheadOption = {
  id: string;
  label: string;
  hint?: string;
};

type Props = {
  options: TypeaheadOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
  emptyMessage?: string;
  fallbackLabel?: string;
  /** Keep typed text that is not in the list (e.g. product categories). */
  allowCustom?: boolean;
  customHint?: string;
  maxLength?: number;
  disabled?: boolean;
  id?: string;
  tabIndex?: number;
  "aria-label"?: string;
};

/** "G" → Glass…; "glass" → Glass / The Glass Co. (name or any word). */
export function optionMatches(option: TypeaheadOption, query: string): boolean {
  const term = query.trim().toLowerCase();
  if (!term) return true;
  const hay = [option.label, option.hint || ""].join(" ").toLowerCase();
  if (hay.startsWith(term)) return true;
  return hay.split(/[\s/,\-_.]+/).some((w) => w.startsWith(term));
}

export function TypeaheadSelect({
  options,
  value,
  onChange,
  placeholder = "Type to filter…",
  allowEmpty = false,
  emptyLabel = "None",
  emptyMessage = "No matches",
  fallbackLabel,
  allowCustom = false,
  customHint = "New",
  maxLength,
  disabled,
  id,
  tabIndex,
  "aria-label": ariaLabel,
}: Props) {
  const selected = options.find((o) => o.id === value);
  const idleLabel = selected
    ? selected.hint
      ? `${selected.label} · ${selected.hint}`
      : selected.label
    : allowCustom && value
      ? value
      : fallbackLabel || "";
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(idleLabel);
  const [highlight, setHighlight] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(
    null
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) setDraft(idleLabel);
  }, [idleLabel, open]);

  const filtering = draft.trim() !== "" && draft !== idleLabel;
  const filtered = useMemo(() => {
    if (!filtering) return options;
    return options.filter((o) => optionMatches(o, draft));
  }, [options, draft, filtering]);

  const typedCustom = filtering ? draft.trim() : "";
  const typedIsNew =
    allowCustom &&
    typedCustom !== "" &&
    !filtered.some(
      (o) =>
        o.id.toLowerCase() === typedCustom.toLowerCase() ||
        o.label.toLowerCase() === typedCustom.toLowerCase()
    );
  let rows: TypeaheadOption[] = allowEmpty && !filtering ? [{ id: "", label: emptyLabel }, ...filtered] : filtered;
  if (typedIsNew) {
    rows = [{ id: typedCustom, label: typedCustom, hint: customHint }, ...rows];
  }

  function placeMenu() {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 4;
    const spaceBelow = window.innerHeight - r.bottom - gap - 8;
    const spaceAbove = r.top - gap - 8;
    const openUp = spaceBelow < 160 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(120, Math.min(260, openUp ? spaceAbove : spaceBelow));
    const top = openUp ? r.top - gap - maxHeight : r.bottom + gap;
    let left = r.left;
    const width = r.width;
    if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - 8 - width);
    setPos({ top, left, width, maxHeight });
  }

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    placeMenu();
    if (filtering) {
      setHighlight(0);
    } else {
      const i = rows.findIndex((o) => o.id === value);
      setHighlight(i >= 0 ? i : 0);
    }
    const onMove = () => placeMenu();
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open, filtered.length, filtering, value]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    setHighlight((h) => (rows.length === 0 ? 0 : Math.min(h, rows.length - 1)));
  }, [rows.length]);

  useEffect(() => {
    if (!open || !menuRef.current) return;
    const el = menuRef.current.querySelector<HTMLElement>('[aria-selected="true"]');
    el?.scrollIntoView({ block: "nearest" });
  }, [open, highlight]);

  function resolveCustom(raw: string): string {
    const t = raw.trim();
    if (!t) return "";
    const match = options.find(
      (o) => o.id.toLowerCase() === t.toLowerCase() || o.label.toLowerCase() === t.toLowerCase()
    );
    return match ? match.id : t;
  }

  function commit(id: string) {
    onChange(id);
    const opt = options.find((o) => o.id === id);
    const label = opt
      ? opt.hint
        ? `${opt.label} · ${opt.hint}`
        : opt.label
      : id && allowCustom
        ? id
        : (id ? fallbackLabel : "") || "";
    setDraft(label);
    // Close after the click finishes so a portaled menu does not unmount under
    // the cursor and leak the leftover click onto a modal backdrop.
    window.setTimeout(() => setOpen(false), 0);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setDraft(idleLabel);
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      setHighlight((h) => (rows.length === 0 ? 0 : (h + 1) % rows.length));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) setOpen(true);
      setHighlight((h) => (rows.length === 0 ? 0 : (h - 1 + rows.length) % rows.length));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const hit = rows[highlight];
      if (hit) commit(hit.id);
      else if (allowCustom) commit(resolveCustom(draft));
      return;
    }
    if (e.key === "Tab") {
      if (allowCustom) {
        commit(resolveCustom(draft));
        return;
      }
      // Keep the current value unless the user has been typing a filter.
      // Otherwise Tab-through commits the highlighted (often first) row.
      if (open && filtering) {
        const hit = rows[highlight];
        if (hit) commit(hit.id);
      } else {
        setOpen(false);
        setDraft(idleLabel);
      }
    }
  }

  const menu =
    open && mounted && pos
      ? createPortal(
          <div
            ref={menuRef}
            role="listbox"
            data-typeahead-menu=""
            className="fixed z-[9999] overflow-hidden rounded-xl border-2 border-border bg-card shadow-lg"
            style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxHeight }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <ul className="overflow-y-auto py-1" style={{ maxHeight: pos.maxHeight }}>
              {rows.length === 0 ? (
                <li className="px-3 py-2 text-xs text-muted-foreground">{emptyMessage}</li>
              ) : (
                rows.map((opt, i) => (
                  <li key={opt.id || "empty"}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={highlight === i}
                      className={cn(
                        "flex w-full flex-col items-start px-3 py-1.5 text-left text-sm hover:bg-accent",
                        highlight === i && "bg-accent",
                        opt.id && opt.id === value && "font-medium",
                        !opt.id && "text-muted-foreground"
                      )}
                      onMouseEnter={() => setHighlight(i)}
                      onMouseDown={(ev) => {
                        ev.preventDefault();
                        commit(opt.id);
                      }}
                    >
                      <span>{opt.label}</span>
                      {opt.hint ? (
                        <span className="text-[11px] text-muted-foreground">{opt.hint}</span>
                      ) : null}
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
    <div ref={rootRef} className="relative">
      <input
        ref={inputRef}
        id={id}
        disabled={disabled}
        tabIndex={tabIndex}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        autoComplete="off"
        spellCheck={false}
        maxLength={maxLength}
        placeholder={placeholder}
        value={open ? draft : idleLabel}
        onFocus={() => {
          setDraft(idleLabel);
          setOpen(true);
          window.requestAnimationFrame(() => inputRef.current?.select());
        }}
        onChange={(e) => {
          setDraft(e.target.value);
          setOpen(true);
          setHighlight(0);
          if (allowCustom) onChange(e.target.value);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          window.setTimeout(() => {
            if (menuRef.current?.contains(document.activeElement)) return;
            if (allowCustom) {
              commit(resolveCustom(draft));
              return;
            }
            setOpen(false);
            setDraft(idleLabel);
          }, 120);
        }}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-background py-1 pl-3 pr-8 text-sm shadow-sm",
          "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50"
        )}
      />
      <ChevronsUpDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 opacity-50" />
      {menu}
    </div>
  );
}
