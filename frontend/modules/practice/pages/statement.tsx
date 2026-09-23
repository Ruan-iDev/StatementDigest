"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { cn, formatDate, formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { captureElementToPages, pagesToPdf } from "@/modules/practice/lib/capture-pages";
import { practiceApi } from "@/modules/practice/lib/api";
import { useModuleFlags } from "@/modules/practice/flags-provider";
import { FeatureOffPage } from "@/modules/practice/pages/disabled";
import { PdfPreviewModal, type PreviewPage } from "@/modules/practice/pages/pdf-preview-modal";
import {
  formatWageDays,
  type PracticeEntry,
  type PracticeStaff,
  type PracticeTravel,
  type PracticeWage,
  type ProjectStatement,
} from "@/modules/practice/lib/types";

type SheetTab = "flow" | "costing";

function entryDate(entry: { occurred_on?: string | null; created_at: string }): string {
  return formatDate(entry.occurred_on || entry.created_at.slice(0, 10));
}

function num(v: string | number | null | undefined): number {
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function mondayOf(iso: string): Date {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(12, 0, 0, 0);
  return d;
}

function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function isAbsenceWage(w: PracticeWage): boolean {
  const kind = String(w.kind || "").toLowerCase();
  if (kind === "absence" || kind === "absent") return true;
  return num(w.amount) === 0 && num(w.days) > 0;
}

type WagePersonRow = {
  name: string;
  role: string;
  paid: number;
  workedDays: number;
  absentDays: number;
};

/** Paid wages, explicit absences, plus days short of the crew that week. */
function buildWageBreakdown(
  wages: PracticeWage[],
  staff: PracticeStaff[],
  fallbackDay: string
): { byRole: Map<string, WagePersonRow[]>; roles: string[]; totalPaid: number } {
  const staffById = new Map(staff.map((s) => [s.id, s]));
  const byPerson = new Map<number, WagePersonRow>();
  const weeks = new Map<string, Map<number, { worked: number; absent: number }>>();

  function personOf(w: PracticeWage): WagePersonRow {
    const existing = byPerson.get(w.staff_id);
    if (existing) return existing;
    const s = staffById.get(w.staff_id);
    const row: WagePersonRow = {
      name: s?.name || w.staff_name || "Staff",
      role: (s?.job_title || "").trim() || "Staff",
      paid: 0,
      workedDays: 0,
      absentDays: 0,
    };
    byPerson.set(w.staff_id, row);
    return row;
  }

  for (const w of wages) {
    const row = personOf(w);
    const days = num(w.days);
    const absent = isAbsenceWage(w);
    if (absent) {
      row.absentDays += days > 0 ? days : 1;
    } else {
      row.paid += num(w.amount);
      if (days > 0) row.workedDays += days;
    }

    const kind = String(w.kind || "wage").toLowerCase();
    if (kind === "commission") continue;
    const key = isoDay(mondayOf((w.occurred_on || fallbackDay).slice(0, 10)));
    if (!weeks.has(key)) weeks.set(key, new Map());
    const slot = weeks.get(key)!;
    const cur = slot.get(w.staff_id) || { worked: 0, absent: 0 };
    if (absent) cur.absent += days > 0 ? days : 1;
    else if (days > 0) cur.worked += days;
    slot.set(w.staff_id, cur);
  }

  for (const slot of weeks.values()) {
    let maxWorked = 0;
    for (const v of slot.values()) maxWorked = Math.max(maxWorked, v.worked);
    if (maxWorked <= 0) continue;
    for (const [staffId, v] of slot) {
      const inferred = Math.max(0, maxWorked - v.worked - v.absent);
      if (inferred <= 0) continue;
      const row = byPerson.get(staffId);
      if (row) row.absentDays += inferred;
    }
  }

  const people = [...byPerson.values()];
  const byRole = new Map<string, WagePersonRow[]>();
  for (const p of people) {
    const list = byRole.get(p.role) || [];
    list.push(p);
    byRole.set(p.role, list);
  }
  const roles = [...byRole.keys()].sort((a, b) => {
    const da = /director/i.test(a) ? 0 : 1;
    const db = /director/i.test(b) ? 0 : 1;
    if (da !== db) return da - db;
    return a.localeCompare(b, undefined, { sensitivity: "base" });
  });
  for (const role of roles) {
    byRole.get(role)!.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }
  return {
    byRole,
    roles,
    totalPaid: people.reduce((s, p) => s + p.paid, 0),
  };
}

function paymentHitsInvoice(p: PracticeEntry, invoiceId: number): boolean {
  if (p.document_id === invoiceId) return true;
  return (p.document_ids || []).includes(invoiceId);
}

function CostingSheet({
  data,
  logoUrl,
  currency,
  staff,
  travels,
}: {
  data: ProjectStatement;
  logoUrl: string | null;
  currency: string;
  staff: PracticeStaff[];
  travels: PracticeTravel[];
}) {
  const invoices = data.invoices || [];
  const payments = data.payments || [];
  const expenses = data.expenses || [];
  const wages = data.wages || [];
  const travelRows = travels.length ? travels : data.travels || [];

  const income = num(data.totals.invoices);
  const projectExpenses = num(data.totals.expenses);
  const wagesTotal = wages.reduce((s, w) => s + num(w.amount), 0);
  const profit = income - projectExpenses;
  const marginPct = income > 0 ? (profit / income) * 100 : null;

  const invoiceBlocks = invoices.map((inv) => {
    const hits = payments.filter((p) => paymentHitsInvoice(p, inv.id));
    const paid =
      inv.status === "paid" || hits.length > 0 ? num(inv.amount) : 0;
    return { inv, hits, paid, unpaid: num(inv.amount) - paid };
  });
  const paidTotal = invoiceBlocks.reduce((s, b) => s + b.paid, 0);
  const unpaidTotal = invoiceBlocks.reduce((s, b) => s + b.unpaid, 0);
  const otherPayments = payments.filter(
    (p) => !invoices.some((inv) => paymentHitsInvoice(p, inv.id))
  );

  type WeekLine = {
    key: string;
    date: string;
    label: string;
    detail: string;
    amount: number;
    kind: string;
  };
  const weekMap = new Map<string, { start: Date; rows: WeekLine[] }>();

  function pushWeek(iso: string | null | undefined, fallback: string, row: WeekLine) {
    const day = (iso || fallback).slice(0, 10);
    const start = mondayOf(day);
    const key = isoDay(start);
    if (!weekMap.has(key)) weekMap.set(key, { start, rows: [] });
    weekMap.get(key)!.rows.push(row);
  }

  const fallbackDay =
    data.project.started_on ||
    expenses[0]?.incurred_on ||
    wages[0]?.occurred_on ||
    new Date().toISOString().slice(0, 10);

  expenses.forEach((ex) => {
    pushWeek(ex.incurred_on, fallbackDay, {
      key: `e-${ex.id}`,
      date: ex.incurred_on || fallbackDay,
      label: ex.description,
      detail: [ex.supplier_name || ex.vendor_name, ex.ledger_name].filter(Boolean).join(" · "),
      amount: num(ex.amount),
      kind: "expense",
    });
  });
  wages.forEach((w) => {
    pushWeek(w.occurred_on, fallbackDay, {
      key: `w-${w.id}`,
      date: w.occurred_on || fallbackDay,
      label:
        w.kind === "absence"
          ? `Absence · ${w.staff_name || "Staff"}`
          : w.kind === "commission"
            ? `Commission · ${w.staff_name || "Staff"}`
            : `Wages · ${w.staff_name || "Staff"}`,
      detail: [
        w.days != null && w.days !== "" ? `${w.days} days` : null,
        w.override_reason,
        w.ledger_name,
      ]
        .filter(Boolean)
        .join(" · "),
      amount: num(w.amount),
      kind: w.kind === "absence" ? "absence" : "wage",
    });
  });

  const weeks = [...weekMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, g]) => {
      const end = addDays(g.start, 6);
      g.rows.sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
      const weekTotal = g.rows.reduce((s, r) => s + r.amount, 0);
      return {
        label: `Monday ${formatDate(isoDay(g.start))} – Sunday ${formatDate(isoDay(end))}`,
        rows: g.rows,
        weekTotal,
      };
    });

  const range = [
    data.project.started_on ? formatDate(data.project.started_on) : null,
    data.project.due_on ? formatDate(data.project.due_on) : data.project.started_on ? "open" : null,
  ]
    .filter(Boolean)
    .join(" → ");

  return (
    <article className="costing-sheet overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm print:border-0 print:shadow-none">
      <header className="border-b border-border/60 px-8 py-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0 space-y-2">
            {data.company_name && (
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                {data.company_name}
              </p>
            )}
            <p className="text-sm text-muted-foreground">{data.project.client_name || "No client"}</p>
            <h2 className="text-2xl font-semibold tracking-tight">
              {data.project.reference ? `${data.project.reference} · ` : ""}
              {data.project.name}
            </h2>
            {range && <p className="text-sm text-muted-foreground">{range}</p>}
          </div>
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-16 w-auto max-w-[200px] object-contain" />
          )}
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl bg-muted/40 px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Project income
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{formatMoney(income, currency)}</p>
            <p className="text-[11px] text-muted-foreground">Invoiced</p>
          </div>
          <div className="rounded-xl bg-[hsl(var(--neon-blue)/0.18)] px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Project expenses
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {formatMoney(projectExpenses, currency)}
            </p>
            <p className="text-[11px] text-muted-foreground">Excludes wages</p>
          </div>
          <div className="rounded-xl bg-[hsl(var(--neon-amber)/0.22)] px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Total wages
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{formatMoney(wagesTotal, currency)}</p>
            <p className="text-[11px] text-muted-foreground">Paid on this project</p>
          </div>
          <div className="rounded-xl border border-[hsl(var(--neon-lime)/0.35)] bg-[hsl(var(--neon-lime)/0.08)] px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Profit margin
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {marginPct == null ? "—" : `${marginPct.toFixed(1)}%`}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {formatMoney(profit, currency)} · wages excluded
            </p>
          </div>
        </div>
      </header>

      <div className="grid lg:grid-cols-2 print:grid-cols-2">
        <section className="border-b border-border/60 px-8 py-7 lg:border-b-0 lg:border-r">
          <div className="border-b-2 border-foreground/80 pb-2">
            <h3 className="text-lg font-semibold tracking-tight">Project income</h3>
            <p className="text-xs text-muted-foreground">Invoices and payments received</p>
          </div>
          <div className="mt-5 space-y-6">
            {invoiceBlocks.length === 0 && otherPayments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No invoices on this file.</p>
            ) : (
              invoiceBlocks.map(({ inv, hits, paid, unpaid }) => (
                <div key={inv.id} className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium tabular-nums">
                        {inv.number}
                        <span className="font-normal text-muted-foreground">
                          {inv.title ? ` · ${inv.title}` : ""}
                        </span>
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {[inv.issued_on ? formatDate(inv.issued_on) : null, unpaid <= 0.005 ? "Paid" : "Open"]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold tabular-nums">
                      {formatMoney(inv.amount, currency)}
                    </p>
                  </div>
                  {hits.length > 0 && (
                    <ul className="space-y-1 border-l border-border/70 pl-3">
                      {hits.map((p) => (
                        <li key={p.id} className="flex justify-between gap-3 text-[13px]">
                          <span className="text-muted-foreground">
                            Payment · {entryDate(p)}
                          </span>
                          <span className="tabular-nums">{formatMoney(p.amount, currency)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {unpaid > 0.005 && paid > 0 && (
                    <p className="text-[11px] text-muted-foreground">
                      Outstanding {formatMoney(unpaid, currency)}
                    </p>
                  )}
                </div>
              ))
            )}
            {otherPayments.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Other receipts
                </p>
                {otherPayments.map((p) => (
                  <div key={p.id} className="flex justify-between gap-3 text-sm">
                    <span>
                      <span className="font-medium">{p.title}</span>
                      <span className="text-muted-foreground"> · {entryDate(p)}</span>
                    </span>
                    <span className="tabular-nums font-semibold">{formatMoney(p.amount, currency)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="mt-8 space-y-1.5 border-t border-border/70 pt-4">
            <div className="flex justify-between rounded-md bg-[hsl(var(--neon-violet)/0.18)] px-2.5 py-1.5 text-sm">
              <span>Total paid</span>
              <span className="font-semibold tabular-nums">{formatMoney(paidTotal, currency)}</span>
            </div>
            <div className="flex justify-between px-2.5 py-1 text-sm">
              <span className="text-muted-foreground">Unpaid</span>
              <span className="font-semibold tabular-nums">{formatMoney(unpaidTotal, currency)}</span>
            </div>
            <div className="flex justify-between rounded-md bg-[hsl(var(--neon-lime)/0.2)] px-2.5 py-1.5 text-sm font-semibold">
              <span>Total invoiced</span>
              <span className="tabular-nums">{formatMoney(income, currency)}</span>
            </div>
          </div>

          <div className="mt-10">
            <div className="border-b-2 border-foreground/80 pb-2">
              <h3 className="text-lg font-semibold tracking-tight">Wages breakdown</h3>
              <p className="text-xs text-muted-foreground">By role · directors first</p>
            </div>
            <div className="mt-5 space-y-6">
              {(() => {
                const breakdown = buildWageBreakdown(wages, staff, fallbackDay);
                if (breakdown.roles.length === 0) {
                  return <p className="text-sm text-muted-foreground">No wages or absences on this project.</p>;
                }
                return (
                  <>
                    {breakdown.roles.map((role) => {
                      const members = breakdown.byRole.get(role) || [];
                      return (
                        <div key={role} className="space-y-2">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {role}
                          </p>
                          <ul className="space-y-2">
                            {members.map((p) => (
                              <li key={`${role}-${p.name}`} className="flex items-start justify-between gap-3 text-sm">
                                <span className="min-w-0 font-medium">{p.name}</span>
                                <span className="shrink-0 text-right tabular-nums">
                                  <span className="block font-semibold">{formatMoney(p.paid, currency)}</span>
                                  <span className="block text-[11px] text-muted-foreground">
                                    Worked {formatWageDays(p.workedDays) || "0"}{" "}
                                    {p.workedDays === 1 ? "day" : "days"}
                                    {" · "}
                                    Absent {formatWageDays(p.absentDays) || "0"}{" "}
                                    {p.absentDays === 1 ? "day" : "days"}
                                  </span>
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                    <div className="flex justify-between rounded-md bg-[hsl(var(--neon-amber)/0.22)] px-2.5 py-1.5 text-sm font-semibold">
                      <span>Total wages</span>
                      <span className="tabular-nums">{formatMoney(breakdown.totalPaid, currency)}</span>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>

          <div className="mt-10">
            <div className="border-b-2 border-foreground/80 pb-2">
              <h3 className="text-lg font-semibold tracking-tight">Traveling</h3>
              <p className="text-xs text-muted-foreground">Mileage, fuel spend, average R/litre</p>
            </div>
            <div className="mt-5 space-y-4">
              {(() => {
                const byPerson = new Map<string, { name: string; km: number; spend: number }>();
                let fuelSpend = 0;
                let litreSum = 0;
                let pricedSpend = 0;
                for (const t of travelRows) {
                  const name = t.staff_name || "Staff";
                  const km = num(t.km);
                  const spend = num(t.amount);
                  const price = num(t.price_per_litre);
                  const row = byPerson.get(name) || { name, km: 0, spend: 0 };
                  row.km += km;
                  row.spend += spend;
                  byPerson.set(name, row);
                  fuelSpend += spend;
                  if (price > 0 && spend > 0) {
                    litreSum += spend / price;
                    pricedSpend += spend;
                  }
                }
                const people = [...byPerson.values()].sort((a, b) =>
                  a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
                );
                const avgLitre = litreSum > 0 ? pricedSpend / litreSum : 0;
                const totalKm = people.reduce((s, p) => s + p.km, 0);
                if (people.length === 0) {
                  return <p className="text-sm text-muted-foreground">No traveling recorded yet.</p>;
                }
                return (
                  <>
                    <ul className="space-y-2">
                      {people.map((p) => (
                        <li key={p.name} className="flex items-start justify-between gap-3 text-sm">
                          <span className="font-medium">{p.name}</span>
                          <span className="shrink-0 text-right tabular-nums">
                            <span className="block font-semibold">{p.km.toLocaleString("en-ZA")} km</span>
                            <span className="block text-[11px] text-muted-foreground">
                              Fuel {formatMoney(p.spend, currency)}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                    <div className="space-y-1.5 border-t border-border/70 pt-3">
                      <div className="flex justify-between text-sm">
                        <span>Total mileage</span>
                        <span className="font-semibold tabular-nums">{totalKm.toLocaleString("en-ZA")} km</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Amount spent on fuel</span>
                        <span className="font-semibold tabular-nums">{formatMoney(fuelSpend, currency)}</span>
                      </div>
                      <div className="flex justify-between rounded-md bg-[hsl(var(--neon-cyan)/0.16)] px-2.5 py-1.5 text-sm">
                        <span>Average price per litre</span>
                        <span className="font-semibold tabular-nums">
                          {avgLitre > 0 ? formatMoney(avgLitre, currency) : "—"}
                        </span>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </section>

        <section className="px-8 py-7">
          <div className="border-b-2 border-foreground/80 pb-2">
            <h3 className="text-lg font-semibold tracking-tight">Project costs</h3>
            <p className="text-xs text-muted-foreground">Monday to Sunday · expenses and wages</p>
          </div>
          <div className="mt-5 space-y-7">
            {weeks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No expenses or wages yet.</p>
            ) : (
              weeks.map((week) => (
                <div key={week.label} className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {week.label}
                  </p>
                  <ul className="space-y-1.5">
                    {week.rows.map((row) => {
                      const isWage = row.kind === "wage" || row.kind === "absence";
                      return (
                        <li
                          key={row.key}
                          className={cn(
                            "flex items-start justify-between gap-3 rounded-md px-2 py-1 text-sm",
                            isWage
                              ? "bg-[hsl(var(--neon-amber)/0.16)]"
                              : "bg-[hsl(var(--neon-blue)/0.14)]"
                          )}
                        >
                          <span className="min-w-0">
                            <span className="font-medium">
                              <span
                                className={cn(
                                  "mr-1.5 rounded px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                                  isWage
                                    ? "bg-[hsl(var(--neon-amber)/0.35)]"
                                    : "bg-[hsl(var(--neon-blue)/0.32)]"
                                )}
                              >
                                {isWage ? "Wage" : "Expense"}
                              </span>
                              {row.label}
                            </span>
                            <span className="block text-[11px] text-muted-foreground">
                              {[formatDate(row.date), row.detail].filter(Boolean).join(" · ")}
                            </span>
                          </span>
                          <span className="shrink-0 tabular-nums font-medium">
                            {formatMoney(row.amount, currency)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="flex justify-between rounded-md bg-[hsl(var(--neon-blue)/0.18)] px-2.5 py-1.5 text-[13px]">
                    <span>Week total expenses</span>
                    <span className="tabular-nums font-semibold">{formatMoney(week.weekTotal, currency)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="mt-8 space-y-1.5 border-t-2 border-foreground/80 pt-4">
            <div className="flex justify-between rounded-md bg-[hsl(var(--neon-blue)/0.18)] px-2.5 py-1.5 text-sm font-semibold">
              <span>Total expenses</span>
              <span className="tabular-nums">{formatMoney(projectExpenses, currency)}</span>
            </div>
            <div className="flex justify-between rounded-md bg-[hsl(var(--neon-amber)/0.22)] px-2.5 py-1.5 text-sm font-semibold">
              <span>Total wages</span>
              <span className="tabular-nums">{formatMoney(wagesTotal, currency)}</span>
            </div>
            <div className="flex justify-between rounded-md bg-[hsl(var(--neon-blue)/0.18)] px-2.5 py-1.5 text-base font-semibold">
              <span>Total project expenses</span>
              <span className="tabular-nums">{formatMoney(projectExpenses + wagesTotal, currency)}</span>
            </div>
          </div>
        </section>
      </div>
    </article>
  );
}

export function PracticeStatementPage() {
  const { flags, ready } = useModuleFlags();
  const search = useSearchParams();
  const id = Number(search.get("id") || "");
  const [data, setData] = useState<ProjectStatement | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<SheetTab>("flow");
  const [staff, setStaff] = useState<PracticeStaff[]>([]);
  const [travels, setTravels] = useState<PracticeTravel[]>([]);
  const [printing, setPrinting] = useState(false);
  const [preview, setPreview] = useState<{
    title: string;
    pages: PreviewPage[];
    pdfBlob: Blob;
  } | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ready || !flags.projects_enabled) return;
    if (!Number.isFinite(id) || id <= 0) {
      setError("Open a project statement from the project file.");
      return;
    }
    Promise.all([
      practiceApi.projects.statement(id),
      practiceApi.wages.list({ projectId: id }).catch(() => [] as PracticeWage[]),
      practiceApi.staff.list().catch(() => [] as PracticeStaff[]),
      practiceApi.travels.list(id).catch(() => [] as PracticeTravel[]),
    ])
      .then(async ([st, wageRows, staffRows, travelRows]) => {
        const wageById = new Map<number, PracticeWage>();
        for (const w of [...(st.wages || []), ...wageRows]) {
          const prev = wageById.get(w.id);
          wageById.set(w.id, prev ? { ...prev, ...w } : w);
        }
        const wages = wageById.size > 0 ? [...wageById.values()] : st.wages || [];
        const wageSum = wages.reduce((s, w) => s + num(w.amount), 0);
        setStaff(staffRows);
        setTravels(st.travels && st.travels.length > 0 ? st.travels : travelRows);
        setData({
          ...st,
          wages,
          totals: { ...st.totals, wages: String(wageSum) },
        });
        if (st.has_logo) {
          const url = await practiceApi.branding.logoObjectUrl();
          setLogoUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return url;
          });
        }
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not pull statement"));
    return () => {
      setLogoUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [id, ready, flags.projects_enabled]);

  if (ready && !flags.projects_enabled) {
    return <FeatureOffPage title="Projects" />;
  }

  if (!data) {
    return (
      <div className="space-y-3">
        <Link
          href={id ? `/practice/file?id=${id}` : "/practice/projects"}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Back
        </Link>
        <p className="text-sm text-muted-foreground">{error || "Pulling statement…"}</p>
      </div>
    );
  }

  const currency = data.currency || "ZAR";
  const projectName = data.project.name;

  async function printReport() {
    const el = printRef.current;
    if (!el) return;
    setPrinting(true);
    try {
      setError(null);
      const pages = await captureElementToPages(el);
      if (pages.length === 0) throw new Error("Nothing to print on this view.");
      const title =
        tab === "costing" ? `Costing sheet · ${projectName}` : `Project flow · ${projectName}`;
      const pdfBlob = await pagesToPdf(pages, title);
      setPreview({ title, pages, pdfBlob });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not open print preview");
    } finally {
      setPrinting(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1 print:hidden">
        <Link
          href={`/practice/file?id=${data.project.id}`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Project file
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-[hsl(var(--neon-cyan))]">
              Project statement
            </p>
            <h1 className="page-title">{data.project.name}</h1>
          </div>
          <Button type="button" variant="outline" onClick={() => void printReport()} disabled={printing}>
            <Printer className="mr-1 h-4 w-4" />
            {printing ? "Opening…" : "Print"}
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </header>

      <table
        className="client-file-tabs w-full border-collapse overflow-hidden rounded-xl border-2 border-border/80 bg-card/70 print:hidden"
        role="tablist"
        aria-label="Statement views"
      >
        <colgroup>
          <col style={{ width: "50%" }} />
          <col style={{ width: "50%" }} />
        </colgroup>
        <tbody>
          <tr>
            {(
              [
                { id: "flow" as const, label: "Project Flow" },
                { id: "costing" as const, label: "Project Costing Sheet" },
              ] as const
            ).map((opt) => (
              <td key={opt.id} className="p-0 align-middle">
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === opt.id}
                  className={cn(
                    "flex h-11 w-full items-center justify-center px-3 text-sm font-medium",
                    tab === opt.id
                      ? "bg-[hsl(var(--neon-cyan)/0.14)] text-foreground"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  )}
                  onClick={() => setTab(opt.id)}
                >
                  {opt.label}
                </button>
              </td>
            ))}
          </tr>
        </tbody>
      </table>

      <div ref={printRef} className="bg-background">
      {tab === "flow" && (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <Card>
              <CardHeader>
                <CardDescription>Quoted</CardDescription>
                <CardTitle className="text-lg tabular-nums">{formatMoney(data.totals.quotes, currency)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Invoiced</CardDescription>
                <CardTitle className="text-lg tabular-nums">{formatMoney(data.totals.invoices, currency)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Running costs</CardDescription>
                <CardTitle className="text-lg tabular-nums">{formatMoney(data.totals.expenses, currency)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Total wages paid</CardDescription>
                <CardTitle className="text-lg tabular-nums">
                  {formatMoney(data.totals.wages || 0, currency)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Received</CardDescription>
                <CardTitle className="text-lg tabular-nums">
                  {formatMoney(data.totals.payments || 0, currency)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card className="section-panel neon-lime border-2">
              <CardHeader>
                <CardDescription>Invoiced less costs</CardDescription>
                <CardTitle className="text-lg tabular-nums">{formatMoney(data.totals.net, currency)}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
              <CardDescription>Date-stamped paper trail notes</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.notes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No notes yet.</p>
              ) : (
                data.notes.map((n) => (
                  <div key={n.id} className="border-b border-border/60 pb-3 last:border-0 last:pb-0">
                    <div className="flex flex-wrap justify-between gap-2">
                      <span className="text-sm font-medium">{n.title}</span>
                      <time className="text-[11px] tabular-nums text-muted-foreground">{entryDate(n)}</time>
                    </div>
                    {n.body && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{n.body}</p>}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quotes</CardTitle>
              <CardDescription>Reference and value</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.quotes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No quotes on this file.</p>
              ) : (
                data.quotes.map((q) => (
                  <div key={q.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span>
                      <span className="font-medium tabular-nums">{q.number}</span>
                      <span className="text-muted-foreground"> · {q.title}</span>
                      {q.issued_on && (
                        <span className="text-muted-foreground"> · {formatDate(q.issued_on)}</span>
                      )}
                    </span>
                    <span className="tabular-nums font-semibold">{formatMoney(q.amount, currency)}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Invoices</CardTitle>
              <CardDescription>Reference, value, and income ledger</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.invoices.length === 0 ? (
                <p className="text-sm text-muted-foreground">No invoices on this file.</p>
              ) : (
                data.invoices.map((inv) => (
                  <div key={inv.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span>
                      <span className="font-medium tabular-nums">{inv.number}</span>
                      <span className="text-muted-foreground"> · {inv.title}</span>
                      {inv.source_quote_number && (
                        <span className="text-muted-foreground"> · from {inv.source_quote_number}</span>
                      )}
                      {inv.issued_on && (
                        <span className="text-muted-foreground"> · {formatDate(inv.issued_on)}</span>
                      )}
                      {inv.income_ledger_name && (
                        <span className="text-muted-foreground"> · {inv.income_ledger_name}</span>
                      )}
                    </span>
                    <span className="tabular-nums font-semibold">{formatMoney(inv.amount, currency)}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Running costs</CardTitle>
              <CardDescription>Expenses assigned to core ledger accounts</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.expenses.length === 0 ? (
                <p className="text-sm text-muted-foreground">No running costs yet.</p>
              ) : (
                data.expenses.map((ex) => (
                  <div key={ex.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span>
                      <span className="font-medium">{ex.description}</span>
                      <span className="text-muted-foreground">
                        {" "}
                        · {[ex.supplier_name || ex.vendor_name, ex.ledger_name || "Ledger", ex.incurred_on ? formatDate(ex.incurred_on) : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span className="tabular-nums font-semibold">{formatMoney(ex.amount, currency)}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Received payments</CardTitle>
              <CardDescription>Money recorded on the paper trail</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {!data.payments?.length ? (
                <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
              ) : (
                data.payments.map((p) => (
                  <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span>
                      <span className="font-medium">{p.title}</span>
                      <span className="text-muted-foreground"> · {entryDate(p)}</span>
                      {p.body && <span className="text-muted-foreground"> · {p.body}</span>}
                    </span>
                    <span className="tabular-nums font-semibold">
                      {formatMoney(p.amount, currency)}
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "costing" && (
        <CostingSheet
          data={data}
          logoUrl={logoUrl}
          currency={currency}
          staff={staff}
          travels={travels}
        />
      )}
      </div>
      <PdfPreviewModal
        open={Boolean(preview)}
        title={preview?.title || "Preview"}
        pages={preview?.pages || []}
        pdfBlob={preview?.pdfBlob}
        onClose={() => setPreview(null)}
      />
    </div>
  );
}
