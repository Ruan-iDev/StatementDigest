"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate, formatMoney } from "@/lib/utils";
import { cabinetApi } from "@/modules/cabinet/lib/api";
import type { CabinetJob } from "@/modules/cabinet/lib/types";
import { practiceApi } from "@/modules/practice/lib/api";
import { projectFileLabel } from "@/modules/practice/pages/project-file-grid";
import type { PracticeProjectDetail } from "@/modules/practice/lib/types";

export function CabinetProjectFilePage() {
  const params = useSearchParams();
  const id = Number(params.get("id"));
  const validId = Number.isFinite(id) && id > 0;
  const [project, setProject] = useState<PracticeProjectDetail | null>(null);
  const [jobs, setJobs] = useState<CabinetJob[]>([]);
  const [picker, setPicker] = useState<CabinetJob[] | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!validId) return;
    practiceApi.projects
      .get(id)
      .then(setProject)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not open project"));
    cabinetApi.jobs
      .list({ projectId: id })
      .then(setJobs)
      .catch(() => setJobs([]));
  }, [id, validId]);

  async function reloadJobs() {
    if (!validId) return;
    setJobs(await cabinetApi.jobs.list({ projectId: id }));
  }

  async function openPicker() {
    if (!project?.client_id) return;
    setBusy(true);
    try {
      setError(null);
      const rows = await cabinetApi.jobs.list({ partyId: project.client_id });
      setPicker(rows.filter((job) => job.project_id !== project.id));
      setPicked([]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not load jobcards");
    } finally {
      setBusy(false);
    }
  }

  function toggle(jobId: number) {
    setPicked((current) =>
      current.includes(jobId) ? current.filter((item) => item !== jobId) : [...current, jobId],
    );
  }

  async function addPicked() {
    if (!project || picked.length === 0) return;
    setBusy(true);
    try {
      setError(null);
      await cabinetApi.jobs.assign(project.id, picked);
      setPicker(null);
      setPicked([]);
      await reloadJobs();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not add the jobcards");
    } finally {
      setBusy(false);
    }
  }

  async function removeFromProject(job: CabinetJob) {
    if (!window.confirm(`Are you sure you want to remove ${job.number} from this project? The jobcard stays on the client.`)) {
      return;
    }
    setBusy(true);
    try {
      setError(null);
      await cabinetApi.jobs.update(job.id, { project_id: null });
      await reloadJobs();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not remove the jobcard");
    } finally {
      setBusy(false);
    }
  }

  if (!validId) {
    return <p className="text-sm text-muted-foreground">Open a project from Cabinet Flow.</p>;
  }
  if (!project) {
    return <p className="text-sm text-muted-foreground">{error || "Opening project…"}</p>;
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link
          href="/cabinet/projects"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Projects
        </Link>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-[hsl(var(--neon-cyan))]">
          Cabinet Flow · Production
        </p>
        <h1 className="page-title">{projectFileLabel(project)}</h1>
        <p className="text-sm text-muted-foreground">
          {project.client_name ? `Client ${project.client_name}` : "No client on this folder yet."}
        </p>
      </header>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Jobcards</h2>
            <p className="max-w-xl text-sm text-muted-foreground">
              {project.client_name
                ? `Jobcards for ${project.client_name} that belong on this project.`
                : "Add a client to this folder before jobcards can be linked."}
            </p>
          </div>
          <Button type="button" disabled={busy || !project.client_id} onClick={() => void openPicker()}>
            Add jobcards
          </Button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No jobcards on this project yet.</p>
        ) : (
          <div className="space-y-2">
            {jobs.map((job) => (
              <Card key={job.id}>
                <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-3 py-3">
                  <div className="w-40 shrink-0 text-xs text-muted-foreground">
                    <div>Created {formatDate(job.created_at)}</div>
                    <div>Last edited {formatDate(job.updated_at)}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link href={`/cabinet/jobcard?id=${job.id}`} className="font-medium hover:underline">
                      {job.number}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {job.job_reference || "No job reference"}
                    </div>
                  </div>
                  <div className="ml-auto flex shrink-0 items-center gap-3">
                    <div className="w-36 text-right">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Total
                      </div>
                      <div className="font-medium tabular-nums">{formatMoney(job.total)}</div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void removeFromProject(job)}
                    >
                      Remove
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Link href={`/practice/file?id=${project.id}`} className="inline-block text-sm underline">
          Open the financial file in Work Flow
        </Link>
      </section>

      {picker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[80vh] w-full max-w-lg flex-col gap-3 rounded-xl border border-border bg-background p-4 shadow-xl">
            <div>
              <h3 className="text-lg font-semibold">Add jobcards</h3>
              <p className="text-sm text-muted-foreground">
                Tick the jobcards for {project.client_name}. Several can be added together.
              </p>
            </div>
            {picker.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {project.client_name} has no jobcards left to add.
              </p>
            ) : (
              <div className="min-h-0 flex-1 space-y-1 overflow-auto">
                {picker.map((job) => (
                  <label
                    key={job.id}
                    className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-accent"
                  >
                    <input
                      type="checkbox"
                      checked={picked.includes(job.id)}
                      onChange={() => toggle(job.id)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{job.number}</span>
                      <span className="block text-xs text-muted-foreground">
                        {job.job_reference || "No job reference"}
                        {job.project_id ? " · Already on another project" : ""}
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums text-sm">{formatMoney(job.total)}</span>
                  </label>
                ))}
              </div>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              {picker.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    setPicked(picked.length === picker.length ? [] : picker.map((job) => job.id))
                  }
                >
                  {picked.length === picker.length ? "Clear" : "Select all"}
                </Button>
              )}
              <Button type="button" variant="outline" onClick={() => setPicker(null)}>
                Cancel
              </Button>
              <Button type="button" disabled={busy || picked.length === 0} onClick={() => void addPicked()}>
                Add
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
