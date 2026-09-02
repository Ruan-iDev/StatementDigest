"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, FileText, FolderOpen, Plus, Printer, Receipt } from "lucide-react";
import { cn, formatDate, formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { practiceApi } from "@/modules/practice/lib/api";
import { useModuleFlags } from "@/modules/practice/flags-provider";
import { tradingAsLine } from "@/modules/practice/pages/client-picker";
import { PdfPreviewModal, type PreviewPage } from "@/modules/practice/pages/pdf-preview-modal";
import { PartyFormModal } from "@/modules/practice/pages/party-form";
import {
  clientFileHref,
  documentEditorHref,
  type ClientFileTab,
  type PartyWrite,
  type PracticeDocument,
  type PracticeParty,
  type PracticeProject,
} from "@/modules/practice/lib/types";

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  on_hold: "On hold",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function PracticeClientFilePage() {
  const { flags, ready } = useModuleFlags();
  const router = useRouter();
  const search = useSearchParams();
  const id = Number(search.get("id") || "");
  const tabParam = search.get("tab") as ClientFileTab | null;

  const [client, setClient] = useState<PracticeParty | null>(null);
  const [quotes, setQuotes] = useState<PracticeDocument[]>([]);
  const [invoices, setInvoices] = useState<PracticeDocument[]>([]);
  const [projects, setProjects] = useState<PracticeProject[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<number | null>(null);
  const [printingId, setPrintingId] = useState<number | null>(null);
  const [preview, setPreview] = useState<{
    title: string;
    pages: PreviewPage[];
    documentId: number;
  } | null>(null);

  const validId = Number.isFinite(id) && id > 0;

  const tabs: {
    id: ClientFileTab;
    label: string;
    count: number;
    enabled: boolean;
    icon: typeof FileText;
    active: string;
    iconOn: string;
    chipOn: string;
  }[] = [
    {
      id: "quotes",
      label: "Quotes",
      count: quotes.length,
      enabled: flags.quotes_enabled,
      icon: FileText,
      active:
        "bg-[hsl(var(--neon-lime)/0.14)] text-foreground shadow-[inset_0_-3px_0_hsl(var(--neon-lime))]",
      iconOn: "text-[hsl(var(--neon-lime))]",
      chipOn: "bg-[hsl(var(--neon-lime)/0.22)] text-foreground",
    },
    {
      id: "invoices",
      label: "Invoices",
      count: invoices.length,
      enabled: flags.invoices_enabled,
      icon: Receipt,
      active:
        "bg-[hsl(var(--neon-magenta)/0.14)] text-foreground shadow-[inset_0_-3px_0_hsl(var(--neon-magenta))]",
      iconOn: "text-[hsl(var(--neon-magenta))]",
      chipOn: "bg-[hsl(var(--neon-magenta)/0.22)] text-foreground",
    },
    {
      id: "projects",
      label: "Projects",
      count: projects.length,
      enabled: flags.projects_enabled,
      icon: FolderOpen,
      active:
        "bg-[hsl(var(--neon-cyan)/0.14)] text-foreground shadow-[inset_0_-3px_0_hsl(var(--neon-cyan))]",
      iconOn: "text-[hsl(var(--neon-cyan))]",
      chipOn: "bg-[hsl(var(--neon-cyan)/0.22)] text-foreground",
    },
  ];
  const tab: ClientFileTab =
    (tabParam && tabs.some((t) => t.id === tabParam) && tabParam) || "quotes";

  async function load() {
    if (!validId) return;
    const [party, quoteList, invoiceList, projectList] = await Promise.all([
      practiceApi.parties.get(id),
      flags.quotes_enabled ? practiceApi.documents.list("quote", undefined, id) : Promise.resolve([]),
      flags.invoices_enabled ? practiceApi.documents.list("invoice", undefined, id) : Promise.resolve([]),
      flags.projects_enabled ? practiceApi.projects.list(false, id) : Promise.resolve([]),
    ]);
    if (party.kind !== "client") {
      setError("This file is for clients.");
      setClient(null);
      return;
    }
    setClient(party);
    setQuotes(quoteList);
    setInvoices(invoiceList);
    setProjects(projectList);
  }

  useEffect(() => {
    if (!ready || !validId) return;
    load().catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to open client file"));
  }, [id, validId, ready, flags.quotes_enabled, flags.invoices_enabled, flags.projects_enabled]);

  async function duplicateQuote(quoteId: number) {
    setDuplicatingId(quoteId);
    try {
      setError(null);
      const copy = await practiceApi.documents.duplicateQuote(quoteId);
      router.push(documentEditorHref({ kind: "quote", id: copy.id }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not duplicate quote");
    } finally {
      setDuplicatingId(null);
    }
  }

  async function printDocument(row: PracticeDocument) {
    setPrintingId(row.id);
    try {
      setError(null);
      const data = await practiceApi.documents.preview(row.id);
      setPreview({
        title: `${row.kind === "invoice" ? "Invoice" : "Quote"} ${data.number}`,
        pages: data.pages,
        documentId: row.id,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not open print preview");
    } finally {
      setPrintingId(null);
    }
  }

  function processQuoteToInvoice(row: PracticeDocument) {
    router.push(
      documentEditorHref({
        kind: "invoice",
        partyId: row.party_id,
        projectId: row.project_id,
        sourceQuoteId: row.id,
      })
    );
  }

  function setTab(next: ClientFileTab) {
    router.replace(clientFileHref(id, next));
  }

  async function saveDetails(body: PartyWrite) {
    if (!client) return;
    const next = await practiceApi.parties.update(client.id, body);
    setClient(next);
  }

  async function newProject() {
    if (!client) return;
    try {
      setError(null);
      const created = await practiceApi.projects.create({
        name: client.name,
        client_id: client.id,
      });
      router.push(`/practice/file?id=${created.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not open project");
    }
  }

  if (!validId) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{error || "Open a client from the Clients library."}</p>
        <Link href="/practice/clients" className="text-sm underline">
          Back to Clients
        </Link>
      </div>
    );
  }

  if (!client) {
    return <p className="text-sm text-muted-foreground">{error || "Opening client file…"}</p>;
  }

  const ta = tradingAsLine(client.name, client.trading_name);
  const listedProjects = [...projects].sort((a, b) => {
    const left = [a.reference || "", a.name].join(" ");
    const right = [b.reference || "", b.name].join(" ");
    return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
  });

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link
          href="/practice/clients"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Clients
        </Link>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-[hsl(var(--neon-amber))]">
          Client file
        </p>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="page-title">{client.name}</h1>
            {ta && <p className="page-subtitle">{ta}</p>}
            <p className="text-xs text-muted-foreground">
              {[
                client.contact_name,
                client.phone,
                client.email,
                client.city,
                client.vat_number ? `VAT ${client.vat_number}` : null,
              ]
                .filter(Boolean)
                .join(" · ") || "No contact details yet"}
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => setEditOpen(true)}>
            Edit details
          </Button>
        </div>
      </header>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <table
        className="client-file-tabs w-full border-collapse overflow-hidden rounded-xl border-2 border-border/80 bg-card/70"
        role="tablist"
        aria-label="Client file sections"
      >
        <colgroup>
          <col style={{ width: "33.333%" }} />
          <col style={{ width: "33.333%" }} />
          <col style={{ width: "33.333%" }} />
        </colgroup>
        <tbody>
          <tr>
            {tabs.map((opt, i) => {
              const Icon = opt.icon;
              const active = tab === opt.id;
              return (
                <td key={opt.id} className={cn("p-0 align-middle", i > 0 && "border-l border-border/80")}>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setTab(opt.id)}
                    className={cn(
                      "flex w-full flex-row items-center justify-center gap-2 whitespace-nowrap px-3 py-3 text-sm font-semibold tracking-tight",
                      active
                        ? opt.active
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                    )}
                  >
                    <Icon className={cn("h-4 w-4 shrink-0", active ? opt.iconOn : "opacity-70")} />
                    {opt.label}
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
                        active ? opt.chipOn : "bg-muted text-muted-foreground"
                      )}
                    >
                      {opt.count}
                    </span>
                  </button>
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>

      {tab === "quotes" && !flags.quotes_enabled && (
        <p className="text-sm text-muted-foreground">
          Quotes are off. Turn them on in Settings → Modules.
        </p>
      )}

      {tab === "quotes" && flags.quotes_enabled && (
        <section className="space-y-2">
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              onClick={() => router.push(documentEditorHref({ kind: "quote", partyId: client.id }))}
            >
              <Plus className="mr-1 h-4 w-4" />
              New quote
            </Button>
          </div>
          {quotes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No quotes linked to this client yet.</p>
          ) : (
            quotes.map((row) => (
              <Card
                key={row.id}
                className="cursor-pointer transition-colors hover:border-[hsl(var(--neon-lime)/0.45)]"
                onClick={() => router.push(documentEditorHref({ kind: "quote", id: row.id }))}
                onDoubleClick={() => router.push(documentEditorHref({ kind: "quote", id: row.id }))}
              >
                <CardContent className="flex flex-wrap items-start justify-between gap-3 py-4">
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium tabular-nums">{row.number}</span>
                      <Badge variant="outline">{row.status}</Badge>
                    </div>
                    <div className="text-sm">{row.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {[row.project_name, formatDate(row.issued_on)].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2" onClick={(e) => e.stopPropagation()}>
                    <span className="text-sm font-semibold tabular-nums">{formatMoney(row.amount)}</span>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={duplicatingId === row.id}
                        onClick={() => void duplicateQuote(row.id)}
                      >
                        {duplicatingId === row.id ? "Copying…" : "Duplicate"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={printingId === row.id}
                        onClick={() => void printDocument(row)}
                      >
                        <Printer className="mr-1 h-3.5 w-3.5" />
                        {printingId === row.id ? "Opening…" : "Print preview"}
                      </Button>
                      {flags.invoices_enabled && row.status !== "invoiced" && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => processQuoteToInvoice(row)}
                        >
                          Process to invoice
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </section>
      )}

      {tab === "invoices" && !flags.invoices_enabled && (
        <p className="text-sm text-muted-foreground">
          Invoices are off. Turn them on in Settings → Modules.
        </p>
      )}

      {tab === "invoices" && flags.invoices_enabled && (
        <section className="space-y-2">
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              onClick={() => router.push(documentEditorHref({ kind: "invoice", partyId: client.id }))}
            >
              <Plus className="mr-1 h-4 w-4" />
              New invoice
            </Button>
          </div>
          {invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">No invoices linked to this client yet.</p>
          ) : (
            invoices.map((row) => (
              <Card
                key={row.id}
                className="cursor-pointer transition-colors hover:border-[hsl(var(--neon-magenta)/0.45)]"
                onClick={() => router.push(documentEditorHref({ kind: "invoice", id: row.id }))}
                onDoubleClick={() => router.push(documentEditorHref({ kind: "invoice", id: row.id }))}
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
                      {[row.project_name, formatDate(row.issued_on), row.income_ledger_name]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2" onClick={(e) => e.stopPropagation()}>
                    <span className="text-sm font-semibold tabular-nums">{formatMoney(row.amount)}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={printingId === row.id}
                      onClick={() => void printDocument(row)}
                    >
                      <Printer className="mr-1 h-3.5 w-3.5" />
                      {printingId === row.id ? "Opening…" : "Print preview"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </section>
      )}

      {tab === "projects" && !flags.projects_enabled && (
        <p className="text-sm text-muted-foreground">
          Projects are off. Turn them on in Settings → Modules.
        </p>
      )}

      {tab === "projects" && flags.projects_enabled && (
        <section className="space-y-2">
          <div className="flex justify-end">
            <Button type="button" size="sm" onClick={() => void newProject()}>
              <Plus className="mr-1 h-4 w-4" />
              New project
            </Button>
          </div>
          {listedProjects.length === 0 ? (
            <p className="text-sm text-muted-foreground">No projects linked to this client yet.</p>
          ) : (
            listedProjects.map((row) => (
              <Card
                key={row.id}
                className="cursor-pointer transition-colors hover:border-[hsl(var(--neon-cyan)/0.45)]"
                onClick={() => router.push(`/practice/file?id=${row.id}`)}
                onDoubleClick={() => router.push(`/practice/file?id=${row.id}`)}
              >
                <CardContent className="flex flex-wrap items-start justify-between gap-3 py-4">
                  <div className="min-w-0 space-y-0.5">
                    <div className="font-medium">
                      {[row.reference || "—", row.name].join(" - ")}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {row.entry_count} {row.entry_count === 1 ? "entry" : "entries"}
                    </div>
                  </div>
                  <Badge variant="outline">{STATUS_LABEL[row.status] ?? row.status}</Badge>
                </CardContent>
              </Card>
            ))
          )}
        </section>
      )}

      <PartyFormModal
        open={editOpen}
        kind="client"
        initial={client}
        onClose={() => setEditOpen(false)}
        onSave={saveDetails}
      />
      <PdfPreviewModal
        open={Boolean(preview)}
        title={preview?.title || "Preview"}
        pages={preview?.pages || []}
        documentId={preview?.documentId}
        onClose={() => setPreview(null)}
      />
    </div>
  );
}
