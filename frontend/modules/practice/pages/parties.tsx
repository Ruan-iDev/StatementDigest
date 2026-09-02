"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { practiceApi } from "@/modules/practice/lib/api";
import { useModuleFlags } from "@/modules/practice/flags-provider";
import {
  clientFileHref,
  documentEditorHref,
  supplierFileHref,
  type PartyKind,
  type PartyWrite,
  type PracticeParty,
} from "@/modules/practice/lib/types";
import { PartyFormModal } from "@/modules/practice/pages/party-form";
import { openPdfPreview } from "@/modules/practice/lib/pdf-preview";

type Props = {
  kind: PartyKind;
};

export function PracticePartiesPage({ kind }: Props) {
  const router = useRouter();
  const { flags } = useModuleFlags();
  const isClient = kind === "client";
  const title = isClient ? "Clients" : "Suppliers";
  const noun = isClient ? "client" : "supplier";
  const accent = isClient ? "text-[hsl(var(--neon-amber))]" : "text-[hsl(var(--neon-violet))]";

  const [rows, setRows] = useState<PracticeParty[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PracticeParty | null>(null);

  async function load(search = query) {
    const list = await practiceApi.parties.list(kind, false, search, 200);
    setRows(list);
  }

  useEffect(() => {
    const delay = query.trim() ? 180 : 0;
    const t = window.setTimeout(() => {
      load(query).catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"));
    }, delay);
    return () => window.clearTimeout(t);
  }, [kind, query]);

  function openNew() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(row: PracticeParty) {
    setEditing(row);
    setFormOpen(true);
  }

  async function save(body: PartyWrite) {
    if (editing) await practiceApi.parties.update(editing.id, body);
    else await practiceApi.parties.create(kind, body);
    await load();
  }

  async function archive(id: number) {
    try {
      await practiceApi.parties.update(id, { is_archived: true });
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not archive");
    }
  }

  async function openStatementPdf(row: PracticeParty) {
    try {
      setError(null);
      const blob = await practiceApi.parties.statementPdf(row.id);
      openPdfPreview(blob, `Supplier statement · ${row.name}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not open statement");
    }
  }

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
          <p className={`text-xs font-medium uppercase tracking-[0.2em] ${accent}`}>
            Work Flow · {isClient ? "Debtors" : "Creditors"}
          </p>
          <h1 className="page-title">{title}</h1>
          <p className="page-subtitle max-w-xl">
            {isClient
              ? "Open a card to see this client's quotes, invoices, and projects. Edit still opens the details sheet."
              : "Open a card to see what you have spent with this supplier. Edit still opens the details sheet."}
          </p>
        </div>
        <Button type="button" onClick={openNew}>
          Add {noun}
        </Button>
      </header>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex max-w-md items-center gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={isClient ? "Search clients…" : "Search suppliers…"}
          aria-label={`Search ${title.toLowerCase()}`}
          className="min-w-0 flex-1"
          autoComplete="off"
        />
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </div>

      <div className="space-y-2">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {query.trim()
              ? `No ${title.toLowerCase()} match "${query.trim()}".`
              : `No ${title.toLowerCase()} yet.`}
          </p>
        ) : (
          rows.map((row) => (
            <Card
              key={row.id}
              className="cursor-pointer transition-colors hover:border-[hsl(var(--neon-amber)/0.45)]"
              onClick={() => {
                router.push(isClient ? clientFileHref(row.id) : supplierFileHref(row.id));
              }}
              onDoubleClick={() => {
                router.push(isClient ? clientFileHref(row.id) : supplierFileHref(row.id));
              }}
            >
              <CardContent className="flex flex-wrap items-start justify-between gap-3 py-4">
                <div className="min-w-0 space-y-0.5">
                  <div className="font-medium">{row.name}</div>
                  {row.trading_name && row.trading_name !== row.name && (
                    <div className="text-sm">t/a {row.trading_name}</div>
                  )}
                  <div className="text-xs text-muted-foreground">
                    {[
                      row.party_type === "business" ? "Business" : "Individual",
                      row.contact_name,
                      row.phone,
                      row.email,
                      row.city,
                      row.vat_number ? `VAT ${row.vat_number}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                  {isClient && flags.quotes_enabled && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => router.push(documentEditorHref({ kind: "quote", partyId: row.id }))}
                    >
                      Quote
                    </Button>
                  )}
                  {isClient && flags.invoices_enabled && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => router.push(documentEditorHref({ kind: "invoice", partyId: row.id }))}
                    >
                      Invoice
                    </Button>
                  )}
                  {!isClient && flags.projects_enabled && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void openStatementPdf(row)}
                    >
                      Statement
                    </Button>
                  )}
                  <Button type="button" size="sm" variant="outline" onClick={() => openEdit(row)}>
                    Edit
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => void archive(row.id)}>
                    Archive
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <PartyFormModal
        open={formOpen}
        kind={kind}
        initial={editing}
        onClose={() => setFormOpen(false)}
        onSave={save}
      />
    </div>
  );
}
