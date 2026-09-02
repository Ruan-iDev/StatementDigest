"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { practiceApi } from "@/modules/practice/lib/api";
import { useModuleFlags } from "@/modules/practice/flags-provider";
import { FeatureOffPage } from "@/modules/practice/pages/disabled";
import type { PracticeParty, PracticeProject } from "@/modules/practice/lib/types";

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  on_hold: "On hold",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function PracticeProjectsPage() {
  const router = useRouter();
  const { flags, ready } = useModuleFlags();
  const [rows, setRows] = useState<PracticeProject[]>([]);
  const [clients, setClients] = useState<PracticeParty[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [reference, setReference] = useState("");
  const [clientId, setClientId] = useState("");
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  async function load() {
    const [projects, partyList] = await Promise.all([
      practiceApi.projects.list(),
      practiceApi.parties.list("client"),
    ]);
    setRows(projects);
    setClients(partyList);
  }

  useEffect(() => {
    if (!ready || !flags.projects_enabled) return;
    load().catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, [ready, flags.projects_enabled]);

  if (ready && !flags.projects_enabled) {
    return <FeatureOffPage title="Projects" />;
  }

  const listed = [...rows].sort((a, b) => {
    const left = [a.reference || "", a.name, a.client_name || ""].join(" ");
    const right = [b.reference || "", b.name, b.client_name || ""].join(" ");
    return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
  });

  function openNew() {
    setName("");
    setReference("");
    setClientId("");
    setSummary("");
    setError(null);
    setFormOpen(true);
  }

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      setError(null);
      const created = await practiceApi.projects.create({
        name: name.trim(),
        reference: reference.trim() || null,
        client_id: clientId ? Number(clientId) : null,
        summary: summary.trim() || null,
      });
      router.push(`/practice/file?id=${created.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not open project");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link
          href="/practice"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Work Flow
        </Link>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-[hsl(var(--neon-cyan))]">
          Work Flow · Library
        </p>
        <h1 className="page-title">Projects</h1>
        <p className="page-subtitle max-w-xl">
          Each project is a file. Open it, fill in the info sheet, then add notes. Everything stays
          on a dated trail.
        </p>
      </header>

      {error && !formOpen && <p className="text-sm text-destructive">{error}</p>}

      <div className="space-y-2">
        <div className="flex justify-center pt-1">
          <Button type="button" variant="outline" onClick={openNew}>
            <Plus className="mr-1 h-4 w-4" />
            New project
          </Button>
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No project files yet.</p>
        ) : (
          listed.map((row) => (
            <Link key={row.id} href={`/practice/file?id=${row.id}`} className="block">
              <Card className="transition-colors hover:border-[hsl(var(--neon-cyan)/0.45)]">
                <CardContent className="flex flex-wrap items-start justify-between gap-3 py-4">
                  <div className="min-w-0 space-y-0.5">
                    <div className="font-medium">
                      {[row.reference || "—", row.name, row.client_name || "No client"]
                        .join(" - ")}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {row.entry_count} {row.entry_count === 1 ? "entry" : "entries"}
                    </div>
                  </div>
                  <Badge variant="outline">{STATUS_LABEL[row.status] ?? row.status}</Badge>
                </CardContent>
              </Card>
            </Link>
          ))
        )}

        <div className="flex justify-center pt-1">
          <Button type="button" variant="outline" onClick={openNew}>
            <Plus className="mr-1 h-4 w-4" />
            New project
          </Button>
        </div>
      </div>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        closeOnOutside={false}
        title="Open a project file"
        description="A name is enough. You can attach a client now or later."
        className="max-w-2xl"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2 space-y-1.5">
            <Label htmlFor="project-name">Project name</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Wedding — Van der Merwe, 14 Feb"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="project-ref">Project number</Label>
            <Input
              id="project-ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="JOB-014"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="project-client">Client</Label>
            <Select
              id="project-client"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            >
              <option value="">No client yet</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="sm:col-span-2 space-y-1.5">
            <Label htmlFor="project-summary">Info sheet notes</Label>
            <textarea
              id="project-summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={3}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Venue, brief, anything you want on the cover of this file."
            />
          </div>
          {error && <p className="sm:col-span-2 text-sm text-destructive">{error}</p>}
          <div className="sm:col-span-2 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void create()} disabled={busy || !name.trim()}>
              Open project
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
