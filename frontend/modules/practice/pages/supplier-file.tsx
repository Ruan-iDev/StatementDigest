"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { formatDate, formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { practiceApi } from "@/modules/practice/lib/api";
import { tradingAsLine } from "@/modules/practice/pages/client-picker";
import { PartyFormModal } from "@/modules/practice/pages/party-form";
import { openPdfPreview } from "@/modules/practice/lib/pdf-preview";
import {
  documentEditorHref,
  RFQ_EXPANSION,
  type PartyWrite,
  type PracticeDocument,
  type PracticeParty,
  type SupplierStatement,
} from "@/modules/practice/lib/types";

export function PracticeSupplierFilePage() {
  const router = useRouter();
  const search = useSearchParams();
  const id = Number(search.get("id") || "");
  const [data, setData] = useState<SupplierStatement | null>(null);
  const [rfqs, setRfqs] = useState<PracticeDocument[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const validId = Number.isFinite(id) && id > 0;

  async function load() {
    const [stmt, docs] = await Promise.all([
      practiceApi.parties.statement(id),
      practiceApi.documents.list("rfq", undefined, id).catch(() => [] as PracticeDocument[]),
    ]);
    setData(stmt);
    setRfqs(docs);
  }

  useEffect(() => {
    if (!validId) {
      setError("Open a supplier from the Suppliers library.");
      return;
    }
    load().catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not open supplier"));
  }, [id, validId]);

  async function save(body: PartyWrite) {
    if (!data) return;
    await practiceApi.parties.update(data.party.id, body);
    await load();
  }

  if (!validId) {
    return <p className="text-sm text-muted-foreground">{error}</p>;
  }

  const party: PracticeParty | undefined = data?.party;
  const ta = party ? tradingAsLine(party.name, party.trading_name) : null;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link
          href="/practice/suppliers"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Suppliers
        </Link>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-[hsl(var(--neon-violet))]">
          Supplier statement
        </p>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="page-title">{party?.name || "Supplier"}</h1>
            {ta && <p className="page-subtitle">{ta}</p>}
            <p className="text-xs text-muted-foreground">
              {(party &&
                [party.contact_name, party.phone, party.email, party.city, party.vat_number ? `VAT ${party.vat_number}` : null]
                  .filter(Boolean)
                  .join(" · ")) ||
                "What you have spent with this supplier, by project."}
            </p>
          </div>
          {party && (
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col items-end gap-0.5">
                <Button
                  type="button"
                  onClick={() =>
                    router.push(documentEditorHref({ kind: "rfq", partyId: party.id }))
                  }
                >
                  <Plus className="mr-1 h-4 w-4" />
                  New RFQ
                </Button>
                <span className="text-[11px] text-muted-foreground">{RFQ_EXPANSION}</span>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void (async () => {
                    try {
                      setError(null);
                      const blob = await practiceApi.parties.statementPdf(party.id);
                      openPdfPreview(blob, `Supplier statement · ${party.name}`);
                    } catch (e: unknown) {
                      setError(e instanceof Error ? e.message : "Could not open statement");
                    }
                  })();
                }}
              >
                Statement
              </Button>
              <Button type="button" variant="outline" onClick={() => setEditOpen(true)}>
                Edit details
              </Button>
            </div>
          )}
        </div>
      </header>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card className="section-panel neon-violet border-2">
        <CardHeader>
          <CardDescription>Total spent</CardDescription>
          <CardTitle className="text-lg tabular-nums">
            {data ? formatMoney(data.totals.spent) : "…"}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {data ? `${data.totals.count} ${data.totals.count === 1 ? "expense" : "expenses"}` : ""}
          </p>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle>RFQs</CardTitle>
              <CardDescription>
                Requests sent to this supplier — item, description and quantity only.
              </CardDescription>
            </div>
            <span className="text-[11px] text-muted-foreground">{RFQ_EXPANSION}</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {rfqs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No RFQs yet. Create one to ask this supplier for prices.
            </p>
          ) : (
            rfqs.map((row) => (
              <button
                key={row.id}
                type="button"
                className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border border-transparent px-1 py-2 text-left text-sm hover:border-[hsl(var(--neon-violet)/0.45)]"
                onClick={() => router.push(documentEditorHref({ kind: "rfq", id: row.id }))}
              >
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium tabular-nums">{row.number}</span>
                    <Badge variant="outline">{row.status}</Badge>
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {[row.title, row.project_name, row.issued_on ? formatDate(row.issued_on) : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {row.lines?.length || 0} {(row.lines?.length || 0) === 1 ? "item" : "items"}
                </span>
              </button>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Spend</CardTitle>
          <CardDescription>Oldest at the top. Open a project to see the paper trail.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {!data || data.expenses.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No spend yet. Pick this supplier as the vendor on a project expense.
            </p>
          ) : (
            data.expenses.map((ex) => (
              <Link
                key={ex.id}
                href={`/practice/file?id=${ex.project_id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-transparent px-1 py-2 text-sm hover:border-[hsl(var(--neon-violet)/0.45)]"
              >
                <span className="min-w-0">
                  <span className="font-medium">{ex.description}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {[ex.project_name || "Project", ex.ledger_name, ex.incurred_on ? formatDate(ex.incurred_on) : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className="tabular-nums font-semibold">{formatMoney(ex.amount)}</span>
              </Link>
            ))
          )}
        </CardContent>
      </Card>

      {party && (
        <PartyFormModal
          open={editOpen}
          kind="supplier"
          initial={party}
          onClose={() => setEditOpen(false)}
          onSave={save}
        />
      )}
    </div>
  );
}
