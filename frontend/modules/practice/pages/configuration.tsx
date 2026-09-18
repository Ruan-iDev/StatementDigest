"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, BookMarked, Building2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { practiceApi } from "@/modules/practice/lib/api";
import type {
  DocumentKind,
  PracticeIssuer,
  PracticeLedger,
  PracticeTemplate,
} from "@/modules/practice/lib/types";

type ConfigPanel = "home" | "company" | "documents" | "ledgers";

function emptyTemplate(kind: DocumentKind): PracticeTemplate {
  return {
    kind,
    number_code: kind === "invoice" ? "INV-001" : "QTE-001",
    bank_name: "",
    bank_account_name: "",
    bank_account_number: "",
    bank_branch_code: "",
    bank_extra: "",
    disclaimer: "",
  };
}

function TemplateForm({
  title,
  hint,
  value,
  onChange,
  onSave,
  busy,
}: {
  title: string;
  hint: string;
  value: PracticeTemplate;
  onChange: (next: PracticeTemplate) => void;
  onSave: () => void;
  busy: boolean;
}) {
  function set(key: keyof PracticeTemplate, v: PracticeTemplate[keyof PracticeTemplate]) {
    onChange({ ...value, [key]: v });
  }
  return (
    <Card className="section-panel neon-amber border-2">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{hint}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label>Next document number</Label>
          <Input
            value={value.number_code || ""}
            onChange={(e) => set("number_code", e.target.value.toUpperCase())}
            placeholder={value.kind === "invoice" ? "INV-001" : "QTE-001"}
            className="max-w-[200px] font-mono"
          />
          <p className="text-[11px] text-muted-foreground">
            Default {value.kind === "invoice" ? "INV-001" : "QTE-001"}. The system then counts up
            ({value.kind === "invoice" ? "INV-002" : "QTE-002"}, and so on).
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Bank</Label>
            <Input value={value.bank_name || ""} onChange={(e) => set("bank_name", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Account name</Label>
            <Input
              value={value.bank_account_name || ""}
              onChange={(e) => set("bank_account_name", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Account number</Label>
            <Input
              value={value.bank_account_number || ""}
              onChange={(e) => set("bank_account_number", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Branch code</Label>
            <Input
              value={value.bank_branch_code || ""}
              onChange={(e) => set("bank_branch_code", e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Extra bank notes</Label>
          <Input
            value={value.bank_extra || ""}
            onChange={(e) => set("bank_extra", e.target.value)}
            placeholder="Reference, SWIFT…"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Declaration / disclaimer</Label>
          <textarea
            value={value.disclaimer || ""}
            onChange={(e) => set("disclaimer", e.target.value)}
            rows={5}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="Validity, payment terms, estimate wording…"
          />
        </div>
        <Button type="button" onClick={onSave} disabled={busy}>
          Save {title.toLowerCase()}
        </Button>
      </CardContent>
    </Card>
  );
}

export function PracticeConfigurationPage() {
  const search = useSearchParams();
  const focus = search.get("kind") === "invoice" ? "invoice" : search.get("kind") === "quote" ? "quote" : null;
  const panelParam = search.get("panel");
  const [panel, setPanel] = useState<ConfigPanel>(
    focus
      ? "documents"
      : panelParam === "ledgers" || panelParam === "company" || panelParam === "documents"
        ? panelParam
        : "home"
  );
  const [quotes, setQuotes] = useState<PracticeTemplate>(emptyTemplate("quote"));
  const [invoices, setInvoices] = useState<PracticeTemplate>(emptyTemplate("invoice"));
  const [vatEnabled, setVatEnabled] = useState(false);
  const [vatRate, setVatRate] = useState("15");
  const [useProfile, setUseProfile] = useState(false);
  const [issuer, setIssuer] = useState<PracticeIssuer>({});
  const [profileIssuer, setProfileIssuer] = useState<PracticeIssuer>({});
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoSource, setLogoSource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ledgers, setLedgers] = useState<PracticeLedger[]>([]);
  const [newLedgerName, setNewLedgerName] = useState("");
  const [newLedgerType, setNewLedgerType] = useState<"income" | "expense">("expense");
  const [editingLedgerId, setEditingLedgerId] = useState<number | null>(null);
  const [editLedgerName, setEditLedgerName] = useState("");
  const [editLedgerType, setEditLedgerType] = useState<"income" | "expense">("expense");

  async function load() {
    const [brand, ledgerList] = await Promise.all([
      practiceApi.branding.get(),
      practiceApi.ledgers.list(undefined, true).catch(() => [] as PracticeLedger[]),
    ]);
    setLedgers(ledgerList);
    setQuotes(brand.quotes);
    setInvoices(brand.invoices);
    setVatEnabled(Boolean(brand.vat_enabled));
    setVatRate(String(brand.vat_rate ?? 15));
    setUseProfile(Boolean(brand.use_profile_issuer));
    setIssuer(brand.issuer || {});
    setProfileIssuer(brand.profile_issuer || {});
    setLogoSource(brand.logo_source);
    const url = await practiceApi.branding.logoObjectUrl();
    setLogoUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
  }

  useEffect(() => {
    load().catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"));
    return () => {
      setLogoUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, []);

  useEffect(() => {
    if (!focus) return;
    setPanel("documents");
    const el = document.getElementById(focus === "quote" ? "quotes" : "invoices");
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focus]);

  async function save(kind: DocumentKind, body: PracticeTemplate) {
    setBusy(true);
    try {
      setError(null);
      const next = await practiceApi.branding.update(kind, body);
      if (kind === "quote") setQuotes(next);
      else setInvoices(next);
      setMessage(`${kind === "quote" ? "Quote" : "Invoice"} template saved`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function onLogo(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      setError(null);
      await practiceApi.branding.uploadLogo(file);
      await load();
      setMessage("Logo saved — used on quotes, invoices, and project statements");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not upload logo");
    } finally {
      setBusy(false);
    }
  }

  async function saveVat() {
    setBusy(true);
    try {
      setError(null);
      const next = await practiceApi.branding.updateVat({
        vat_enabled: vatEnabled,
        vat_rate: vatRate,
      });
      setVatEnabled(Boolean(next.vat_enabled));
      setVatRate(String(next.vat_rate ?? 15));
      setMessage(
        vatEnabled
          ? `VAT is on at ${next.vat_rate}% for quotes and invoices`
          : "VAT is off — quotes and invoices show totals excluding VAT"
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not save VAT");
    } finally {
      setBusy(false);
    }
  }

  async function saveIssuer() {
    setBusy(true);
    try {
      setError(null);
      const next = await practiceApi.branding.updateIssuer({
        use_profile_data: useProfile,
        details: issuer,
      });
      setUseProfile(next.use_profile_issuer);
      setIssuer(next.issuer);
      setMessage(
        useProfile
          ? "From details now follow My Profile"
          : "Practice company details saved — separate from My Profile"
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not save your details");
    } finally {
      setBusy(false);
    }
  }

  const shown = useProfile ? profileIssuer : issuer;

  function setIss(key: keyof PracticeIssuer, v: PracticeIssuer[keyof PracticeIssuer]) {
    setIssuer((cur) => ({ ...cur, [key]: v }));
  }

  async function addLedger() {
    const name = newLedgerName.trim();
    if (!name) return;
    setBusy(true);
    try {
      setError(null);
      const row = await practiceApi.ledgers.create({ name, type: newLedgerType });
      setLedgers((prev) => {
        if (prev.some((l) => l.id === row.id)) return prev;
        return [...prev, row].sort((a, b) => a.name.localeCompare(b.name));
      });
      setNewLedgerName("");
      setMessage(`Ledger "${row.name}" saved`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not add ledger");
    } finally {
      setBusy(false);
    }
  }

  function startEditLedger(row: PracticeLedger) {
    setEditingLedgerId(row.id);
    setEditLedgerName(row.name);
    setEditLedgerType(row.type === "income" ? "income" : "expense");
  }

  async function saveEditLedger() {
    if (editingLedgerId == null) return;
    const name = editLedgerName.trim();
    if (!name) return;
    setBusy(true);
    try {
      setError(null);
      const next = await practiceApi.ledgers.update(editingLedgerId, {
        name,
        type: editLedgerType,
      });
      setLedgers((prev) => prev.map((l) => (l.id === next.id ? next : l)));
      setEditingLedgerId(null);
      setMessage(`Ledger “${next.name}” updated`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not update ledger");
    } finally {
      setBusy(false);
    }
  }

  async function archiveLedger(row: PracticeLedger, archived: boolean) {
    setBusy(true);
    try {
      const next = await practiceApi.ledgers.update(row.id, { is_archived: archived });
      setLedgers((prev) => prev.map((l) => (l.id === next.id ? next : l)));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not update ledger");
    } finally {
      setBusy(false);
    }
  }

  async function clearLogo() {
    setBusy(true);
    try {
      await practiceApi.branding.deleteLogo();
      await load();
      setMessage("Practice logo removed. Profile logo is used if you have one.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not remove logo");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link
          href="/practice"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Work Flow
        </Link>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-[hsl(var(--neon-amber))]">
          Work Flow · Configuration
        </p>
        <h1 className="page-title">Configuration</h1>
        <p className="page-subtitle max-w-2xl">
          Company details, quote and invoice templates, and Work Flow ledgers — kept separate from
          Ledger Flow.
        </p>
      </header>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {message && (
        <p className="rounded-xl border-2 border-[hsl(var(--neon-lime)/0.45)] bg-[hsl(var(--neon-lime)/0.08)] px-4 py-2 text-sm">
          {message}
        </p>
      )}

      {panel === "home" && (
        <div className="grid gap-3 sm:grid-cols-3">
          <button
            type="button"
            className="rounded-xl border-2 border-[hsl(var(--neon-cyan)/0.45)] bg-card p-4 text-left shadow-sm hover:bg-accent/50"
            onClick={() => setPanel("company")}
          >
            <Building2 className="mb-2 h-5 w-5 text-[hsl(var(--neon-cyan))]" />
            <p className="font-semibold">Company details</p>
            <p className="mt-1 text-xs text-muted-foreground">Your details, logo, and VAT.</p>
          </button>
          <button
            type="button"
            className="rounded-xl border-2 border-[hsl(var(--neon-amber)/0.45)] bg-card p-4 text-left shadow-sm hover:bg-accent/50"
            onClick={() => setPanel("documents")}
          >
            <FileText className="mb-2 h-5 w-5 text-[hsl(var(--neon-amber))]" />
            <p className="font-semibold">Quote / invoice settings</p>
            <p className="mt-1 text-xs text-muted-foreground">Numbers, bank details, disclaimers.</p>
          </button>
          <button
            type="button"
            className="rounded-xl border-2 border-[hsl(var(--neon-violet)/0.45)] bg-card p-4 text-left shadow-sm hover:bg-accent/50"
            onClick={() => setPanel("ledgers")}
          >
            <BookMarked className="mb-2 h-5 w-5 text-[hsl(var(--neon-violet))]" />
            <p className="font-semibold">Ledgers</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Work Flow chart of accounts — copied from Ledger Flow, then yours to grow.
            </p>
          </button>
        </div>
      )}

      {panel !== "home" && (
        <Button type="button" variant="outline" size="sm" onClick={() => setPanel("home")}>
          <ArrowLeft className="mr-1 h-3.5 w-3.5" />
          All configuration
        </Button>
      )}

      {panel === "company" && (
      <>
      <Card className="section-panel neon-cyan border-2">
        <CardHeader>
          <CardTitle>Your details</CardTitle>
          <CardDescription>
            This is the From block on quotes and invoices. Unticked (default) means a Practice
            company that can differ from My Profile.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Use My Profile data</p>
              <p className="text-xs text-muted-foreground">
                Off by default. Tick to copy name, address, VAT and registration from My Profile.
              </p>
            </div>
            <ToggleSwitch
              checked={useProfile}
              onChange={(on) => {
                setUseProfile(on);
                if (on) setIssuer({ ...profileIssuer });
              }}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Name / company</Label>
              <Input
                value={shown.name || ""}
                disabled={useProfile}
                onChange={(e) => setIss("name", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Trading name</Label>
              <Input
                value={shown.trading_name || ""}
                disabled={useProfile}
                onChange={(e) => setIss("trading_name", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Contact</Label>
              <Input
                value={shown.contact_name || ""}
                disabled={useProfile}
                onChange={(e) => setIss("contact_name", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                value={shown.email || ""}
                disabled={useProfile}
                onChange={(e) => setIss("email", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input
                value={shown.phone || ""}
                disabled={useProfile}
                onChange={(e) => setIss("phone", e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Address</Label>
              <Input
                value={shown.address_line1 || ""}
                disabled={useProfile}
                onChange={(e) => setIss("address_line1", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>City</Label>
              <Input
                value={shown.city || ""}
                disabled={useProfile}
                onChange={(e) => setIss("city", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Postal code</Label>
              <Input
                value={shown.postal_code || ""}
                disabled={useProfile}
                onChange={(e) => setIss("postal_code", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Registration number</Label>
              <Input
                value={shown.business_registration_number || ""}
                disabled={useProfile}
                onChange={(e) => setIss("business_registration_number", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>VAT number</Label>
              <Input
                value={shown.vat_number || ""}
                disabled={useProfile}
                onChange={(e) => setIss("vat_number", e.target.value)}
              />
            </div>
          </div>
          <Button type="button" onClick={() => void saveIssuer()} disabled={busy}>
            Save your details
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Logo</CardTitle>
          <CardDescription>
            Upload a Practice logo, or we fall back to the business logo on My Profile.
            {logoSource ? ` Currently using: ${logoSource}.` : " No logo yet."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Practice logo" className="h-16 w-auto max-w-[200px] object-contain" />
          ) : (
            <div className="flex h-16 w-28 items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">
              No logo
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(e) => void onLogo(e.target.files?.[0])}
              />
              <span className="inline-flex h-9 cursor-pointer items-center rounded-md border-2 border-input bg-card/60 px-3 text-sm hover:bg-accent">
                Upload logo
              </span>
            </label>
            {logoSource === "practice" && (
              <Button type="button" variant="ghost" size="sm" onClick={() => void clearLogo()} disabled={busy}>
                Remove
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="section-panel neon-lime border-2">
        <CardHeader>
          <CardTitle>VAT</CardTitle>
          <CardDescription>
            One switch for the whole Practice workspace — quotes and invoices both use this.
            On: subtotal ex VAT, VAT line, total incl. Off: total excl. VAT only.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">VAT</p>
              <p className="text-xs text-muted-foreground">
                Tick on to apply VAT at the percentage below.
              </p>
            </div>
            <ToggleSwitch checked={vatEnabled} onChange={setVatEnabled} />
          </div>
          {vatEnabled && (
            <div className="max-w-[180px] space-y-1.5">
              <Label>Percentage</Label>
              <Input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={vatRate}
                onChange={(e) => setVatRate(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                South Africa is currently 15% — change it here if the rate moves.
              </p>
            </div>
          )}
          <Button type="button" onClick={() => void saveVat()} disabled={busy}>
            Save VAT
          </Button>
        </CardContent>
      </Card>
      </>
      )}

      {panel === "documents" && (
      <>
      <div className="grid gap-5 lg:grid-cols-2">
        <div id="quotes">
          <TemplateForm
            title="Quote template"
            hint="Bank details and wording that appear only on quotes."
            value={quotes}
            onChange={setQuotes}
            onSave={() => void save("quote", quotes)}
            busy={busy}
          />
        </div>
        <div id="invoices">
          <TemplateForm
            title="Invoice template"
            hint="Separate from quotes — invoices keep their own bank and disclaimer."
            value={invoices}
            onChange={setInvoices}
            onSave={() => void save("invoice", invoices)}
            busy={busy}
          />
        </div>
      </div>
      {focus && (
        <p className="text-xs text-muted-foreground">
          Opened from Settings → Modules ({focus}). Scroll to that template above.
        </p>
      )}
      </>
      )}

      {panel === "ledgers" && (
        <Card className="section-panel neon-violet border-2">
          <CardHeader>
            <CardTitle>Work Flow ledgers</CardTitle>
            <CardDescription>
              These are not Ledger Flow ledgers. Your existing income and expense names were copied
              across so quotes, invoices, expenses and wages keep their allocations.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[180px] flex-1 space-y-1.5">
                <Label>New ledger</Label>
                <Input
                  value={newLedgerName}
                  onChange={(e) => setNewLedgerName(e.target.value)}
                  placeholder="Wages and salaries…"
                />
              </div>
              <div className="w-[140px] space-y-1.5">
                <Label>Type</Label>
                <Select
                  value={newLedgerType}
                  onChange={(e) => setNewLedgerType(e.target.value as "income" | "expense")}
                >
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </Select>
              </div>
              <Button type="button" onClick={() => void addLedger()} disabled={busy || !newLedgerName.trim()}>
                Add ledger
              </Button>
            </div>
            {(["income", "expense"] as const).map((kind) => {
              const rows = ledgers.filter((l) => l.type === kind);
              return (
                <div key={kind} className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {kind === "income" ? "Income" : "Expense"}
                  </p>
                  {rows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">None yet.</p>
                  ) : (
                    <ul className="space-y-1">
                      {rows.map((row) => (
                        <li
                          key={row.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
                        >
                          {editingLedgerId === row.id ? (
                            <>
                              <div className="flex min-w-0 flex-1 flex-wrap items-end gap-2">
                                <div className="min-w-[140px] flex-1 space-y-1">
                                  <Label className="text-[11px]">Name</Label>
                                  <Input
                                    value={editLedgerName}
                                    onChange={(e) => setEditLedgerName(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.preventDefault();
                                        void saveEditLedger();
                                      }
                                    }}
                                  />
                                </div>
                                <div className="w-[130px] space-y-1">
                                  <Label className="text-[11px]">Type</Label>
                                  <Select
                                    value={editLedgerType}
                                    onChange={(e) =>
                                      setEditLedgerType(e.target.value as "income" | "expense")
                                    }
                                  >
                                    <option value="expense">Expense</option>
                                    <option value="income">Income</option>
                                  </Select>
                                </div>
                              </div>
                              <div className="flex gap-1">
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={busy || !editLedgerName.trim()}
                                  onClick={() => void saveEditLedger()}
                                >
                                  Save
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setEditingLedgerId(null)}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </>
                          ) : (
                            <>
                              <span className={row.is_archived ? "text-muted-foreground line-through" : ""}>
                                {row.name}
                              </span>
                              <div className="flex gap-1">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={busy}
                                  onClick={() => startEditLedger(row)}
                                >
                                  Edit
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  disabled={busy}
                                  onClick={() => void archiveLedger(row, !row.is_archived)}
                                >
                                  {row.is_archived ? "Restore" : "Archive"}
                                </Button>
                              </div>
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
