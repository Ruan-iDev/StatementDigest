"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { practiceApi } from "@/modules/practice/lib/api";
import { formatMoney } from "@/lib/utils";
import type { PracticeProduct, ProductWrite } from "@/modules/practice/lib/types";
import { ProductFormModal } from "@/modules/practice/pages/product-form";

type CategoryGroup = { key: string; label: string; items: PracticeProduct[] };

function groupByCategory(rows: PracticeProduct[]): CategoryGroup[] {
  const map = new Map<string, CategoryGroup>();
  for (const row of rows) {
    const raw = (row.category || "").trim();
    const key = raw.toLowerCase();
    const existing = map.get(key);
    if (existing) existing.items.push(row);
    else map.set(key, { key, label: raw || "Uncategorised", items: [row] });
  }
  return [...map.values()].sort((a, b) => {
    if (a.key === "" && b.key !== "") return 1;
    if (b.key === "" && a.key !== "") return -1;
    return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
  });
}

export function PracticeProductsLibraryPage() {
  const [rows, setRows] = useState<PracticeProduct[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PracticeProduct | null>(null);

  async function load(search = query) {
    const [list, cats] = await Promise.all([
      practiceApi.products.list(false, search, 200),
      practiceApi.products.categories().catch(() => [] as string[]),
    ]);
    setRows(list);
    setCategories(cats);
  }

  useEffect(() => {
    const delay = query.trim() ? 180 : 0;
    const t = window.setTimeout(() => {
      load(query).catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"));
    }, delay);
    return () => window.clearTimeout(t);
  }, [query]);

  async function save(body: ProductWrite) {
    if (editing) await practiceApi.products.update(editing.id, body);
    else await practiceApi.products.create(body);
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
            href="/practice"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" />
            Work Flow
          </Link>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-[hsl(var(--neon-lime))]">
            Work Flow · Catalogue
          </p>
          <h1 className="page-title">Products</h1>
          <p className="page-subtitle max-w-xl">
            Goods, labour, or anything else that repeats on a quote. Type the name on a line to pull
            the description and retail price. Cost stays here for you.
          </p>
        </div>
        <Button type="button" onClick={openNew}>
          Add product
        </Button>
      </header>

      {error && <p className="text-sm text-destructive">{error}</p>}

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
            {query.trim() ? `No products match "${query.trim()}".` : "No products yet."}
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
        categories={categories}
        onClose={() => setFormOpen(false)}
        onSave={save}
      />
    </div>
  );
}

function ProductCard({
  row,
  onEdit,
  onArchive,
}: {
  row: PracticeProduct;
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
              row.supplier_stock_code ? `Code ${row.supplier_stock_code}` : null,
              `Cost ${formatMoney(row.cost_price)}`,
              row.markup_percent != null && row.markup_percent !== ""
                ? `Markup ${Number(row.markup_percent).toLocaleString("en-ZA", { maximumFractionDigits: 2 })}%`
                : null,
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
