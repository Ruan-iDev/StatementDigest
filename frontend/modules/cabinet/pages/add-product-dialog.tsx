"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Boxes, Package, Ruler, Square, Trees, Wrench, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { practiceApi } from "@/modules/practice/lib/api";
import { formatMoney } from "@/lib/utils";
import { priceBasisOf, priceBasisShort, sizeAsk } from "@/modules/practice/lib/price-basis";
import type { PracticeProduct, ProductFamily } from "@/modules/practice/lib/types";

const ACCENT: Record<string, string> = {
  amber: "border-[hsl(var(--neon-amber)/0.55)] bg-[hsl(var(--neon-amber)/0.14)] text-[hsl(var(--neon-amber))]",
  magenta: "border-[hsl(var(--neon-magenta)/0.55)] bg-[hsl(var(--neon-magenta)/0.14)] text-[hsl(var(--neon-magenta))]",
  cyan: "border-[hsl(var(--neon-cyan)/0.55)] bg-[hsl(var(--neon-cyan)/0.14)] text-[hsl(var(--neon-cyan))]",
  lime: "border-[hsl(var(--neon-lime)/0.55)] bg-[hsl(var(--neon-lime)/0.14)] text-[hsl(var(--neon-lime))]",
  violet: "border-[hsl(var(--neon-violet)/0.55)] bg-[hsl(var(--neon-violet)/0.14)] text-[hsl(var(--neon-violet))]",
};

const FAMILIES: { id: ProductFamily; label: string; hint: string; icon: LucideIcon; accent: string }[] = [
  { id: "timber", label: "Timber", hint: "Sheets and solid timber", icon: Trees, accent: "amber" },
  { id: "square_meter", label: "Square meter", hint: "Granite, glass, paint, vinyl", icon: Square, accent: "magenta" },
  { id: "linear_meter", label: "Linear meter", hint: "Edging and length-sold items", icon: Ruler, accent: "cyan" },
  { id: "quantitative", label: "Quantitative", hint: "Counted items", icon: Package, accent: "lime" },
  { id: "labour", label: "Labour", hint: "Time and work", icon: Wrench, accent: "violet" },
];

export type AddedProduct = {
  product: PracticeProduct;
  quantity: number;
  lengthMm: number | null;
  widthMm: number | null;
};

type Step = "family" | "library" | "quantity" | "cabinets";

function mmLimit(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function mmText(value: number): string {
  return String(value);
}

function maxSizeLabel(product: PracticeProduct): string | null {
  const maxLength = mmLimit(product.max_length_mm);
  const maxWidth = mmLimit(product.max_width_mm);
  if (maxLength != null && maxWidth != null) return `${mmText(maxLength)} × ${mmText(maxWidth)} mm`;
  if (maxLength != null) return `${mmText(maxLength)} mm long`;
  if (maxWidth != null) return `${mmText(maxWidth)} mm wide`;
  return null;
}

function overMaxMessage(
  product: PracticeProduct,
  length: number | null,
  width: number | null,
): string | null {
  const maxLength = mmLimit(product.max_length_mm);
  const maxWidth = mmLimit(product.max_width_mm);
  const tooLong = maxLength != null && length != null && length > maxLength;
  const tooWide = maxWidth != null && width != null && width > maxWidth;
  if (!tooLong && !tooWide) return null;
  const limit = maxSizeLabel(product);
  return `${product.name} is past its maximum${limit ? ` of ${limit}` : ""}. It cannot be added.`;
}

function priceHelp(product: PracticeProduct): string {
  const cutHost =
    product.cut_and_edge &&
    (product.family === "timber" || product.family === "square_meter" || product.family === "quantitative");
  if (cutHost) {
    return "Length and width are the cut size. Cutting labour follows how many sheets these pieces need. The price still follows this product's price switch.";
  }
  const basis = priceBasisOf(product.family, product.price_basis);
  if (basis === "square_meter") {
    return "Price is the retail rate per square metre, times the size, times how many.";
  }
  if (basis === "meter") {
    return "Price is the retail rate per metre, times the length, times how many.";
  }
  if (basis === "unit") {
    return "Price is the retail rate per unit, times how many. Length is recorded when you enter it.";
  }
  if (basis === "whole" && (product.family === "timber" || product.family === "square_meter")) {
    return "Price is the retail rate for the whole item, times how many. Size is recorded when you enter it.";
  }
  return "Price is the retail rate times how many.";
}

function sizeNote(product: PracticeProduct): string {
  const ask = sizeAsk(product.family, product.price_basis, product.cut_and_edge);
  if (ask.width) {
    const limit = maxSizeLabel(product);
    return limit ? ` Maximum ${limit}. A larger size cannot be added.` : "";
  }
  if (ask.length) {
    const maxLength = mmLimit(product.max_length_mm);
    return maxLength != null
      ? ` Maximum length ${mmText(maxLength)} mm. A longer piece cannot be added.`
      : "";
  }
  return "";
}

export function AddProductDialog({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (pick: AddedProduct) => void;
}) {
  const [step, setStep] = useState<Step>("family");
  const [family, setFamily] = useState<ProductFamily | null>(null);
  const [rows, setRows] = useState<PracticeProduct[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [lengthMm, setLengthMm] = useState("");
  const [widthMm, setWidthMm] = useState("");

  useEffect(() => {
    if (!open) return;
    setStep("family");
    setFamily(null);
    setRows([]);
    setQuery("");
    setError(null);
    setSelectedId(null);
    setQuantity("1");
    setLengthMm("");
    setWidthMm("");
  }, [open]);

  useEffect(() => {
    if (!open || step !== "library" || !family) return;
    const delay = query.trim() ? 160 : 0;
    const t = window.setTimeout(() => {
      practiceApi.products
        .list(false, query, 200, family)
        .then((list) => {
          setRows(list);
          setSelectedId(list[0]?.id ?? null);
        })
        .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load products"));
    }, delay);
    return () => window.clearTimeout(t);
  }, [open, step, family, query]);

  const groups = useMemo(() => {
    const map = new Map<string, PracticeProduct[]>();
    for (const row of rows) {
      const key = (row.category || "").trim() || "No group";
      const list = map.get(key) || [];
      list.push(row);
      map.set(key, list);
    }
    return [...map.entries()].sort((a, b) => {
      if (a[0] === "No group") return 1;
      if (b[0] === "No group") return -1;
      return a[0].localeCompare(b[0]);
    });
  }, [rows]);

  const flat = useMemo(() => groups.flatMap(([, items]) => items), [groups]);
  const selected = rows.find((row) => row.id === selectedId) || null;
  const familyMeta = FAMILIES.find((item) => item.id === family);
  const ask = selected
    ? sizeAsk(selected.family || family, selected.price_basis, selected.cut_and_edge)
    : null;

  function openFamily(id: ProductFamily) {
    setFamily(id);
    setQuery("");
    setStep("library");
    setError(null);
  }

  function choose(row: PracticeProduct) {
    setSelectedId(row.id);
    setQuantity("1");
    setLengthMm("");
    setWidthMm("");
    setError(null);
    setStep("quantity");
  }

  function confirmQuantity() {
    if (!selected) return;
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      setError("Enter how many you want.");
      return;
    }
    const length = lengthMm.trim() ? Number(lengthMm) : null;
    const width = widthMm.trim() ? Number(widthMm) : null;
    const ask = sizeAsk(selected.family || family, selected.price_basis, selected.cut_and_edge);
    if (ask.lengthRequired && (length == null || length <= 0)) {
      setError("Enter the length in millimetres.");
      return;
    }
    if (ask.widthRequired && (width == null || width <= 0)) {
      setError("Enter the width in millimetres.");
      return;
    }
    const over = overMaxMessage(selected, length, width);
    if (over) {
      setError(over);
      return;
    }
    onAdd({ product: selected, quantity: qty, lengthMm: length, widthMm: width });
    onClose();
  }

  useEffect(() => {
    if (!open || step !== "library") return;
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA");
      if (typing && event.key !== "Enter") return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const index = flat.findIndex((row) => row.id === selectedId);
        const next = event.key === "ArrowDown" ? index + 1 : index - 1;
        const row = flat[Math.max(0, Math.min(flat.length - 1, next))];
        if (row) setSelectedId(row.id);
      }
      if (event.key === "Enter" && selected) {
        event.preventDefault();
        choose(selected);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, step, flat, selectedId, selected]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeOnOutside={false}
      title="Add product"
      description={
        step === "family"
          ? "Choose a product family, or Cabinets."
          : step === "library"
            ? familyMeta?.label
            : step === "cabinets"
              ? "Cabinets library"
              : "How many do you want on this jobcard?"
      }
      className="max-w-2xl"
    >
      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

      {step === "family" && (
        <div className="grid gap-2 sm:grid-cols-2">
          {FAMILIES.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => openFamily(item.id)}
                className="flex items-center gap-3 rounded-xl border-2 border-border px-3 py-3 text-left transition-colors hover:border-[hsl(var(--neon-cyan)/0.55)]"
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${ACCENT[item.accent]}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <span>
                  <span className="block font-medium">{item.label}</span>
                  <span className="block text-xs text-muted-foreground">{item.hint}</span>
                </span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => {
              setError(null);
              setStep("cabinets");
            }}
            className="flex items-center gap-3 rounded-xl border-2 border-border px-3 py-3 text-left transition-colors hover:border-[hsl(var(--neon-cyan)/0.55)]"
          >
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${ACCENT.cyan}`}>
              <Boxes className="h-4 w-4" />
            </span>
            <span>
              <span className="block font-medium">Cabinets</span>
              <span className="block text-xs text-muted-foreground">Default cabinets library</span>
            </span>
          </button>
          <div className="sm:col-span-2 flex justify-end pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {step === "cabinets" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            The cabinets library is not open yet. Nothing can be added to the jobcard from here.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setStep("family")}>
              <ArrowLeft className="mr-1 h-3.5 w-3.5" />
              Back
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {step === "library" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setStep("family")}>
              <ArrowLeft className="mr-1 h-3.5 w-3.5" />
              Back
            </Button>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search this library…"
              aria-label="Search products"
              autoComplete="off"
              className="min-w-[12rem] flex-1"
            />
          </div>
          <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
            {flat.length === 0 ? (
              <p className="text-sm text-muted-foreground">No products in this family yet.</p>
            ) : (
              groups.map(([label, items]) => (
                <section key={label} className="space-y-1">
                  <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {label}
                  </h3>
                  {items.map((row) => {
                    const on = row.id === selectedId;
                    const rate = priceBasisShort(priceBasisOf(row.family, row.price_basis));
                    return (
                      <button
                        key={row.id}
                        type="button"
                        onClick={() => setSelectedId(row.id)}
                        onDoubleClick={() => choose(row)}
                        className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm ${
                          on
                            ? "border-[hsl(var(--neon-cyan)/0.7)] bg-[hsl(var(--neon-cyan)/0.12)]"
                            : "border-border hover:border-[hsl(var(--neon-cyan)/0.4)]"
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="block font-medium">{row.name}</span>
                          {maxSizeLabel(row) && (
                            <span className="block text-[11px] text-muted-foreground">
                              Max {maxSizeLabel(row)}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {formatMoney(row.retail_price)}
                          {rate ? ` ${rate}` : ""}
                        </span>
                      </button>
                    );
                  })}
                </section>
              ))
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" disabled={!selected} onClick={() => selected && choose(selected)}>
              Add
            </Button>
          </div>
        </div>
      )}

      {step === "quantity" && selected && ask && (
        <div className="space-y-3">
          <Button type="button" size="sm" variant="outline" onClick={() => setStep("library")}>
            <ArrowLeft className="mr-1 h-3.5 w-3.5" />
            Back
          </Button>
          <p className="text-sm font-medium">{selected.name}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>How many</Label>
              <Input
                autoFocus
                type="number"
                min="0.001"
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmQuantity();
                }}
              />
            </div>
            {ask.length && (
              <div className="space-y-1.5">
                <Label>Length mm{ask.lengthRequired ? "" : " (optional)"}</Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={lengthMm}
                  onChange={(e) => setLengthMm(e.target.value)}
                />
              </div>
            )}
            {ask.width && (
              <div className="space-y-1.5">
                <Label>Width mm{ask.widthRequired ? "" : " (optional)"}</Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={widthMm}
                  onChange={(e) => setWidthMm(e.target.value)}
                />
              </div>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {priceHelp(selected)}
            {sizeNote(selected)}
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" onClick={confirmQuantity}>
              Add
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
