"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { practiceApi } from "@/modules/practice/lib/api";
import { useModuleFlags } from "@/modules/practice/flags-provider";
import { FeatureOffPage } from "@/modules/practice/pages/disabled";
import { ProjectFileGrid } from "@/modules/practice/pages/project-file-grid";
import type { PracticeParty, PracticeProject } from "@/modules/practice/lib/types";

export function PracticeProjectsPage({
  homeHref = "/practice",
  fileHref = (id: number) => `/practice/file?id=${id}`,
  moduleLabel = "Work Flow",
  blurb = "Each project is a folder. The number sits on the folder, the name underneath. Open one, fill in the info sheet, then add notes.",
}: {
  homeHref?: string;
  fileHref?: (id: number) => string;
  moduleLabel?: string;
  blurb?: string;
} = {}) {
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
      router.push(fileHref(created.id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not open project");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link
          href={homeHref}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          {moduleLabel}
        </Link>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-[hsl(var(--neon-cyan))]">
          {moduleLabel} · Library
        </p>
        <h1 className="page-title">Projects</h1>
        <p className="page-subtitle max-w-xl">{blurb}</p>
      </header>

      {error && !formOpen && <p className="text-sm text-destructive">{error}</p>}

      <div className="space-y-4">
        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={openNew}>
            <Plus className="mr-1 h-4 w-4" />
            New project
          </Button>
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No project files yet.</p>
        ) : (
          <ProjectFileGrid projects={rows} showClient hrefFor={(row) => fileHref(row.id)} />
        )}
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
