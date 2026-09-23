"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cn, formatMoney, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { practiceApi } from "@/modules/practice/lib/api";
import { useModuleFlags } from "@/modules/practice/flags-provider";
import { FeatureOffPage } from "@/modules/practice/pages/disabled";
import { PdfPreviewModal, type PreviewPage } from "@/modules/practice/pages/pdf-preview-modal";
import { InvoiceBatchBar, InvoiceCheck } from "@/modules/practice/pages/invoice-batch";
import {
  documentEditorHref,
  documentStatusLabel,
  type DocumentKind,
  type PracticeDocument,
} from "@/modules/practice/lib/types";

type Props = {
  kind: DocumentKind;
};

export function PracticeDocumentsPage({ kind }: Props) {
  const router = useRouter();
  const { flags, ready } = useModuleFlags();
  const enabled = kind === "quote" ? flags.quotes_enabled : flags.invoices_enabled;
  const title = kind === "quote" ? "Quotes" : "Invoices";
  const accent = kind === "quote" ? "text-[hsl(var(--neon-lime))]" : "text-[hsl(var(--neon-magenta))]";

  const [rows, setRows] = useState<PracticeDocument[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [printing, setPrinting] = useState(false);
  const [preview, setPreview] = useState<{
    title: string;
    pages: PreviewPage[];
    documentId?: number;
    documentIds?: number[];
  } | null>(null);
  const isInvoiceList = kind === "invoice";
  const selectedCount = selected.size;
  const allSelected = rows.length > 0 && selectedCount === rows.length;
  const listFrom = kind === "quote" ? "/practice/quotes" : "/practice/invoices";

  async function load() {
    setRows(await practiceApi.documents.list(kind));
  }

  useEffect(() => {
    if (!ready || !enabled) return;
    load().catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, [kind, ready, enabled]);

  useEffect(() => {
    setSelected(new Set());
  }, [kind]);

  useEffect(() => {
    const ids = new Set(rows.map((row) => row.id));
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [rows]);

  function toggleSelected(id: number, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(on: boolean) {
    setSelected(on ? new Set(rows.map((row) => row.id)) : new Set());
  }

  async function printSelected() {
    const ids = rows.filter((row) => selected.has(row.id)).map((row) => row.id);
    if (ids.length === 0) return;
    setPrinting(true);
    try {
      setError(null);
      const data = await practiceApi.documents.batchPreview(ids);
      setPreview({
        title: data.title,
        pages: data.pages,
        documentIds: ids,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not open print preview");
    } finally {
      setPrinting(false);
    }
  }

  async function duplicateQuote(id: number) {
    setDuplicatingId(id);
    try {
      setError(null);
      const copy = await practiceApi.documents.duplicateQuote(id);
      router.push(documentEditorHref({ kind: "quote", id: copy.id, from: listFrom }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not duplicate quote");
    } finally {
      setDuplicatingId(null);
    }
  }

  if (ready && !enabled) {
    return <FeatureOffPage title={title} />;
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
          <p className={`text-xs font-medium uppercase tracking-[0.2em] ${accent}`}>Work Flow · {title}</p>
          <h1 className="page-title">{title}</h1>
          <p className="page-subtitle max-w-xl">
            Open a document to edit line items.
            {isInvoiceList
              ? " Tick invoices and use Print selected for a batch print."
              : ` New ${kind}s get the next number and pull company + client details.`}
          </p>
        </div>
        <Button type="button" onClick={() => router.push(documentEditorHref({ kind, from: listFrom }))}>
          New {kind}
        </Button>
      </header>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {isInvoiceList && rows.length > 0 && (
        <InvoiceBatchBar
          total={rows.length}
          selectedCount={selectedCount}
          allSelected={allSelected}
          onToggleAll={toggleAll}
          onPrint={() => void printSelected()}
          printing={printing}
        />
      )}

      <div className="space-y-2">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No {title.toLowerCase()} yet.</p>
        ) : (
          rows.map((row) => (
            <Card
              key={row.id}
              className={cn(
                "cursor-pointer transition-colors hover:border-[hsl(var(--neon-lime)/0.45)]",
                isInvoiceList && selected.has(row.id) && "border-[hsl(var(--neon-magenta)/0.55)]"
              )}
              onClick={() => router.push(documentEditorHref({ kind, id: row.id, from: listFrom }))}
            >
              <CardContent className="flex flex-wrap items-start justify-between gap-3 py-4">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    {isInvoiceList && (
                      <InvoiceCheck
                        checked={selected.has(row.id)}
                        onChange={(on) => toggleSelected(row.id, on)}
                        label={`Select ${row.number}`}
                      />
                    )}
                    <span className="font-medium tabular-nums">{row.number}</span>
                    <Badge variant={row.status === "paid" ? "danger" : "outline"}>
                      {documentStatusLabel(row.status)}
                    </Badge>
                    {row.source_quote_number && (
                      <span className="text-xs text-muted-foreground">from {row.source_quote_number}</span>
                    )}
                  </div>
                  <div className="text-sm">{row.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {[row.party_name, row.project_name, formatDate(row.issued_on), row.income_ledger_name]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2" onClick={(e) => e.stopPropagation()}>
                  <span className="text-sm font-semibold tabular-nums">{formatMoney(row.amount)}</span>
                  <div className="flex flex-wrap justify-end gap-2">
                    {kind === "quote" && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={duplicatingId === row.id}
                        onClick={() => void duplicateQuote(row.id)}
                      >
                        {duplicatingId === row.id ? "Copying…" : "Duplicate"}
                      </Button>
                    )}
                    {kind === "quote" && flags.invoices_enabled && row.status !== "invoiced" && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          router.push(
                            documentEditorHref({
                              kind: "invoice",
                              partyId: row.party_id,
                              projectId: row.project_id,
                              sourceQuoteId: row.id,
                              from: "/practice/invoices",
                            })
                          )
                        }
                      >
                        Create invoice
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
      <PdfPreviewModal
        open={Boolean(preview)}
        title={preview?.title || "Preview"}
        pages={preview?.pages || []}
        documentId={preview?.documentId}
        documentIds={preview?.documentIds}
        onClose={() => setPreview(null)}
      />
    </div>
  );
}
