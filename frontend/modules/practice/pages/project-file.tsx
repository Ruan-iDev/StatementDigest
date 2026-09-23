"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Plus, ScrollText, X } from "lucide-react";
import { cn, formatMoney } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { TypeaheadSelect } from "@/components/ui/typeahead-select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { practiceApi } from "@/modules/practice/lib/api";
import { useModuleFlags } from "@/modules/practice/flags-provider";
import { FeatureOffPage } from "@/modules/practice/pages/disabled";
import { ClientPicker } from "@/modules/practice/pages/client-picker";
import {
  clientFileHref,
  documentEditorHref,
  documentStatusLabel,
  formatWageDays,
  RFQ_EXPANSION,
  staffWagePeriodLabel,
  supplierFileHref,
  type DocumentKind,
  type EntryType,
  type PracticeDocument,
  type PracticeEntry,
  type PracticeExpense,
  type PracticeLedger,
  type PracticeParty,
  type PracticeProjectDetail,
  type PracticeStaff,
  type PracticeTravel,
  type PracticeWage,
  type ProjectStatus,
  staffFileHref,
} from "@/modules/practice/lib/types";

const STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "on_hold", label: "On hold" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const ENTRY_LABEL: Record<EntryType, string> = {
  note: "Note",
  quote: "Quote",
  invoice: "Invoice",
  rfq: "RFQ",
  expense: "Expense",
  payment: "Payment",
  file: "File",
  status: "Status",
  task: "Task",
  meeting: "Meeting",
  wage: "Wages",
  travel: "Travel",
};

const ENTRY_TILE: Partial<Record<EntryType, string>> = {
  payment:
    "font-bold border-[hsl(var(--neon-lime)/0.5)] bg-[hsl(var(--neon-lime)/0.22)] text-[hsl(var(--neon-lime))]",
  invoice:
    "font-bold border-[hsl(var(--neon-blue)/0.5)] bg-[hsl(var(--neon-blue)/0.22)] text-[hsl(var(--neon-blue))]",
  quote:
    "font-bold border-[hsl(var(--neon-violet)/0.5)] bg-[hsl(var(--neon-violet)/0.22)] text-[hsl(var(--neon-violet))]",
  expense:
    "font-bold border-[hsl(var(--danger)/0.5)] bg-[hsl(var(--danger)/0.18)] text-[hsl(var(--danger))]",
  wage:
    "font-bold border-[hsl(24_82%_40%/0.55)] bg-[hsl(24_82%_40%/0.18)] text-[hsl(24_82%_36%)] dark:border-[hsl(28_95%_58%/0.5)] dark:bg-[hsl(28_90%_50%/0.22)] dark:text-[hsl(28_95%_62%)]",
  travel:
    "font-bold border-[hsl(var(--neon-cyan)/0.5)] bg-[hsl(var(--neon-cyan)/0.18)] text-[hsl(var(--neon-cyan))]",
  note:
    "font-bold border-[hsl(48_90%_42%/0.55)] bg-[hsl(48_90%_48%/0.28)] text-[hsl(42_72%_28%)] dark:border-[hsl(48_95%_58%/0.5)] dark:bg-[hsl(48_90%_52%/0.22)] dark:text-[hsl(48_95%_64%)]",
  meeting:
    "font-bold border-[hsl(48_90%_42%/0.55)] bg-[hsl(48_90%_48%/0.28)] text-[hsl(42_72%_28%)] dark:border-[hsl(48_95%_58%/0.5)] dark:bg-[hsl(48_90%_52%/0.22)] dark:text-[hsl(48_95%_64%)]",
};

type AddKind = "note" | "quote" | "invoice" | "rfq" | "expense" | "payment" | "meeting" | "wage" | "travel";

type WageLineDraft = { description: string; amount: string };

function parseMoneyInput(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function parseWageNumber(value: string | number | null | undefined): number {
  if (value == null || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const n = Number(String(value).trim());
  return Number.isFinite(n) ? n : 0;
}

function roundCents(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function staffRateHint(s: Pick<PracticeStaff, "wage_amount" | "wage_period">): string | undefined {
  if (s.wage_amount == null || s.wage_amount === "") return undefined;
  return `${formatMoney(s.wage_amount)} ${staffWagePeriodLabel(s.wage_period).toLowerCase()}`;
}

function wageLinesComplete(rows: WageLineDraft[]): boolean {
  return rows.every((r) => r.description.trim().length > 0 && parseMoneyInput(r.amount) > 0);
}

function wageLineTotal(rows: { amount: string | number }[]): number {
  return rows.reduce((sum, row) => {
    const n = Number(row.amount);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
}

function wageGrossFrom(w: PracticeWage): number {
  const net = Number(w.amount);
  const deduct = wageLineTotal(w.deductions || []);
  const extra = wageLineTotal(w.additions || []);
  return (Number.isFinite(net) ? net : 0) + deduct - extra;
}

function WageLineList({
  label,
  addLabel,
  hint,
  noun,
  rows,
  onChange,
}: {
  label: string;
  addLabel: string;
  hint: string;
  noun: string;
  rows: WageLineDraft[];
  onChange: (rows: WageLineDraft[]) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {rows.map((row, index) => (
        <div
          key={index}
          className="flex flex-col gap-2 sm:grid sm:grid-cols-[1fr_7rem_auto] sm:items-center"
        >
          <Input
            value={row.description}
            onChange={(e) =>
              onChange(rows.map((item, i) => (i === index ? { ...item, description: e.target.value } : item)))
            }
            placeholder="Description"
            aria-label={`${noun} ${index + 1} description`}
          />
          <Input
            type="number"
            step="0.01"
            min="0"
            value={row.amount}
            onChange={(e) =>
              onChange(rows.map((item, i) => (i === index ? { ...item, amount: e.target.value } : item)))
            }
            placeholder="Amount"
            aria-label={`${noun} ${index + 1} amount`}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
            aria-label={`Remove ${noun} ${index + 1}`}
          >
            <X className="h-4 w-4" />
            Remove
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...rows, { description: "", amount: "" }])}
      >
        <Plus className="mr-1 h-4 w-4" />
        {addLabel}
      </Button>
      {rows.length > 0 && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function prettyDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addCalendarDays(iso: string, extra: number): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  d.setDate(d.getDate() + extra);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function nowTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function actionDate(entry: {
  occurred_on?: string | null;
  occurred_time?: string | null;
  created_at: string;
}): string {
  const day = entry.occurred_on ? prettyDate(entry.occurred_on) : prettyDate(entry.created_at.slice(0, 10));
  if (entry.occurred_time) return `${day} · ${entry.occurred_time}`;
  return day;
}

function isOpenedMarker(entry: { entry_type: string; title: string }): boolean {
  return entry.entry_type === "status" && entry.title === "Project opened";
}

function isEditableTrail(entry: PracticeEntry): boolean {
  return (
    entry.entry_type === "note" ||
    entry.entry_type === "meeting" ||
    entry.entry_type === "payment" ||
    entry.entry_type === "expense" ||
    entry.entry_type === "wage"
  );
}

function trailOldestFirst(entries: PracticeEntry[]): PracticeEntry[] {
  const opened = entries.filter(isOpenedMarker);
  const rest = entries.filter((e) => !isOpenedMarker(e));
  rest.sort((a, b) => {
    const da = a.occurred_on || a.created_at.slice(0, 10);
    const db = b.occurred_on || b.created_at.slice(0, 10);
    if (da !== db) return da.localeCompare(db);
    return a.id - b.id;
  });
  return [...opened, ...rest];
}

export function PracticeProjectFilePage() {
  const { flags, ready } = useModuleFlags();
  const router = useRouter();
  const search = useSearchParams();
  const id = Number(search.get("id") || "");
  const [project, setProject] = useState<PracticeProjectDetail | null>(null);
  const [clients, setClients] = useState<PracticeParty[]>([]);
  const [ledgers, setLedgers] = useState<PracticeLedger[]>([]);
  const [wageLedgerId, setWageLedgerId] = useState("");
  const [todoDraft, setTodoDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addType, setAddType] = useState<AddKind>("note");
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [noteDate, setNoteDate] = useState(todayIso);
  const [expenseDesc, setExpenseDesc] = useState("");
  const [expenseSupplierId, setExpenseSupplierId] = useState<number | null>(null);
  const [expenseSupplierName, setExpenseSupplierName] = useState("");
  const [expenseSupplierTrading, setExpenseSupplierTrading] = useState<string | null>(null);
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseLedgerId, setExpenseLedgerId] = useState("");
  const [addingExpenseLedger, setAddingExpenseLedger] = useState(false);
  const [newExpenseLedgerName, setNewExpenseLedgerName] = useState("");
  const [addingExpenseVendor, setAddingExpenseVendor] = useState(false);
  const [newExpenseVendorName, setNewExpenseVendorName] = useState("");
  const [vendorPickerKey, setVendorPickerKey] = useState(0);
  const [expenseDate, setExpenseDate] = useState(todayIso);
  const [projectExpenses, setProjectExpenses] = useState<PracticeExpense[]>([]);
  const [editingEntry, setEditingEntry] = useState<PracticeEntry | null>(null);
  const [linkDocs, setLinkDocs] = useState<PracticeDocument[]>([]);
  const [linkQuery, setLinkQuery] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkClientOnly, setLinkClientOnly] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(todayIso);
  const [payMethod, setPayMethod] = useState("eft");
  const [payNote, setPayNote] = useState("");
  const [payInvoiceIds, setPayInvoiceIds] = useState<number[]>([]);
  const [payLedgerId, setPayLedgerId] = useState("");
  const [projectInvoices, setProjectInvoices] = useState<PracticeDocument[]>([]);
  const [projectQuotes, setProjectQuotes] = useState<PracticeDocument[]>([]);
  const [meetTitle, setMeetTitle] = useState("");
  const [meetBody, setMeetBody] = useState("");
  const [meetDate, setMeetDate] = useState(todayIso);
  const [meetTime, setMeetTime] = useState(nowTime);
  const [staffList, setStaffList] = useState<PracticeStaff[]>([]);
  const [projectWages, setProjectWages] = useState<PracticeWage[]>([]);
  const [projectTravels, setProjectTravels] = useState<PracticeTravel[]>([]);
  const [travelStaffId, setTravelStaffId] = useState("");
  const [travelLedgerId, setTravelLedgerId] = useState("");
  const [travelKm, setTravelKm] = useState("");
  const [travelPrice, setTravelPrice] = useState("");
  const [travelAmount, setTravelAmount] = useState("");
  const [travelDate, setTravelDate] = useState(todayIso);
  const [travelNote, setTravelNote] = useState("");
  const [wageStaffId, setWageStaffId] = useState("");
  const [wageAmount, setWageAmount] = useState("");
  const [wageDays, setWageDays] = useState("");
  const [wageRateAmount, setWageRateAmount] = useState(0);
  const [wageRatePeriod, setWageRatePeriod] = useState("week");
  const [wageDeductions, setWageDeductions] = useState<WageLineDraft[]>([]);
  const [wageAdditions, setWageAdditions] = useState<WageLineDraft[]>([]);
  const [wageDate, setWageDate] = useState(todayIso);
  const [wageNote, setWageNote] = useState("");
  const [wageOverride, setWageOverride] = useState(false);
  const [wageAbsent, setWageAbsent] = useState(false);
  const [wageReason, setWageReason] = useState("");

  const validId = Number.isFinite(id) && id > 0;

  const addTypes: { type: AddKind; label: string; show: boolean }[] = [
    { type: "note", label: "Notes", show: true },
    { type: "quote", label: "Quote", show: flags.quotes_enabled },
    { type: "invoice", label: "Invoice", show: flags.invoices_enabled },
    { type: "rfq", label: "RFQ", show: true },
    { type: "expense", label: "Expense", show: true },
    { type: "wage", label: "Wages", show: true },
    { type: "travel", label: "Traveling", show: true },
    { type: "payment", label: "Received payment", show: true },
    { type: "meeting", label: "Meeting", show: true },
  ];

  async function load() {
    if (!validId) return;
    const [detail, partyList, ledgerList, expenseList, staffRows, wageRows, travelRows, invoiceList, quoteList] =
      await Promise.all([
        practiceApi.projects.get(id),
        practiceApi.parties.list("client"),
        practiceApi.ledgers.list(),
        practiceApi.expenses.list(id),
        practiceApi.staff.list(),
        practiceApi.wages.list({ projectId: id }).catch(() => [] as PracticeWage[]),
        practiceApi.travels.list(id).catch(() => [] as PracticeTravel[]),
        flags.invoices_enabled ? practiceApi.documents.list("invoice", id) : Promise.resolve([]),
        flags.quotes_enabled ? practiceApi.documents.list("quote", id) : Promise.resolve([]),
      ]);
    setProject(detail);
    setClients(partyList);
    setLedgers(ledgerList);
    setProjectExpenses(expenseList);
    setStaffList(staffRows);
    setProjectWages(wageRows);
    setProjectTravels(travelRows);
    setProjectInvoices(invoiceList);
    setProjectQuotes(quoteList);
  }

  useEffect(() => {
    if (!ready || !flags.projects_enabled) return;
    if (!validId) {
      setError("Open a project from the Projects library.");
      return;
    }
    load().catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to open file"));
  }, [id, validId, ready, flags.projects_enabled]);

  const submitTrailRef = useRef<() => void>(() => {});
  const openAddRef = useRef<(type?: AddKind) => void>(() => {});
  const trailDateRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || !(e.ctrlKey || e.metaKey)) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "TEXTAREA" && !addOpen) return;
      e.preventDefault();
      e.stopPropagation();
      if (addOpen) submitTrailRef.current();
      else openAddRef.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [addOpen]);

  useEffect(() => {
    if (!addOpen) return;
    const id = window.setTimeout(() => {
      trailDateRef.current?.focus();
    }, 30);
    return () => window.clearTimeout(id);
  }, [addOpen, addType]);

  if (ready && !flags.projects_enabled) {
    return <FeatureOffPage title="Projects" />;
  }

  const entries: PracticeEntry[] = trailOldestFirst(project?.entries ?? []);
  const expenseLedgers = ledgers.filter((l) => l.type === "expense" && !l.is_archived);

  function defaultWageLedgerId(list: PracticeLedger[] = expenseLedgers): string {
    const hit = list.find((l) => /wage|salar/i.test(l.name));
    return hit ? String(hit.id) : list[0] ? String(list[0].id) : "";
  }

  function defaultTravelLedgerId(list: PracticeLedger[] = expenseLedgers): string {
    const hit = list.find((l) => /fuel|petrol|diesel|travel/i.test(l.name));
    return hit ? String(hit.id) : list[0] ? String(list[0].id) : "";
  }

  async function pickOrCreateExpenseLedger(idOrName: string): Promise<string> {
    if (!idOrName) return "";
    if (ledgers.some((l) => String(l.id) === idOrName)) return idOrName;
    const created = await practiceApi.ledgers.create({ name: idOrName.trim(), type: "expense" });
    setLedgers((prev) => [...prev, created]);
    return String(created.id);
  }

  async function saveNewExpenseVendor() {
    const name = newExpenseVendorName.trim();
    if (!name) return;
    try {
      const created = await practiceApi.parties.create("supplier", { name, party_type: "individual" });
      setExpenseSupplierId(created.id);
      setExpenseSupplierName(created.name);
      setExpenseSupplierTrading(created.trading_name);
      setAddingExpenseVendor(false);
      setNewExpenseVendorName("");
      setVendorPickerKey((k) => k + 1);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not add vendor");
    }
  }

  async function saveNewExpenseLedger() {
    const name = newExpenseLedgerName.trim();
    if (!name) return;
    try {
      const id = await pickOrCreateExpenseLedger(name);
      setExpenseLedgerId(id);
      setAddingExpenseLedger(false);
      setNewExpenseLedgerName("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not add ledger");
    }
  }

  function closeAdd() {
    setAddOpen(false);
    setEditingEntry(null);
  }

  function trailLedgerName(entry: PracticeEntry): string | null {
    if (entry.entry_type === "expense") {
      const ex = projectExpenses.find((row) => row.id === entry.expense_id);
      return ex?.ledger_name || null;
    }
    if (entry.entry_type === "invoice") {
      const inv = projectInvoices.find((d) => d.id === entry.document_id);
      return inv?.income_ledger_name || null;
    }
    if (entry.entry_type === "quote") {
      const quote = projectQuotes.find((d) => d.id === entry.document_id);
      return quote?.income_ledger_name || null;
    }
    if (entry.entry_type === "wage") {
      const w = projectWages.find((row) => row.id === entry.wage_id);
      return w?.ledger_name || null;
    }
    if (entry.entry_type === "travel") {
      const t = projectTravels.find((row) => row.id === entry.travel_id);
      return t?.ledger_name || null;
    }
    if (entry.entry_type === "payment" && entry.ledger_id) {
      const led = ledgers.find((l) => l.id === entry.ledger_id);
      if (!led) return null;
      return led.type === "expense" ? `${led.name} · credit` : led.name;
    }
    return null;
  }

  function matchesLinkDoc(d: PracticeDocument): boolean {
    if (
      linkClientOnly &&
      addType !== "rfq" &&
      project?.client_id &&
      d.party_id !== project.client_id
    ) {
      return false;
    }
    const q = linkQuery.trim().toLowerCase();
    if (!q) return true;
    return [d.number, d.title, d.party_name]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q));
  }

  function openAdd(type: AddKind = "note", opts?: { invoiceId?: number }) {
    setEditingEntry(null);
    setAddType(type);
    setAddOpen(true);
    if (type === "note") setNoteDate(todayIso());
    if (type === "expense") {
      setExpenseDate(todayIso());
      setExpenseSupplierId(null);
      setExpenseSupplierName("");
      setExpenseSupplierTrading(null);
    }
    if (type === "meeting") {
      setMeetDate(todayIso());
      setMeetTime(nowTime());
    }
    if (type === "travel") {
      setTravelDate(todayIso());
      setTravelStaffId("");
      setTravelKm("");
      setTravelPrice("");
      setTravelAmount("");
      setTravelNote("");
      setTravelLedgerId(defaultTravelLedgerId());
    }
    if (type === "wage") {
      setWageDate(todayIso());
      setWageStaffId("");
      setWageAmount("");
      setWageDays("");
      setWageRateAmount(0);
      setWageRatePeriod("week");
      setWageDeductions([]);
      setWageAdditions([]);
      setWageNote("");
      setWageOverride(false);
      setWageAbsent(false);
      setWageReason("");
      setWageLedgerId(defaultWageLedgerId());
    }
    if ((type === "quote" || type === "invoice" || type === "rfq") && project) {
      setLinkQuery("");
      setLinkClientOnly(type !== "rfq" && Boolean(project.client_id));
      setLinkBusy(true);
      practiceApi.documents
        .list(type)
        .then((rows) => setLinkDocs(rows.filter((d) => d.project_id !== project.id)))
        .catch(() => setLinkDocs([]))
        .finally(() => setLinkBusy(false));
    }
    if (type === "payment" && project) {
      setPayAmount("");
      setPayDate(todayIso());
      setPayMethod("eft");
      setPayNote("");
      setPayInvoiceIds(opts?.invoiceId ? [opts.invoiceId] : []);
      setPayLedgerId("");
      practiceApi.documents
        .list("invoice", project.id)
        .then((rows) => {
          setProjectInvoices(rows);
          if (opts?.invoiceId) {
            const inv = rows.find((d) => d.id === opts.invoiceId);
            if (inv) {
              setPayInvoiceIds([inv.id]);
              setPayAmount(String(inv.amount));
            }
            return;
          }
          const unpaid = rows.filter((d) => d.status !== "paid" && d.status !== "void");
          if (unpaid.length === 1) {
            setPayInvoiceIds([unpaid[0].id]);
            setPayAmount(String(unpaid[0].amount));
          }
        })
        .catch(() => setProjectInvoices([]));
    }
  }
  openAddRef.current = () => openAdd(addType);

  function openEdit(entry: PracticeEntry) {
    if (!isEditableTrail(entry)) return;
    setEditingEntry(entry);
    setAddType(entry.entry_type as AddKind);
    setAddOpen(true);
    if (entry.entry_type === "note") {
      setNoteTitle(entry.title);
      setNoteBody(entry.body || "");
      setNoteDate(entry.occurred_on || todayIso());
    }
    if (entry.entry_type === "travel") {
      const t = projectTravels.find((row) => row.id === entry.travel_id);
      setTravelStaffId(t ? String(t.staff_id) : "");
      setTravelLedgerId(t ? String(t.ledger_id) : defaultTravelLedgerId());
      setTravelKm(t ? String(t.km) : "");
      setTravelPrice(t ? String(t.price_per_litre) : "");
      setTravelAmount(t ? String(t.amount) : entry.amount != null ? String(entry.amount) : "");
      setTravelDate(t?.occurred_on || entry.occurred_on || todayIso());
      setTravelNote(t?.notes || "");
    }
    if (entry.entry_type === "meeting") {
      setMeetTitle(entry.title);
      setMeetBody(entry.body || "");
      setMeetDate(entry.occurred_on || todayIso());
      setMeetTime(entry.occurred_time || nowTime());
    }
    if (entry.entry_type === "payment") {
      const allocated = [
        ...(entry.document_ids || []),
        ...(entry.document_id && !(entry.document_ids || []).includes(entry.document_id)
          ? [entry.document_id]
          : []),
      ];
      setPayAmount(entry.amount != null ? String(entry.amount) : "");
      setPayDate(entry.occurred_on || todayIso());
      setPayInvoiceIds(allocated);
      setPayNote(entry.body || "");
      setPayMethod("eft");
      setPayLedgerId(entry.ledger_id ? String(entry.ledger_id) : "");
      if (project) {
        practiceApi.documents
          .list("invoice", project.id)
          .then(setProjectInvoices)
          .catch(() => setProjectInvoices([]));
      }
    }
    if (entry.entry_type === "expense") {
      const ex = projectExpenses.find((row) => row.id === entry.expense_id);
      setExpenseDesc(ex?.description || entry.title);
      setExpenseSupplierId(ex?.supplier_id ?? null);
      setExpenseSupplierName(ex?.supplier_name || ex?.vendor_name || "");
      setExpenseSupplierTrading(null);
      setExpenseAmount(ex ? String(ex.amount) : entry.amount != null ? String(entry.amount) : "");
      setExpenseLedgerId(ex ? String(ex.ledger_id) : "");
      setExpenseDate(ex?.incurred_on || entry.occurred_on || todayIso());
    }
    if (entry.entry_type === "wage") {
      const w = projectWages.find((row) => row.id === entry.wage_id);
      setWageStaffId(w ? String(w.staff_id) : "");
      setWageAmount(w ? String(wageGrossFrom(w)) : entry.amount != null ? String(entry.amount) : "");
      setWageDays(w?.days != null && w.days !== "" ? String(w.days) : "");
      {
        const snapRate = w?.rate_amount != null && w.rate_amount !== "" ? parseWageNumber(w.rate_amount) : 0;
        const daysNum = w?.days != null && w.days !== "" ? parseWageNumber(w.days) : 0;
        const inferred =
          w && snapRate <= 0 && daysNum > 0 ? roundCents(wageGrossFrom(w) / daysNum) : 0;
        setWageRatePeriod(w?.rate_period || (daysNum > 0 ? "day" : "week"));
        setWageRateAmount(snapRate > 0 ? snapRate : inferred);
      }
      setWageDeductions(
        (w?.deductions || []).map((d) => ({
          description: d.description,
          amount: String(d.amount),
        }))
      );
      setWageAdditions(
        (w?.additions || []).map((d) => ({
          description: d.description,
          amount: String(d.amount),
        }))
      );
      setWageDate(w?.occurred_on || entry.occurred_on || todayIso());
      setWageNote(w?.notes || "");
      setWageOverride(w?.kind === "commission");
      setWageAbsent(w?.kind === "absence");
      setWageReason(w?.override_reason || "");
      setWageLedgerId(w?.ledger_id ? String(w.ledger_id) : defaultWageLedgerId());
    }
  }

  function startNewDocument(kind: DocumentKind) {
    if (!project) return;
    closeAdd();
    router.push(
      documentEditorHref({
        kind,
        partyId: kind === "rfq" ? null : project.client_id,
        projectId: project.id,
        from: `/practice/file?id=${project.id}`,
      })
    );
  }

  async function linkExisting(doc: PracticeDocument) {
    if (!project) return;
    setSaving(true);
    try {
      setError(null);
      await practiceApi.documents.update(doc.id, { project_id: project.id });
      closeAdd();
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not link document");
    } finally {
      setSaving(false);
    }
  }

  async function saveInfo(patch: Partial<PracticeProjectDetail>) {
    if (!project) return;
    setSaving(true);
    try {
      setError(null);
      const next = await practiceApi.projects.update(project.id, {
        name: patch.name ?? project.name,
        reference: patch.reference ?? project.reference,
        client_id: patch.client_id === undefined ? project.client_id : patch.client_id,
        status: patch.status ?? project.status,
        started_on: patch.started_on !== undefined ? patch.started_on : project.started_on,
        due_on: patch.due_on !== undefined ? patch.due_on : project.due_on,
        summary: patch.summary ?? project.summary,
        checklist: patch.checklist ?? project.checklist ?? [],
      });
      setProject(next);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not save info sheet");
    } finally {
      setSaving(false);
    }
  }

  async function addNote() {
    if (!project || !noteTitle.trim()) return;
    setSaving(true);
    try {
      setError(null);
      if (editingEntry) {
        await practiceApi.projects.updateEntry(project.id, editingEntry.id, {
          title: noteTitle.trim(),
          body: noteBody.trim() || null,
          occurred_on: noteDate || todayIso(),
        });
      } else {
        await practiceApi.projects.addEntry(project.id, {
          entry_type: "note",
          title: noteTitle.trim(),
          body: noteBody.trim() || undefined,
          occurred_on: noteDate || todayIso(),
        });
      }
      setNoteTitle("");
      setNoteBody("");
      setNoteDate(todayIso());
      closeAdd();
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not save note");
    } finally {
      setSaving(false);
    }
  }

  async function addExpense() {
    if (!project || !expenseDesc.trim() || !expenseAmount || !expenseLedgerId) {
      setError("Expense needs a description, amount, and ledger");
      return;
    }
    setSaving(true);
    try {
      setError(null);
      const ledgerId = await pickOrCreateExpenseLedger(expenseLedgerId);
      if (!ledgerId) {
        setError("Pick or type an expense ledger");
        return;
      }
      const payload = {
        ledger_id: Number(ledgerId),
        description: expenseDesc.trim(),
        amount: Number(expenseAmount),
        incurred_on: expenseDate || todayIso(),
        supplier_id: expenseSupplierId,
      };
      if (editingEntry) {
        if (!editingEntry.expense_id) {
          setError("This expense line cannot be edited");
          return;
        }
        await practiceApi.expenses.update(editingEntry.expense_id, payload);
      } else {
        await practiceApi.expenses.create({
          project_id: project.id,
          ...payload,
        });
      }
      setExpenseDesc("");
      setExpenseSupplierId(null);
      setExpenseSupplierName("");
      setExpenseSupplierTrading(null);
      setExpenseAmount("");
      setExpenseDate(todayIso());
      setAddingExpenseLedger(false);
      setNewExpenseLedgerName("");
      setAddingExpenseVendor(false);
      setNewExpenseVendorName("");
      closeAdd();
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not save expense");
    } finally {
      setSaving(false);
    }
  }

  function invoicePayAmount(invoiceId: number): number {
    const inv = projectInvoices.find((d) => d.id === invoiceId);
    return inv ? Number(inv.amount) || 0 : 0;
  }

  function togglePayInvoice(invoiceId: number, on: boolean) {
    if (!on) {
      setPayInvoiceIds(payInvoiceIds.filter((id) => id !== invoiceId));
      return;
    }
    if (payInvoiceIds.includes(invoiceId)) return;
    const amt = invoicePayAmount(invoiceId);
    const received = parseMoneyInput(payAmount);
    const allocated = payInvoiceIds.reduce((sum, id) => sum + invoicePayAmount(id), 0);
    const remaining = roundCents(received - allocated);
    if (amt > remaining + 0.005) return;
    setPayInvoiceIds([...payInvoiceIds, invoiceId]);
  }

  function selectUnpaidInvoices() {
    const unpaid = projectInvoices.filter((d) => d.status !== "paid" && d.status !== "void");
    const received = parseMoneyInput(payAmount);
    if (!(received > 0)) {
      const ids = unpaid.map((d) => d.id);
      const sum = roundCents(unpaid.reduce((s, d) => s + (Number(d.amount) || 0), 0));
      setPayInvoiceIds(ids);
      if (sum > 0) setPayAmount(String(sum));
      return;
    }
    const next: number[] = [];
    let left = received;
    for (const inv of unpaid) {
      const amt = Number(inv.amount) || 0;
      if (amt > 0 && amt <= left + 0.005) {
        next.push(inv.id);
        left = roundCents(left - amt);
      }
    }
    setPayInvoiceIds(next);
  }

  async function addPayment() {
    if (!project || !payAmount) {
      setError("A received payment needs an amount");
      return;
    }
    const amount = Number(payAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a payment amount greater than zero");
      return;
    }
    const methodLabel =
      payMethod === "eft"
        ? "EFT"
        : payMethod === "cash"
          ? "Cash"
          : payMethod === "card"
            ? "Card"
            : "Other";
    const invoices = projectInvoices.filter((d) => payInvoiceIds.includes(d.id));
    const numbers = invoices.map((d) => d.number);
    const against = numbers.length ? `against ${numbers.join(", ")}` : null;
    const payLedger = ledgers.find((l) => String(l.id) === payLedgerId);
    const ledgerBit = payLedger
      ? payLedger.type === "expense"
        ? `credits ${payLedger.name}`
        : `to ${payLedger.name}`
      : null;
    const bits = [
      payDate ? `Received ${payDate}` : null,
      methodLabel,
      against,
      ledgerBit,
      payNote.trim() || null,
    ].filter(Boolean);
    let title =
      numbers.length > 0
        ? `Payment · ${numbers.join(", ")}`
        : payLedger
          ? `Payment · ${payLedger.name}`
          : "Payment received";
    if (title.length > 240) title = `Payment · ${numbers.length} invoices`;
    setSaving(true);
    try {
      setError(null);
      const payload = {
        title,
        body: bits.join(" · ") || null,
        amount,
        document_id: invoices[0]?.id ?? null,
        document_ids: invoices.map((d) => d.id),
        ledger_id: payLedgerId ? Number(payLedgerId) : null,
        occurred_on: payDate || todayIso(),
      };
      if (editingEntry) {
        await practiceApi.projects.updateEntry(project.id, editingEntry.id, payload);
      } else {
        await practiceApi.projects.addEntry(project.id, {
          entry_type: "payment",
          ...payload,
          body: payload.body || undefined,
        });
      }
      setPayAmount("");
      setPayNote("");
      setPayInvoiceIds([]);
      setPayLedgerId("");
      closeAdd();
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not save payment");
    } finally {
      setSaving(false);
    }
  }

  async function addMeeting() {
    if (!project || !meetTitle.trim()) {
      setError("A meeting needs a title");
      return;
    }
    setSaving(true);
    try {
      setError(null);
      if (editingEntry) {
        await practiceApi.projects.updateEntry(project.id, editingEntry.id, {
          title: meetTitle.trim(),
          body: meetBody.trim() || null,
          occurred_on: meetDate || todayIso(),
          occurred_time: meetTime || null,
        });
      } else {
        await practiceApi.projects.addEntry(project.id, {
          entry_type: "meeting",
          title: meetTitle.trim(),
          body: meetBody.trim() || undefined,
          occurred_on: meetDate || todayIso(),
          occurred_time: meetTime || undefined,
        });
      }
      setMeetTitle("");
      setMeetBody("");
      setMeetDate(todayIso());
      setMeetTime(nowTime());
      closeAdd();
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not save meeting");
    } finally {
      setSaving(false);
    }
  }

  const wageStaff = staffList.find((s) => String(s.id) === wageStaffId) ?? null;
  const editingWage = editingEntry?.wage_id
    ? projectWages.find((w) => w.id === editingEntry.wage_id)
    : undefined;
  const wagePeriod = wageRatePeriod || "week";
  const isDayWage = wagePeriod === "day";
  const shownRate = wageRateAmount;
  const daysWorked = parseMoneyInput(wageDays);
  const deductionTotal = wageLineTotal(wageDeductions);
  const additionTotal = wageLineTotal(wageAdditions);
  const wageGross = wageAbsent
    ? 0
    : wageOverride
      ? parseMoneyInput(wageAmount)
      : isDayWage
        ? roundCents(daysWorked * shownRate)
        : parseMoneyInput(wageAmount);
  const wageNet = wageAbsent
    ? 0
    : wageOverride
      ? roundCents(wageGross)
      : roundCents(wageGross + additionTotal - deductionTotal);
  const wageCanSave = wageAbsent
    ? Boolean(wageStaffId) && daysWorked > 0
    : wageOverride
      ? Boolean(wageStaffId) && parseMoneyInput(wageAmount) > 0 && wageReason.trim().length > 0
      : Boolean(wageStaffId) &&
        wageLinesComplete(wageDeductions) &&
        wageLinesComplete(wageAdditions) &&
        wageNet > 0 &&
        (isDayWage ? daysWorked > 0 && shownRate > 0 : parseMoneyInput(wageAmount) > 0);
  const wageDateLabel =
    wagePeriod === "day"
      ? "Date"
      : wagePeriod === "monthly"
        ? "Month ending"
        : wagePeriod === "biweekly"
          ? "Period ending"
          : "Week ending";

  async function addWage() {
    if (!project || !wageStaffId) {
      setError("Pick a staff member");
      return;
    }
    if (wageAbsent) {
      if (!(daysWorked > 0)) {
        setError("Enter how many days they were absent");
        return;
      }
    } else if (wageOverride) {
      if (!(parseMoneyInput(wageAmount) > 0)) {
        setError("Enter the commission amount");
        return;
      }
      if (!wageReason.trim()) {
        setError("Enter a reason for this commission");
        return;
      }
    } else {
      if (!wageLinesComplete(wageAdditions)) {
        setError("Each extra needs a description and an amount");
        return;
      }
      if (!wageLinesComplete(wageDeductions)) {
        setError("Each deduction needs a description and an amount");
        return;
      }
      if (isDayWage) {
        if (!(shownRate > 0)) {
          setError("This staff member has no daily rate. Set it on their staff card first.");
          return;
        }
        if (!(daysWorked > 0)) {
          setError("Enter how many days were worked");
          return;
        }
      } else if (!(parseMoneyInput(wageAmount) > 0)) {
        setError("Enter a wage amount greater than zero");
        return;
      }
      if (!(wageNet > 0)) {
        setError("Net wage must be greater than zero after extras and deductions");
        return;
      }
    }
    let ledgerId: string | null = wageLedgerId || null;
    if (!wageAbsent) {
      ledgerId = await pickOrCreateExpenseLedger(wageLedgerId);
      if (!ledgerId) {
        setError("Pick or type a wages ledger");
        return;
      }
    } else if (ledgerId && !ledgers.some((l) => String(l.id) === ledgerId)) {
      ledgerId = await pickOrCreateExpenseLedger(ledgerId);
    }
    setSaving(true);
    try {
      setError(null);
      const payload = wageAbsent
        ? {
            staff_id: Number(wageStaffId),
            occurred_on: wageDate || todayIso(),
            kind: "absence" as const,
            override_reason: wageReason.trim() || null,
            amount: 0,
            days: daysWorked,
            ledger_id: ledgerId ? Number(ledgerId) : null,
            notes: wageNote.trim() || null,
            deductions: [] as { description: string; amount: number }[],
            additions: [] as { description: string; amount: number }[],
          }
        : wageOverride
        ? {
            staff_id: Number(wageStaffId),
            occurred_on: wageDate || todayIso(),
            kind: "commission" as const,
            override_reason: wageReason.trim(),
            amount: parseMoneyInput(wageAmount),
            days: null,
            ledger_id: Number(ledgerId),
            notes: wageNote.trim() || null,
            deductions: [] as { description: string; amount: number }[],
            additions: [] as { description: string; amount: number }[],
          }
        : {
            staff_id: Number(wageStaffId),
            occurred_on: wageDate || todayIso(),
            kind: "wage" as const,
            override_reason: null,
            ledger_id: Number(ledgerId),
            notes: wageNote.trim() || null,
            deductions: wageDeductions.map((row) => ({
              description: row.description.trim(),
              amount: parseMoneyInput(row.amount),
            })),
            additions: wageAdditions.map((row) => ({
              description: row.description.trim(),
              amount: parseMoneyInput(row.amount),
            })),
            ...(isDayWage ? { days: daysWorked } : { amount: parseMoneyInput(wageAmount) }),
          };
      if (editingEntry) {
        if (!editingEntry.wage_id) {
          setError("This wage line cannot be edited");
          return;
        }
        await practiceApi.wages.update(editingEntry.wage_id, payload);
      } else {
        await practiceApi.wages.create({
          project_id: project.id,
          ...payload,
        });
      }
      setWageStaffId("");
      setWageAmount("");
      setWageDays("");
      setWageRateAmount(0);
      setWageRatePeriod("week");
      setWageDeductions([]);
      setWageAdditions([]);
      setWageNote("");
      setWageOverride(false);
      setWageAbsent(false);
      setWageReason("");
      setWageLedgerId(defaultWageLedgerId());
      setWageDate(todayIso());
      closeAdd();
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not save wages");
    } finally {
      setSaving(false);
    }
  }

  async function removeTrail() {
    if (!project || !editingEntry) return;
    const kind = ENTRY_LABEL[editingEntry.entry_type] || "line";
    const ok = window.confirm(
      editingEntry.entry_type === "wage"
        ? "Remove this wage from the paper trail? You can add it again with the correct days and rate. This does not change the staff card."
        : `Remove this ${kind.toLowerCase()} from the paper trail?`
    );
    if (!ok) return;
    setSaving(true);
    try {
      setError(null);
      await practiceApi.projects.deleteEntry(project.id, editingEntry.id);
      closeAdd();
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not remove this trail line");
    } finally {
      setSaving(false);
    }
  }

  async function addTravel() {
    if (!project) return;
    if (!travelStaffId) {
      setError("Pick who travelled");
      return;
    }
    const ledgerId = await pickOrCreateExpenseLedger(travelLedgerId);
    if (!ledgerId) {
      setError("Pick a travel / fuel ledger");
      return;
    }
    const km = parseMoneyInput(travelKm);
    const price = parseMoneyInput(travelPrice);
    const amount = parseMoneyInput(travelAmount);
    if (km < 0 || price < 0 || amount < 0) {
      setError("Mileage, price per litre and amount cannot be negative");
      return;
    }
    setSaving(true);
    try {
      setError(null);
      const payload = {
        project_id: project.id,
        staff_id: Number(travelStaffId),
        ledger_id: Number(ledgerId),
        km,
        price_per_litre: price,
        amount,
        occurred_on: travelDate || todayIso(),
        notes: travelNote.trim() || null,
      };
      if (editingEntry?.travel_id) {
        await practiceApi.travels.update(editingEntry.travel_id, payload);
      } else {
        await practiceApi.travels.create(payload);
      }
      setTravelStaffId("");
      setTravelKm("");
      setTravelPrice("");
      setTravelAmount("");
      setTravelNote("");
      closeAdd();
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not save traveling");
    } finally {
      setSaving(false);
    }
  }

  submitTrailRef.current = () => {
    if (saving) return;
    if (addType === "expense" && addingExpenseVendor) {
      void saveNewExpenseVendor();
      return;
    }
    if (addType === "expense" && addingExpenseLedger) {
      void saveNewExpenseLedger();
      return;
    }
    if (addType === "note") void addNote();
    else if (addType === "expense") void addExpense();
    else if (addType === "wage") void addWage();
    else if (addType === "travel") void addTravel();
    else if (addType === "meeting") void addMeeting();
    else if (addType === "payment") void addPayment();
    else if (addType === "quote" || addType === "invoice" || addType === "rfq") startNewDocument(addType);
  };

  if (!validId) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{error}</p>
        <Link href="/practice/projects" className="text-sm underline">
          Back to Projects
        </Link>
      </div>
    );
  }

  if (!project) {
    return <p className="text-sm text-muted-foreground">{error || "Opening project file…"}</p>;
  }

  const payReceived = parseMoneyInput(payAmount);
  const payAllocated = roundCents(
    payInvoiceIds.reduce((sum, invoiceId) => sum + invoicePayAmount(invoiceId), 0)
  );
  const payRemaining = roundCents(payReceived - payAllocated);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link
          href="/practice/projects"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Projects
        </Link>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-[hsl(var(--neon-cyan))]">
          Project file
        </p>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="page-title">{project.name}</h1>
            <p className="page-subtitle">
              {[project.reference || "—", project.name].join(" - ")}
              {project.client_id ? (
                <>
                  {" - "}
                  <Link
                    href={clientFileHref(project.client_id)}
                    className="underline-offset-2 hover:underline"
                  >
                    {project.client_name || "Client file"}
                  </Link>
                </>
              ) : (
                " - No client"
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {project.started_on
                ? `${prettyDate(project.started_on)} → ${
                    project.due_on ? prettyDate(project.due_on) : "open"
                  }`
                : project.due_on
                  ? `→ ${prettyDate(project.due_on)}`
                  : "No timeframe yet"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/practice/file/statement?id=${project.id}`}>
              <Button type="button" variant="outline">
                <ScrollText className="mr-1 h-4 w-4" />
                Pull statement
              </Button>
            </Link>
            <Button type="button" onClick={() => openAdd("note")}>
              <Plus className="mr-1 h-4 w-4" />
              Add
            </Button>
          </div>
        </div>
      </header>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle>Info sheet</CardTitle>
          <CardDescription>Cover of the file. Changes save when you leave a field.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2 space-y-1.5">
            <Label htmlFor="info-name">Name</Label>
            <Input
              id="info-name"
              defaultValue={project.name}
              key={`name-${project.updated_at}`}
              onBlur={(e) => {
                const next = e.target.value.trim();
                if (next && next !== project.name) void saveInfo({ name: next });
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="info-ref">Project number</Label>
            <Input
              id="info-ref"
              defaultValue={project.reference ?? ""}
              key={`ref-${project.updated_at}`}
              onBlur={(e) => {
                const next = e.target.value.trim() || null;
                if (next !== project.reference) void saveInfo({ reference: next });
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="info-client">Client</Label>
            <Select
              id="info-client"
              value={project.client_id ? String(project.client_id) : ""}
              onChange={(e) => {
                const next = e.target.value ? Number(e.target.value) : null;
                void saveInfo({ client_id: next });
              }}
            >
              <option value="">No client yet</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="info-status">Status</Label>
            <Select
              id="info-status"
              value={project.status}
              onChange={(e) => {
                const next = e.target.value as ProjectStatus;
                if (next === "completed" && !project.due_on) {
                  void saveInfo({
                    status: next,
                    due_on: new Date().toISOString().slice(0, 10),
                  });
                } else {
                  void saveInfo({ status: next });
                }
              }}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="info-start">Project started</Label>
            <Input
              id="info-start"
              type="date"
              defaultValue={project.started_on ?? ""}
              key={`start-${project.updated_at}`}
              onBlur={(e) => {
                const next = e.target.value || null;
                if (next !== project.started_on) void saveInfo({ started_on: next });
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="info-end">Completed</Label>
            <Input
              id="info-end"
              type="date"
              defaultValue={project.due_on ?? ""}
              key={`due-${project.updated_at}`}
              onBlur={(e) => {
                const next = e.target.value || null;
                if (next !== project.due_on) void saveInfo({ due_on: next });
              }}
            />
            <p className="text-[11px] text-muted-foreground">
              Leave blank while the project is still open.
            </p>
          </div>
          <div className="sm:col-span-2 space-y-1.5">
            <Label htmlFor="info-summary">Summary</Label>
            <textarea
              id="info-summary"
              defaultValue={project.summary ?? ""}
              key={`sum-${project.updated_at}`}
              rows={3}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onBlur={(e) => {
                const next = e.target.value.trim() || null;
                if (next !== project.summary) void saveInfo({ summary: next });
              }}
            />
          </div>
          <div className="sm:col-span-2 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Still to do</Label>
              {(() => {
                const items = project.checklist || [];
                const open = items.filter((i) => !i.done).length;
                return (
                  <span className="text-[11px] text-muted-foreground">
                    {items.length === 0
                      ? "Tick off leftover work so nothing is missed"
                      : `${open} open · ${items.length} total`}
                  </span>
                );
              })()}
            </div>
            <ul className="space-y-1">
              {(project.checklist || []).map((item) => (
                <li key={item.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[hsl(var(--neon-lime))]"
                    checked={item.done}
                    onChange={() => {
                      const next = (project.checklist || []).map((row) =>
                        row.id === item.id ? { ...row, done: !row.done } : row
                      );
                      void saveInfo({ checklist: next });
                    }}
                    aria-label={item.text}
                  />
                  <span
                    className={
                      item.done
                        ? "min-w-0 flex-1 text-sm text-muted-foreground line-through"
                        : "min-w-0 flex-1 text-sm"
                    }
                  >
                    {item.text}
                  </span>
                  <button
                    type="button"
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                    aria-label={`Remove ${item.text}`}
                    onClick={() => {
                      const next = (project.checklist || []).filter((row) => row.id !== item.id);
                      void saveInfo({ checklist: next });
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <Input
                value={todoDraft}
                onChange={(e) => setTodoDraft(e.target.value)}
                placeholder="Add a leftover: return keys, snag list, collect remaining paint…"
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  const text = todoDraft.trim();
                  if (!text) return;
                  const next = [
                    ...(project.checklist || []),
                    { id: `t-${Date.now()}`, text, done: false },
                  ];
                  setTodoDraft("");
                  void saveInfo({ checklist: next });
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={!todoDraft.trim()}
                onClick={() => {
                  const text = todoDraft.trim();
                  if (!text) return;
                  const next = [
                    ...(project.checklist || []),
                    { id: `t-${Date.now()}`, text, done: false },
                  ];
                  setTodoDraft("");
                  void saveInfo({ checklist: next });
                }}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {saving && <p className="sm:col-span-2 text-xs text-muted-foreground">Saving…</p>}
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-tight">Paper trail</h2>
          <span className="text-xs text-muted-foreground">
            {entries.length} {entries.length === 1 ? "entry" : "entries"} · oldest at the top ·
            double-click to edit
          </span>
        </div>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing recorded yet. Use + Add.</p>
        ) : (
          <ol className="space-y-2">
            {entries.map((entry) => (
              <li key={entry.id}>
                <Card
                  className={
                    entry.document_id &&
                    (entry.entry_type === "quote" ||
                      entry.entry_type === "invoice" ||
                      entry.entry_type === "rfq")
                      ? "cursor-pointer transition-colors hover:border-[hsl(var(--neon-cyan)/0.45)]"
                      : isEditableTrail(entry)
                        ? "cursor-pointer transition-colors hover:border-[hsl(var(--neon-amber)/0.45)]"
                        : undefined
                  }
                  onClick={() => {
                    if (!entry.document_id) return;
                    if (
                      entry.entry_type === "quote" ||
                      entry.entry_type === "invoice" ||
                      entry.entry_type === "rfq"
                    ) {
                      router.push(
                        documentEditorHref({
                          kind: entry.entry_type,
                          id: entry.document_id,
                          from: `/practice/file?id=${id}`,
                        })
                      );
                    }
                  }}
                  onDoubleClick={() => openEdit(entry)}
                >
                  <CardContent className="space-y-1.5 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={ENTRY_TILE[entry.entry_type]}>
                          {entry.entry_type === "wage"
                            ? projectWages.find((w) => w.id === entry.wage_id)?.kind === "commission"
                              ? "Commission"
                              : projectWages.find((w) => w.id === entry.wage_id)?.kind === "absence"
                                ? "Absent"
                                : ENTRY_LABEL[entry.entry_type]
                            : ENTRY_LABEL[entry.entry_type]}
                        </Badge>
                        {entry.entry_type === "invoice" &&
                          projectInvoices.find((d) => d.id === entry.document_id)?.status === "paid" && (
                            <Badge variant="danger">{documentStatusLabel("paid")}</Badge>
                          )}
                        <span className="text-sm font-medium">{entry.title}</span>
                        {trailLedgerName(entry) ? (
                          <span className="rounded-md border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            {trailLedgerName(entry)}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-3">
                        {entry.amount != null && (
                          <span className="text-xs font-semibold tabular-nums">
                            {formatMoney(entry.amount)}
                          </span>
                        )}
                        {!isOpenedMarker(entry) && (
                          <time className="text-[11px] tabular-nums text-muted-foreground">
                            {actionDate(entry)}
                          </time>
                        )}
                      </div>
                    </div>
                    {entry.entry_type === "invoice" &&
                      entry.document_id &&
                      projectInvoices.find((d) => d.id === entry.document_id)?.status !== "paid" && (
                        <div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              openAdd("payment", { invoiceId: entry.document_id! });
                            }}
                          >
                            Payment received
                          </Button>
                        </div>
                      )}
                    {entry.body && (
                      <p className="whitespace-pre-wrap text-sm text-muted-foreground">{entry.body}</p>
                    )}
                    {entry.entry_type === "expense" &&
                      (() => {
                        const ex = projectExpenses.find((row) => row.id === entry.expense_id);
                        if (!ex?.supplier_id) return null;
                        return (
                          <Link
                            href={supplierFileHref(ex.supplier_id)}
                            className="inline-block text-[11px] text-[hsl(var(--neon-violet))] underline-offset-2 hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {ex.supplier_name || ex.vendor_name || "Supplier"} statement
                          </Link>
                        );
                      })()}
                    {entry.entry_type === "wage" &&
                      (() => {
                        const w = projectWages.find((row) => row.id === entry.wage_id);
                        if (!w?.staff_id) return null;
                        return (
                          <Link
                            href={staffFileHref(w.staff_id)}
                            className="inline-block text-[11px] text-[hsl(var(--neon-cyan))] underline-offset-2 hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {w.staff_name || "Staff"} statement
                          </Link>
                        );
                      })()}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ol>
        )}
        <div className="flex justify-center pt-1">
          <Button type="button" variant="outline" onClick={() => openAdd(addType)}>
            <Plus className="mr-1 h-4 w-4" />
            Add to trail
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">Ctrl+Enter opens Add and saves</p>
        </div>
      </section>

      <Modal
        open={addOpen}
        onClose={closeAdd}
        title={editingEntry ? "Correct this trail line" : "Add to this file"}
        description={
          editingEntry
            ? "Correct what was recorded, or remove it from the trail and add it again. Ctrl+Enter saves."
            : "Notes, meeting, quote, invoice, RFQ, expense, or a received payment. Ctrl+Enter saves."
        }
      >
        <div className="space-y-4">
          {!editingEntry && (
          <div className="flex flex-wrap gap-2">
            {addTypes
              .filter((opt) => opt.show)
              .map((opt) => (
                <Button
                  key={opt.type}
                  type="button"
                  size="sm"
                  tabIndex={-1}
                  variant={addType === opt.type ? "default" : "outline"}
                  onClick={() => openAdd(opt.type)}
                >
                  {opt.label}
                  {opt.type === "rfq" && (
                    <span
                      className={`ml-1 text-[10px] font-normal ${
                        addType === "rfq" ? "text-primary-foreground/70" : "text-muted-foreground"
                      }`}
                    >
                      {RFQ_EXPANSION}
                    </span>
                  )}
                </Button>
              ))}
          </div>
          )}

          {addType === "note" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input
                  ref={trailDateRef}
                  type="date"
                  value={noteDate}
                  onChange={(e) => setNoteDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Title</Label>
                <Input
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  placeholder="Called client, site visit, reminder…"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Note</Label>
                <textarea
                  value={noteBody}
                  onChange={(e) => setNoteBody(e.target.value)}
                  rows={4}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <Button type="button" onClick={() => void addNote()} disabled={saving || !noteTitle.trim()}>
                {editingEntry ? "Save note" : "Add note"}
              </Button>
            </div>
          )}

          {addType === "expense" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Date incurred</Label>
                <Input
                  ref={trailDateRef}
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>What was spent</Label>
                <Input
                  value={expenseDesc}
                  onChange={(e) => setExpenseDesc(e.target.value)}
                  placeholder="Fuel, flowers wholesale, courier…"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Vendor</Label>
                <div className="flex flex-wrap items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <ClientPicker
                      key={vendorPickerKey}
                      kind="supplier"
                      value={expenseSupplierId}
                      selectedName={expenseSupplierName || null}
                      selectedTradingName={expenseSupplierTrading}
                      onSelect={(party) => {
                        setExpenseSupplierId(party.id);
                        setExpenseSupplierName(party.name);
                        setExpenseSupplierTrading(party.trading_name);
                      }}
                      onClear={() => {
                        setExpenseSupplierId(null);
                        setExpenseSupplierName("");
                        setExpenseSupplierTrading(null);
                      }}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setAddingExpenseVendor(true);
                      setNewExpenseVendorName("");
                    }}
                  >
                    Add vendor
                  </Button>
                </div>
                {addingExpenseVendor && (
                  <div className="flex flex-wrap items-end gap-2 pt-1">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <Label>New vendor name</Label>
                      <Input
                        value={newExpenseVendorName}
                        onChange={(e) => setNewExpenseVendorName(e.target.value)}
                        placeholder="Florist wholesale, hardware store…"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key !== "Enter") return;
                          e.preventDefault();
                          void saveNewExpenseVendor();
                        }}
                      />
                    </div>
                    <Button
                      type="button"
                      disabled={!newExpenseVendorName.trim() || saving}
                      onClick={() => void saveNewExpenseVendor()}
                    >
                      Save vendor
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setAddingExpenseVendor(false);
                        setNewExpenseVendorName("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Typing filters the list. Use Add vendor if they are not in the Suppliers library yet.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Amount</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Expense ledger</Label>
                <div className="flex flex-wrap items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <TypeaheadSelect
                      options={expenseLedgers.map((l) => ({ id: String(l.id), label: l.name }))}
                      value={expenseLedgerId}
                      onChange={setExpenseLedgerId}
                      placeholder="Type a ledger…"
                      emptyMessage="No ledgers match"
                      aria-label="Expense ledger"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setAddingExpenseLedger(true);
                      setNewExpenseLedgerName("");
                    }}
                  >
                    Add ledger
                  </Button>
                </div>
                {addingExpenseLedger && (
                  <div className="flex flex-wrap items-end gap-2 pt-1">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <Label>New ledger name</Label>
                      <Input
                        value={newExpenseLedgerName}
                        onChange={(e) => setNewExpenseLedgerName(e.target.value)}
                        placeholder="Fuel, Hire, Consumables…"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key !== "Enter") return;
                          e.preventDefault();
                          void saveNewExpenseLedger();
                        }}
                      />
                    </div>
                    <Button
                      type="button"
                      disabled={!newExpenseLedgerName.trim() || saving}
                      onClick={() => void saveNewExpenseLedger()}
                    >
                      Save ledger
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setAddingExpenseLedger(false);
                        setNewExpenseLedgerName("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Work Flow ledgers. Use Add ledger if the account is not in the list yet.
              </p>
              <Button
                type="button"
                onClick={() => void addExpense()}
                disabled={saving || !expenseDesc.trim() || !expenseAmount || !expenseLedgerId}
              >
                {editingEntry ? "Save expense" : "Add expense"}
              </Button>
            </div>
          )}

          {addType === "wage" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>{wageAbsent ? "First day absent" : wageOverride ? "Date" : wageDateLabel}</Label>
                <Input
                  ref={trailDateRef}
                  type="date"
                  value={wageDate}
                  onChange={(e) => setWageDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Staff member</Label>
                <TypeaheadSelect
                  options={staffList.map((s) => ({
                    id: String(s.id),
                    label: s.name,
                    hint: [s.known_as && s.known_as !== s.name ? s.known_as : null, s.job_title, staffRateHint(s)]
                      .filter(Boolean)
                      .join(" · ") || undefined,
                  }))}
                  value={wageStaffId}
                  onChange={(id) => {
                    setWageStaffId(id);
                    const sameStaff = Boolean(editingWage && String(editingWage.staff_id) === id);
                    if (sameStaff) return;
                    const s = staffList.find((row) => String(row.id) === id);
                    if (!s) {
                      setWageRateAmount(0);
                      setWageRatePeriod("week");
                      return;
                    }
                    const period = s.wage_period || "week";
                    const rate = parseWageNumber(s.wage_amount);
                    setWageRatePeriod(period);
                    setWageRateAmount(rate);
                    setWageLedgerId(
                      s.default_ledger_id ? String(s.default_ledger_id) : defaultWageLedgerId()
                    );
                    if (period === "day") {
                      setWageAmount("");
                      return;
                    }
                    if (rate > 0) setWageAmount(String(rate));
                  }}
                  placeholder="Type a staff name…"
                  emptyMessage="No staff match. Add them in the Staff library first."
                  aria-label="Staff member"
                />
              </div>
              {wageStaffId && (
                <>
                  <div className="space-y-1.5">
                    <Label>Wages ledger</Label>
                    <TypeaheadSelect
                      options={expenseLedgers.map((l) => ({ id: String(l.id), label: l.name }))}
                      value={wageLedgerId}
                      onChange={setWageLedgerId}
                      placeholder="Type Wages and salaries, or a new name…"
                      emptyMessage="No ledgers match — type a name to create one"
                      allowCustom
                      customHint="Create ledger"
                      aria-label="Wages ledger"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Defaults from this staff member&apos;s profile. Pick another ledger if this
                      payment should go elsewhere.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={wageOverride ? "default" : "outline"}
                      onClick={() => {
                        setWageOverride((on) => {
                          const next = !on;
                          if (next) {
                            setWageAbsent(false);
                            setWageDays("");
                            setWageDeductions([]);
                            setWageAdditions([]);
                          }
                          return next;
                        });
                      }}
                    >
                      {wageOverride ? "Using commission override" : "Override with commission"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={wageAbsent ? "default" : "outline"}
                      onClick={() => {
                        setWageAbsent((on) => {
                          const next = !on;
                          if (next) {
                            setWageOverride(false);
                            setWageAmount("0");
                            if (!wageDays) setWageDays("1");
                            setWageDeductions([]);
                            setWageAdditions([]);
                          }
                          return next;
                        });
                      }}
                    >
                      {wageAbsent ? "Marked absent" : "Absent"}
                    </Button>
                  </div>
                  {wageAbsent ? (
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label>Days absent</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={wageDays}
                          onChange={(e) => setWageDays(e.target.value)}
                          placeholder="e.g. 3"
                        />
                        <p className="text-[11px] text-muted-foreground">
                          From the date above
                          {daysWorked > 0 && wageDate
                            ? daysWorked === 1
                              ? " · that day only"
                              : ` · through ${addCalendarDays(wageDate, daysWorked - 1)}`
                            : ""}
                          . Decimals are fine — 0.5 is a half day.
                        </p>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Reason (optional)</Label>
                        <Input
                          value={wageReason}
                          onChange={(e) => setWageReason(e.target.value)}
                          placeholder="Sick, annual leave, family responsibility…"
                        />
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Records R0 on this file and on the staff profile so those days are not missing.
                      </p>
                    </div>
                  ) : wageOverride ? (
                    <>
                      <div className="space-y-1.5">
                        <Label>Commission amount</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={wageAmount}
                          onChange={(e) => setWageAmount(e.target.value)}
                          placeholder="0.00"
                        />
                        <p className="text-[11px] text-muted-foreground">
                          Replaces the daily wage on this payment — for a director profit split or similar.
                          It still lands on this person&apos;s wages statement.
                        </p>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Reason for this payment</Label>
                        <textarea
                          value={wageReason}
                          onChange={(e) => setWageReason(e.target.value)}
                          rows={3}
                          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          placeholder="Profit split on this job, director commission…"
                        />
                      </div>
                    </>
                  ) : isDayWage ? (
                    <>
                      <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
                        <p className="text-[11px] text-muted-foreground">
                          Wage per day{wageStaff?.name ? ` · ${wageStaff.name}` : ""}
                        </p>
                        <p className="text-lg font-semibold tabular-nums">
                          {shownRate > 0 ? formatMoney(shownRate) : "Not set"}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {editingEntry
                            ? "Locked on this payment. Later increases on the staff card do not change this line."
                            : "Taken from the staff card now, then frozen on this payment when you save."}
                        </p>
                        {!(shownRate > 0) && (
                          <p className="mt-1 text-xs text-destructive">
                            Set a daily rate on this staff card before loading wages.
                          </p>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label>Days worked</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={wageDays}
                          onChange={(e) => setWageDays(e.target.value)}
                          placeholder="e.g. 4.5"
                        />
                        <p className="text-[11px] text-muted-foreground">
                          Decimals are fine — 0.5 is a half day.
                        </p>
                      </div>
                    </>
                  ) : (
                    <div className="space-y-1.5">
                      <Label>Amount</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={wageAmount}
                        onChange={(e) => setWageAmount(e.target.value)}
                      />
                    </div>
                  )}
                  {!wageOverride && !wageAbsent && (
                    <>
                  <WageLineList
                    label="Additional income"
                    addLabel="Add extra"
                    noun="extra"
                    hint="Favours, performance boosts, odd jobs — each extra needs a description and an amount."
                    rows={wageAdditions}
                    onChange={setWageAdditions}
                  />
                  <WageLineList
                    label="Deductions"
                    addLabel="Add deduction"
                    noun="deduction"
                    hint="Every deduction needs a description and an amount, or the wage cannot be loaded."
                    rows={wageDeductions}
                    onChange={setWageDeductions}
                  />
                    </>
                  )}
                  {wageAbsent ? (
                    <p className="text-sm tabular-nums text-muted-foreground">
                      Absence · {formatWageDays(daysWorked) || "0"} days · {formatMoney(0)}
                    </p>
                  ) : wageGross > 0 || additionTotal > 0 ? (
                    <p
                      className={
                        wageNet > 0
                          ? "text-sm tabular-nums text-muted-foreground"
                          : "text-sm tabular-nums text-destructive"
                      }
                    >
                      {wageOverride
                        ? `Commission ${formatMoney(wageGross)}`
                        : isDayWage
                          ? `${formatWageDays(daysWorked) || "0"} days × ${formatMoney(shownRate)} per day = ${formatMoney(wageGross)}`
                          : `Gross ${formatMoney(wageGross)}`}
                      {!wageOverride && additionTotal > 0 ? ` + extras ${formatMoney(additionTotal)}` : ""}
                      {!wageOverride && deductionTotal > 0 ? ` − deductions ${formatMoney(deductionTotal)}` : ""}
                      {!wageOverride ? ` · net ${formatMoney(wageNet)}` : ""}
                    </p>
                  ) : null}
                  {!wageOverride && !wageAbsent && (
                  <div className="space-y-1.5">
                    <Label>Notes (saved for HR)</Label>
                    <textarea
                      value={wageNote}
                      onChange={(e) => setWageNote(e.target.value)}
                      rows={3}
                      className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      placeholder="How they worked this period — used in HR later."
                    />
                  </div>
                  )}
                  <Button
                    type="button"
                    onClick={() => void addWage()}
                    disabled={saving || !wageCanSave}
                  >
                    {editingEntry
                      ? wageAbsent
                        ? "Save absence"
                        : wageOverride
                          ? "Save commission"
                          : "Save wages"
                      : wageAbsent
                        ? "Add absence"
                        : wageOverride
                          ? "Add commission"
                          : "Add wages"}
                  </Button>
                </>
              )}
            </div>
          )}

          {(addType === "quote" || addType === "invoice" || addType === "rfq") && (
            <div className="space-y-3">
              {addType === "rfq" && (
                <p className="text-[11px] text-muted-foreground">
                  {RFQ_EXPANSION} — item, description and quantity only. No prices.
                </p>
              )}
              <Button type="button" onClick={() => startNewDocument(addType)}>
                <Plus className="mr-1 h-4 w-4" />
                New {addType === "rfq" ? "RFQ" : addType}
              </Button>
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Label>Or link an existing {addType === "rfq" ? "RFQ" : addType}</Label>
                  {addType !== "rfq" && (
                    <label
                      className={cn(
                        "flex items-center gap-1.5 text-sm",
                        project.client_id ? "cursor-pointer" : "cursor-not-allowed text-muted-foreground"
                      )}
                      title={
                        project.client_id
                          ? "Show only this client's documents"
                          : "Attach a client on the info sheet first"
                      }
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[hsl(var(--neon-magenta))]"
                        checked={linkClientOnly}
                        disabled={!project.client_id}
                        onChange={(e) => setLinkClientOnly(e.target.checked)}
                      />
                      Filter by Client
                    </label>
                  )}
                </div>
                <Input
                  value={linkQuery}
                  onChange={(e) => setLinkQuery(e.target.value)}
                  placeholder={
                    addType === "rfq"
                      ? "Search number, reference, supplier…"
                      : linkClientOnly
                        ? "Search number or reference…"
                        : "Search number, reference, client…"
                  }
                />
              </div>
              <ul className="max-h-56 space-y-1 overflow-y-auto">
                {linkBusy && <li className="text-xs text-muted-foreground">Loading…</li>}
                {!linkBusy &&
                  linkDocs
                    .filter(matchesLinkDoc)
                    .map((d) => (
                      <li key={d.id}>
                        <button
                          type="button"
                          disabled={saving}
                          className="flex w-full items-start justify-between gap-3 rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-50"
                          onClick={() => void linkExisting(d)}
                        >
                          <span className="min-w-0">
                            <span className="font-medium tabular-nums">{d.number}</span>
                            {d.title ? (
                              <span className="text-muted-foreground"> · {d.title}</span>
                            ) : null}
                            <span className="mt-0.5 block text-[11px] text-muted-foreground">
                              {[d.party_name, d.project_name ? `on ${d.project_name}` : "not on a file"]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </span>
                          {addType !== "rfq" && (
                            <span className="shrink-0 tabular-nums text-xs font-semibold">
                              {formatMoney(d.amount)}
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                {!linkBusy && linkDocs.filter(matchesLinkDoc).length === 0 && (
                    <li className="text-xs text-muted-foreground">
                      {linkClientOnly && addType !== "rfq" && project.client_id
                        ? `No spare ${addType}s for this client. Create a new one, or show all.`
                        : `No spare ${addType === "rfq" ? "RFQs" : `${addType}s`} to link. Create a new one.`}
                    </li>
                  )}
              </ul>
            </div>
          )}

          {addType === "travel" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input
                  ref={trailDateRef}
                  type="date"
                  value={travelDate}
                  onChange={(e) => setTravelDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Who travelled</Label>
                <TypeaheadSelect
                  options={staffList.map((s) => ({
                    id: String(s.id),
                    label: s.name,
                    hint: s.job_title || undefined,
                  }))}
                  value={travelStaffId}
                  onChange={setTravelStaffId}
                  placeholder="Type a staff name…"
                  emptyMessage="No staff match"
                  aria-label="Who travelled"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Ledger</Label>
                <TypeaheadSelect
                  options={expenseLedgers.map((l) => ({ id: String(l.id), label: l.name }))}
                  value={travelLedgerId}
                  onChange={setTravelLedgerId}
                  placeholder="Fuel, Travel…"
                  emptyMessage="No ledgers match"
                  aria-label="Travel ledger"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Mileage (km)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    value={travelKm}
                    onChange={(e) => setTravelKm(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Price per litre</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={travelPrice}
                    onChange={(e) => setTravelPrice(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Amount paid</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={travelAmount}
                    onChange={(e) => setTravelAmount(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Note</Label>
                <Input
                  value={travelNote}
                  onChange={(e) => setTravelNote(e.target.value)}
                  placeholder="Trip, vehicle…"
                />
              </div>
              <Button
                type="button"
                onClick={() => void addTravel()}
                disabled={saving || !travelStaffId || !travelLedgerId}
              >
                {editingEntry ? "Save traveling" : "Add traveling"}
              </Button>
            </div>
          )}

          {addType === "meeting" && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Date</Label>
                  <Input
                    ref={trailDateRef}
                    type="date"
                    value={meetDate}
                    onChange={(e) => setMeetDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Time</Label>
                  <Input type="time" value={meetTime} onChange={(e) => setMeetTime(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Title</Label>
                <Input
                  value={meetTitle}
                  onChange={(e) => setMeetTitle(e.target.value)}
                  placeholder="Site visit, client meeting, install…"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <textarea
                  value={meetBody}
                  onChange={(e) => setMeetBody(e.target.value)}
                  rows={3}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="Who, where, what to take…"
                />
              </div>
              <Button
                type="button"
                onClick={() => void addMeeting()}
                disabled={saving || !meetTitle.trim()}
              >
                {editingEntry ? "Save meeting" : "Add meeting"}
              </Button>
            </div>
          )}

          {addType === "payment" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Date received</Label>
                <Input
                  ref={trailDateRef}
                  type="date"
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                />
              </div>
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
              <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-md border border-[hsl(var(--neon-lime)/0.35)] bg-[hsl(var(--neon-lime)/0.08)] px-3 py-2">
                <span className="text-sm font-medium">Remaining to allocate</span>
                <span
                  className={cn(
                    "text-lg font-bold tabular-nums",
                    payRemaining === 0 && payReceived > 0
                      ? "text-[hsl(var(--neon-lime))]"
                      : payRemaining < 0
                        ? "text-destructive"
                        : "text-foreground"
                  )}
                >
                  {formatMoney(payRemaining)}
                </span>
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
                <div className="flex items-center justify-between gap-2">
                  <Label>Allocate to invoices</Label>
                  {projectInvoices.some((d) => d.status !== "paid" && d.status !== "void") && (
                    <button
                      type="button"
                      className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                      onClick={selectUnpaidInvoices}
                    >
                      Select unpaid
                    </button>
                  )}
                </div>
                <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-input p-2">
                  {projectInvoices.length === 0 ? (
                    <li className="text-xs text-muted-foreground">No invoices on this file yet.</li>
                  ) : (
                    projectInvoices.map((inv) => {
                      const selected = payInvoiceIds.includes(inv.id);
                      const amt = Number(inv.amount) || 0;
                      const fits = selected || amt <= payRemaining + 0.005;
                      return (
                      <li key={inv.id}>
                        <label
                          className={cn(
                            "flex items-center gap-2 rounded-sm px-1 py-1 text-sm",
                            fits ? "cursor-pointer hover:bg-accent/60" : "cursor-not-allowed opacity-50"
                          )}
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-[hsl(var(--neon-lime))]"
                            checked={selected}
                            disabled={!fits}
                            onChange={(e) => togglePayInvoice(inv.id, e.target.checked)}
                          />
                          <span className="min-w-0 flex-1 truncate">
                            {inv.number}
                            {inv.title ? ` · ${inv.title}` : ""}
                            {inv.status === "paid" ? " · Paid" : ""}
                            {selected ? " · will be Paid" : ""}
                          </span>
                          <span className="shrink-0 tabular-nums text-xs font-semibold">
                            {formatMoney(inv.amount)}
                          </span>
                        </label>
                      </li>
                      );
                    })
                  )}
                </ul>
                <p className="text-[11px] text-muted-foreground">
                  {payReceived <= 0
                    ? "Enter the amount received, then tick invoices. Each allocated invoice is marked Paid."
                    : payRemaining === 0 && payInvoiceIds.length > 0
                      ? "Fully allocated — ticked invoices will be marked Paid."
                      : payRemaining > 0
                        ? `Tick an invoice that fits the remaining ${formatMoney(payRemaining)}.`
                        : "Allocated more than received. Untick an invoice."}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Allocate to ledger (optional)</Label>
                <TypeaheadSelect
                  options={ledgers
                    .filter((l) => !l.is_archived)
                    .map((l) => ({
                      id: String(l.id),
                      label: l.name,
                      hint: l.type === "expense" ? "Expense · credits this account" : "Income",
                    }))}
                  value={payLedgerId}
                  onChange={setPayLedgerId}
                  placeholder="Type a ledger…"
                  emptyMessage="No Work Flow ledgers match"
                  allowEmpty
                  emptyLabel="No ledger"
                  aria-label="Payment ledger"
                />
                <p className="text-[11px] text-muted-foreground">
                  For refunds (e.g. a director paying back a cash advance), pick the expense ledger.
                  That credits the account — it does not add as spend.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Note</Label>
                <Input
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                  placeholder="Deposit, progress payment, reference…"
                />
              </div>
              <Button
                type="button"
                onClick={() => void addPayment()}
                disabled={saving || !payAmount}
              >
                {editingEntry ? "Save payment" : "Record payment"}
              </Button>
            </div>
          )}

          {editingEntry && isEditableTrail(editingEntry) && (
            <div className="border-t border-border pt-3">
              <Button
                type="button"
                variant="destructive"
                disabled={saving}
                onClick={() => void removeTrail()}
              >
                Remove from trail
              </Button>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Use this when the line was loaded with the wrong figures. You can add it again after.
              </p>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
