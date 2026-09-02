"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { TypeaheadSelect } from "@/components/ui/typeahead-select";
import type { PracticeProduct, ProductWrite } from "@/modules/practice/lib/types";

type Props = {
  open: boolean;
  initial?: PracticeProduct | null;
  categories?: string[];
  onClose: () => void;
  onSave: (body: ProductWrite) => Promise<void>;
};

const empty: ProductWrite = {
  name: "",
  category: "",
  description: "",
  supplier_stock_code: "",
  cost_price: "",
  markup_percent: "",
  retail_price: "",
};

function priceField(value: string | number | null | undefined): string {
  if (value == null || value === "") return "";
  return String(value);
}

function num(value: string | number | null | undefined): number {
  if (value == null || value === "") return NaN;
  const n = typeof value === "number" ? value : parseFloat(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

function moneyText(n: number): string {
  return n.toFixed(2);
}

function pctText(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

function retailFrom(cost: number, markup: number): number {
  return Math.round(cost * (1 + markup / 100) * 100) / 100;
}

function markupFrom(cost: number, retail: number): number {
  return Math.round(((retail - cost) / cost) * 10000) / 100;
}

export function ProductFormModal({ open, initial, categories = [], onClose, onSave }: Props) {
  const [form, setForm] = useState<ProductWrite>(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastPrice = useRef<"markup" | "retail" | null>(null);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      const storedMarkup = priceField(initial.markup_percent);
      const derivedMarkup =
        num(initial.cost_price) > 0 && num(initial.retail_price) > 0
          ? pctText(markupFrom(num(initial.cost_price), num(initial.retail_price)))
          : "";
      setForm({
        name: initial.name,
        category: initial.category || "",
        description: initial.description || "",
        supplier_stock_code: initial.supplier_stock_code || "",
        cost_price: priceField(initial.cost_price),
        markup_percent: storedMarkup || derivedMarkup,
        retail_price: priceField(initial.retail_price),
      });
      lastPrice.current = storedMarkup ? "markup" : "retail";
    } else {
      setForm(empty);
      lastPrice.current = null;
    }
    setError(null);
  }, [open, initial]);

  function onCost(raw: string) {
    const cost = num(raw);
    const markup = num(form.markup_percent);
    const retail = num(form.retail_price);
    const patch: ProductWrite = { ...form, cost_price: raw };
    if (Number.isFinite(cost) && cost > 0) {
      const keepMarkup = lastPrice.current === "markup" || lastPrice.current == null;
      if (keepMarkup && Number.isFinite(markup)) {
        patch.retail_price = moneyText(retailFrom(cost, markup));
      } else if (Number.isFinite(retail) && retail > 0) {
        patch.markup_percent = pctText(markupFrom(cost, retail));
      }
    }
    setForm(patch);
  }

  function onMarkup(raw: string) {
    lastPrice.current = "markup";
    const cost = num(form.cost_price);
    const markup = num(raw);
    const patch: ProductWrite = { ...form, markup_percent: raw };
    if (Number.isFinite(cost) && cost > 0 && Number.isFinite(markup)) {
      patch.retail_price = moneyText(retailFrom(cost, markup));
    }
    setForm(patch);
  }

  function onRetail(raw: string) {
    lastPrice.current = "retail";
    const cost = num(form.cost_price);
    const retail = num(raw);
    const patch: ProductWrite = { ...form, retail_price: raw };
    if (Number.isFinite(cost) && cost > 0 && Number.isFinite(retail) && retail > 0) {
      patch.markup_percent = pctText(markupFrom(cost, retail));
    }
    setForm(patch);
  }

  function set<K extends keyof ProductWrite>(key: K, value: ProductWrite[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const categoryOptions = useMemo(() => {
    const names = [...categories];
    const current = (form.category || "").trim();
    if (current && !names.some((n) => n.toLowerCase() === current.toLowerCase())) {
      names.push(current);
    }
    return names.map((c) => ({ id: c, label: c }));
  }, [categories, form.category]);

  async function save() {
    if (!form.name?.trim()) return;
    setBusy(true);
    try {
      setError(null);
      await onSave({
        name: form.name.trim(),
        category: form.category?.trim() || null,
        description: form.description?.trim() || null,
        supplier_stock_code: form.supplier_stock_code?.trim() || null,
        cost_price: form.cost_price === "" || form.cost_price == null ? "0" : form.cost_price,
        markup_percent:
          form.markup_percent === "" || form.markup_percent == null ? null : form.markup_percent,
        retail_price: form.retail_price === "" || form.retail_price == null ? "0" : form.retail_price,
      });
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeOnOutside={false}
      title={initial ? "Edit product" : "Add product"}
      description="Enter cost and markup to fill retail, or cost and retail to fill the markup. Retail is the rate that lands on a quote line."
      className="max-w-lg"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Product name</Label>
          <Input
            value={form.name || ""}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Red rose stem, site labour…"
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Category</Label>
          <TypeaheadSelect
            options={categoryOptions}
            value={form.category || ""}
            onChange={(id) => set("category", id)}
            allowCustom
            allowEmpty
            emptyLabel="No category"
            customHint="New category"
            maxLength={80}
            placeholder="Type a category or pick one…"
            emptyMessage="Type a name to add this category"
            aria-label="Category"
          />
          <p className="text-[11px] text-muted-foreground">
            No presets — type a name. Matching names group together on the list.
          </p>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Description</Label>
          <textarea
            value={form.description || ""}
            onChange={(e) => set("description", e.target.value)}
            rows={3}
            placeholder="What the customer sees on the quote line"
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Supplier stock code</Label>
          <Input
            value={form.supplier_stock_code || ""}
            onChange={(e) => set("supplier_stock_code", e.target.value)}
            placeholder="Their SKU / catalogue number — optional"
            autoComplete="off"
          />
        </div>
        <div className="sm:col-span-2 grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Cost price</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.cost_price == null ? "" : String(form.cost_price)}
              onChange={(e) => onCost(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Markup %</Label>
            <Input
              type="number"
              step="0.01"
              value={form.markup_percent == null ? "" : String(form.markup_percent)}
              onChange={(e) => onMarkup(e.target.value)}
              placeholder="e.g. 50"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Retail price</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.retail_price == null ? "" : String(form.retail_price)}
              onChange={(e) => onRetail(e.target.value)}
              placeholder="0.00"
            />
          </div>
        </div>
        <p className="sm:col-span-2 text-[11px] text-muted-foreground">
          Cost R100 and markup 50% → retail R150. Change retail and the % updates.
        </p>
        {error && <p className="sm:col-span-2 text-sm text-destructive">{error}</p>}
        <div className="sm:col-span-2 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void save()} disabled={busy || !form.name?.trim()}>
            {busy ? "Saving…" : initial ? "Save changes" : "Add product"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
