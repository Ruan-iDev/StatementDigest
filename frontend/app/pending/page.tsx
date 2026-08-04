"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Camera, ChevronDown, HelpCircle, ListPlus, Paperclip } from "lucide-react";
import { api, getStoredProfileId, type Ledger, type TrainingReason, type Transaction } from "@/lib/api";
import { useProfile } from "@/components/profile-provider";
import { formatDate, formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { CreateLedgerModal } from "@/components/create-ledger-modal";
import { LedgerAssignPicker } from "@/components/ledger-assign-picker";
import { useLicenseOptional } from "@/components/license-provider";

type TxTab = "unallocated" | "allocated";

/** monthKey (YYYY-MM) → true if collapsed */
type MonthCollapseMap = Record<string, boolean>;

type StoredCollapse = {
  unallocated: MonthCollapseMap;
  allocated: MonthCollapseMap;
};

function collapseStorageKey(profileId: number | null): string {
  return `ledgerflow-tx-month-collapse-p${profileId ?? "default"}`;
}

function loadCollapseState(profileId: number | null): StoredCollapse {
  if (typeof window === "undefined") {
    return { unallocated: {}, allocated: {} };
  }
  try {
    const raw = localStorage.getItem(collapseStorageKey(profileId));
    if (!raw) return { unallocated: {}, allocated: {} };
    const parsed = JSON.parse(raw) as Partial<StoredCollapse>;
    return {
      unallocated: parsed.unallocated || {},
      allocated: parsed.allocated || {},
    };
  } catch {
    return { unallocated: {}, allocated: {} };
  }
}

function saveCollapseState(profileId: number | null, state: StoredCollapse) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(collapseStorageKey(profileId), JSON.stringify(state));
  } catch {
    /* ignore quota */
  }
}

/** Drop collapse memory so wiped months don't reappear collapsed after re-import. */
function clearCollapseMemory(
  profileId: number | null,
  scope?: { year?: number; month?: number | null }
) {
  if (typeof window === "undefined") return { unallocated: {}, allocated: {} } as StoredCollapse;

  const year = scope?.year;
  const month = scope?.month;

  // Full clear when no scope (or caller wants hard reset)
  if (year == null) {
    try {
      localStorage.removeItem(collapseStorageKey(profileId));
    } catch {
      /* ignore */
    }
    return { unallocated: {}, allocated: {} };
  }

  const all = loadCollapseState(profileId);
  const prune = (map: MonthCollapseMap): MonthCollapseMap => {
    const next: MonthCollapseMap = {};
    for (const [key, collapsed] of Object.entries(map)) {
      // key = YYYY-MM
      const [yStr, mStr] = key.split("-");
      const y = Number(yStr);
      const m = Number(mStr);
      if (y === year && (month == null || m === month)) {
        continue; // drop wiped period
      }
      next[key] = collapsed;
    }
    return next;
  };
  const cleaned: StoredCollapse = {
    unallocated: prune(all.unallocated),
    allocated: prune(all.allocated),
  };
  const empty =
    Object.keys(cleaned.unallocated).length === 0 &&
    Object.keys(cleaned.allocated).length === 0;
  if (empty) {
    try {
      localStorage.removeItem(collapseStorageKey(profileId));
    } catch {
      /* ignore */
    }
    return { unallocated: {}, allocated: {} };
  }
  saveCollapseState(profileId, cleaned);
  return cleaned;
}

/**
 * Transactions workspace — Unallocated + Allocated tabs, month sections.
 */
export default function PendingPage() {
  const { active } = useProfile();
  const profileId = active?.id ?? getStoredProfileId();
  const license = useLicenseOptional();
  const readOnly = Boolean(license?.readOnly);

  const [tab, setTab] = useState<TxTab>("unallocated");
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [unallocatedCount, setUnallocatedCount] = useState(0);
  const [allocatedCount, setAllocatedCount] = useState(0);
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [q, setQ] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [bulkLedger, setBulkLedger] = useState("");
  const [rowLedger, setRowLedger] = useState<Record<number, string>>({});
  const [expandedNotes, setExpandedNotes] = useState<Set<number>>(new Set());
  const [noteDrafts, setNoteDrafts] = useState<Record<number, string>>({});
  const [noteSaving, setNoteSaving] = useState<Record<number, boolean>>({});
  const [constructionTip, setConstructionTip] = useState<number | null>(null);
  const [trainOpenId, setTrainOpenId] = useState<number | null>(null);
  const [trainReasons, setTrainReasons] = useState<TrainingReason[]>([]);
  const [trainReason, setTrainReason] = useState("ghost_transaction");
  const [trainDetail, setTrainDetail] = useState("");
  const [trainCustom, setTrainCustom] = useState("");
  const [trainBusy, setTrainBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Collapsed month keys for current tab (YYYY-MM → true) */
  const [collapsedMonths, setCollapsedMonths] = useState<MonthCollapseMap>({});

  // Rule modal state
  const [ruleOpen, setRuleOpen] = useState(false);
  const [ruleName, setRuleName] = useState("");
  const [ruleMatch, setRuleMatch] = useState("contains");
  const [ruleValue, setRuleValue] = useState("");
  const [ruleLedger, setRuleLedger] = useState("");
  const [rulePriority, setRulePriority] = useState("10");
  /** Transaction ids the rule modal will force-allocate (selection or single row). */
  const [ruleTxIds, setRuleTxIds] = useState<number[]>([]);

  // Quick-create ledger from Assign dropdown
  const [createLedgerOpen, setCreateLedgerOpen] = useState(false);
  /** Where to apply the new ledger after create: bulk bar, a row, or rule form. */
  const [createLedgerTarget, setCreateLedgerTarget] = useState<
    | { kind: "bulk" }
    | { kind: "row"; txId: number }
    | { kind: "rule" }
    | null
  >(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const listParams = {
        q: q || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        limit: 2000,
      } as const;

      const [list, lgs, pendingCountRes, allocatedList] = await Promise.all([
        api.transactions.list({
          ...listParams,
          ...(tab === "unallocated"
            ? { pending_only: true }
            : { categorised_only: true }),
        }),
        api.ledgers.list(),
        api.transactions.pendingCount(),
        // Count allocated with a lightweight list (same filters, for badge)
        api.transactions.list({
          ...listParams,
          categorised_only: true,
          limit: 2000,
        }),
      ]);
      setTxs(list);
      setLedgers(lgs);
      setUnallocatedCount(pendingCountRes.count);
      setAllocatedCount(allocatedList.length);
      setSelected(new Set());
      // Prefill row ledgers for allocated tab
      if (tab === "allocated") {
        const pref: Record<number, string> = {};
        for (const t of list) {
          if (t.ledger_id != null) pref[t.id] = String(t.ledger_id);
        }
        setRowLedger(pref);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [q, dateFrom, dateTo, tab]);

  useEffect(() => {
    load();
  }, [load]);

  // Restore collapsed months from localStorage (per profile + tab)
  useEffect(() => {
    const stored = loadCollapseState(profileId);
    setCollapsedMonths(stored[tab] || {});
  }, [profileId, tab]);

  const toggleMonthCollapse = useCallback(
    (monthKey: string) => {
      setCollapsedMonths((prev) => {
        const next = { ...prev, [monthKey]: !prev[monthKey] };
        const all = loadCollapseState(profileId);
        all[tab] = next;
        saveCollapseState(profileId, all);
        return next;
      });
    },
    [profileId, tab]
  );

  // Refresh list after Wipe + clear month expand/collapse memory for wiped period
  useEffect(() => {
    const onWiped = (ev: Event) => {
      const detail = (ev as CustomEvent<{ year?: number; month?: number | null }>).detail || {};
      const cleaned = clearCollapseMemory(profileId, {
        year: detail.year,
        month: detail.month ?? null,
      });
      setCollapsedMonths(cleaned[tab] || {});
      void load();
    };
    window.addEventListener("ledgerflow:transactions-wiped", onWiped);
    return () => window.removeEventListener("ledgerflow:transactions-wiped", onWiped);
  }, [load, profileId, tab]);

  function openCreateLedger(
    target: { kind: "bulk" } | { kind: "row"; txId: number } | { kind: "rule" }
  ) {
    setCreateLedgerTarget(target);
    setCreateLedgerOpen(true);
  }

  function selectRowLedger(txId: number, ledgerId: string) {
    setRowLedger((m) => ({ ...m, [txId]: ledgerId }));
    // Auto-tick when a ledger is chosen so user can batch “Allocate selected”
    if (ledgerId) {
      setSelected((prev) => {
        if (prev.has(txId)) return prev;
        const next = new Set(prev);
        next.add(txId);
        return next;
      });
    }
  }

  async function handleLedgerCreated(created: Ledger) {
    // Refresh full list so nesting/sort stay correct
    try {
      const list = await api.ledgers.list();
      setLedgers(list);
    } catch {
      setLedgers((prev) => [...prev, created]);
    }
    const idStr = String(created.id);
    const target = createLedgerTarget;
    setCreateLedgerTarget(null);
    if (!target) {
      setMessage(`Created ledger “${created.name}”`);
      return;
    }
    if (target.kind === "bulk") {
      setBulkLedger(idStr);
      setMessage(`Created “${created.name}” — selected for bulk assign`);
      return;
    }
    if (target.kind === "rule") {
      setRuleLedger(idStr);
      setMessage(`Created “${created.name}” — selected as rule target`);
      return;
    }
    // Row: pick ledger + tick checkbox (allocate later with “Allocate selected”)
    selectRowLedger(target.txId, idStr);
    setMessage(`Created “${created.name}” — row selected; use Allocate selected when ready`);
  }

  /** Group by calendar month — chronological (oldest month first). */
  const monthGroups = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const tx of txs) {
      const d = tx.date.slice(0, 7); // YYYY-MM
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(tx);
    }
    const keys = [...map.keys()].sort((a, b) => a.localeCompare(b));
    return keys.map((key) => {
      const items = map.get(key)!;
      // Within month: 1st → last day of month (chronological)
      items.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
      const [y, m] = key.split("-").map(Number);
      const label = new Date(y, m - 1, 1).toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
      });
      const inflow = items
        .filter((t) => parseFloat(t.amount) > 0)
        .reduce((s, t) => s + parseFloat(t.amount), 0);
      const outflow = items
        .filter((t) => parseFloat(t.amount) < 0)
        .reduce((s, t) => s + parseFloat(t.amount), 0);
      return { key, label, items, inflow, outflow, count: items.length };
    });
  }, [txs]);

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === txs.length) setSelected(new Set());
    else setSelected(new Set(txs.map((t) => t.id)));
  }

  function toggleMonth(ids: number[]) {
    setSelected((prev) => {
      const next = new Set(prev);
      const allOn = ids.every((id) => next.has(id));
      if (allOn) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }

  async function categoriseOne(txId: number, ledgerId: string) {
    if (!ledgerId) return;
    try {
      const updated = await api.transactions.update(txId, { ledger_id: Number(ledgerId) });
      if (tab === "unallocated") {
        setMessage("Allocated");
        setTxs((prev) => prev.filter((t) => t.id !== txId));
        setUnallocatedCount((c) => Math.max(0, c - 1));
        setAllocatedCount((c) => c + 1);
      } else {
        setMessage("Ledger updated");
        setTxs((prev) =>
          prev.map((t) =>
            t.id === txId
              ? {
                  ...t,
                  ledger_id: updated.ledger_id,
                  ledger_name: updated.ledger_name,
                  is_categorised: true,
                }
              : t
          )
        );
      }
      setSelected((prev) => {
        const n = new Set(prev);
        n.delete(txId);
        return n;
      });
      setExpandedNotes((prev) => {
        const n = new Set(prev);
        n.delete(txId);
        return n;
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  async function unallocateOne(txId: number) {
    try {
      await api.transactions.update(txId, { ledger_id: null, is_categorised: false });
      setMessage("Moved back to Unallocated");
      setTxs((prev) => prev.filter((t) => t.id !== txId));
      setAllocatedCount((c) => Math.max(0, c - 1));
      setUnallocatedCount((c) => c + 1);
      setSelected((prev) => {
        const n = new Set(prev);
        n.delete(txId);
        return n;
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unallocate failed");
    }
  }

  async function bulkUnallocate() {
    if (selected.size === 0) return;
    try {
      await Promise.all(
        Array.from(selected).map((id) =>
          api.transactions.update(id, { ledger_id: null, is_categorised: false })
        )
      );
      setMessage(`Unallocated ${selected.size} transaction(s)`);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Bulk unallocate failed");
    }
  }

  function toggleNotesExpand(txId: number, currentNotes: string | null | undefined) {
    setExpandedNotes((prev) => {
      const next = new Set(prev);
      if (next.has(txId)) {
        next.delete(txId);
        setConstructionTip((tip) => (tip === txId ? null : tip));
      } else {
        next.add(txId);
        setNoteDrafts((d) => ({
          ...d,
          [txId]: d[txId] ?? currentNotes ?? "",
        }));
      }
      return next;
    });
  }

  async function saveNotesOnBlur(txId: number) {
    const draft = noteDrafts[txId];
    const current = txs.find((t) => t.id === txId)?.notes ?? "";
    const nextVal = draft ?? current;
    if ((current || "") === (nextVal || "")) return;

    setNoteSaving((s) => ({ ...s, [txId]: true }));
    try {
      const updated = await api.transactions.update(txId, { notes: nextVal });
      setTxs((prev) => prev.map((t) => (t.id === txId ? { ...t, notes: updated.notes } : t)));
      setNoteDrafts((d) => ({ ...d, [txId]: updated.notes ?? "" }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not save notes");
    } finally {
      setNoteSaving((s) => ({ ...s, [txId]: false }));
    }
  }

  function showReceiptConstruction(txId: number) {
    setConstructionTip(txId);
    window.setTimeout(() => {
      setConstructionTip((tip) => (tip === txId ? null : tip));
    }, 3200);
  }

  async function openTrainPanel(txId: number) {
    if (trainOpenId === txId) {
      setTrainOpenId(null);
      return;
    }
    setTrainOpenId(txId);
    setTrainReason("ghost_transaction");
    setTrainDetail("");
    setTrainCustom("");
    try {
      const reasons = await api.transactions.trainingReasons();
      setTrainReasons(reasons);
      if (reasons.length && !reasons.find((r) => r.code === "ghost_transaction")) {
        setTrainReason(reasons[0].code);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not load training reasons");
    }
  }

  async function submitTrain(txId: number) {
    if (!trainReason) {
      setError("Pick a training reason");
      return;
    }
    if (trainReason === "other" && !trainCustom.trim() && !trainDetail.trim()) {
      setError("For Other, type a short reason label or detail");
      return;
    }
    setTrainBusy(true);
    setError(null);
    try {
      const res = await api.transactions.train(txId, {
        reason_code: trainReason,
        detail: trainDetail.trim() || undefined,
        custom_label: trainReason === "other" ? trainCustom.trim() || undefined : undefined,
      });
      setMessage(res.message);
      setTrainOpenId(null);
      if (res.is_excluded) {
        setTxs((prev) => prev.filter((t) => t.id !== txId));
        if (tab === "unallocated") setUnallocatedCount((c) => Math.max(0, c - 1));
        else setAllocatedCount((c) => Math.max(0, c - 1));
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Train submit failed");
    } finally {
      setTrainBusy(false);
    }
  }

  const activeTrainHint = useMemo(() => {
    return trainReasons.find((r) => r.code === trainReason)?.hint || null;
  }, [trainReasons, trainReason]);

  async function bulkAssign() {
    if (!bulkLedger || selected.size === 0) return;
    try {
      const res = await api.transactions.bulkCategorise(Array.from(selected), Number(bulkLedger));
      setMessage(`Assigned ${res.updated} transaction(s) to the bulk ledger`);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Bulk failed");
    }
  }

  /**
   * Allocate all checked rows using each row’s chosen ledger
   * (falls back to the bulk ledger when a row has none).
   */
  async function allocateSelected() {
    if (selected.size === 0) return;
    const jobs: { id: number; ledgerId: number }[] = [];
    let missing = 0;
    for (const id of selected) {
      const raw = rowLedger[id] || bulkLedger;
      if (!raw) {
        missing += 1;
        continue;
      }
      jobs.push({ id, ledgerId: Number(raw) });
    }
    if (jobs.length === 0) {
      setError(
        "Selected rows need a ledger — pick one on each row, or choose a bulk ledger above."
      );
      return;
    }
    setError(null);
    try {
      // Group by ledger so we can use bulk endpoint when many share one ledger
      const byLedger = new Map<number, number[]>();
      for (const j of jobs) {
        const list = byLedger.get(j.ledgerId) || [];
        list.push(j.id);
        byLedger.set(j.ledgerId, list);
      }
      let updated = 0;
      await Promise.all(
        Array.from(byLedger.entries()).map(async ([ledgerId, ids]) => {
          if (ids.length === 1) {
            await api.transactions.update(ids[0], { ledger_id: ledgerId });
            updated += 1;
          } else {
            const res = await api.transactions.bulkCategorise(ids, ledgerId);
            updated += res.updated;
          }
        })
      );
      const skipNote =
        missing > 0 ? ` · ${missing} skipped (no ledger chosen)` : "";
      setMessage(
        tab === "unallocated"
          ? `Allocated ${updated} transaction(s)${skipNote}`
          : `Updated ${updated} transaction(s)${skipNote}`
      );
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Allocate selected failed");
    }
  }

  const selectedReadyCount = useMemo(() => {
    let n = 0;
    for (const id of selected) {
      if (rowLedger[id] || bulkLedger) n += 1;
    }
    return n;
  }, [selected, rowLedger, bulkLedger]);

  /** Inline row action — rule targets this transaction only (auto-applies on save). */
  function openRuleFromTransaction(tx: Transaction) {
    setError(null);
    setRuleTxIds([tx.id]);
    setRuleName(`Match: ${tx.description.slice(0, 40)}`);
    setRuleValue(tx.description);
    setRuleMatch("contains");
    setRuleLedger(rowLedger[tx.id] || bulkLedger || "");
    setRuleOpen(true);
  }

  async function saveRule() {
    if (!ruleLedger || !ruleValue) {
      setError("Rule needs match value and ledger");
      return;
    }
    try {
      const ids = ruleTxIds.length ? ruleTxIds : selected.size ? Array.from(selected) : [];
      const res = await api.transactions.createRule({
        transaction_ids: ids,
        name: ruleName || "Rule",
        match_type: ruleMatch,
        match_value: ruleValue,
        ledger_id: Number(ruleLedger),
        priority: Number(rulePriority) || 10,
      });
      setMessage(res.message);
      setRuleOpen(false);
      setRuleTxIds([]);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Rule failed");
    }
  }

  return (
    <div className="space-y-0">
      {/* Sticky top panes — stay visible while the transaction list scrolls */}
      <div className="sticky top-0 z-30 -mx-5 space-y-3 border-b border-border/70 bg-background/95 px-5 pb-3 pt-0 backdrop-blur-md md:-mx-8 md:px-8">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[hsl(var(--neon-magenta))]">
              Queue
            </p>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Transactions</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Use the rule button on a line to create a rule — it applies automatically.
            </p>
          </div>
        </div>

        {/* Tabs — always 50/50 (only two options) */}
        <div
          className="grid w-full grid-cols-2 gap-1 rounded-xl border border-border/70 bg-card/60 p-1"
          role="tablist"
          aria-label="Transaction lists"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "unallocated"}
            className={cn(
              "flex w-full items-center justify-center rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
              tab === "unallocated"
                ? "border border-[hsl(var(--neon-magenta)/0.55)] bg-[hsl(var(--neon-magenta)/0.12)] text-foreground"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            )}
            onClick={() => setTab("unallocated")}
          >
            Unallocated
            <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[11px] tabular-nums">
              {unallocatedCount}
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "allocated"}
            className={cn(
              "flex w-full items-center justify-center rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
              tab === "allocated"
                ? "border border-[hsl(var(--neon-lime)/0.55)] bg-[hsl(var(--neon-lime)/0.12)] text-foreground"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            )}
            onClick={() => setTab("allocated")}
          >
            Allocated
            <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[11px] tabular-nums">
              {allocatedCount}
            </span>
          </button>
        </div>

        {message && (
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-700 dark:text-emerald-300">
            {message}
          </div>
        )}
        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <Card className="shadow-none">
          <CardContent className="flex flex-wrap items-end gap-2 pt-3 pb-3">
            <div className="min-w-[160px] flex-1 space-y-1">
              <Label className="text-[11px]">Search</Label>
              <Input
                className="h-8 text-xs"
                placeholder="Description, amount, date, ledger, bank, ref, notes…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && load()}
                title="Searches every field on the transaction"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">From</Label>
              <Input
                className="h-8 text-xs"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">To</Label>
              <Input
                className="h-8 text-xs"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <Button size="sm" className="h-8" variant="secondary" onClick={load}>
              Apply
            </Button>
            <div className="ml-auto flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label className="text-[11px]">Bulk ledger</Label>
                <LedgerAssignPicker
                  className="min-w-[12rem] sm:min-w-[14rem]"
                  ledgers={ledgers}
                  value={bulkLedger}
                  onChange={setBulkLedger}
                  onAddNew={() => openCreateLedger({ kind: "bulk" })}
                  placeholder="Same ledger for all…"
                  aria-label="Bulk ledger"
                />
              </div>
              <Button
                size="sm"
                className="h-8"
                disabled={readOnly || selectedReadyCount === 0}
                onClick={() => void allocateSelected()}
                title={
                  readOnly
                    ? "Read-only — enter unlock key to allocate"
                    : "Uses each row’s ledger; falls back to bulk ledger when a row has none"
                }
              >
                {tab === "unallocated" ? "Allocate selected" : "Update selected"}
                {selectedReadyCount > 0 ? ` (${selectedReadyCount})` : ""}
              </Button>
              {bulkLedger && selected.size > 0 && (
                <Button
                  size="sm"
                  className="h-8"
                  variant="secondary"
                  disabled={readOnly}
                  onClick={() => void bulkAssign()}
                  title="Force the bulk ledger onto every checked row"
                >
                  Apply bulk ledger
                </Button>
              )}
              {tab === "allocated" && (
                <Button
                  size="sm"
                  className="h-8"
                  variant="outline"
                  disabled={readOnly || selected.size === 0}
                  onClick={bulkUnallocate}
                >
                  Unallocate selected
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Transaction list (page scrolls; header stays pinned) */}
      <div className="space-y-6 pt-4">
      {loading ? (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">Loading…</CardContent>
        </Card>
      ) : txs.length === 0 ? (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            {tab === "unallocated"
              ? "No unallocated transactions. Upload a statement or clear filters."
              : "No allocated transactions yet. Allocate items from the Unallocated tab."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <p className="text-xs text-muted-foreground">
              {monthGroups.length} month{monthGroups.length === 1 ? "" : "s"} · days run 1st → end of month
            </p>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={selected.size === txs.length && txs.length > 0}
                onChange={toggleAll}
                aria-label="Select all transactions"
              />
              Select all ({txs.length})
            </label>
          </div>

          {monthGroups.map((group) => {
            const ids = group.items.map((t) => t.id);
            const monthSelected = ids.filter((id) => selected.has(id)).length;
            const allMonthSelected = monthSelected === ids.length && ids.length > 0;
            const isCollapsed = !!collapsedMonths[group.key];

            return (
              <section key={group.key} className="tx-month-section" aria-labelledby={`month-${group.key}`}>
                <header
                  className="tx-month-heading cursor-pointer select-none"
                  role="button"
                  tabIndex={0}
                  aria-expanded={!isCollapsed}
                  aria-controls={`month-body-${group.key}`}
                  onClick={() => toggleMonthCollapse(group.key)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleMonthCollapse(group.key);
                    }
                  }}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <ChevronDown
                        className={cn(
                          "ml-1 h-5 w-5 shrink-0 text-[hsl(var(--neon-magenta))] transition-transform duration-200",
                          isCollapsed && "-rotate-90"
                        )}
                        aria-hidden
                      />
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0"
                        checked={allMonthSelected}
                        ref={(el) => {
                          if (el) {
                            el.indeterminate = monthSelected > 0 && !allMonthSelected;
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => toggleMonth(ids)}
                        aria-label={`Select all in ${group.label}`}
                      />
                      <div>
                        <h2 id={`month-${group.key}`} className="tx-month-title">
                          {group.label}
                        </h2>
                        <p className="tx-month-meta">
                          {isCollapsed
                            ? `${group.count} transactions · click to expand`
                            : tab === "unallocated"
                              ? "Unallocated activity for this month"
                              : "Allocated activity for this month"}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="tx-month-stats" onClick={(e) => e.stopPropagation()}>
                    <span className="tx-month-chip">{group.count} items</span>
                    <span className="tx-month-chip text-emerald-700 dark:text-emerald-400">
                      In {formatMoney(group.inflow)}
                    </span>
                    <span className="tx-month-chip text-red-700 dark:text-red-400">
                      Out {formatMoney(group.outflow)}
                    </span>
                    {monthSelected > 0 && (
                      <span className="tx-month-chip">{monthSelected} selected</span>
                    )}
                  </div>
                </header>

                {/* Stacked cards: details+amount row, then actions row — mobile-friendly */}
                <ul
                  id={`month-body-${group.key}`}
                  className={cn("divide-y divide-border/40", isCollapsed && "hidden")}
                >
                  {group.items.map((tx) => {
                    const amt = parseFloat(tx.amount);
                    const notesOpen = expandedNotes.has(tx.id);
                    const hasNotes = !!(tx.notes && tx.notes.trim());
                    const selectValue =
                      rowLedger[tx.id] ||
                      (tab === "allocated" && tx.ledger_id != null
                        ? String(tx.ledger_id)
                        : "");
                    return (
                      <li
                        key={tx.id}
                        className={cn(
                          "tx-row flex flex-wrap gap-2 px-2 py-3 sm:gap-3 sm:px-3",
                          selected.has(tx.id) && "bg-[hsl(var(--neon-magenta)/0.04)]",
                          notesOpen && "bg-muted/20"
                        )}
                        data-selected={selected.has(tx.id)}
                      >
                        {/* Main card */}
                        <div className="tx-row-card min-w-0 flex-1 rounded-xl border border-border/50 bg-card/40 px-3 py-3 transition-[border-color,box-shadow,background-color] duration-150">
                          {/* Row 1 — details + amount */}
                          <div className="flex items-start gap-2.5">
                            <input
                              type="checkbox"
                              className="mt-1 h-4 w-4 shrink-0"
                              checked={selected.has(tx.id)}
                              onChange={() => toggle(tx.id)}
                              aria-label={`Select ${tx.id}`}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                                    <span className="tabular-nums font-medium text-foreground">
                                      {formatDate(tx.date)}
                                    </span>
                                    {tx.bank_profile_name && (
                                      <>
                                        <span aria-hidden>·</span>
                                        <span className="truncate">{tx.bank_profile_name}</span>
                                      </>
                                    )}
                                  </div>
                                  <p
                                    className="mt-0.5 text-sm font-medium leading-snug text-foreground"
                                    title={tx.description}
                                  >
                                    {tx.description}
                                  </p>
                                  {tab === "allocated" && tx.ledger_name && (
                                    <p className="mt-0.5 text-[11px] text-[hsl(var(--neon-lime))]">
                                      {tx.ledger_name}
                                    </p>
                                  )}
                                  {hasNotes && !notesOpen && (
                                    <p className="mt-0.5 text-[11px] text-[hsl(var(--neon-cyan))]">
                                      Note: {tx.notes}
                                    </p>
                                  )}
                                </div>
                                <div className="shrink-0 pt-0.5 text-right">
                                  {/* Statement Amount only — never fee + amount combined */}
                                  <div
                                    className={cn(
                                      "text-base font-semibold tabular-nums sm:text-lg",
                                      amt < 0
                                        ? "text-red-600 dark:text-red-400"
                                        : "text-emerald-600 dark:text-emerald-400"
                                    )}
                                  >
                                    {formatMoney(tx.amount)}
                                  </div>
                                </div>
                              </div>
                              {/* One compact meta row: Ref left · Bank Fee under amount (right), above Allocate */}
                              {(() => {
                                const showRef =
                                  !!tx.reference &&
                                  !String(tx.reference).startsWith("CAPITEC_FEE:");
                                const feeRaw = tx.fee_amount;
                                let feeLabel: string | null = null;
                                if (feeRaw != null && String(feeRaw) !== "") {
                                  const feeN = parseFloat(String(feeRaw));
                                  // Show for dual-column fees and fee-only (R0 amount + fee)
                                  if (!Number.isNaN(feeN) && feeN !== 0) {
                                    feeLabel = formatMoney(Math.abs(feeN));
                                  }
                                }
                                if (!showRef && !feeLabel) return null;
                                return (
                                  <div className="mt-0.5 flex items-baseline justify-between gap-3">
                                    <p className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                                      {showRef ? `Ref: ${tx.reference}` : "\u00a0"}
                                    </p>
                                    {feeLabel ? (
                                      <p
                                        className="shrink-0 text-[11px] tabular-nums text-muted-foreground"
                                        title="Capitec Business fee as on the statement (not added to the amount)"
                                      >
                                        Bank Fee: {feeLabel}
                                      </p>
                                    ) : null}
                                  </div>
                                );
                              })()}
                            </div>
                          </div>

                          {/* Row 2 — ledger picker left · allocate / rule / notes right */}
                          <div className="mt-2.5 flex flex-wrap items-center gap-2 pl-6 sm:flex-nowrap sm:pl-7">
                            <LedgerAssignPicker
                              className="min-w-0 flex-1 sm:max-w-none"
                              ledgers={ledgers}
                              value={selectValue}
                              onChange={(v) => selectRowLedger(tx.id, v)}
                              onAddNew={() => openCreateLedger({ kind: "row", txId: tx.id })}
                              placeholder={
                                tab === "allocated"
                                  ? "Change ledger…"
                                  : "Assign to Ledger…"
                              }
                              aria-label={
                                tab === "allocated"
                                  ? `Change ledger for transaction ${tx.id}`
                                  : `Assign to ledger for transaction ${tx.id}`
                              }
                            />
                            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 sm:ml-auto">
                              <Button
                                size="sm"
                                className="h-9 shrink-0"
                                disabled={readOnly || !(rowLedger[tx.id] || selectValue)}
                                onClick={() =>
                                  categoriseOne(tx.id, rowLedger[tx.id] || selectValue)
                                }
                                title={
                                  readOnly
                                    ? "Read-only — enter unlock key to allocate"
                                    : "Allocate this row now (or tick several and use Allocate selected)"
                                }
                              >
                                {tab === "allocated" ? "Update" : "Allocate"}
                              </Button>
                              {tab === "allocated" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-9 shrink-0"
                                  disabled={readOnly}
                                  onClick={() => unallocateOne(tx.id)}
                                >
                                  Unallocate
                                </Button>
                              )}
                              {tab === "unallocated" && (
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="outline"
                                  className="h-9 w-9 shrink-0 border-[hsl(var(--neon-violet)/0.45)] text-[hsl(var(--neon-violet))] hover:bg-[hsl(var(--neon-violet)/0.1)]"
                                  title={
                                    readOnly
                                      ? "Read-only — rules locked"
                                      : "Create rule for this transaction only"
                                  }
                                  aria-label="Create rule for this transaction"
                                  disabled={readOnly}
                                  onClick={() => openRuleFromTransaction(tx)}
                                >
                                  <ListPlus className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                type="button"
                                size="icon"
                                variant={notesOpen ? "secondary" : "outline"}
                                className={cn(
                                  "h-9 w-9 shrink-0",
                                  (notesOpen || hasNotes) &&
                                    "border-[hsl(var(--neon-cyan)/0.55)] text-[hsl(var(--neon-cyan))]"
                                )}
                                title={notesOpen ? "Collapse notes" : "Notes & receipt"}
                                aria-expanded={notesOpen}
                                aria-label={notesOpen ? "Collapse notes" : "Open notes"}
                                onClick={() => toggleNotesExpand(tx.id, tx.notes)}
                              >
                                <Paperclip className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>

                          {notesOpen && (
                            <div className="mt-3 space-y-2 rounded-xl border border-[hsl(var(--neon-cyan)/0.35)] bg-card/80 p-3 pl-6 sm:ml-7 sm:pl-3">
                              <div className="space-y-1">
                                <Label
                                  htmlFor={`note-${tx.id}`}
                                  className="text-xs text-muted-foreground"
                                >
                                  Your notes
                                  {noteSaving[tx.id] ? " · saving…" : ""}
                                </Label>
                                <Input
                                  id={`note-${tx.id}`}
                                  placeholder="Add a personal note for this transaction…"
                                  value={noteDrafts[tx.id] ?? tx.notes ?? ""}
                                  onChange={(e) =>
                                    setNoteDrafts((d) => ({
                                      ...d,
                                      [tx.id]: e.target.value,
                                    }))
                                  }
                                  onBlur={() => saveNotesOnBlur(tx.id)}
                                  autoFocus
                                />
                                <p className="text-[10px] text-muted-foreground">
                                  Notes save automatically when you click away from this field.
                                </p>
                              </div>
                              <div className="relative flex items-center gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="gap-2"
                                  onClick={() => showReceiptConstruction(tx.id)}
                                >
                                  <Camera className="h-4 w-4" />
                                  Attach receipt
                                </Button>
                                {constructionTip === tx.id && (
                                  <div
                                    role="status"
                                    className="absolute left-0 top-full z-10 mt-2 max-w-xs rounded-xl border-2 border-[hsl(var(--neon-amber)/0.55)] bg-card px-3 py-2 text-xs shadow-[0_0_16px_hsl(var(--neon-amber)/0.25)]"
                                  >
                                    <p className="font-semibold text-[hsl(var(--neon-amber))]">
                                      Under construction
                                    </p>
                                    <p className="mt-0.5 text-muted-foreground">
                                      Feature not available yet — receipt capture from your phone is
                                      coming later.
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* DEV train control hidden for now — calibration is ours, not the user's.
                            Panel kept for a future power-user toggle. */}
                        {false && trainOpenId === tx.id && (
                          <div className="basis-full pl-0 sm:col-span-full">
                            <div className="mt-1 rounded-xl border-2 border-[hsl(var(--neon-violet)/0.45)] bg-[hsl(var(--neon-violet)/0.08)] p-3 sm:ml-0">
                              <p className="mb-2 text-xs font-semibold text-[hsl(var(--neon-violet))]">
                                Train parser · mark mistakes
                              </p>
                              <div className="grid gap-2 sm:grid-cols-2">
                                <div className="space-y-1">
                                  <Label className="text-xs">Reason</Label>
                                  <Select
                                    value={trainReason}
                                    onChange={(e) => setTrainReason(e.target.value)}
                                  >
                                    {trainReasons.map((r) => (
                                      <option key={r.code} value={r.code}>
                                        {r.label}
                                        {r.code === "ghost_transaction" ? " ?" : ""}
                                      </option>
                                    ))}
                                  </Select>
                                  {activeTrainHint && (
                                    <p className="flex gap-1 text-[11px] text-muted-foreground">
                                      <HelpCircle className="mt-0.5 h-3 w-3 shrink-0" />
                                      {activeTrainHint}
                                    </p>
                                  )}
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">Detail (optional)</Label>
                                  <Input
                                    placeholder="What should the app learn?"
                                    value={trainDetail}
                                    onChange={(e) => setTrainDetail(e.target.value)}
                                  />
                                </div>
                                {trainReason === "other" && (
                                  <div className="space-y-1 sm:col-span-2">
                                    <Label className="text-xs">New reason label</Label>
                                    <Input
                                      placeholder="Becomes a future dropdown option"
                                      value={trainCustom}
                                      onChange={(e) => setTrainCustom(e.target.value)}
                                    />
                                  </div>
                                )}
                              </div>
                              <div className="mt-3 flex flex-wrap justify-end gap-2">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setTrainOpenId(null)}
                                  disabled={trainBusy}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => submitTrain(tx.id)}
                                  disabled={trainBusy}
                                >
                                  {trainBusy ? "Submitting…" : "Submit training"}
                                </Button>
                              </div>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
      </div>

      <CreateLedgerModal
        open={createLedgerOpen}
        onClose={() => {
          setCreateLedgerOpen(false);
          setCreateLedgerTarget(null);
        }}
        ledgers={ledgers}
        onCreated={(ledger) => void handleLedgerCreated(ledger)}
      />

      {ruleOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Create rule + live strip</CardTitle>
              <CardDescription>
                {ruleTxIds.length === 1
                  ? "Rule for this transaction — also auto-applies to matching items still in the queue."
                  : `Rule for ${ruleTxIds.length || "selected"} transaction(s) — also auto-applies to matching items in the queue.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label>Name</Label>
                <Input value={ruleName} onChange={(e) => setRuleName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Match type</Label>
                <Select value={ruleMatch} onChange={(e) => setRuleMatch(e.target.value)}>
                  <option value="contains">Contains</option>
                  <option value="exact">Exact</option>
                  <option value="regex">Regex</option>
                  <option value="amount_exact">Amount exact</option>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Match value</Label>
                <Input value={ruleValue} onChange={(e) => setRuleValue(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Target ledger</Label>
                <LedgerAssignPicker
                  ledgers={ledgers}
                  value={ruleLedger}
                  onChange={setRuleLedger}
                  onAddNew={() => openCreateLedger({ kind: "rule" })}
                  placeholder="Search ledger…"
                  aria-label="Rule target ledger"
                />
              </div>
              <div className="space-y-1">
                <Label>Priority (higher wins)</Label>
                <Input
                  type="number"
                  value={rulePriority}
                  onChange={(e) => setRulePriority(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setRuleOpen(false);
                    setRuleTxIds([]);
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={saveRule}>Save &amp; apply</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
