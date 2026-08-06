"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Check,
  CheckCircle2,
  FileUp,
  ListChecks,
  Plus,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { api, type SupportedBank } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import {
  UploadDisclaimerModal,
  type DisclaimerContent,
} from "@/components/upload-disclaimer-modal";
import { useUploadQueue, type QueueStatus } from "@/components/upload-queue-provider";
import { useLicenseOptional } from "@/components/license-provider";
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

/** Find or create the internal bank profile for a calibrated bank (hidden from Settings). */
async function ensureBankProfileId(bank: SupportedBank): Promise<number> {
  const list = await api.bankProfiles.list();
  const existing = list.find(
    (p) => (p.bank_type || "").toLowerCase() === (bank.bank_type || "").toLowerCase()
  );
  if (existing) return existing.id;

  const calibration = await api.bankProfiles.preset(bank.bank_type);
  const created = await api.bankProfiles.create({
    name: bank.suggested_name || bank.label,
    bank_type: bank.bank_type,
    calibration_data: calibration,
  });
  return created.id;
}

export default function UploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queueListRef = useRef<HTMLUListElement>(null);
  const license = useLicenseOptional();
  const readOnly = Boolean(license?.readOnly);

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

  const [banks, setBanks] = useState<SupportedBank[] | null>(null);
  const [bankKey, setBankKey] = useState("");
  const [resolvingBank, setResolvingBank] = useState(false);
  const [disclaimerOpen, setDisclaimerOpen] = useState(false);
  const [disclaimer, setDisclaimer] = useState<DisclaimerContent | null>(null);
  const [disclaimerBusy, setDisclaimerBusy] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const wasRunning = useRef(false);

  const selectedBank = banks?.find((b) => b.id === bankKey) || null;
  const step1Done = !!bankKey && !!profileId && !resolvingBank;
  const step2Done = queue.length > 0;
  const step3Active = step1Done && step2Done;

  const canUpload =
    step1Done &&
    queue.length > 0 &&
    !running &&
    queue.some((q) => q.status === "pending" || q.status === "failed");

  const loadBanks = useCallback(async () => {
    const res = await api.bankProfiles.supportedBanks();
    const list = res.banks || [];
    setBanks(list);
    return list;
  }, []);

  useEffect(() => {
    loadBanks().catch((e: unknown) =>
      setError(e instanceof Error ? e.message : "Could not load banks")
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  async function onBankChange(nextKey: string) {
    setBankKey(nextKey);
    setError(null);
    setProfileId("");
    if (!nextKey || !banks) return;

    const bank = banks.find((b) => b.id === nextKey);
    if (!bank) return;

    setResolvingBank(true);
    try {
      const id = await ensureBankProfileId(bank);
      setProfileId(String(id));
    } catch (e: unknown) {
      setBankKey("");
      setProfileId("");
      setError(e instanceof Error ? e.message : "Could not prepare bank for import");
    } finally {
      setResolvingBank(false);
    }
  }

  // Success modal when a processing run finishes with at least one success
  useEffect(() => {
    if (running) {
      wasRunning.current = true;
      return;
    }
    if (
      wasRunning.current &&
      !running &&
      counts.processed > 0 &&
      counts.pending === 0 &&
      counts.processing === 0
    ) {
      setSuccessOpen(true);
      wasRunning.current = false;
    }
  }, [running, counts.processed, counts.pending, counts.processing]);

  // Queue auto-scroll while processing
  const lastScrollTargetRef = useRef<number>(-1);
  useEffect(() => {
    const list = queueListRef.current;
    if (!list || queue.length === 0) return;

    const processingIdx = queue.findIndex((q) => q.status === "processing");
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
      if (list.scrollTop !== 0) list.scrollTop = 0;
      lastScrollTargetRef.current = targetIdx;
      return;
    }

    const ideal = el.offsetTop + el.offsetHeight / 2 - list.clientHeight / 2;
    const top = Math.max(0, Math.min(ideal, maxScroll));
    const targetChanged = lastScrollTargetRef.current !== targetIdx;
    lastScrollTargetRef.current = targetIdx;
    if (!targetChanged && Math.abs(list.scrollTop - top) < 8) return;

    const distance = Math.abs(list.scrollTop - top);
    list.scrollTo({
      top,
      behavior: distance > list.clientHeight * 0.6 ? "smooth" : "auto",
    });
  }, [queue, running, counts.processed, counts.failed, counts.current]);

  function onPickFiles(fileList: FileList | null) {
    addFiles(fileList);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function onProcess() {
    if (readOnly) {
      setError("Read-only mode — uploads are locked until you enter an unlock key.");
      return;
    }
    if (!selectedBank) {
      setError("Select your bank first.");
      return;
    }
    if (
      !queue.length ||
      !queue.some((q) => q.status === "pending" || q.status === "failed")
    ) {
      return;
    }

    let pid = profileId;
    if (!pid) {
      setResolvingBank(true);
      try {
        pid = String(await ensureBankProfileId(selectedBank));
        setProfileId(pid);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Could not prepare bank for import");
        return;
      } finally {
        setResolvingBank(false);
      }
    }

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
      let pid = profileId;
      if (!pid && selectedBank) {
        pid = String(await ensureBankProfileId(selectedBank));
        setProfileId(pid);
      }
      void processQueue(pid);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not record acceptance");
    } finally {
      setDisclaimerBusy(false);
    }
  }

  if (banks === null && !error) {
    return <p className="text-sm text-muted-foreground">Loading banks…</p>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-[hsl(var(--neon-cyan))]">
            Import
          </p>
          <h1 className="page-title">Upload statements</h1>
          <p className="page-subtitle max-w-xl">
            Three easy steps — pick your bank, add files, then process.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => router.push("/")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Dashboard
        </Button>
      </div>

      {/* Visual step rail */}
      <div className="flex items-center justify-between gap-1 px-1 sm:gap-2">
        <StepPill n={1} label="Bank" done={step1Done} active={!step1Done} accent="cyan" />
        <div
          className={cn(
            "h-0.5 min-w-[1.5rem] flex-1 rounded-full transition-colors",
            step1Done ? "bg-[hsl(var(--neon-cyan)/0.7)]" : "bg-border"
          )}
        />
        <StepPill
          n={2}
          label="Files"
          done={step2Done}
          active={step1Done && !step2Done}
          locked={!step1Done}
          accent="violet"
        />
        <div
          className={cn(
            "h-0.5 min-w-[1.5rem] flex-1 rounded-full transition-colors",
            step2Done ? "bg-[hsl(var(--neon-violet)/0.7)]" : "bg-border"
          )}
        />
        <StepPill
          n={3}
          label="Process"
          done={counts.processed > 0 && !running && counts.pending === 0}
          active={step3Active && (running || canUpload)}
          locked={!step3Active}
          accent="lime"
        />
      </div>

      {/* ── Step 1 ── */}
      <section
        className={cn(
          "upload-step rounded-2xl border-2 p-5 transition-all",
          step1Done
            ? "border-[hsl(var(--neon-cyan)/0.45)] bg-[hsl(var(--neon-cyan)/0.06)]"
            : "border-[hsl(var(--neon-cyan)/0.65)] bg-card shadow-[0_0_28px_hsl(var(--neon-cyan)/0.12)]"
        )}
      >
        <StepHeader
          n={1}
          title="Select your bank"
          subtitle="Which bank’s statements are you importing? We only list banks we already know how to read."
          icon={<Building2 className="h-5 w-5" />}
          done={step1Done}
          accent="cyan"
        />
        <div className="mt-4 space-y-2">
          <Label htmlFor="bank-select">Select your bank</Label>
          <Select
            id="bank-select"
            value={bankKey}
            onChange={(e) => void onBankChange(e.target.value)}
            disabled={!banks?.length || running || resolvingBank}
            className="h-11"
          >
            <option value="">
              {banks?.length ? "Select your bank…" : "No supported banks available"}
            </option>
            {banks?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </Select>
          {resolvingBank && (
            <p className="text-xs text-muted-foreground">Preparing bank reader…</p>
          )}
          {selectedBank && !resolvingBank && (
            <p className="text-xs text-muted-foreground">
              {selectedBank.description}
              {selectedBank.formats ? ` · ${selectedBank.formats}` : ""}
            </p>
          )}
        </div>
      </section>

      {/* Connector */}
      <div className="flex justify-center">
        <div
          className={cn(
            "h-8 w-0.5 rounded-full transition-colors",
            step1Done ? "bg-[hsl(var(--neon-cyan)/0.5)]" : "bg-border/60"
          )}
        />
      </div>

      {/* ── Step 2 ── */}
      <section
        className={cn(
          "upload-step rounded-2xl border-2 p-5 transition-all",
          !step1Done && "pointer-events-none opacity-45",
          step1Done &&
            !step2Done &&
            "border-[hsl(var(--neon-violet)/0.65)] bg-card shadow-[0_0_28px_hsl(var(--neon-violet)/0.12)]",
          step2Done && "border-[hsl(var(--neon-violet)/0.45)] bg-[hsl(var(--neon-violet)/0.06)]"
        )}
      >
        <StepHeader
          n={2}
          title="Add statements"
          subtitle="Drop in one or many PDF / CSV files from that bank."
          icon={<FileUp className="h-5 w-5" />}
          done={step2Done}
          accent="violet"
        />
        <div className="mt-4 space-y-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.pdf,.txt,.tsv"
            multiple
            className="hidden"
            disabled={!step1Done || running || readOnly}
            onChange={(e) => onPickFiles(e.target.files)}
          />
          <button
            type="button"
            disabled={!step1Done || running || readOnly}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 transition-colors",
              step1Done
                ? "border-[hsl(var(--neon-violet)/0.45)] bg-[hsl(var(--neon-violet)/0.05)] hover:border-[hsl(var(--neon-violet)/0.7)] hover:bg-[hsl(var(--neon-violet)/0.1)]"
                : "border-border bg-muted/30"
            )}
          >
            <Plus className="h-8 w-8 text-[hsl(var(--neon-violet))]" />
            <span className="text-sm font-medium">Click to add statements</span>
            <span className="text-xs text-muted-foreground">
              PDF or CSV · multi-select with Ctrl / Cmd
            </span>
          </button>

          {queue.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {queue.length} file{queue.length === 1 ? "" : "s"} ready
                </p>
                {!running && (
                  <Button type="button" variant="ghost" size="sm" onClick={clearQueue}>
                    Clear list
                  </Button>
                )}
              </div>
              <ul
                ref={queueListRef}
                className="relative max-h-[16rem] space-y-2 overflow-y-auto pr-1"
                aria-label="Statement upload queue"
              >
                {queue.map((item, index) => (
                  <li
                    key={item.id}
                    data-queue-index={index}
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
        </div>
      </section>

      <div className="flex justify-center">
        <div
          className={cn(
            "h-8 w-0.5 rounded-full transition-colors",
            step2Done ? "bg-[hsl(var(--neon-violet)/0.5)]" : "bg-border/60"
          )}
        />
      </div>

      {/* ── Step 3 ── */}
      <section
        className={cn(
          "upload-step rounded-2xl border-2 p-5 transition-all",
          !step3Active && "pointer-events-none opacity-45",
          step3Active &&
            !running &&
            "border-[hsl(var(--neon-lime)/0.65)] bg-card shadow-[0_0_28px_hsl(var(--neon-lime)/0.12)]",
          running && "border-[hsl(var(--neon-amber)/0.65)] bg-[hsl(var(--neon-amber)/0.08)]"
        )}
      >
        <StepHeader
          n={3}
          title="Process statements"
          subtitle="Import transactions one file at a time. You can leave this page while it runs."
          icon={<Upload className="h-5 w-5" />}
          done={counts.processed > 0 && !running && counts.pending === 0}
          accent="lime"
        />

        {error && (
          <div className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
            {error}
          </div>
        )}

        {running && (
          <div className="mt-4 rounded-xl border border-[hsl(var(--neon-amber)/0.5)] bg-[hsl(var(--neon-amber)/0.1)] px-4 py-3 text-sm">
            <p className="font-medium">
              Processing… {counts.current}/{counts.total}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              A toast stays visible if you navigate away.
            </p>
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            type="button"
            className="h-11 min-w-[12rem] gap-2 border-2 border-[hsl(var(--neon-lime)/0.5)] bg-[hsl(var(--neon-lime)/0.15)] text-foreground shadow-[0_0_18px_hsl(var(--neon-lime)/0.2)] hover:bg-[hsl(var(--neon-lime)/0.25)]"
            disabled={readOnly || !canUpload || resolvingBank || disclaimerBusy}
            onClick={() => void onProcess()}
          >
            <Sparkles className="h-4 w-4" />
            {readOnly
              ? "Read-only — locked"
              : running
                ? "Processing…"
                : disclaimerBusy
                  ? "…"
                  : counts.failed
                    ? "Retry failed files"
                    : "Process statements"}
          </Button>
        </div>
      </section>

      <UploadDisclaimerModal
        open={disclaimerOpen}
        content={disclaimer}
        fileCount={queue.filter((q) => q.status === "pending" || q.status === "failed").length}
        busy={disclaimerBusy}
        onAccept={onDisclaimerAccept}
        onCancel={() => {
          if (!disclaimerBusy) setDisclaimerOpen(false);
        }}
      />

      {/* ── Success modal ── */}
      <Modal
        open={successOpen}
        onClose={() => setSuccessOpen(false)}
        hideClose
        className="max-w-md border-[hsl(var(--neon-lime)/0.55)] shadow-[0_0_40px_hsl(var(--neon-lime)/0.2)]"
      >
        <div className="space-y-5 px-1 py-2 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-[hsl(var(--neon-lime)/0.6)] bg-[hsl(var(--neon-lime)/0.12)] text-[hsl(var(--neon-lime))] shadow-[0_0_24px_hsl(var(--neon-lime)/0.35)]">
            <CheckCircle2 className="h-9 w-9" />
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Success</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {counts.failed === 0
                ? "All statements were processed successfully."
                : `${counts.processed} statement(s) processed successfully${
                    counts.failed ? `, ${counts.failed} failed` : ""
                  }.`}
            </p>
            {counts.txs > 0 && (
              <p className="mt-2 text-sm font-medium text-foreground">
                {counts.txs} transaction{counts.txs === 1 ? "" : "s"} ready to review.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button
              type="button"
              className="h-11 gap-2 border-2 border-[hsl(var(--neon-magenta)/0.55)] bg-[hsl(var(--neon-magenta)/0.15)] text-foreground shadow-[0_0_16px_hsl(var(--neon-magenta)/0.25)] hover:bg-[hsl(var(--neon-magenta)/0.25)]"
              onClick={() => {
                setSuccessOpen(false);
                router.push("/pending");
              }}
            >
              <ListChecks className="h-4 w-4" />
              View transactions
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={() => {
                setSuccessOpen(false);
                router.push("/");
              }}
            >
              Back to dashboard
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Tip: the Transactions menu item pulses when unallocated items need attention.
          </p>
        </div>
      </Modal>
    </div>
  );
}

function StepPill({
  n,
  label,
  done,
  active,
  locked,
  accent,
}: {
  n: number;
  label: string;
  done?: boolean;
  active?: boolean;
  locked?: boolean;
  accent: "cyan" | "violet" | "lime";
}) {
  const ring =
    accent === "cyan"
      ? "border-[hsl(var(--neon-cyan)/0.7)] text-[hsl(var(--neon-cyan))]"
      : accent === "violet"
        ? "border-[hsl(var(--neon-violet)/0.7)] text-[hsl(var(--neon-violet))]"
        : "border-[hsl(var(--neon-lime)/0.7)] text-[hsl(var(--neon-lime))]";
  const glow =
    accent === "cyan"
      ? "shadow-[0_0_14px_hsl(var(--neon-cyan)/0.35)]"
      : accent === "violet"
        ? "shadow-[0_0_14px_hsl(var(--neon-violet)/0.35)]"
        : "shadow-[0_0_14px_hsl(var(--neon-lime)/0.35)]";

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium transition-all sm:px-3",
        locked && "opacity-40",
        done && "border-[hsl(var(--neon-lime)/0.5)] bg-[hsl(var(--neon-lime)/0.1)] text-foreground",
        active && !done && cn(ring, "bg-card", glow),
        !active && !done && !locked && "border-border text-muted-foreground"
      )}
    >
      <span
        className={cn(
          "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold",
          done
            ? "bg-[hsl(var(--neon-lime)/0.25)] text-[hsl(var(--neon-lime))]"
            : active
              ? "bg-foreground/10"
              : "bg-muted"
        )}
      >
        {done ? <Check className="h-3 w-3" /> : n}
      </span>
      <span className="hidden sm:inline">{label}</span>
    </div>
  );
}

function StepHeader({
  n,
  title,
  subtitle,
  icon,
  done,
  accent,
}: {
  n: number;
  title: string;
  subtitle: string;
  icon: React.ReactElement;
  done?: boolean;
  accent: "cyan" | "violet" | "lime";
}) {
  const iconCls =
    accent === "cyan"
      ? "border-[hsl(var(--neon-cyan)/0.55)] bg-[hsl(var(--neon-cyan)/0.12)] text-[hsl(var(--neon-cyan))]"
      : accent === "violet"
        ? "border-[hsl(var(--neon-violet)/0.55)] bg-[hsl(var(--neon-violet)/0.12)] text-[hsl(var(--neon-violet))]"
        : "border-[hsl(var(--neon-lime)/0.55)] bg-[hsl(var(--neon-lime)/0.12)] text-[hsl(var(--neon-lime))]";

  return (
    <div className="flex items-start gap-3">
      <div
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2",
          iconCls
        )}
      >
        {done ? <Check className="h-5 w-5" /> : icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Step {n}
        </p>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}
