"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type Ledger, type Transaction } from "@/lib/api";
import { formatDate, formatMoney, cn } from "@/lib/utils";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { LedgerAssignPicker } from "@/components/ledger-assign-picker";

export type PlDrillTarget = {
  title: string;
  /** Single ledger cell */
  ledgerId?: number | null;
  /**
   * Section total: filter to these ledger types
   * (income | expense | transfer | capital | other)
   */
  ledgerTypes?: string[] | null;
  dateFrom: string;
  dateTo: string;
};

type Props = {
  open: boolean;
  target: PlDrillTarget | null;
  currency: string;
  onClose: () => void;
  /** Called after unallocate / reassign so parent can refresh the matrix */
  onChanged: () => void;
};

export function PlDrilldownModal({ open, target, currency, onClose, onChanged }: Props) {
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  /** Per-row draft ledger selection */
  const [rowLedger, setRowLedger] = useState<Record<number, string>>({});
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!target) return;
    setLoading(true);
    setError(null);
    try {
      const [list, lgs] = await Promise.all([
        api.transactions.list({
          categorised_only: true,
          ledger_id: target.ledgerId ?? undefined,
          date_from: target.dateFrom,
          date_to: target.dateTo,
          limit: 2000,
        }),
        api.ledgers.list(),
      ]);
      let filtered = list;
      if (target.ledgerTypes?.length) {
        const types = new Set(target.ledgerTypes);
        const typeById = new Map(lgs.map((l) => [l.id, l.type]));
        filtered = list.filter((t) => {
          if (t.ledger_id == null) return false;
          const typ = typeById.get(t.ledger_id);
          return typ != null && types.has(typ);
        });
      }
      setTxs(filtered);
      setLedgers(lgs.filter((l) => !l.is_archived));
      const pref: Record<number, string> = {};
      for (const t of filtered) {
        if (t.ledger_id != null) pref[t.id] = String(t.ledger_id);
      }
      setRowLedger(pref);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load transactions");
    } finally {
      setLoading(false);
    }
  }, [target]);

  useEffect(() => {
    if (open && target) {
      setMessage(null);
      void load();
    }
  }, [open, target, load]);

  const total = useMemo(
    () => txs.reduce((s, t) => s + parseFloat(String(t.amount) || "0"), 0),
    [txs]
  );

  async function unallocate(tx: Transaction) {
    setBusyId(tx.id);
    setError(null);
    try {
      await api.transactions.update(tx.id, { ledger_id: null, is_categorised: false });
      setTxs((prev) => prev.filter((t) => t.id !== tx.id));
      setMessage(`Unallocated — moved to Unallocated transactions`);
      onChanged();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unallocate failed");
    } finally {
      setBusyId(null);
    }
  }

  async function saveLedger(tx: Transaction) {
    const lid = rowLedger[tx.id];
    if (!lid) {
      setError("Choose a ledger first");
      return;
    }
    if (String(tx.ledger_id) === lid) {
      setMessage("Already on that ledger");
      return;
    }
    setBusyId(tx.id);
    setError(null);
    try {
      const updated = await api.transactions.update(tx.id, {
        ledger_id: Number(lid),
        is_categorised: true,
      });
      // If still matches filter (same ledger or section), update in place; else remove
      const stillInScope =
        target?.ledgerId != null
          ? updated.ledger_id === target.ledgerId
          : target?.ledgerTypes?.length
            ? (() => {
                const lg = ledgers.find((l) => l.id === updated.ledger_id);
                return lg != null && target.ledgerTypes!.includes(lg.type);
              })()
            : true;
      if (stillInScope) {
        setTxs((prev) => prev.map((t) => (t.id === tx.id ? { ...t, ...updated } : t)));
        setMessage("Ledger updated");
      } else {
        setTxs((prev) => prev.filter((t) => t.id !== tx.id));
        setMessage("Moved to another ledger — removed from this list");
      }
      onChanged();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={target?.title || "Transactions"}
      description={
        target
          ? `${target.dateFrom} → ${target.dateTo} · click Unallocate or pick another ledger and Save`
          : undefined
      }
      className="max-w-3xl"
    >
      <div className="space-y-3">
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

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            {loading ? "Loading…" : `${txs.length} transaction${txs.length === 1 ? "" : "s"}`}
          </span>
          {!loading && txs.length > 0 && (
            <span className="font-semibold tabular-nums text-foreground">
              Sum {formatMoney(total, currency)}
            </span>
          )}
        </div>

        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading transactions…</p>
        ) : txs.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No allocated transactions for this cell.
          </p>
        ) : (
          <ul className="max-h-[min(55vh,28rem)] space-y-2 overflow-y-auto pr-0.5">
            {txs.map((tx) => {
              const busy = busyId === tx.id;
              const dirty =
                rowLedger[tx.id] != null && String(tx.ledger_id ?? "") !== rowLedger[tx.id];
              return (
                <li
                  key={tx.id}
                  className={cn(
                    "rounded-xl border border-border/70 bg-card/60 p-3",
                    busy && "opacity-70"
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium" title={tx.description}>
                        {tx.description}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {formatDate(tx.date)}
                        {tx.reference ? ` · Ref ${tx.reference}` : ""}
                        {tx.ledger_name ? ` · ${tx.ledger_name}` : ""}
                      </p>
                    </div>
                    <p
                      className={cn(
                        "shrink-0 text-sm font-semibold tabular-nums",
                        parseFloat(String(tx.amount)) < 0 && "text-red-500"
                      )}
                    >
                      {formatMoney(tx.amount, currency)}
                    </p>
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-end gap-2">
                    <div className="min-w-[10rem] flex-1 space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Ledger</Label>
                      <LedgerAssignPicker
                        className="w-full"
                        ledgers={ledgers}
                        value={rowLedger[tx.id] || ""}
                        onChange={(v) => setRowLedger((m) => ({ ...m, [tx.id]: v }))}
                        placeholder="Assign ledger…"
                        aria-label={`Ledger for transaction ${tx.id}`}
                      />
                    </div>
                    <Button
                      size="sm"
                      className="h-9"
                      disabled={busy || !dirty}
                      onClick={() => void saveLedger(tx)}
                    >
                      {busy ? "…" : "Save"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9"
                      disabled={busy}
                      onClick={() => void unallocate(tx)}
                    >
                      Unallocate
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex justify-end border-t border-border/50 pt-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
