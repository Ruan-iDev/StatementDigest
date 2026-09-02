"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Plus, ScrollText, X } from "lucide-react";
import { api, type Ledger } from "@/lib/api";
import { formatMoney } from "@/lib/utils";
import { formatWageDays, staffWagePeriodLabel } from "@/modules/practice/lib/types";
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
  supplierFileHref,
  type DocumentKind,
  type EntryType,
  type PracticeDocument,
  type PracticeEntry,
  type PracticeExpense,
  type PracticeParty,
  type PracticeProjectDetail,
  type PracticeStaff,
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
  expense: "Expense",
  payment: "Payment",
  file: "File",
  status: "Status",
  task: "Task",
  meeting: "Meeting",
  wage: "Wages",
};

type AddKind = "note" | "quote" | "invoice" | "expense" | "payment" | "meeting" | "wage";

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
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
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
  const [expenseDate, setExpenseDate] = useState(todayIso);
  const [projectExpenses, setProjectExpenses] = useState<PracticeExpense[]>([]);
  const [editingEntry, setEditingEntry] = useState<PracticeEntry | null>(null);
  const [linkDocs, setLinkDocs] = useState<PracticeDocument[]>([]);
  const [linkQuery, setLinkQuery] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(todayIso);
  const [payMethod, setPayMethod] = useState("eft");
  const [payNote, setPayNote] = useState("");
  const [payInvoiceId, setPayInvoiceId] = useState("");
  const [projectInvoices, setProjectInvoices] = useState<PracticeDocument[]>([]);
  const [meetTitle, setMeetTitle] = useState("");
  const [meetBody, setMeetBody] = useState("");
  const [meetDate, setMeetDate] = useState(todayIso);
  const [meetTime, setMeetTime] = useState(nowTime);
  const [staffList, setStaffList] = useState<PracticeStaff[]>([]);
  const [projectWages, setProjectWages] = useState<PracticeWage[]>([]);
  const [wageStaffId, setWageStaffId] = useState("");
  const [wageAmount, setWageAmount] = useState("");
  const [wageDays, setWageDays] = useState("");
  const [wageRateAmount, setWageRateAmount] = useState(0);
  const [wageRatePeriod, setWageRatePeriod] = useState("week");
  const [wageDeductions, setWageDeductions] = useState<WageLineDraft[]>([]);
  const [wageAdditions, setWageAdditions] = useState<WageLineDraft[]>([]);
  const [wageDate, setWageDate] = useState(todayIso);
  const [wageNote, setWageNote] = useState("");

  const validId = Number.isFinite(id) && id > 0;

  const addTypes: { type: AddKind; label: string; show: boolean }[] = [
    { type: "note", label: "Notes", show: true },
    { type: "quote", label: "Quote", show: flags.quotes_enabled },
    { type: "invoice", label: "Invoice", show: flags.invoices_enabled },
    { type: "expense", label: "Expense", show: true },
    { type: "wage", label: "Wages", show: true },
    { type: "payment", label: "Received payment", show: true },
    { type: "meeting", label: "Meeting", show: true },
  ];

  async function load() {
    if (!validId) return;
    const [detail, partyList, ledgerList, expenseList, staffRows, wageRows] = await Promise.all([
      practiceApi.projects.get(id),
      practiceApi.parties.list("client"),
      api.ledgers.list(),
      practiceApi.expenses.list(id),
      practiceApi.staff.list(),
      practiceApi.wages.list({ projectId: id }),
    ]);
    setProject(detail);
    setClients(partyList);
    setLedgers(ledgerList);
    setProjectExpenses(expenseList);
    setStaffList(staffRows);
    setProjectWages(wageRows);
  }

  useEffect(() => {
    if (!ready || !flags.projects_enabled) return;
    if (!validId) {
      setError("Open a project from the Projects library.");
      return;
    }
    load().catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to open file"));
  }, [id, validId, ready, flags.projects_enabled]);

  if (ready && !flags.projects_enabled) {
    return <FeatureOffPage title="Projects" />;
  }

  const entries: PracticeEntry[] = trailOldestFirst(project?.entries ?? []);
  const expenseLedgers = ledgers.filter((l) => l.type === "expense" && !l.is_archived);

  function closeAdd() {
    setAddOpen(false);
    setEditingEntry(null);
  }

  function openAdd(type: AddKind = "note") {
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
    }
    if ((type === "quote" || type === "invoice") && project) {
      setLinkQuery("");
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
      setPayInvoiceId("");
      practiceApi.documents
        .list("invoice", project.id)
        .then(setProjectInvoices)
        .catch(() => setProjectInvoices([]));
    }
  }

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
    if (entry.entry_type === "meeting") {
      setMeetTitle(entry.title);
      setMeetBody(entry.body || "");
      setMeetDate(entry.occurred_on || todayIso());
      setMeetTime(entry.occurred_time || nowTime());
    }
    if (entry.entry_type === "payment") {
      setPayAmount(entry.amount != null ? String(entry.amount) : "");
      setPayDate(entry.occurred_on || todayIso());
      setPayInvoiceId(entry.document_id ? String(entry.document_id) : "");
      setPayNote(entry.body || "");
      setPayMethod("eft");
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
    }
  }

  function startNewDocument(kind: DocumentKind) {
    if (!project) return;
    closeAdd();
    router.push(
      documentEditorHref({
        kind,
        partyId: project.client_id,
        projectId: project.id,
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
      const payload = {
        ledger_id: Number(expenseLedgerId),
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
      closeAdd();
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not save expense");
    } finally {
      setSaving(false);
    }
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
    const invoice = projectInvoices.find((d) => String(d.id) === payInvoiceId);
    const bits = [
      payDate ? `Received ${payDate}` : null,
      methodLabel,
      invoice ? `against ${invoice.number}` : null,
      payNote.trim() || null,
    ].filter(Boolean);
    const title = invoice ? `Payment · ${invoice.number}` : "Payment received";
    setSaving(true);
    try {
      setError(null);
      if (editingEntry) {
        await practiceApi.projects.updateEntry(project.id, editingEntry.id, {
          title,
          body: editingEntry.entry_type === "payment" ? bits.join(" · ") || null : payNote.trim() || null,
          amount,
          document_id: invoice ? invoice.id : null,
          occurred_on: payDate || todayIso(),
        });
      } else {
        await practiceApi.projects.addEntry(project.id, {
          entry_type: "payment",
          title,
          body: bits.join(" · ") || undefined,
          amount,
          document_id: invoice ? invoice.id : null,
          occurred_on: payDate || todayIso(),
        });
      }
      setPayAmount("");
      setPayNote("");
      setPayInvoiceId("");
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
  const wageGross = isDayWage
    ? roundCents(daysWorked * shownRate)
    : parseMoneyInput(wageAmount);
  const wageNet = roundCents(wageGross + additionTotal - deductionTotal);
  const wageCanSave =
    Boolean(wageStaffId) &&
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
    setSaving(true);
    try {
      setError(null);
      const payload = {
        staff_id: Number(wageStaffId),
        occurred_on: wageDate || todayIso(),
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
                    entry.document_id && (entry.entry_type === "quote" || entry.entry_type === "invoice")
                      ? "cursor-pointer transition-colors hover:border-[hsl(var(--neon-cyan)/0.45)]"
                      : isEditableTrail(entry)
                        ? "cursor-pointer transition-colors hover:border-[hsl(var(--neon-amber)/0.45)]"
                        : undefined
                  }
                  onClick={() => {
                    if (!entry.document_id) return;
                    if (entry.entry_type === "quote" || entry.entry_type === "invoice") {
                      router.push(documentEditorHref({ kind: entry.entry_type, id: entry.document_id }));
                    }
                  }}
                  onDoubleClick={() => openEdit(entry)}
                >
                  <CardContent className="space-y-1.5 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{ENTRY_LABEL[entry.entry_type]}</Badge>
                        <span className="text-sm font-medium">{entry.title}</span>
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
          <Button type="button" variant="outline" onClick={() => openAdd("note")}>
            <Plus className="mr-1 h-4 w-4" />
            Add to trail
          </Button>
        </div>
      </section>

      <Modal
        open={addOpen}
        onClose={closeAdd}
        title={editingEntry ? "Correct this trail line" : "Add to this file"}
        description={
          editingEntry
            ? "Correct what was recorded, or remove it from the trail and add it again. Quotes and invoices still open in their own editor."
            : "Notes, meeting, quote, invoice, expense, or a received payment. Date each one to when it happened."
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
                  variant={addType === opt.type ? "default" : "outline"}
                  onClick={() => openAdd(opt.type)}
                >
                  {opt.label}
                </Button>
              ))}
          </div>
          )}

          {addType === "note" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input type="date" value={noteDate} onChange={(e) => setNoteDate(e.target.value)} />
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
                <Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
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
                <ClientPicker
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
                <p className="text-[11px] text-muted-foreground">
                  Linked to the Suppliers library, so spend rolls onto that supplier&apos;s statement.
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
                <TypeaheadSelect
                  options={expenseLedgers.map((l) => ({ id: String(l.id), label: l.name }))}
                  value={expenseLedgerId}
                  onChange={setExpenseLedgerId}
                  placeholder="Type a ledger…"
                  emptyMessage="No ledgers match"
                  aria-label="Expense ledger"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                This uses your core ledger accounts so project running costs roll toward the same
                books as statement categorisation.
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
                    <Label>{wageDateLabel}</Label>
                    <Input type="date" value={wageDate} onChange={(e) => setWageDate(e.target.value)} />
                  </div>
                  {isDayWage ? (
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
                  {(wageGross > 0 || additionTotal > 0) && (
                    <p
                      className={
                        wageNet > 0
                          ? "text-sm tabular-nums text-muted-foreground"
                          : "text-sm tabular-nums text-destructive"
                      }
                    >
                      {isDayWage
                        ? `${formatWageDays(daysWorked) || "0"} days × ${formatMoney(shownRate)} per day = ${formatMoney(wageGross)}`
                        : `Gross ${formatMoney(wageGross)}`}
                      {additionTotal > 0 ? ` + extras ${formatMoney(additionTotal)}` : ""}
                      {deductionTotal > 0 ? ` − deductions ${formatMoney(deductionTotal)}` : ""}
                      {` · net ${formatMoney(wageNet)}`}
                    </p>
                  )}
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
                  <Button
                    type="button"
                    onClick={() => void addWage()}
                    disabled={saving || !wageCanSave}
                  >
                    {editingEntry ? "Save wages" : "Add wages"}
                  </Button>
                </>
              )}
            </div>
          )}

          {(addType === "quote" || addType === "invoice") && (
            <div className="space-y-3">
              <Button type="button" onClick={() => startNewDocument(addType)}>
                <Plus className="mr-1 h-4 w-4" />
                New {addType}
              </Button>
              <div className="space-y-1.5">
                <Label>Or link an existing {addType}</Label>
                <Input
                  value={linkQuery}
                  onChange={(e) => setLinkQuery(e.target.value)}
                  placeholder="Search number, reference, client…"
                />
              </div>
              <ul className="max-h-56 space-y-1 overflow-y-auto">
                {linkBusy && <li className="text-xs text-muted-foreground">Loading…</li>}
                {!linkBusy &&
                  linkDocs
                    .filter((d) => {
                      const q = linkQuery.trim().toLowerCase();
                      if (!q) return true;
                      return [d.number, d.title, d.party_name]
                        .filter(Boolean)
                        .some((v) => String(v).toLowerCase().includes(q));
                    })
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
                          <span className="shrink-0 tabular-nums text-xs font-semibold">
                            {formatMoney(d.amount)}
                          </span>
                        </button>
                      </li>
                    ))}
                {!linkBusy && linkDocs.length === 0 && (
                  <li className="text-xs text-muted-foreground">
                    No spare {addType}s to link. Create a new one.
                  </li>
                )}
              </ul>
            </div>
          )}

          {addType === "meeting" && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Date</Label>
                  <Input type="date" value={meetDate} onChange={(e) => setMeetDate(e.target.value)} />
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
                <Label>Against invoice (optional)</Label>
                <Select value={payInvoiceId} onChange={(e) => setPayInvoiceId(e.target.value)}>
                  <option value="">Not tied to an invoice</option>
                  {projectInvoices.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.number}
                      {inv.title ? ` · ${inv.title}` : ""} · {formatMoney(inv.amount)}
                    </option>
                  ))}
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
