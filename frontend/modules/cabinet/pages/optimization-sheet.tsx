"use client";

import type { CabinetJobLine, PricingRow } from "@/modules/cabinet/lib/types";

function num(value: string | number | null | undefined): number {
  if (value == null || value === "") return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function amountText(value: string | number): string {
  const amount = num(value);
  return Number.isInteger(amount) ? String(amount) : String(Math.round(amount * 1000) / 1000);
}

function sheetText(quantity: string | number): string {
  const amount = num(quantity);
  return `${amountText(quantity)} ${amount === 1 ? "sheet" : "sheets"}`;
}

function pieceSize(line: CabinetJobLine): string {
  const length = line.length_mm == null || line.length_mm === "" ? null : num(line.length_mm);
  const width = line.width_mm == null || line.width_mm === "" ? null : num(line.width_mm);
  if (length && width) return `${length} × ${width} mm`;
  if (length) return `${length} mm`;
  return "—";
}

function piecesOf(lines: CabinetJobLine[], productId: number | null): CabinetJobLine[] {
  if (productId == null) return [];
  return lines.filter((line) => line.source_product_id == null && line.product_id === productId);
}

export function OptimizationSheet({
  lines,
  rows,
  error,
  number,
  clientName,
  reference,
}: {
  lines: CabinetJobLine[];
  rows: PricingRow[];
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
        <p>Optimization</p>
      </div>
      <h2 className="mb-1 text-lg font-semibold">Optimization</h2>
      <p className="mb-4 max-w-2xl text-sm text-muted-foreground">
        Cut and edge products are placed on sheets. Each block is one product, the sheets it uses, and the pieces on
        those sheets.
      </p>
      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
      <div className="space-y-4">
        {rows.map((row, index) => {
          const pieces = piecesOf(lines, row.product_id);
          return (
            <section key={`${row.product_id}-${index}`} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-medium">{row.name}</h3>
                <p className="text-sm font-medium tabular-nums">{sheetText(row.quantity)}</p>
              </div>
              {row.detail ? <p className="mt-1 text-xs text-muted-foreground">{row.detail}</p> : null}
              {pieces.length > 0 ? (
                <table className="mt-3 w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                      <th className="py-1.5 pr-3 font-semibold">Qty</th>
                      <th className="py-1.5 font-semibold">Piece</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pieces.map((line) => (
                      <tr key={line.id} className="border-b border-border/70">
                        <td className="py-1.5 pr-3 tabular-nums">{amountText(line.quantity)}</td>
                        <td className="py-1.5 text-muted-foreground">{pieceSize(line)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}
