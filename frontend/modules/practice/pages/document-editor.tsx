"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ImagePlus, Plus, Printer, Trash2 } from "lucide-react";
import { api, type Ledger } from "@/lib/api";
import { formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { practiceApi } from "@/modules/practice/lib/api";
import { useModuleFlags } from "@/modules/practice/flags-provider";
import { FeatureOffPage } from "@/modules/practice/pages/disabled";
import { ClientPicker, partyToCard, tradingAsLine } from "@/modules/practice/pages/client-picker";
import { ProductItemField } from "@/modules/practice/pages/product-item-field";
import { PdfPreviewModal, type PreviewPage } from "@/modules/practice/pages/pdf-preview-modal";
import type {
  AddressCard,
  BankSnapshot,
  DocumentKind,
  DocumentLine,
  NoteBlock,
  PracticeProduct,
} from "@/modules/practice/lib/types";

type NoteBlockView = NoteBlock & { id: string; url?: string };

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function blocksFromNotes(notes: string | null | undefined, json?: NoteBlock[] | null): NoteBlockView[] {
  if (json && json.length) {
    return json.map((b) => ({
      id: newId(),
      type: b.type,
      body: b.body || "",
      path: b.path,
      filename: b.filename,
    }));
  }
  return [{ id: newId(), type: "text", body: notes || "" }];
}

async function hydrateImages(blocks: NoteBlockView[]): Promise<NoteBlockView[]> {
  const next = [...blocks];
  for (let i = 0; i < next.length; i++) {
    const b = next[i];
    if (b.type === "image" && b.path && !b.url) {
      const url = await practiceApi.documents.noteImageObjectUrl(b.path);
      next[i] = { ...b, url: url || undefined };
    }
  }
  return next;
}

function money(n: string | number | undefined): number {
  const v = typeof n === "string" ? parseFloat(n) : n;
  return Number.isFinite(v) ? v! : 0;
}

function lineAmount(line: DocumentLine): number {
  return money(line.quantity) * money(line.unit_price);
}

/** Qty 0 = heading / note line: hide qty, rate, and line total on the sheet. */
function isZeroQty(line: DocumentLine): boolean {
  return money(line.quantity) === 0;
}

function LineText({
  value,
  onChange,
  onKeyDown,
  placeholder,
  itemIndex,
}: {
  value: string;
  onChange: (next: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  itemIndex?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.max(36, el.scrollHeight)}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      data-line-item={itemIndex}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      className="min-h-[36px] w-full min-w-0 resize-none overflow-hidden rounded-md border border-input bg-background px-2 py-1.5 text-left text-sm leading-snug shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{ textAlign: "left", verticalAlign: "top" }}
    />
  );
}

function AddressBlock({
  title,
  card,
  emptyHint,
}: {
  title?: string;
  card: AddressCard | null | undefined;
  emptyHint?: string;
}) {
  if (!card || !(card.name || card.trading_name)) {
    return (
      <div>
        {title ? (
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
        ) : null}
        <p className="mt-1 text-sm text-muted-foreground">
          {emptyHint || "No details yet — fill them on the client or My Profile."}
        </p>
      </div>
    );
  }
  const displayName = card.name || card.trading_name;
  const ta = card.name ? tradingAsLine(card.name, card.trading_name) : null;
  const lines = [
    ta,
    card.contact_name,
    card.address_line1,
    card.address_line2,
    [card.city, card.postal_code].filter(Boolean).join(" "),
    card.country,
    card.email,
    card.phone,
    card.business_registration_number ? `Reg ${card.business_registration_number}` : null,
    card.vat_number ? `VAT ${card.vat_number}` : null,
  ].filter(Boolean) as string[];

  return (
    <div>
      {title ? (
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      ) : null}
      <p className={title ? "mt-1 text-sm font-semibold" : "text-sm font-semibold"}>{displayName}</p>
      {ta ? <p className="text-sm font-medium">{ta}</p> : null}
      <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
        {lines.filter((l) => l !== ta).map((l) => (
          <p key={l}>{l}</p>
        ))}
      </div>
    </div>
  );
}

export function PracticeDocumentEditorPage() {
  const router = useRouter();
  const search = useSearchParams();
  const { flags, ready } = useModuleFlags();
  const kind = (search.get("kind") === "invoice" ? "invoice" : "quote") as DocumentKind;
  const existingId = Number(search.get("id") || "") || null;
  const partyIdParam = Number(search.get("party_id") || "") || null;
  const projectIdParam = Number(search.get("project_id") || "") || null;
  const sourceQuoteId = Number(search.get("source_quote_id") || "") || null;

  const enabled = kind === "quote" ? flags.quotes_enabled : flags.invoices_enabled;
  const label = kind === "quote" ? "Quote" : "Invoice";

  const [number, setNumber] = useState("");
  const [title, setTitle] = useState("");
  const [issuedOn, setIssuedOn] = useState("");
  const [notes, setNotes] = useState<NoteBlockView[]>([{ id: newId(), type: "text", body: "" }]);
  const [partyId, setPartyId] = useState<number | null>(partyIdParam);
  const [projectId, setProjectId] = useState<number | null>(projectIdParam);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [incomeLedgerId, setIncomeLedgerId] = useState("");
  const [issuer, setIssuer] = useState<AddressCard | null>(null);
  const [client, setClient] = useState<AddressCard | null>(null);
  const [lines, setLines] = useState<DocumentLine[]>([
    { item: "", description: "", quantity: "1", unit_price: "0" },
  ]);
  const [products, setProducts] = useState<PracticeProduct[]>([]);
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [currency, setCurrency] = useState("ZAR");
  const [vatEnabled, setVatEnabled] = useState(false);
  const [vatRate, setVatRate] = useState(15);
  const [bank, setBank] = useState<BankSnapshot | null>(null);
  const [disclaimer, setDisclaimer] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [savedId, setSavedId] = useState<number | null>(existingId);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    title: string;
    pages: PreviewPage[];
    documentId: number;
  } | null>(null);
  const lastSaved = useRef("");
  const allowLeave = useRef(false);

  const incomeLedgers = useMemo(
    () => ledgers.filter((l) => l.type === "income" && !l.is_archived),
    [ledgers]
  );
  const subtotal = lines.reduce((s, l) => s + lineAmount(l), 0);
  const vatAmount = vatEnabled ? subtotal * (vatRate / 100) : 0;
  const totalIncl = vatEnabled ? subtotal + vatAmount : subtotal;

  useEffect(() => {
    if (!ready || !enabled) return;
    let cancelled = false;
    async function boot() {
      try {
        const [ledgerList, productList] = await Promise.all([
          api.ledgers.list(),
          practiceApi.products.list(false, undefined, 200).catch(() => [] as PracticeProduct[]),
        ]);
        if (cancelled) return;
        setLedgers(ledgerList);
        setProducts(productList);
        if (existingId) {
          const doc = await practiceApi.documents.get(existingId);
          if (cancelled) return;
          setSavedId(doc.id);
          setNumber(doc.number);
          setTitle(doc.title);
          setIssuedOn(doc.issued_on || "");
          setNotes(await hydrateImages(blocksFromNotes(doc.notes, doc.notes_json)));
          setPartyId(doc.party_id);
          setProjectId(doc.project_id);
          setProjectName(doc.project_name);
          setIncomeLedgerId(doc.income_ledger_id ? String(doc.income_ledger_id) : "");
          setIssuer(doc.issuer || null);
          setClient(doc.client || null);
          setVatEnabled(Boolean(doc.vat_enabled));
          setVatRate(Number(doc.vat_rate || 15));
          setBank(doc.bank || null);
          setDisclaimer(doc.disclaimer || null);
          setLines(
            doc.lines?.length
              ? doc.lines.map((l) => ({
                  item: l.item || "",
                  description: l.description,
                  quantity: String(l.quantity),
                  unit_price: String(l.unit_price),
                }))
              : [{ item: "", description: "", quantity: "1", unit_price: "0" }]
          );
        } else {
          const prep = await practiceApi.documents.prepare(kind, {
            partyId: partyIdParam || undefined,
            projectId: projectIdParam || undefined,
          });
          if (cancelled) return;
          setNumber(prep.number);
          setTitle("");
          setIssuedOn(prep.issued_on || new Date().toISOString().slice(0, 10));
          setIssuer(prep.issuer);
          setClient(prep.client);
          setPartyId(prep.party_id);
          setProjectId(prep.project_id);
          setProjectName(prep.project_name);
          setCurrency(prep.currency);
          setVatEnabled(Boolean(prep.vat_enabled));
          setVatRate(Number(prep.vat_rate || 15));
          setBank(prep.bank);
          setDisclaimer(prep.disclaimer);
          if (prep.default_income_ledger_id) setIncomeLedgerId(String(prep.default_income_ledger_id));
          if (sourceQuoteId) {
            const quote = await practiceApi.documents.get(sourceQuoteId);
            if (cancelled) return;
            setTitle(quote.title);
            setNotes(await hydrateImages(blocksFromNotes(quote.notes, quote.notes_json)));
            setPartyId(quote.party_id);
            setProjectId(quote.project_id);
            setProjectName(quote.project_name);
            setClient(quote.client || prep.client);
            if (quote.lines?.length) {
              setLines(
                quote.lines.map((l) => ({
                  item: l.item || "",
                  description: l.description,
                  quantity: String(l.quantity),
                  unit_price: String(l.unit_price),
                }))
              );
            }
          }
        }
        const logo = await practiceApi.branding.logoObjectUrl();
        if (!cancelled) {
          setLogoUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return logo;
          });
        }
        setLoaded(true);
        lastSaved.current = "";
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not open document");
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, [ready, enabled, existingId, kind, partyIdParam, projectIdParam, sourceQuoteId]);

  useEffect(() => {
    return () => {
      setNotes((blocks) => {
        blocks.forEach((b) => {
          if (b.url) URL.revokeObjectURL(b.url);
        });
        return blocks;
      });
    };
  }, []);

  useEffect(() => {
    if (!ready || !enabled) return;
    async function pullIssuer() {
      try {
        const brand = await practiceApi.branding.get();
        const src = brand.use_profile_issuer ? brand.profile_issuer : brand.issuer;
        const live = (src?.name || src?.trading_name || "").trim() ? src : brand.profile_issuer;
        if (live && (live.name || live.trading_name)) {
          setIssuer(live);
        }
        const logo = await practiceApi.branding.logoObjectUrl();
        if (logo) {
          setLogoUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return logo;
          });
        }
      } catch {
        /* leave whatever is already on the document */
      }
    }
    void pullIssuer();
    const onFocus = () => void pullIssuer();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [ready, enabled]);

  if (ready && !enabled) {
    return <FeatureOffPage title={`${label}s`} />;
  }

  function setLine(index: number, patch: Partial<DocumentLine>) {
    setLines((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addLineItem() {
    const nextIndex = lines.length;
    setLines((rows) => [...rows, { item: "", description: "", quantity: "1", unit_price: "0" }]);
    window.requestAnimationFrame(() => {
      const el = document.querySelector<HTMLTextAreaElement>(`textarea[data-line-item="${nextIndex}"]`);
      el?.focus();
    });
  }

  function onLineKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      addLineItem();
    }
  }

  function formFingerprint() {
    return JSON.stringify({
      title,
      issuedOn,
      partyId,
      incomeLedgerId,
      lines,
      notes: notes.map((b) =>
        b.type === "image" ? { t: "i", p: b.path || "" } : { t: "x", b: b.body || "" }
      ),
    });
  }

  const dirty = loaded && lastSaved.current !== "" && formFingerprint() !== lastSaved.current;

  useEffect(() => {
    if (!loaded) return;
    if (!lastSaved.current) lastSaved.current = formFingerprint();
  }, [loaded]);

  useEffect(() => {
    if (!dirty) return;
    const onBefore = (e: BeforeUnloadEvent) => {
      if (allowLeave.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBefore);
    return () => window.removeEventListener("beforeunload", onBefore);
  }, [dirty]);

  useEffect(() => {
    if (!dirty) return;
    const onClick = (e: MouseEvent) => {
      if (allowLeave.current || e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest("a[href]");
      if (!a || a.getAttribute("target") === "_blank" || a.hasAttribute("download")) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("javascript:")) return;
      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      setPendingHref(`${url.pathname}${url.search}${url.hash}`);
      setLeaveOpen(true);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [dirty]);

  function backHref(): string {
    if (projectId) return `/practice/file?id=${projectId}`;
    if (partyId) return `/practice/clients/file?id=${partyId}&tab=${kind === "quote" ? "quotes" : "invoices"}`;
    return kind === "quote" ? "/practice/quotes" : "/practice/invoices";
  }

  async function save(opts?: { stay?: boolean }): Promise<number | null> {
    const cleaned = lines
      .map((l) => ({
        item: (l.item || "").trim(),
        description: (l.description || "").trim(),
        quantity: money(l.quantity),
        unit_price: money(l.unit_price),
      }))
      .filter((l) => l.item || l.description);
    if (cleaned.length === 0) {
      setError("Add at least one line item.");
      return null;
    }
    if (kind === "invoice" && !incomeLedgerId) {
      setError("Pick a sales / income ledger.");
      return null;
    }
    setBusy(true);
    try {
      setError(null);
      const notesJson = notes
        .map((b) =>
          b.type === "image"
            ? { type: "image" as const, path: b.path, filename: b.filename }
            : { type: "text" as const, body: (b.body || "").trim() }
        )
        .filter((b) => (b.type === "image" ? Boolean(b.path) : Boolean(b.body)));
      const notesText = notes
        .filter((b) => b.type === "text")
        .map((b) => (b.body || "").trim())
        .filter(Boolean)
        .join("\n\n");
      const body = {
        kind,
        title: title.trim() || label,
        issued_on: issuedOn || null,
        party_id: partyId,
        project_id: projectId,
        income_ledger_id: kind === "invoice" ? Number(incomeLedgerId) : null,
        source_quote_id: sourceQuoteId,
        notes: notesText || null,
        notes_json: notesJson,
        lines: cleaned,
      };
      const id = savedId || existingId;
      const doc = id
        ? await practiceApi.documents.update(id, body)
        : await practiceApi.documents.create(body);
      setSavedId(doc.id);
      setNumber(doc.number);
      lastSaved.current = formFingerprint();
      if (!opts?.stay) {
        allowLeave.current = true;
        router.push(backHref());
      } else if (!existingId) {
        allowLeave.current = true;
        router.replace(documentHref(doc.id));
      }
      return doc.id;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not save");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function addNoteImage(file: File) {
    setBusy(true);
    try {
      setError(null);
      const saved = await practiceApi.documents.uploadNoteImage(file);
      const url = await practiceApi.documents.noteImageObjectUrl(saved.path);
      setNotes((rows) => [
        ...rows,
        { id: newId(), type: "image", path: saved.path, filename: saved.filename, url: url || undefined },
      ]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not add image");
    } finally {
      setBusy(false);
    }
  }

  function documentHref(id: number) {
    const q = new URLSearchParams({ kind, id: String(id) });
    return `/practice/document?${q}`;
  }

  async function duplicateQuote() {
    if (kind !== "quote") return;
    const sourceId = await save({ stay: true });
    if (!sourceId) return;
    setBusy(true);
    try {
      setError(null);
      const copy = await practiceApi.documents.duplicateQuote(sourceId);
      allowLeave.current = true;
      router.push(documentHref(copy.id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not duplicate quote");
    } finally {
      setBusy(false);
    }
  }

  async function printPreview() {
    const id = await save({ stay: true });
    if (!id) return;
    try {
      setError(null);
      const data = await practiceApi.documents.preview(id);
      setPreview({
        title: `${label} ${data.number}`,
        pages: data.pages,
        documentId: id,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not open PDF");
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={backHref()}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Back
        </Link>
        <div className="flex flex-wrap gap-2">
          {kind === "quote" && (savedId || existingId) && (
            <Button
              type="button"
              variant="outline"
              onClick={() => void duplicateQuote()}
              disabled={busy || !loaded}
            >
              Duplicate
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => void printPreview()} disabled={busy || !loaded}>
            <Printer className="mr-1 h-4 w-4" />
            Print
          </Button>
          <Button type="button" onClick={() => void save()} disabled={busy || !loaded}>
            Save and close
          </Button>
        </div>
      </header>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card className="min-w-0 section-panel neon-lime border-2">
        <CardContent className="min-w-0 space-y-6 pt-6">
          <table className="doc-sheet-top">
            <colgroup>
              <col style={{ width: "33.333%" }} />
              <col style={{ width: "33.333%" }} />
              <col style={{ width: "33.333%" }} />
            </colgroup>
            <tbody>
              <tr>
                <td>
                  <div className="doc-sheet-meta space-y-3">
                    <div className="space-y-1">
                      <Label>Issued date</Label>
                      <Input type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} />
                      <p className="text-[11px] text-muted-foreground">
                        Backdate this to when it was actually issued if you are recapturing the year.
                      </p>
                    </div>
                    <div className="space-y-1">
                      <Label>{label} reference</Label>
                      <Input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="kitchen, bedroom…"
                      />
                      {projectName && (
                        <p className="text-xs text-muted-foreground">Linked project: {projectName}</p>
                      )}
                    </div>
                  </div>
                </td>
                <td style={{ verticalAlign: "middle", textAlign: "center" }}>
                  <h1 className="text-2xl font-semibold uppercase tracking-[0.28em]">{label}</h1>
                  <p className="mt-1 text-sm tabular-nums text-muted-foreground">
                    {number || "Assigning number…"}
                  </p>
                </td>
                <td>
                  <div className="doc-sheet-logo-box">
                    {logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={logoUrl} alt="Company logo" />
                    ) : null}
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          <table className="doc-sheet-parties">
            <colgroup>
              <col style={{ width: "50%" }} />
              <col style={{ width: "50%" }} />
            </colgroup>
            <tbody>
              <tr>
                <td>
                  <AddressBlock title="From" card={issuer} />
                </td>
                <td>
                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Bill to
                    </p>
                    <ClientPicker
                      value={partyId}
                      selectedName={client?.name || null}
                      selectedTradingName={client?.trading_name || null}
                      tabIndex={partyId != null ? -1 : undefined}
                      onSelect={(party) => {
                        setPartyId(party.id);
                        setClient(partyToCard(party));
                      }}
                    />
                    {client?.name ? (
                      <AddressBlock card={client} />
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Search and select a client. Their address, VAT and registration pull through.
                      </p>
                    )}
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          {kind === "invoice" && (
            <div className="max-w-sm space-y-1.5">
              <Label>Sales / income ledger</Label>
              <Select value={incomeLedgerId} onChange={(e) => setIncomeLedgerId(e.target.value)}>
                <option value="">Select ledger</option>
                {incomeLedgers.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <div className="w-full min-w-0 overflow-hidden">
            <table className="w-full table-fixed border-collapse text-sm">
              <colgroup>
                <col style={{ width: "20%" }} />
                <col style={{ width: "30%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "20%" }} />
                <col style={{ width: "20%" }} />
              </colgroup>
              <thead>
                <tr className="border-b border-border text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-1 py-2 font-semibold">Item</th>
                  <th className="px-1 py-2 font-semibold">Description</th>
                  <th className="px-1 py-2 font-semibold">Qty</th>
                  <th className="px-1 py-2 font-semibold">Rate</th>
                  <th className="px-1 py-2 text-right font-semibold">Line total ex VAT</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, i) => {
                  const hideMoney = isZeroQty(line);
                  return (
                    <tr key={i} className="border-b border-border/60 align-top">
                      <td className="min-w-0 px-1 py-1.5 align-top">
                        <ProductItemField
                          itemIndex={i}
                          value={line.item || ""}
                          items={products}
                          onChange={(v) => setLine(i, { item: v })}
                          onPick={(item) =>
                            setLine(i, {
                              item: item.name,
                              description: item.description || "",
                              unit_price: String(item.retail_price ?? "0"),
                            })
                          }
                          onKeyDown={onLineKeyDown}
                          placeholder={products.length ? "Type to pick a product…" : "Week 1"}
                        />
                      </td>
                      <td className="min-w-0 px-1 py-1.5 align-top">
                        <LineText
                          value={line.description}
                          onChange={(v) => setLine(i, { description: v })}
                          onKeyDown={onLineKeyDown}
                          placeholder="Setting up shop…"
                        />
                      </td>
                      <td className="min-w-0 px-1 py-1.5">
                        <Input
                          className="min-w-0 px-1"
                          type="number"
                          min="0"
                          step="0.01"
                          value={hideMoney ? "" : String(line.quantity)}
                          onChange={(e) => setLine(i, { quantity: e.target.value })}
                          onKeyDown={onLineKeyDown}
                          aria-label="Quantity"
                        />
                      </td>
                      <td className="min-w-0 px-1 py-1.5">
                        {hideMoney ? (
                          <div className="h-9" aria-hidden />
                        ) : (
                          <Input
                            className="min-w-0 px-2"
                            type="number"
                            min="0"
                            step="0.01"
                            value={String(line.unit_price)}
                            onChange={(e) => setLine(i, { unit_price: e.target.value })}
                            onKeyDown={onLineKeyDown}
                            aria-label="Rate"
                          />
                        )}
                      </td>
                      <td className="min-w-0 px-1 py-1.5">
                        <div className="flex items-center justify-end gap-0.5">
                          <span className="min-w-0 truncate text-right tabular-nums">
                            {hideMoney ? "" : formatMoney(lineAmount(line), currency)}
                          </span>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 shrink-0"
                            onClick={() => setLines((rows) => rows.filter((_, idx) => idx !== i))}
                            disabled={lines.length === 1}
                            aria-label="Remove line"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() => addLineItem()}
            >
              <Plus className="mr-1 h-3 w-3" />
              Add line
            </Button>
          </div>

          <div className="flex justify-end">
            <div className="min-w-[240px] space-y-1 text-right text-sm">
              {vatEnabled ? (
                <>
                  <div className="flex justify-between gap-6 text-muted-foreground">
                    <span>Subtotal ex VAT</span>
                    <span className="tabular-nums">{formatMoney(subtotal, currency)}</span>
                  </div>
                  <div className="flex justify-between gap-6 text-muted-foreground">
                    <span>VAT {vatRate}%</span>
                    <span className="tabular-nums">{formatMoney(vatAmount, currency)}</span>
                  </div>
                  <div className="flex justify-between gap-6 text-base font-semibold">
                    <span>Total incl. VAT</span>
                    <span className="tabular-nums">{formatMoney(totalIncl, currency)}</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between gap-6 text-base font-semibold">
                  <span>Total excl. VAT</span>
                  <span className="tabular-nums">{formatMoney(subtotal, currency)}</span>
                </div>
              )}
            </div>
          </div>

          {(bank?.bank_name || bank?.bank_account_number) && (
            <div className="rounded-xl border border-border/80 bg-muted/30 px-4 py-3 text-sm">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Bank details
              </p>
              <p className="mt-1">
                {[bank.bank_name, bank.bank_account_name].filter(Boolean).join(" · ")}
              </p>
              <p className="text-muted-foreground">
                {[
                  bank.bank_account_number ? `Acc ${bank.bank_account_number}` : null,
                  bank.bank_branch_code ? `Branch ${bank.bank_branch_code}` : null,
                  bank.bank_extra,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          )}

          {disclaimer && (
            <div className="whitespace-pre-wrap text-xs text-muted-foreground">{disclaimer}</div>
          )}

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>Notes</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setNotes((rows) => [...rows, { id: newId(), type: "text", body: "" }])}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  Add note
                </Button>
                <label className="inline-flex">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) void addNoteImage(file);
                    }}
                  />
                  <span className="inline-flex h-8 cursor-pointer items-center rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-accent">
                    <ImagePlus className="mr-1 h-3 w-3" />
                    Add image
                  </span>
                </label>
              </div>
            </div>
            <div className="space-y-3">
              {notes.map((block, i) =>
                block.type === "image" ? (
                  <div key={block.id} className="rounded-xl border border-border/80 bg-muted/20 p-3">
                    <div className="flex items-start justify-between gap-3">
                      {block.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={block.url}
                          alt={block.filename || "Note image"}
                          className="max-h-64 max-w-full rounded-md object-contain"
                        />
                      ) : (
                        <p className="text-xs text-muted-foreground">{block.filename || "Image"}</p>
                      )}
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 shrink-0"
                        onClick={() =>
                          setNotes((rows) => {
                            const gone = rows[i];
                            if (gone?.url) URL.revokeObjectURL(gone.url);
                            return rows.filter((_, idx) => idx !== i);
                          })
                        }
                        aria-label="Remove image"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    {block.filename && (
                      <p className="mt-1 text-[11px] text-muted-foreground">{block.filename}</p>
                    )}
                  </div>
                ) : (
                  <div key={block.id} className="flex gap-2">
                    <textarea
                      value={block.body || ""}
                      onChange={(e) =>
                        setNotes((rows) =>
                          rows.map((row, idx) => (idx === i ? { ...row, body: e.target.value } : row))
                        )
                      }
                      rows={3}
                      className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      placeholder="Payment terms, site notes, extras…"
                    />
                    {notes.length > 1 && (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 shrink-0"
                        onClick={() => setNotes((rows) => rows.filter((_, idx) => idx !== i))}
                        aria-label="Remove note"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                )
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end pb-2">
        <Button type="button" onClick={() => void save()} disabled={busy || !loaded}>
          Save and close
        </Button>
      </div>

      <Modal
        open={leaveOpen}
        onClose={() => {
          setLeaveOpen(false);
          setPendingHref(null);
        }}
        title="Leave without saving?"
        description={`Unsaved work on this ${label.toLowerCase()} may be lost.`}
      >
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setLeaveOpen(false);
              setPendingHref(null);
            }}
          >
            Stay
          </Button>
          <Button
            type="button"
            onClick={() => {
              allowLeave.current = true;
              const href = pendingHref;
              setLeaveOpen(false);
              setPendingHref(null);
              if (href) router.push(href);
            }}
          >
            Leave
          </Button>
        </div>
      </Modal>
      <PdfPreviewModal
        open={Boolean(preview)}
        title={preview?.title || `${label} preview`}
        pages={preview?.pages || []}
        documentId={preview?.documentId}
        onClose={() => setPreview(null)}
      />
    </div>
  );
}
