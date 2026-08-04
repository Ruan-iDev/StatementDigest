"use client";

import { useEffect, useMemo, useState } from "react";
import { api, type Ledger } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ParentLedgerPicker } from "@/components/parent-ledger-picker";

const TYPES = ["income", "expense", "transfer", "capital", "other"];

type Props = {
  open: boolean;
  onClose: () => void;
  /** Existing ledgers for parent picker (active only preferred). */
  ledgers: Ledger[];
  /** Called with the newly created ledger after a successful save. */
  onCreated: (ledger: Ledger) => void;
  /** Optional default type when creating a main ledger. */
  defaultType?: string;
};

/**
 * Shortcut create form for main or sub ledgers — used from Transactions assign flow
 * and anywhere else a quick ledger is needed without leaving the page.
 */
export function CreateLedgerModal({
  open,
  onClose,
  ledgers,
  onCreated,
  defaultType = "expense",
}: Props) {
  const [name, setName] = useState("");
  const [type, setType] = useState(defaultType);
  const [kind, setKind] = useState<"main" | "sub">("main");
  const [parentId, setParentId] = useState<number | null>(null);
  const [budgetMonthly, setBudgetMonthly] = useState("");
  const [budgetAnnual, setBudgetAnnual] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parentOptions = useMemo(
    () => ledgers.filter((l) => !l.is_archived),
    [ledgers]
  );

  useEffect(() => {
    if (!open) return;
    setName("");
    setType(defaultType);
    setKind("main");
    setParentId(null);
    setBudgetMonthly("");
    setBudgetAnnual("");
    setSaving(false);
    setError(null);
  }, [open, defaultType]);

  async function create() {
    if (!name.trim()) {
      setError("Enter a ledger name");
      return;
    }
    if (kind === "sub" && !parentId) {
      setError("Select a parent ledger for a sub-ledger");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const parent = kind === "sub" ? parentOptions.find((l) => l.id === parentId) : null;
      const created = await api.ledgers.create({
        name: name.trim(),
        type: parent?.type || type,
        parent_id: kind === "sub" ? parentId : null,
        budget_monthly: budgetMonthly ? budgetMonthly : null,
        budget_annual: budgetAnnual ? budgetAnnual : null,
      } as never);
      onCreated(created);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add new ledger"
      description="Create a main or sub-ledger, then use it to assign this transaction."
      className="max-w-md"
    >
      <div className="space-y-4">
        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-1.5">
          <Label>Ledger level</Label>
          <div className="inline-flex rounded-xl border border-border/70 bg-muted/30 p-1">
            <button
              type="button"
              className={cn(
                "rounded-lg px-4 py-1.5 text-sm font-medium transition-all",
                kind === "main"
                  ? "bg-[hsl(var(--neon-lime)/0.2)] text-foreground shadow-sm ring-1 ring-[hsl(var(--neon-lime)/0.45)]"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => {
                setKind("main");
                setParentId(null);
              }}
            >
              Main
            </button>
            <button
              type="button"
              className={cn(
                "rounded-lg px-4 py-1.5 text-sm font-medium transition-all",
                kind === "sub"
                  ? "bg-[hsl(var(--neon-lime)/0.2)] text-foreground shadow-sm ring-1 ring-[hsl(var(--neon-lime)/0.45)]"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setKind("sub")}
            >
              Sub-ledger
            </button>
          </div>
        </div>

        {kind === "sub" && (
          <ParentLedgerPicker
            ledgers={parentOptions}
            value={parentId}
            onChange={(id) => {
              setParentId(id);
              const p = parentOptions.find((l) => l.id === id);
              if (p) setType(p.type);
            }}
            label="Parent ledger"
          />
        )}

        <div className="space-y-1">
          <Label>Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={kind === "sub" ? "e.g. Fuel" : "e.g. Motor vehicle"}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void create();
              }
            }}
          />
        </div>

        <div className="space-y-1">
          <Label>Type{kind === "sub" ? " (from parent)" : ""}</Label>
          <Select
            value={type}
            onChange={(e) => setType(e.target.value)}
            disabled={kind === "sub"}
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Budget / month</Label>
            <Input
              value={budgetMonthly}
              onChange={(e) => setBudgetMonthly(e.target.value)}
              placeholder="optional"
            />
          </div>
          <div className="space-y-1">
            <Label>Budget / year</Label>
            <Input
              value={budgetAnnual}
              onChange={(e) => setBudgetAnnual(e.target.value)}
              placeholder="optional"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void create()}
            disabled={saving || (kind === "sub" && !parentId)}
          >
            {saving ? "Creating…" : "Create ledger"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
