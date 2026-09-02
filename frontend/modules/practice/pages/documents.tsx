"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { formatMoney, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { practiceApi } from "@/modules/practice/lib/api";
import { useModuleFlags } from "@/modules/practice/flags-provider";
import { FeatureOffPage } from "@/modules/practice/pages/disabled";
import { documentEditorHref, type DocumentKind, type PracticeDocument } from "@/modules/practice/lib/types";

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

  async function load() {
    setRows(await practiceApi.documents.list(kind));
  }

  useEffect(() => {
    if (!ready || !enabled) return;
    load().catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, [kind, ready, enabled]);

  async function duplicateQuote(id: number) {
    setDuplicatingId(id);
    try {
      setError(null);
      const copy = await practiceApi.documents.duplicateQuote(id);
      router.push(documentEditorHref({ kind: "quote", id: copy.id }));
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
            Open a document to edit line items. New {kind}s get the next number and pull company + client
            details.
          </p>
        </div>
        <Button type="button" onClick={() => router.push(documentEditorHref({ kind }))}>
          New {kind}
        </Button>
      </header>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="space-y-2">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No {title.toLowerCase()} yet.</p>
        ) : (
          rows.map((row) => (
            <Card
              key={row.id}
              className="cursor-pointer transition-colors hover:border-[hsl(var(--neon-lime)/0.45)]"
              onClick={() => router.push(documentEditorHref({ kind, id: row.id }))}
            >
              <CardContent className="flex flex-wrap items-start justify-between gap-3 py-4">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium tabular-nums">{row.number}</span>
                    <Badge variant="outline">{row.status}</Badge>
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
    </div>
  );
}
