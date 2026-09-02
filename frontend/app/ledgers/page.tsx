"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { api, type Ledger } from "@/lib/api";
import { cn, formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ParentLedgerPicker } from "@/components/parent-ledger-picker";

const TYPES = ["income", "expense", "transfer", "capital", "other"];

const TYPE_SECTIONS: { key: string; label: string }[] = [
  { key: "income", label: "Income" },
  { key: "expense", label: "Expense" },
  { key: "transfer", label: "Transfer" },
];

export default function LedgersPage() {
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("expense");
  const [budgetMonthly, setBudgetMonthly] = useState("");
  const [budgetAnnual, setBudgetAnnual] = useState("");
  const [kind, setKind] = useState<"main" | "sub">("main");
  const [parentId, setParentId] = useState<number | null>(null);
  const [editing, setEditing] = useState<Ledger | null>(null);
  const [editKind, setEditKind] = useState<"main" | "sub">("main");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const list = await api.ledgers.list(showArchived);
    setLedgers(list);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [showArchived]);

  const parentOptions = useMemo(() => ledgers.filter((l) => !l.is_archived), [ledgers]);

  const typeGroups = useMemo(() => {
    const known = new Set(TYPE_SECTIONS.map((s) => s.key));
    const extras = [
      ...new Set(ledgers.map((l) => l.type).filter((t) => t && !known.has(t))),
    ].sort();
    const sections = [
      ...TYPE_SECTIONS,
      ...extras.map((t) => ({
        key: t,
        label: t.charAt(0).toUpperCase() + t.slice(1),
      })),
    ];
    return sections
      .map((s) => ({ ...s, items: ledgers.filter((l) => l.type === s.key) }))
      .filter((s) => s.items.length > 0);
  }, [ledgers]);

  async function create() {
    if (!name.trim()) return;
    if (kind === "sub" && !parentId) {
      setError("Select a parent ledger for a sub-ledger");
      return;
    }
    try {
      setError(null);
      const parent = kind === "sub" ? parentOptions.find((l) => l.id === parentId) : null;
      await api.ledgers.create({
        name: name.trim(),
        type: parent?.type || type,
        parent_id: kind === "sub" ? parentId : null,
        budget_monthly: budgetMonthly ? budgetMonthly : null,
        budget_annual: budgetAnnual ? budgetAnnual : null,
      } as never);
      setName("");
      setBudgetMonthly("");
      setBudgetAnnual("");
      setKind("main");
      setParentId(null);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Create failed");
    }
  }

  async function saveEdit() {
    if (!editing) return;
    if (editKind === "sub" && !editing.parent_id) {
      setError("Select a parent ledger for a sub-ledger");
      return;
    }
    try {
      setError(null);
      const parent =
        editKind === "sub" && editing.parent_id
          ? parentOptions.find((l) => l.id === editing.parent_id)
          : null;
      await api.ledgers.update(editing.id, {
        name: editing.name,
        type: parent?.type || editing.type,
        parent_id: editKind === "main" ? null : editing.parent_id,
        budget_monthly: editing.budget_monthly,
        budget_annual: editing.budget_annual,
        sort_order: editing.sort_order,
      } as never);
      setEditing(null);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  }

  async function archive(id: number) {
    await api.ledgers.archive(id);
    await load();
  }

  async function restore(id: number) {
    await api.ledgers.update(id, { is_archived: false });
    await load();
  }

  function openEdit(l: Ledger) {
    setEditing({ ...l });
    setEditKind(l.parent_id ? "sub" : "main");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-[hsl(var(--neon-lime))]">
            Accounts
          </p>
          <h1 className="page-title">Ledger Account Management</h1>
          <p className="text-sm text-muted-foreground">
            Main ledgers or unlimited nested sub-ledgers (sub of a sub, and so on). Archive instead of
            delete.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Show archived
        </label>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm">
          {error}
        </div>
      )}

      <Card className="relative z-30 overflow-visible neon-lime border-2">
        <CardHeader>
          <CardTitle>Add ledger</CardTitle>
          <CardDescription>Toggle Main or Sub — sub-ledgers nest under any active ledger</CardDescription>
        </CardHeader>
        <CardContent className="relative z-30 space-y-4 overflow-visible">
          {/* Main / Sub toggle */}
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
                Main (default)
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
              label="Parent ledger (search)"
            />
          )}

          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[180px] flex-1 space-y-1">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
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
            <Button onClick={create} disabled={kind === "sub" && !parentId}>
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="relative z-0">
        <CardContent className="overflow-x-auto p-0">
          <table className="table-dense w-full min-w-[780px]">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="p-2 font-medium">Name</th>
                <th className="font-medium">Type</th>
                <th className="font-medium">Level</th>
                <th className="font-medium text-right">Budget mo</th>
                <th className="font-medium text-right">Budget yr</th>
                <th className="font-medium">Flags</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {typeGroups.map((group) => (
                <Fragment key={group.key}>
                  <tr className="border-b border-border/60 bg-muted/40">
                    <td colSpan={7} className="px-2 py-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        {group.label}
                      </span>
                      <span className="ml-2 text-xs text-muted-foreground">{group.items.length}</span>
                    </td>
                  </tr>
                  {group.items.map((l) => {
                    const depth = l.depth ?? 0;
                    return (
                      <tr key={l.id} className="border-b border-border/40">
                        <td className="p-2 font-medium">
                          <span
                            className="inline-block"
                            style={{ paddingLeft: `${Math.min(depth, 8) * 14}px` }}
                          >
                            {depth > 0 && (
                              <span className="mr-1 text-muted-foreground">{"└ ".repeat(1)}</span>
                            )}
                            {l.name}
                          </span>
                          {l.parent_name && (
                            <div
                              className="text-[10px] text-muted-foreground"
                              style={{ paddingLeft: `${Math.min(depth, 8) * 14}px` }}
                            >
                              under {l.parent_name}
                            </div>
                          )}
                        </td>
                        <td>
                          <Badge variant="outline">{l.type}</Badge>
                        </td>
                        <td>
                          {depth === 0 ? (
                            <Badge variant="secondary">main</Badge>
                          ) : (
                            <Badge variant="outline">sub · L{depth}</Badge>
                          )}
                        </td>
                        <td className="text-right tabular-nums">
                          {l.budget_monthly != null ? formatMoney(l.budget_monthly) : "—"}
                        </td>
                        <td className="text-right tabular-nums">
                          {l.budget_annual != null ? formatMoney(l.budget_annual) : "—"}
                        </td>
                        <td className="space-x-1">
                          {l.is_system && <Badge variant="secondary">system</Badge>}
                          {l.is_archived && <Badge variant="warning">archived</Badge>}
                        </td>
                        <td className="space-x-1 text-right">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(l)}>
                            Edit
                          </Button>
                          {l.is_archived ? (
                            <Button size="sm" variant="secondary" onClick={() => restore(l.id)}>
                              Restore
                            </Button>
                          ) : (
                            <Button size="sm" variant="ghost" onClick={() => archive(l.id)}>
                              Archive
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Edit ledger</CardTitle>
              <CardDescription>Budgets feed P&amp;L traffic lights · nest under any parent</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label>Ledger level</Label>
                <div className="inline-flex rounded-xl border border-border/70 bg-muted/30 p-1">
                  <button
                    type="button"
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-sm font-medium transition-all",
                      editKind === "main"
                        ? "bg-[hsl(var(--neon-lime)/0.2)] ring-1 ring-[hsl(var(--neon-lime)/0.45)]"
                        : "text-muted-foreground"
                    )}
                    onClick={() => {
                      setEditKind("main");
                      setEditing({ ...editing, parent_id: null });
                    }}
                  >
                    Main
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-sm font-medium transition-all",
                      editKind === "sub"
                        ? "bg-[hsl(var(--neon-lime)/0.2)] ring-1 ring-[hsl(var(--neon-lime)/0.45)]"
                        : "text-muted-foreground"
                    )}
                    onClick={() => setEditKind("sub")}
                  >
                    Sub-ledger
                  </button>
                </div>
              </div>

              {editKind === "sub" && (
                <ParentLedgerPicker
                  ledgers={parentOptions}
                  value={editing.parent_id}
                  excludeIds={[editing.id]}
                  onChange={(id) => {
                    const p = parentOptions.find((l) => l.id === id);
                    setEditing({
                      ...editing,
                      parent_id: id,
                      type: p?.type || editing.type,
                    });
                  }}
                  label="Parent ledger (search)"
                />
              )}

              <div className="space-y-1">
                <Label>Name</Label>
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Type{editKind === "sub" ? " (from parent)" : ""}</Label>
                <Select
                  value={editing.type}
                  disabled={editKind === "sub"}
                  onChange={(e) => setEditing({ ...editing, type: e.target.value })}
                >
                  {TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Monthly budget</Label>
                <Input
                  value={editing.budget_monthly ?? ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      budget_monthly: e.target.value || null,
                    })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Annual budget</Label>
                <Input
                  value={editing.budget_annual ?? ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      budget_annual: e.target.value || null,
                    })
                  }
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button onClick={saveEdit}>Save</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
