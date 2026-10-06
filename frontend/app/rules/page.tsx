"use client";

import { useEffect, useState } from "react";
import { api, type Ledger, type Rule } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function RulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [name, setName] = useState("");
  const [matchType, setMatchType] = useState("contains");
  const [matchValue, setMatchValue] = useState("");
  const [ledgerId, setLedgerId] = useState("");
  const [priority, setPriority] = useState("10");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [r, l] = await Promise.all([api.rules.list(), api.ledgers.list()]);
    setRules(r);
    setLedgers(l);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  function ledgerName(id: number) {
    return ledgers.find((l) => l.id === id)?.name || `#${id}`;
  }

  async function create() {
    if (!name || !matchValue || !ledgerId) {
      setError("Name, match value, and ledger required");
      return;
    }
    try {
      const res = await api.rules.create({
        name,
        match_type: matchType,
        match_value: matchValue,
        ledger_id: Number(ledgerId),
        priority: Number(priority) || 0,
        is_active: true,
      });
      setMessage(res.message);
      setName("");
      setMatchValue("");
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  async function toggleActive(rule: Rule) {
    const res = await api.rules.update(rule.id, { is_active: !rule.is_active });
    setMessage(res.message);
    await load();
  }

  async function remove(id: number) {
    if (!confirm("Delete this rule?")) return;
    await api.rules.delete(id);
    await load();
  }

  async function applyAll() {
    const res = await api.rules.applyAll();
    setMessage(res.message);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-[hsl(var(--neon-magenta))]">
            Automation
          </p>
          <h1 className="page-title">Rule Management</h1>
          <p className="text-sm text-muted-foreground">
            Create / edit rules live-strip matching transactions from the pending queue.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={applyAll}>
          Re-run all rules
        </Button>
      </div>

      {message && (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm">
          {message}
        </div>
      )}
      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>New rule</CardTitle>
          <CardDescription>Higher priority wins when multiple rules match</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="min-w-[140px] flex-1 space-y-1">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Match</Label>
            <Select value={matchType} onChange={(e) => setMatchType(e.target.value)}>
              <option value="contains">Contains</option>
              <option value="exact">Exact</option>
              <option value="regex">Regex</option>
              <option value="amount_exact">Amount exact</option>
              <option value="amount_range">Amount range</option>
              <option value="combination">Combination</option>
            </Select>
          </div>
          <div className="min-w-[160px] flex-1 space-y-1">
            <Label>Value</Label>
            <Input
              value={matchValue}
              onChange={(e) => setMatchValue(e.target.value)}
              placeholder="e.g. NETFLIX"
            />
          </div>
          <div className="space-y-1">
            <Label>Ledger</Label>
            <Select value={ledgerId} onChange={(e) => setLedgerId(e.target.value)}>
              <option value="">Choose…</option>
              {ledgers.filter((l) => !l.system_role).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-20 space-y-1">
            <Label>Priority</Label>
            <Input value={priority} onChange={(e) => setPriority(e.target.value)} />
          </div>
          <Button onClick={create}>Create &amp; apply</Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="table-dense w-full min-w-[700px]">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="p-2 font-medium">Name</th>
                <th className="font-medium">Match</th>
                <th className="font-medium">Ledger</th>
                <th className="font-medium text-right">Priority</th>
                <th className="font-medium text-right">Applied</th>
                <th className="font-medium">Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} className="border-b border-border/40">
                  <td className="p-2 font-medium">{r.name}</td>
                  <td className="text-xs">
                    <Badge variant="outline">{r.match_type}</Badge>{" "}
                    <span className="text-muted-foreground">{r.match_value}</span>
                  </td>
                  <td>{ledgerName(r.ledger_id)}</td>
                  <td className="text-right tabular-nums">{r.priority}</td>
                  <td className="text-right tabular-nums">{r.applied_count ?? 0}</td>
                  <td>
                    <Badge variant={r.is_active ? "success" : "secondary"}>
                      {r.is_active ? "active" : "off"}
                    </Badge>
                  </td>
                  <td className="space-x-1 text-right">
                    <Button size="sm" variant="ghost" onClick={() => toggleActive(r)}>
                      {r.is_active ? "Disable" : "Enable"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(r.id)}>
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rules.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">No rules yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
