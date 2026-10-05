"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { practiceApi } from "@/modules/practice/lib/api";
import { priceBasisLabel, priceBasisOf } from "@/modules/practice/lib/price-basis";
import { formatMoney } from "@/lib/utils";
import type { PracticeProduct, ProductFamily, ProductWrite } from "@/modules/practice/lib/types";
import { ProductFormModal } from "@/modules/practice/pages/product-form";

const FAMILIES: { id: ProductFamily; label: string; hint: string }[] = [
  {
    id: "timber",
    label: "Timber Products",
    hint: "Sheets and solid timber the nest can optimise. Price the whole item or a square metre.",
  },
  {
    id: "square_meter",
    label: "Square Meter Products",
    hint: "Granite, glass, paint, vinyl. Price the whole item or a square metre.",
  },
  {
    id: "linear_meter",
    label: "Linear Meter Products",
    hint: "Length-sold items. Price a unit or a metre.",
  },
  {
    id: "quantitative",
    label: "Quantitative Products",
    hint: "Counted items. This is the catalogue the quotes already use.",
  },
  {
    id: "labour",
    label: "Labour",
    hint: "Time and work, kept off the counted list.",
  },
];

type CategoryGroup = { key: string; label: string; items: PracticeProduct[] };

const EMPTY_DEFAULTS: Record<ProductFamily, string> = {
  timber: "",
  square_meter: "",
  linear_meter: "",
  quantitative: "",
  labour: "",
};

function percentText(value: string | number | null | undefined): string {
  if (value == null || value === "") return "";
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : "";
}

function samePercent(left: string, right: string): boolean {
  if (left.trim() === "" && right.trim() === "") return true;
  const a = Number(left);
  const b = Number(right);
  return Number.isFinite(a) && Number.isFinite(b) && a === b;
}

function groupByCategory(rows: PracticeProduct[]): CategoryGroup[] {
  const map = new Map<string, CategoryGroup>();
  for (const row of rows) {
    const raw = (row.category || "").trim();
    const key = raw.toLowerCase();
    const existing = map.get(key);
    if (existing) existing.items.push(row);
    else map.set(key, { key, label: raw || "No group", items: [row] });
  }
  return [...map.values()].sort((a, b) => {
    if (a.key === "" && b.key !== "") return 1;
    if (b.key === "" && a.key !== "") return -1;
    return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
  });
}

export function PracticeProductsLibraryPage({ homeHref = "/practice" }: { homeHref?: string }) {
  const inCabinet = homeHref.startsWith("/cabinet");
  const [family, setFamily] = useState<ProductFamily>("quantitative");
  const [defaults, setDefaults] = useState<Record<ProductFamily, string>>(EMPTY_DEFAULTS);
  const [savedDefaults, setSavedDefaults] = useState<Record<ProductFamily, string>>(EMPTY_DEFAULTS);
  const [rows, setRows] = useState<PracticeProduct[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PracticeProduct | null>(null);
  const active = FAMILIES.find((item) => item.id === family) ?? FAMILIES[0];

  async function load(search = query, nextFamily = family) {
    const [list, cats] = await Promise.all([
      practiceApi.products.list(false, search, 200, nextFamily),
      practiceApi.products.categories(nextFamily).catch(() => [] as string[]),
    ]);
    setRows(list);
    setCategories(cats);
  }

  function applyDefaults(map: Record<string, string | number | null>) {
    const next = { ...EMPTY_DEFAULTS };
    (Object.keys(EMPTY_DEFAULTS) as ProductFamily[]).forEach((id) => {
      next[id] = percentText(map[id]);
    });
    setDefaults(next);
    setSavedDefaults(next);
  }

  useEffect(() => {
    practiceApi.products
      .markupDefaults()
      .then(applyDefaults)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load default markups"));
  }, []);

  useEffect(() => {
    const delay = query.trim() ? 180 : 0;
    const t = window.setTimeout(() => {
      load(query, family).catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"));
    }, delay);
    return () => window.clearTimeout(t);
  }, [query, family]);

  async function commitDefault(id: ProductFamily) {
    const raw = defaults[id].trim();
    if (samePercent(raw, savedDefaults[id])) return;
    if (raw !== "" && !Number.isFinite(Number(raw))) {
      setError("Enter a markup percent, or leave it blank.");
      return;
    }
    try {
      setError(null);
      const saved = await practiceApi.products.saveMarkupDefault(id, raw === "" ? null : raw);
      applyDefaults(saved);
      if (id === family) await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not save the default markup");
    }
  }

  async function save(body: ProductWrite) {
    if (editing) await practiceApi.products.update(editing.id, body);
    else await practiceApi.products.create({ ...body, family });
    await load();
  }

  async function archive(id: number) {
    try {
      await practiceApi.products.update(id, { is_archived: true });
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not archive");
    }
  }

  function openNew() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(row: PracticeProduct) {
    setEditing(row);
    setFormOpen(true);
  }

  const groups = useMemo(() => groupByCategory(rows), [rows]);
  const showGroups = rows.some((row) => (row.category || "").trim());

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <Link
            href={homeHref}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" />
            {inCabinet ? "Cabinet Flow" : "Work Flow"}
          </Link>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-[hsl(var(--neon-lime))]">
            {inCabinet ? "Cabinet Flow · Same catalogue" : "Work Flow · Catalogue"}
          </p>
          <h1 className="page-title">Products</h1>
          <p className="page-subtitle max-w-xl">
            One catalogue for Work Flow and Cabinet Flow. Pick a family, then add the lines you
            quote. Cost stays here for you.
          </p>
        </div>
        <Button type="button" onClick={openNew}>
          Add product
        </Button>
      </header>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {FAMILIES.map((item) => {
          const selected = item.id === family;
          return (
            <div key={item.id} className="space-y-1.5">
              <label
                htmlFor={`markup-${item.id}`}
                className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
              >
                Default markup %
              </label>
              <Input
                id={`markup-${item.id}`}
                type="number"
                step="0.01"
                value={defaults[item.id]}
                onChange={(e) => setDefaults((current) => ({ ...current, [item.id]: e.target.value }))}
                onBlur={() => void commitDefault(item.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
                }}
                placeholder="—"
                aria-label={`${item.label} default markup percent`}
                className="h-8"
              />
              <Button
                type="button"
                size="sm"
                variant={selected ? "default" : "outline"}
                className="h-auto w-full whitespace-normal px-2 py-2 text-center leading-tight"
                onClick={() => setFamily(item.id)}
              >
                {item.label}
              </Button>
            </div>
          );
        })}
      </div>
      <p className="text-sm text-muted-foreground">{active.hint}</p>
      <p className="text-[11px] text-muted-foreground">
        A blank markup on a product uses the default above its family. Type a markup on the product
        to override it. Products that already have their own markup keep it until you clear that
        field.
      </p>

      <div className="max-w-md">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, category, description, or supplier code…"
          aria-label="Search products"
          autoComplete="off"
        />
      </div>

      <div className="space-y-6">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {query.trim()
              ? `No ${active.label.toLowerCase()} match "${query.trim()}".`
              : `No ${active.label.toLowerCase()} yet.`}
          </p>
        ) : showGroups ? (
          groups.map((group) => (
            <section key={group.key || "uncategorised"} className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {group.label}
                <span className="ml-2 font-normal normal-case tracking-normal">
                  {group.items.length}
                </span>
              </h2>
              {group.items.map((row) => (
                <ProductCard
                  key={row.id}
                  row={row}
                  defaultMarkup={defaults[family]}
                  onEdit={openEdit}
                  onArchive={(id) => void archive(id)}
                />
              ))}
            </section>
          ))
        ) : (
          <div className="space-y-2">
            {rows.map((row) => (
              <ProductCard
                key={row.id}
                row={row}
                defaultMarkup={defaults[family]}
                onEdit={openEdit}
                onArchive={(id) => void archive(id)}
              />
            ))}
          </div>
        )}
      </div>

      <ProductFormModal
        open={formOpen}
        initial={editing}
        family={family}
        defaultMarkup={defaults[family]}
        categories={categories}
        onClose={() => setFormOpen(false)}
        onSave={save}
      />
    </div>
  );
}

function mmLabel(value: string | number | null | undefined): string | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return String(n);
}

function sheetSize(row: PracticeProduct): string | null {
  if (
    row.family !== "timber" &&
    row.family !== "square_meter" &&
    row.family !== "linear_meter" &&
    row.family !== "quantitative"
  ) {
    return null;
  }
  const parts = [row.max_length_mm, row.max_width_mm, row.thickness_mm].map(mmLabel).filter(Boolean);
  return parts.length ? `${parts.join(" × ")} mm` : null;
}

function labourLabel(row: PracticeProduct): string | null {
  if (!row.cut_and_edge || !row.linked_labour?.length) return null;
  return row.linked_labour
    .map((link) => `${link.labour_name || "Labour"} × ${link.quantity} per sheet`)
    .join(", ");
}

function markupLabel(row: PracticeProduct, defaultMarkup: string): string | null {
  if (row.uses_default_markup) {
    const n = Number(defaultMarkup);
    if (!Number.isFinite(n)) return null;
    return `Markup ${n}% default`;
  }
  if (row.markup_percent == null || row.markup_percent === "") return null;
  const n = Number(row.markup_percent);
  if (!Number.isFinite(n)) return null;
  return `Markup ${n}%`;
}

function ProductCard({
  row,
  defaultMarkup,
  onEdit,
  onArchive,
}: {
  row: PracticeProduct;
  defaultMarkup: string;
  onEdit: (row: PracticeProduct) => void;
  onArchive: (id: number) => void;
}) {
  return (
    <Card
      className="cursor-pointer transition-colors hover:border-[hsl(var(--neon-lime)/0.45)]"
      onClick={() => onEdit(row)}
    >
      <CardContent className="flex flex-wrap items-start justify-between gap-3 py-4">
        <div className="min-w-0 space-y-0.5">
          <div className="font-medium">{row.name}</div>
          {row.description && (
            <div className="line-clamp-2 text-sm text-muted-foreground">{row.description}</div>
          )}
          <div className="text-xs text-muted-foreground">
            {[
              sheetSize(row),
              row.supplier_code ? `Supplier ${row.supplier_code}` : null,
              row.stock_code ? `Stock ${row.stock_code}` : null,
              row.cut_and_edge ? "Cut and Edge" : null,
              labourLabel(row),
              priceBasisLabel(priceBasisOf(row.family, row.price_basis)),
              row.supplier_stock_code ? `Code ${row.supplier_stock_code}` : null,
              `Cost ${formatMoney(row.cost_price)}`,
              markupLabel(row, defaultMarkup),
              `Retail ${formatMoney(row.retail_price)}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
        <div className="flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
          <Button type="button" size="sm" variant="outline" onClick={() => onEdit(row)}>
            Edit
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => onArchive(row.id)}>
            Archive
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
