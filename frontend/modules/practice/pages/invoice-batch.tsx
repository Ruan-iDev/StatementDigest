"use client";

import { Printer } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function InvoiceCheck({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <label
      className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center"
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-input accent-[hsl(var(--neon-magenta))]"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
      />
    </label>
  );
}

export function InvoiceBatchBar({
  total,
  selectedCount,
  allSelected,
  onToggleAll,
  onPrint,
  printing,
}: {
  total: number;
  selectedCount: number;
  allSelected: boolean;
  onToggleAll: (next: boolean) => void;
  onPrint: () => void;
  printing?: boolean;
}) {
  if (total === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-input accent-[hsl(var(--neon-magenta))]"
          checked={allSelected}
          onChange={(e) => onToggleAll(e.target.checked)}
          aria-label="Select all invoices"
        />
        <span className={cn(selectedCount ? "text-foreground" : "text-muted-foreground")}>
          {selectedCount === 0
            ? "Select invoices"
            : `${selectedCount} selected`}
        </span>
      </label>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={selectedCount === 0 || printing}
        onClick={onPrint}
      >
        <Printer className="mr-1 h-3.5 w-3.5" />
        {printing ? "Opening…" : "Print selected"}
      </Button>
    </div>
  );
}
