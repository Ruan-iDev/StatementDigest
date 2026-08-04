"use client";

import { useEffect, useMemo, useState } from "react";
import { api, getStoredProfileId } from "@/lib/api";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

/** Same key as Transactions page — clear expand/collapse memory on wipe. */
function clearTxMonthCollapseMemory(year: number, month: number | null) {
  if (typeof window === "undefined") return;
  const profileId = getStoredProfileId();
  const key = `ledgerflow-tx-month-collapse-p${profileId ?? "default"}`;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const parsed = JSON.parse(raw) as {
      unallocated?: Record<string, boolean>;
      allocated?: Record<string, boolean>;
    };
    const prune = (map: Record<string, boolean> | undefined) => {
      const next: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(map || {})) {
        const [yStr, mStr] = k.split("-");
        const y = Number(yStr);
        const m = Number(mStr);
        if (y === year && (month == null || m === month)) continue;
        next[k] = v;
      }
      return next;
    };
    const unallocated = prune(parsed.unallocated);
    const allocated = prune(parsed.allocated);
    if (Object.keys(unallocated).length === 0 && Object.keys(allocated).length === 0) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify({ unallocated, allocated }));
    }
  } catch {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

type Periods = {
  total: number;
  years: {
    year: number;
    count: number;
    months: { month: number; count: number }[];
  }[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  onWiped?: () => void;
};

export function WipeTransactionsModal({ open, onClose, onWiped }: Props) {
  const [periods, setPeriods] = useState<Periods | null>(null);
  const [year, setYear] = useState<string>("");
  const [month, setMonth] = useState<string>(""); // "" = whole year
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setMessage(null);
    setLoading(true);
    api.transactions
      .periods()
      .then((p) => {
        setPeriods(p);
        if (p.years.length) {
          setYear(String(p.years[0].year));
          setMonth("");
        } else {
          setYear("");
          setMonth("");
        }
      })
      .catch((e) => setError(e.message || "Failed to load periods"))
      .finally(() => setLoading(false));
  }, [open]);

  const yearInfo = useMemo(() => {
    if (!periods || !year) return null;
    return periods.years.find((y) => String(y.year) === year) || null;
  }, [periods, year]);

  const previewCount = useMemo(() => {
    if (!yearInfo) return 0;
    if (!month) return yearInfo.count;
    const m = yearInfo.months.find((x) => String(x.month) === month);
    return m?.count ?? 0;
  }, [yearInfo, month]);

  async function wipe() {
    if (!year) {
      setError("Select a year");
      return;
    }
    const y = Number(year);
    const m = month ? Number(month) : null;
    const scope = m ? `${MONTH_NAMES[m - 1]} ${y}` : `all of ${y}`;
    const ok = confirm(
      `DEV wipe: permanently delete ${previewCount} transaction(s) for ${scope}?\n\nThis cannot be undone.`
    );
    if (!ok) return;

    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await api.transactions.wipe({
        year: y,
        month: m ?? null,
      });
      setMessage(res.message || `Deleted ${res.deleted} transaction(s).`);
      const p = await api.transactions.periods();
      setPeriods(p);
      if (p.years.length) {
        setYear(String(p.years[0].year));
        setMonth("");
      } else {
        setYear("");
        setMonth("");
      }
      // Drop month expand/collapse memory for wiped year/month so re-imports expand by default
      clearTxMonthCollapseMemory(y, m);
      onWiped?.();
      // Notify open pages (e.g. Transactions) to reload their lists + refresh collapse UI
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("ledgerflow:transactions-wiped", {
            detail: { deleted: res.deleted, year: y, month: m },
          })
        );
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Wipe failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Wipe transactions (dev)"
      description="Bulk-delete by year or month for testing. Permanent — use only while developing."
      className="max-w-md border-[hsl(var(--neon-amber)/0.55)]"
    >
      <div className="space-y-4">
        {loading && !periods && (
          <p className="text-sm text-muted-foreground">Loading periods…</p>
        )}

        {periods && periods.total === 0 && (
          <p className="text-sm text-muted-foreground">No transactions in the database.</p>
        )}

        {periods && periods.total > 0 && (
          <>
            <p className="text-xs text-muted-foreground">
              Database has <strong>{periods.total}</strong> transaction(s) across{" "}
              {periods.years.length} year(s).
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="wipe-year">Year</Label>
              <Select
                id="wipe-year"
                value={year}
                onChange={(e) => {
                  setYear(e.target.value);
                  setMonth("");
                }}
                disabled={loading}
              >
                {periods.years.map((y) => (
                  <option key={y.year} value={y.year}>
                    {y.year} ({y.count} txns)
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="wipe-month">Month</Label>
              <Select
                id="wipe-month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                disabled={loading || !yearInfo}
              >
                <option value="">
                  Whole year{yearInfo ? ` (${yearInfo.count} txns)` : ""}
                </option>
                {yearInfo?.months.map((m) => (
                  <option key={m.month} value={m.month}>
                    {MONTH_NAMES[m.month - 1]} ({m.count} txns)
                  </option>
                ))}
              </Select>
            </div>

            <div className="rounded-xl border border-[hsl(var(--neon-amber)/0.4)] bg-[hsl(var(--neon-amber)/0.08)] px-3 py-2 text-sm">
              Will delete <strong>{previewCount}</strong> transaction(s)
              {month
                ? ` in ${MONTH_NAMES[Number(month) - 1]} ${year}`
                : ` in ${year}`}
              .
            </div>
          </>
        )}

        {error && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
            {error}
          </div>
        )}
        {message && (
          <div className="rounded-xl border border-[hsl(var(--neon-lime)/0.45)] bg-[hsl(var(--neon-lime)/0.1)] px-3 py-2 text-sm">
            {message}
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            Close
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={wipe}
            disabled={loading || !periods?.total || previewCount === 0}
          >
            {loading ? "Working…" : "Wipe selected"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
