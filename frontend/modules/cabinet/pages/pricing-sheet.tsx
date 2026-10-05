"use client";

import type { PricingResult } from "@/modules/cabinet/lib/types";
import { formatMoney } from "@/lib/utils";

function num(value: string | number | null | undefined): number {
  if (value == null || value === "") return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function measureText(quantity: string | number, unitLabel: string): string {
  const amount = num(quantity);
  const shown = Number.isInteger(amount) ? String(amount) : String(Math.round(amount * 1000) / 1000);
  if (unitLabel === "sheets") return `${shown} ${amount === 1 ? "sheet" : "sheets"}`;
  if (unitLabel === "m²") return `${shown} m²`;
  if (unitLabel === "m") return `${shown} m`;
  return shown;
}

function rateCaption(unitLabel: string): string {
  if (unitLabel === "sheets") return "per sheet";
  if (unitLabel === "m²") return "per m²";
  if (unitLabel === "m") return "per m";
  return "each";
}

export function PricingSheet({
  result,
  error,
  number,
  clientName,
  reference,
}: {
  result: PricingResult | null;
  error: string | null;
  number: string;
  clientName: string;
  reference: string;
}) {
  return (
    <div className="jobcard-sheet flex-1 overflow-auto p-4">
      <div className="mb-4 hidden print:block">
        <p className="text-lg font-semibold">{number}</p>
        <p>{clientName}</p>
        {reference ? <p>{reference}</p> : null}
        <p>Pricing</p>
      </div>
      <h2 className="mb-1 text-lg font-semibold">Pricing</h2>
      <p className="mb-4 max-w-2xl text-sm text-muted-foreground">
        Cut and edge products are priced by the sheets they use. Square metre products of the same kind are added
        into one area. Linear products of the same kind are added into one length.
      </p>
      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
      {!result && !error ? <p className="text-sm text-muted-foreground">Working out the prices…</p> : null}
      {result && result.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Add products first. The prices are worked out here.</p>
      ) : null}
      {result && result.rows.length > 0 ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <th className="py-2 pr-3 font-semibold">Item</th>
              <th className="py-2 pr-3 font-semibold">Amount</th>
              <th className="py-2 pr-3 text-right font-semibold">Rate</th>
              <th className="py-2 pr-3 text-right font-semibold">Ex VAT</th>
              <th className="py-2 pr-3 text-right font-semibold">VAT</th>
              <th className="py-2 text-right font-semibold">Line total</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, index) => (
              <tr key={`${row.product_id}-${index}`} className="border-b border-border/70">
                <td className="py-2 pr-3">
                  <div className="font-medium">{row.name}</div>
                  {row.detail ? <div className="text-xs text-muted-foreground">{row.detail}</div> : null}
                </td>
                <td className="py-2 pr-3 tabular-nums">{measureText(row.quantity, row.unit_label)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  <div>{formatMoney(row.unit_price)}</div>
                  <div className="text-xs text-muted-foreground">{rateCaption(row.unit_label)}</div>
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">{formatMoney(row.line_ex_vat)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{formatMoney(row.vat_amount)}</td>
                <td className="py-2 text-right font-medium tabular-nums">{formatMoney(row.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {result ? (
        <div className="ml-auto mt-4 w-full max-w-xs space-y-1 border-t border-border pt-3 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span>
            <span className="tabular-nums">{formatMoney(result.ex_vat)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>VAT</span>
            <span className="tabular-nums">{formatMoney(result.vat)}</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{formatMoney(result.total)}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
