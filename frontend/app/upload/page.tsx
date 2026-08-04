"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileUp, ListChecks, Plus, Trash2, Upload } from "lucide-react";
import { api, type BankProfile } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BankProfileWizard } from "@/components/bank-profile-wizard";
import {
  UploadDisclaimerModal,
  type DisclaimerContent,
} from "@/components/upload-disclaimer-modal";
import { useUploadQueue, type QueueStatus } from "@/components/upload-queue-provider";
import { cn } from "@/lib/utils";

function statusLabel(s: QueueStatus): string {
  switch (s) {
    case "pending":
      return "Pending";
    case "processing":
      return "Processing";
    case "processed":
      return "Processed";
    case "failed":
      return "Failed";
  }
}

export default function UploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queueListRef = useRef<HTMLUListElement>(null);

  const {
    queue,
    running,
    profileId,
    setProfileId,
    error,
    setError,
    addFiles,
    removeItem,
    clearQueue,
    processQueue,
    counts,
  } = useUploadQueue();

  const [profiles, setProfiles] = useState<BankProfile[] | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStartStep1, setWizardStartStep1] = useState(false);
  const [disclaimerOpen, setDisclaimerOpen] = useState(false);
  const [disclaimer, setDisclaimer] = useState<DisclaimerContent | null>(null);
  const [disclaimerBusy, setDisclaimerBusy] = useState(false);

  const refreshProfiles = useCallback(async () => {
    const list = await api.bankProfiles.list();
    setProfiles(list);
    if (list.length) {
      setProfileId(
        // Keep existing selection if still valid
        profileId && list.some((p) => String(p.id) === profileId)
          ? profileId
          : String(list[0].id)
      );
      setWizardOpen(false);
    } else {
      setProfileId("");
      setWizardStartStep1(false);
      setWizardOpen(true);
    }
    return list;
  }, [profileId, setProfileId]);

  useEffect(() => {
    refreshProfiles().catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  /**
   * Queue scroll follow:
   * 1) Start at the top (first rows).
   * 2) Follow the active processing row downward.
   * 3) Once that row would sit at mid-viewport, keep it mid-screen (auto-scroll).
   * 4) Near the end, clamp to bottom so the last items stay in view — no jump-to-end thrash.
   */
  const lastScrollTargetRef = useRef<number>(-1);
  useEffect(() => {
    const list = queueListRef.current;
    if (!list || queue.length === 0) return;

    const processingIdx = queue.findIndex((q) => q.status === "processing");
    // Prefer live processing row; when idle after a run, rest on last finished item
    let targetIdx = processingIdx;
    if (targetIdx < 0) {
      if (!running && (counts.processed > 0 || counts.failed > 0)) {
        targetIdx = queue.length - 1;
      } else {
        return;
      }
    }

    const el = list.querySelector(
      `[data-queue-index="${targetIdx}"]`
    ) as HTMLElement | null;
    if (!el) return;

    const maxScroll = Math.max(0, list.scrollHeight - list.clientHeight);
    if (maxScroll <= 0) {
      // Entire queue fits — stay at top, no scrolling
      if (list.scrollTop !== 0) list.scrollTop = 0;
      lastScrollTargetRef.current = targetIdx;
      return;
    }

    // Ideal: active row vertically centred in the list viewport
    const ideal = el.offsetTop + el.offsetHeight / 2 - list.clientHeight / 2;
    // Early rows → clamp 0 (top). Late rows → clamp maxScroll (bottom).
    const top = Math.max(0, Math.min(ideal, maxScroll));

    const targetChanged = lastScrollTargetRef.current !== targetIdx;
    lastScrollTargetRef.current = targetIdx;

    // Ignore tiny adjustments (avoids smooth-scroll fight / jitter)
    if (!targetChanged && Math.abs(list.scrollTop - top) < 8) return;

    // Instant when stepping row-to-row (stable); smooth only for larger jumps
    const distance = Math.abs(list.scrollTop - top);
    list.scrollTo({
      top,
      behavior: distance > list.clientHeight * 0.6 ? "smooth" : "auto",
    });
  }, [queue, running, counts.processed, counts.failed, counts.current]);

  const canUpload =
    !!profileId &&
    queue.length > 0 &&
    !running &&
    queue.some((q) => q.status === "pending" || q.status === "failed");

  function onPickFiles(fileList: FileList | null) {
    addFiles(fileList);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function onUpload() {
    if (!profiles?.length) {
      setWizardStartStep1(false);
      setWizardOpen(true);
      return;
    }
    if (!canUpload) return;
    // Adding files does nothing yet — disclaimer only when starting process
    setDisclaimerBusy(true);
    setError(null);
    try {
      const content = await api.disclaimers.uploadContent();
      setDisclaimer(content);
      setDisclaimerOpen(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not load disclaimer");
    } finally {
      setDisclaimerBusy(false);
    }
  }

  async function onDisclaimerAccept() {
    if (!disclaimer) return;
    setDisclaimerBusy(true);
    setError(null);
    try {
      await api.disclaimers.acceptUpload({
        disclaimer_version: disclaimer.version,
        context: "statement_upload",
        file_count: queue.filter((q) => q.status === "pending" || q.status === "failed").length,
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      });
      setDisclaimerOpen(false);
      // Fire-and-forget background process — user may navigate away
      void processQueue(profileId);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not record acceptance");
    } finally {
      setDisclaimerBusy(false);
    }
  }

  function onDisclaimerCancel() {
    if (disclaimerBusy) return;
    setDisclaimerOpen(false);
  }

  if (profiles === null && !error) {
    return <p className="text-sm text-muted-foreground">Checking bank profiles…</p>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-[hsl(var(--neon-cyan))]">
            Import
          </p>
          <h1 className="page-title">Upload Statement</h1>
          <p className="page-subtitle max-w-xl">
            Choose a bank profile, add as many statements as you need, then upload. Processing runs
            one file at a time in the background — you can leave this page while it works.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => router.push("/")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
      </div>

      {profiles && profiles.length === 0 && (
        <Card className="border-2 border-[hsl(var(--neon-amber)/0.5)] shadow-neon-amber">
          <CardHeader>
            <CardTitle>No bank profile yet</CardTitle>
            <CardDescription>
              Create a bank profile from a sample statement before importing.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              size="sm"
              onClick={() => {
                setWizardStartStep1(false);
                setWizardOpen(true);
              }}
            >
              Create Bank Profile
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className="neon-cyan border-2">
        <CardHeader>
          <CardTitle>Statement batch</CardTitle>
          <CardDescription>
            Select bank profile · add files · upload · navigate freely while the queue runs
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="bank-profile">Bank profile</Label>
            <Select
              id="bank-profile"
              value={profileId}
              onChange={(e) => setProfileId(e.target.value)}
              disabled={!profiles?.length || running}
            >
              <option value="">Select…</option>
              {profiles?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.bank_type})
                </option>
              ))}
            </Select>
            {profiles && profiles.length > 0 && (
              <button
                type="button"
                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                disabled={running}
                onClick={() => {
                  setWizardStartStep1(true);
                  setWizardOpen(true);
                }}
              >
                Create another bank profile
              </button>
            )}
          </div>

          <div className="space-y-2">
            <Label>Statements</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.pdf,.txt,.tsv"
              multiple
              className="hidden"
              disabled={!profiles?.length || running}
              onChange={(e) => onPickFiles(e.target.files)}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={!profiles?.length || running}
                onClick={() => fileInputRef.current?.click()}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add statements
              </Button>
              {queue.length > 0 && !running && (
                <Button type="button" variant="ghost" size="sm" onClick={clearQueue}>
                  Clear list
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Hold Ctrl (Windows) or Cmd (Mac) to multi-select. No file limit — files process one by
              one.
              {queue.length > 0 ? ` · ${queue.length} in queue` : ""}
            </p>
          </div>

          {queue.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Queue
                </p>
                <p className="text-xs text-muted-foreground">
                  {counts.processed} processed
                  {counts.processing ? ` · 1 processing` : ""}
                  {counts.pending ? ` · ${counts.pending} pending` : ""}
                  {counts.failed ? ` · ${counts.failed} failed` : ""}
                  {counts.txs > 0 ? ` · ${counts.txs} transactions` : ""}
                </p>
              </div>
              <ul
                ref={queueListRef}
                className="relative max-h-[22rem] space-y-2 overflow-y-auto pr-1"
                aria-label="Statement upload queue"
              >
                {queue.map((item, index) => (
                  <li
                    key={item.id}
                    data-queue-index={index}
                    data-status={item.status}
                    className={cn(
                      "queue-row",
                      item.status === "pending" && "queue-row-pending",
                      item.status === "processing" && "queue-row-processing",
                      item.status === "processed" && "queue-row-processed",
                      item.status === "failed" && "queue-row-failed"
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium" title={item.file.name}>
                        {item.file.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {(item.file.size / 1024).toFixed(1)} KB
                        {item.transactionsCreated != null && item.status === "processed"
                          ? ` · ${item.transactionsCreated} txns`
                          : ""}
                        {item.message && item.status === "failed" ? ` · ${item.message}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className={cn(
                          "queue-status-badge",
                          item.status === "pending" && "queue-status-pending",
                          item.status === "processing" && "queue-status-processing",
                          item.status === "processed" && "queue-status-processed",
                          item.status === "failed" && "queue-status-failed"
                        )}
                      >
                        {statusLabel(item.status)}
                      </span>
                      {!running && item.status !== "processing" && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => removeItem(item.id)}
                          aria-label={`Remove ${item.file.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
              {error}
            </div>
          )}

          {running && (
            <div className="rounded-xl border-2 border-[hsl(var(--neon-amber)/0.5)] bg-[hsl(var(--neon-amber)/0.1)] px-4 py-3 text-sm">
              <p className="font-medium">
                Background upload in progress — {counts.current}/{counts.total}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                You can leave this page. A spinner in the bottom-right keeps the counter visible.
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-2 border-t border-border/60 pt-4">
            <Button type="button" variant="outline" onClick={() => router.push("/")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>

            <Button
              type="button"
              disabled={!canUpload || !profiles?.length || disclaimerBusy}
              onClick={() => onUpload()}
            >
              <Upload className="mr-2 h-4 w-4" />
              {running ? "Uploading…" : disclaimerBusy ? "…" : "Upload"}
            </Button>

            <Link href="/pending" className="inline-flex">
              <Button
                type="button"
                variant="secondary"
                className="border-2 border-[hsl(var(--neon-magenta)/0.55)] bg-[hsl(var(--neon-magenta)/0.1)] shadow-[0_0_14px_hsl(var(--neon-magenta)/0.25)] hover:bg-[hsl(var(--neon-magenta)/0.18)]"
              >
                <ListChecks className="mr-2 h-4 w-4" />
                View Processed transactions
              </Button>
            </Link>
          </div>

          {counts.processed > 0 && !running && (
            <div className="rounded-xl border-2 border-[hsl(var(--neon-lime)/0.45)] bg-[hsl(var(--neon-lime)/0.08)] px-4 py-3 text-sm">
              <p className="font-medium">
                Batch complete — {counts.processed} file(s) processed
                {counts.failed ? `, ${counts.failed} failed` : ""}.
              </p>
              <p className="mt-1 text-muted-foreground">
                {counts.txs} transaction(s) imported. Review them under Transactions.
              </p>
              <div className="mt-3">
                <Link href="/pending">
                  <Button
                    type="button"
                    size="sm"
                    className="border-2 border-[hsl(var(--neon-magenta)/0.55)] bg-[hsl(var(--neon-magenta)/0.15)] text-foreground shadow-[0_0_14px_hsl(var(--neon-magenta)/0.3)] hover:bg-[hsl(var(--neon-magenta)/0.25)]"
                  >
                    <FileUp className="mr-2 h-4 w-4" />
                    Open transactions
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <BankProfileWizard
        key={wizardStartStep1 ? "step1" : "gate"}
        open={wizardOpen}
        startAtStep1={wizardStartStep1}
        goDashboardOnSave={!profiles?.length}
        onClose={() => setWizardOpen(false)}
        onSaved={() => {
          refreshProfiles().catch(() => undefined);
        }}
      />

      <UploadDisclaimerModal
        open={disclaimerOpen}
        content={disclaimer}
        fileCount={queue.filter((q) => q.status === "pending" || q.status === "failed").length}
        busy={disclaimerBusy}
        onAccept={onDisclaimerAccept}
        onCancel={onDisclaimerCancel}
      />
    </div>
  );
}
