"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { TypeaheadSelect } from "@/components/ui/typeahead-select";
import { practiceApi } from "@/modules/practice/lib/api";
import {
  defaultPriceBasis,
  priceBasisOf,
  priceBasisOptions,
  retailCaption,
} from "@/modules/practice/lib/price-basis";
import type { PracticeProduct, ProductFamily, ProductWrite } from "@/modules/practice/lib/types";

type Props = {
  open: boolean;
  initial?: PracticeProduct | null;
  family?: ProductFamily | string;
  defaultMarkup?: string | number | null;
  categories?: string[];
  onClose: () => void;
  onSave: (body: ProductWrite) => Promise<void>;
};

const FAMILY_LABEL: Record<string, string> = {
  timber: "Timber",
  square_meter: "Square meter",
  linear_meter: "Linear meter",
  quantitative: "Quantitative",
  labour: "Labour",
};

const empty: ProductWrite = {
  name: "",
  category: "",
  description: "",
  supplier_stock_code: "",
  supplier_code: "",
  stock_code: "",
  max_length_mm: "",
  max_width_mm: "",
  thickness_mm: "",
  cut_and_edge: false,
  price_basis: null,
  linked_labour: [],
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

function sheetKind(
  family: string | null | undefined,
): "timber" | "square_meter" | "linear_meter" | "quantitative" | null {
  if (
    family === "timber" ||
    family === "square_meter" ||
    family === "linear_meter" ||
    family === "quantitative"
  ) {
    return family;
  }
  return null;
}

export function ProductFormModal({
  open,
  initial,
  family,
  defaultMarkup = null,
  categories = [],
  onClose,
  onSave,
}: Props) {
  const activeFamily = initial?.family || family;
  const sheet = sheetKind(activeFamily);
  const splitCodes = Boolean(sheet) || activeFamily === "labour";
  const basisOptions = priceBasisOptions(activeFamily);
  const familyDefault = num(defaultMarkup);
  const familyName = FAMILY_LABEL[activeFamily || ""] || "family";
  const [form, setForm] = useState<ProductWrite>(empty);
  const basis = priceBasisOf(activeFamily, form.price_basis);
  const sheetHost =
    activeFamily === "timber" || activeFamily === "square_meter" || activeFamily === "quantitative";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [labourChoices, setLabourChoices] = useState<PracticeProduct[]>([]);
  const [linking, setLinking] = useState(false);
  const [labourId, setLabourId] = useState("");
  const [labourQty, setLabourQty] = useState("1");
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
        supplier_code: initial.supplier_code || "",
        stock_code: initial.stock_code || "",
        max_length_mm: priceField(initial.max_length_mm),
        max_width_mm: priceField(initial.max_width_mm),
        thickness_mm: priceField(initial.thickness_mm),
        cut_and_edge: Boolean(initial.cut_and_edge),
        price_basis: priceBasisOf(initial.family || family, initial.price_basis),
        linked_labour: (initial.linked_labour || []).map((link) => ({
          labour_product_id: link.labour_product_id,
          quantity: priceField(link.quantity),
          labour_name: link.labour_name,
        })),
        cost_price: priceField(initial.cost_price),
        markup_percent: initial.uses_default_markup ? "" : storedMarkup || derivedMarkup,
        retail_price: priceField(initial.retail_price),
      });
      lastPrice.current = initial.uses_default_markup ? null : storedMarkup ? "markup" : "retail";
    } else {
      setForm({ ...empty, price_basis: defaultPriceBasis(family) });
      lastPrice.current = null;
    }
    setLinking(false);
    setLabourId("");
    setLabourQty("1");
    setError(null);
  }, [open, initial, family]);

  useEffect(() => {
    if (!open || !sheetHost) return;
    practiceApi.products
      .list(false, "", 200, "labour")
      .then(setLabourChoices)
      .catch(() => setLabourChoices([]));
  }, [open, sheetHost]);

  function onCost(raw: string) {
    const cost = num(raw);
    const typed = num(form.markup_percent);
    const markupBlank = form.markup_percent === "" || form.markup_percent == null;
    const markup = !markupBlank && Number.isFinite(typed) ? typed : familyDefault;
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

  function useFamilyDefault() {
    lastPrice.current = null;
    const cost = num(form.cost_price);
    const patch: ProductWrite = { ...form, markup_percent: "" };
    if (Number.isFinite(cost) && cost > 0 && Number.isFinite(familyDefault)) {
      patch.retail_price = moneyText(retailFrom(cost, familyDefault));
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

  function labourName(link: { labour_product_id: number; labour_name?: string | null }) {
    return (
      link.labour_name ||
      labourChoices.find((row) => row.id === link.labour_product_id)?.name ||
      "Labour"
    );
  }

  function linkLabour() {
    const id = Number(labourId);
    const qty = Number(labourQty);
    if (!Number.isFinite(id) || id <= 0) {
      setError("Choose a labour item.");
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      setError("Enter the quantity per sheet.");
      return;
    }
    const current = form.linked_labour || [];
    if (current.some((link) => link.labour_product_id === id)) {
      setError("That labour is already linked.");
      return;
    }
    const chosen = labourChoices.find((row) => row.id === id);
    setError(null);
    set("linked_labour", [
      ...current,
      { labour_product_id: id, quantity: labourQty, labour_name: chosen?.name || "Labour" },
    ]);
    setLinking(false);
    setLabourId("");
    setLabourQty("1");
  }

  function removeLabour(link: { labour_product_id: number; labour_name?: string | null }) {
    const name = labourName(link);
    if (!window.confirm(`Are you sure you want to remove ${name}?`)) return;
    set(
      "linked_labour",
      (form.linked_labour || []).filter((item) => item.labour_product_id !== link.labour_product_id),
    );
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
        supplier_stock_code: splitCodes ? null : form.supplier_stock_code?.trim() || null,
        supplier_code: splitCodes ? form.supplier_code?.trim() || null : null,
        stock_code: splitCodes ? form.stock_code?.trim() || null : null,
        max_length_mm: sheet && form.max_length_mm !== "" ? form.max_length_mm : null,
        max_width_mm: sheet && form.max_width_mm !== "" ? form.max_width_mm : null,
        thickness_mm: sheet && form.thickness_mm !== "" ? form.thickness_mm : null,
        cut_and_edge: Boolean(form.cut_and_edge),
        price_basis: basisOptions.length ? basis : null,
        linked_labour: sheetHost
          ? (form.linked_labour || []).map((link) => ({
              labour_product_id: link.labour_product_id,
              quantity: link.quantity,
            }))
          : null,
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
      description={
        basisOptions.length
          ? "Enter cost and markup to fill retail, or cost and retail to fill the markup. The price switch chooses whether that retail is for one item or for the measured size."
          : "Enter cost and markup to fill retail, or cost and retail to fill the markup. Retail is the rate that lands on a quote line."
      }
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
          <Label>Group</Label>
          <TypeaheadSelect
            options={categoryOptions}
            value={form.category || ""}
            onChange={(id) => set("category", id)}
            allowCustom
            allowEmpty
            emptyLabel="No group"
            customHint="Create group"
            maxLength={80}
            placeholder="Type a group or pick one…"
            emptyMessage="That group is not on the list. Choose Create group."
            aria-label="Group"
          />
          <p className="text-[11px] text-muted-foreground">
            Products with the same group sit together in the jobcard library. Type a name that is
            not on the list, then choose Create group.
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
        <label className="flex items-start gap-2 sm:col-span-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={Boolean(form.cut_and_edge)}
            onChange={(e) => set("cut_and_edge", e.target.checked)}
          />
          <span>
            <span className="font-medium">Cut and Edge</span>
            <span className="mt-0.5 block text-[11px] text-muted-foreground">
              Off by default. The jobcard adds this product as it is, and the optimizer skips it.
              On asks for the cut size. Timber, square metre, and quantitative products can then
              link labour that follows the sheets those pieces use.
            </span>
          </span>
        </label>
        {sheetHost && form.cut_and_edge ? (
          <div className="space-y-2 sm:col-span-2 rounded-md border border-border p-3">
            <Label>Assigned labour</Label>
            <p className="text-[11px] text-muted-foreground">
              Add a labour item, such as cutting per sheet, and set how much of it belongs to one
              sheet. On a jobcard, pieces of this product share sheets. Ten sizes on one sheet add
              the labour once. A second sheet adds it again. Max length and max width are that
              sheet. With either side blank, each piece counts as its own sheet.
            </p>
            {(form.linked_labour || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No labour linked yet.</p>
            ) : (
              <ul className="space-y-1">
                {(form.linked_labour || []).map((link) => (
                  <li key={link.labour_product_id} className="flex items-center justify-between gap-2 text-sm">
                    <span>
                      {labourName(link)}
                      <span className="text-muted-foreground"> · {String(link.quantity)} per sheet</span>
                    </span>
                    <Button type="button" size="sm" variant="ghost" onClick={() => removeLabour(link)}>
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {linking ? (
              <div className="grid gap-2 sm:grid-cols-[1fr_8rem_auto_auto]">
                <Select aria-label="Labour item" value={labourId} onChange={(e) => setLabourId(e.target.value)}>
                  <option value="">Choose labour</option>
                  {labourChoices.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </Select>
                <Input
                  aria-label="Quantity per sheet"
                  type="number"
                  min="0.001"
                  step="1"
                  value={labourQty}
                  onChange={(e) => setLabourQty(e.target.value)}
                />
                <Button type="button" size="sm" onClick={linkLabour}>
                  Link
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setLinking(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setLinking(true);
                  setLabourQty("1");
                  setError(null);
                }}
              >
                Add labour
              </Button>
            )}
            {linking && labourChoices.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">Add a labour product first, then link it here.</p>
            ) : null}
          </div>
        ) : null}
        {sheet ? (
          <>
            <div className="space-y-1.5">
              <Label>Max length (mm)</Label>
              <Input
                type="number"
                min="0"
                step="1"
                value={form.max_length_mm == null ? "" : String(form.max_length_mm)}
                onChange={(e) => set("max_length_mm", e.target.value)}
                placeholder={sheet === "square_meter" ? "3000" : sheet === "timber" ? "2750" : ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Max width (mm)</Label>
              <Input
                type="number"
                min="0"
                step="1"
                value={form.max_width_mm == null ? "" : String(form.max_width_mm)}
                onChange={(e) => set("max_width_mm", e.target.value)}
                placeholder={sheet === "square_meter" ? "2500" : sheet === "timber" ? "1830" : ""}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Thickness (mm)</Label>
              <Input
                type="number"
                min="0"
                step="0.1"
                value={form.thickness_mm == null ? "" : String(form.thickness_mm)}
                onChange={(e) => set("thickness_mm", e.target.value)}
                placeholder={sheet === "square_meter" ? "20" : sheet === "timber" ? "16" : ""}
                className="sm:max-w-[12rem]"
              />
            </div>
            <p className="text-[11px] text-muted-foreground sm:col-span-2">
              {sheet === "square_meter"
                ? "A jobcard size larger than the maximum cannot be added. Paint can be 1000 × 1000. A slab can be its real size, for example 3000 × 2500. Leave a side blank when it has no limit."
                : sheet === "linear_meter"
                  ? "A jobcard length larger than the max length cannot be added. Leave a measurement blank when it has no limit."
                  : sheet === "quantitative"
                    ? "Stored on the product. A counted jobcard line asks for how many. Leave a measurement blank when you do not need it."
                    : "A jobcard size larger than the maximum cannot be added. Leave a side blank when it has no limit."}
            </p>
          </>
        ) : null}
        {splitCodes ? (
          <>
            <div className="space-y-1.5">
              <Label>Supplier code</Label>
              <Input
                value={form.supplier_code || ""}
                onChange={(e) => set("supplier_code", e.target.value)}
                placeholder="Supplier's code"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Stock code</Label>
              <Input
                value={form.stock_code || ""}
                onChange={(e) => set("stock_code", e.target.value)}
                placeholder="Your stock code"
                autoComplete="off"
              />
            </div>
          </>
        ) : (
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Supplier stock code</Label>
            <Input
              value={form.supplier_stock_code || ""}
              onChange={(e) => set("supplier_stock_code", e.target.value)}
              placeholder="Their SKU / catalogue number — optional"
              autoComplete="off"
            />
          </div>
        )}
        {basisOptions.length > 0 && basis ? (
          <div className="space-y-1.5 sm:col-span-2">
            <Label>How this product is priced</Label>
            <div className="flex flex-wrap gap-2" role="group" aria-label="How this product is priced">
              {basisOptions.map((option) => (
                <Button
                  key={option.id}
                  type="button"
                  size="sm"
                  variant={basis === option.id ? "default" : "outline"}
                  aria-pressed={basis === option.id}
                  onClick={() => set("price_basis", option.id)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {basis === "square_meter"
                ? "The jobcard multiplies this retail by the square metres."
                : basis === "meter"
                  ? "The jobcard multiplies this retail by the metres."
                  : basis === "unit"
                    ? "The jobcard multiplies this retail by how many units."
                    : "The jobcard multiplies this retail by how many whole items."}
              {" "}The number stays as you type it when you switch.
            </p>
          </div>
        ) : null}
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
              placeholder={Number.isFinite(familyDefault) ? String(familyDefault) : "e.g. 50"}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{retailCaption(basis)}</Label>
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
        <div className="sm:col-span-2 space-y-1 text-[11px] text-muted-foreground">
          <p>Cost R100 and markup 50% → retail R150. Change retail and the % updates.</p>
          {Number.isFinite(familyDefault) && (form.markup_percent === "" || form.markup_percent == null) ? (
            <p>Using the {familyName} default of {familyDefault}%.</p>
          ) : Number.isFinite(familyDefault) ? (
            <p>
              This overrides the {familyName} default of {familyDefault}%.{" "}
              <button type="button" className="underline" onClick={useFamilyDefault}>
                Use the default
              </button>
            </p>
          ) : (
            <p>Leave the markup blank until a default is set above this family.</p>
          )}
        </div>
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
