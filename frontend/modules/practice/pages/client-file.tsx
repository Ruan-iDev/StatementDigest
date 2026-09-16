"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, FileText, FolderOpen, Plus, Printer, Receipt } from "lucide-react";
import { cn, formatDate, formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { practiceApi } from "@/modules/practice/lib/api";
import { useModuleFlags } from "@/modules/practice/flags-provider";
import { tradingAsLine } from "@/modules/practice/pages/client-picker";
import { PdfPreviewModal, type PreviewPage } from "@/modules/practice/pages/pdf-preview-modal";
import { InvoiceBatchBar, InvoiceCheck } from "@/modules/practice/pages/invoice-batch";
import { ProjectFileGrid } from "@/modules/practice/pages/project-file-grid";
import { PartyFormModal } from "@/modules/practice/pages/party-form";
import {
  clientFileHref,
  documentEditorHref,
  documentStatusLabel,
  type ClientFileTab,
  type PartyWrite,
  type PracticeDocument,
  type PracticeParty,
  type PracticeProject,
} from "@/modules/practice/lib/types";

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

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
  const [printingBatch, setPrintingBatch] = useState(false);
  const [selectedInvoices, setSelectedInvoices] = useState<Set<number>>(new Set());
  const [preview, setPreview] = useState<{
    title: string;
    pages: PreviewPage[];
    documentId?: number;
    documentIds?: number[];
  } | null>(null);
  const [payRow, setPayRow] = useState<PracticeDocument | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(todayIso);
  const [payMethod, setPayMethod] = useState("eft");
  const [payNote, setPayNote] = useState("");
  const [paying, setPaying] = useState(false);

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
    setSelectedInvoices((prev) => {
      const ids = new Set(invoiceList.map((row) => row.id));
      const next = new Set([...prev].filter((invoiceId) => ids.has(invoiceId)));
      return next.size === prev.size ? prev : next;
    });
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

  function toggleInvoice(invoiceId: number, on: boolean) {
    setSelectedInvoices((prev) => {
      const next = new Set(prev);
      if (on) next.add(invoiceId);
      else next.delete(invoiceId);
      return next;
    });
  }

  function toggleAllInvoices(on: boolean) {
    setSelectedInvoices(on ? new Set(invoices.map((row) => row.id)) : new Set());
  }

  async function printSelectedInvoices() {
    const ids = invoices.filter((row) => selectedInvoices.has(row.id)).map((row) => row.id);
    if (ids.length === 0) return;
    setPrintingBatch(true);
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
      setPrintingBatch(false);
    }
  }

  async function printDocument(row: PracticeDocument) {
    setPrintingId(row.id);
    const unlock = window.setTimeout(() => setPrintingId(null), 20_000);
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
      window.clearTimeout(unlock);
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

  function openPayment(row: PracticeDocument) {
    setPayRow(row);
    setPayAmount(String(row.amount));
    setPayDate(todayIso());
    setPayMethod("eft");
    setPayNote("");
  }

  async function submitPayment() {
    if (!payRow) return;
    const amount = Number(payAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a payment amount greater than zero");
      return;
    }
    setPaying(true);
    try {
      setError(null);
      await practiceApi.documents.paymentReceived(payRow.id, {
        amount,
        occurred_on: payDate || todayIso(),
        method: payMethod,
        note: payNote.trim() || null,
      });
      setPayRow(null);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not record payment");
    } finally {
      setPaying(false);
    }
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
                      <Badge variant="outline">{documentStatusLabel(row.status)}</Badge>
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <InvoiceBatchBar
              total={invoices.length}
              selectedCount={selectedInvoices.size}
              allSelected={invoices.length > 0 && selectedInvoices.size === invoices.length}
              onToggleAll={toggleAllInvoices}
              onPrint={() => void printSelectedInvoices()}
              printing={printingBatch}
            />
            <Button
              type="button"
              size="sm"
              className="ml-auto"
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
                className={cn(
                  "cursor-pointer transition-colors hover:border-[hsl(var(--neon-magenta)/0.45)]",
                  selectedInvoices.has(row.id) && "border-[hsl(var(--neon-magenta)/0.55)]"
                )}
                onClick={() => router.push(documentEditorHref({ kind: "invoice", id: row.id }))}
                onDoubleClick={() => router.push(documentEditorHref({ kind: "invoice", id: row.id }))}
              >
                <CardContent className="flex flex-wrap items-start justify-between gap-3 py-4">
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <InvoiceCheck
                        checked={selectedInvoices.has(row.id)}
                        onChange={(on) => toggleInvoice(row.id, on)}
                        label={`Select ${row.number}`}
                      />
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
                      {[row.project_name, formatDate(row.issued_on), row.income_ledger_name]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2" onClick={(e) => e.stopPropagation()}>
                    <span className="text-sm font-semibold tabular-nums">{formatMoney(row.amount)}</span>
                    <div className="flex flex-wrap justify-end gap-2">
                      {row.status !== "paid" && row.status !== "void" && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => openPayment(row)}
                        >
                          Payment received
                        </Button>
                      )}
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
          {projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">No projects linked to this client yet.</p>
          ) : (
            <ProjectFileGrid projects={projects} />
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
        documentIds={preview?.documentIds}
        onClose={() => setPreview(null)}
      />
      <Modal
        open={Boolean(payRow)}
        onClose={() => setPayRow(null)}
        title="Payment received"
        description={
          payRow
            ? `Mark ${payRow.number} as Paid. The invoice and its PDF printout get a Paid — Thank you stamp.`
            : undefined
        }
      >
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Amount received</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Date received</Label>
            <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Method</Label>
            <Select value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
              <option value="eft">EFT</option>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="other">Other</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Note</Label>
            <Input
              value={payNote}
              onChange={(e) => setPayNote(e.target.value)}
              placeholder="Deposit, progress payment, reference…"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setPayRow(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void submitPayment()} disabled={paying || !payAmount}>
              {paying ? "Saving…" : "Mark as Paid"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
