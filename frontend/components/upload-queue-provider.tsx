"use client";

import * as React from "react";
import { api } from "@/lib/api";

export type QueueStatus = "pending" | "processing" | "processed" | "failed";

export type QueueItem = {
  id: string;
  file: File;
  status: QueueStatus;
  message?: string;
  transactionsCreated?: number;
};

type UploadQueueContextValue = {
  queue: QueueItem[];
  running: boolean;
  profileId: string;
  setProfileId: (id: string) => void;
  error: string | null;
  setError: (msg: string | null) => void;
  toastDismissed: boolean;
  setToastDismissed: (v: boolean) => void;
  addFiles: (fileList: FileList | null) => void;
  removeItem: (id: string) => void;
  clearQueue: () => void;
  processQueue: (bankProfileId?: string) => Promise<void>;
  counts: {
    total: number;
    pending: number;
    processing: number;
    processed: number;
    failed: number;
    txs: number;
    current: number;
  };
  showProgressToast: boolean;
};

const UploadQueueContext = React.createContext<UploadQueueContextValue | null>(null);

function newItemId(file: File): string {
  return `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 9)}`;
}

export function UploadQueueProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = React.useState<QueueItem[]>([]);
  const [running, setRunning] = React.useState(false);
  const [profileId, setProfileId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [toastDismissed, setToastDismissed] = React.useState(false);

  const runningRef = React.useRef(false);
  const queueRef = React.useRef<QueueItem[]>([]);
  const profileIdRef = React.useRef(profileId);

  React.useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  React.useEffect(() => {
    profileIdRef.current = profileId;
  }, [profileId]);

  const counts = React.useMemo(() => {
    const pending = queue.filter((q) => q.status === "pending").length;
    const processing = queue.filter((q) => q.status === "processing").length;
    const processed = queue.filter((q) => q.status === "processed").length;
    const failed = queue.filter((q) => q.status === "failed").length;
    const txs = queue.reduce((sum, q) => sum + (q.transactionsCreated || 0), 0);
    const processingIdx = queue.findIndex((q) => q.status === "processing");
    const current =
      processingIdx >= 0
        ? processingIdx + 1
        : processed + failed > 0
          ? Math.min(processed + failed, queue.length || 1)
          : 0;
    return {
      total: queue.length,
      pending,
      processing,
      processed,
      failed,
      txs,
      current,
    };
  }, [queue]);

  const showProgressToast =
    !toastDismissed &&
    queue.length > 0 &&
    (running || counts.processed > 0 || counts.failed > 0);

  const addFiles = React.useCallback((fileList: FileList | null) => {
    if (!fileList?.length) return;
    setError(null);
    setToastDismissed(false);

    const incoming = Array.from(fileList).filter((f) => {
      const n = f.name.toLowerCase();
      return (
        n.endsWith(".csv") ||
        n.endsWith(".pdf") ||
        n.endsWith(".txt") ||
        n.endsWith(".tsv")
      );
    });

    if (!incoming.length) {
      setError("Please choose PDF or CSV statement files.");
      return;
    }

    setQueue((prev) => {
      const existing = new Set(
        prev.map((q) => `${q.file.name}|${q.file.size}|${q.file.lastModified}`)
      );
      const next: QueueItem[] = [];
      for (const file of incoming) {
        const key = `${file.name}|${file.size}|${file.lastModified}`;
        if (existing.has(key)) continue;
        existing.add(key);
        next.push({ id: newItemId(file), file, status: "pending" });
      }
      return [...prev, ...next];
    });
  }, []);

  const removeItem = React.useCallback((id: string) => {
    if (runningRef.current) return;
    setQueue((prev) => prev.filter((q) => q.id !== id));
  }, []);

  const clearQueue = React.useCallback(() => {
    if (runningRef.current) return;
    setQueue([]);
    setError(null);
    setToastDismissed(false);
  }, []);

  const processQueue = React.useCallback(async (bankProfileId?: string) => {
    const pid = bankProfileId || profileIdRef.current;
    if (!pid) {
      setError("Select your bank first.");
      return;
    }
    if (runningRef.current) return;

    let working = queueRef.current.map((q) =>
      q.status === "failed"
        ? { ...q, status: "pending" as QueueStatus, message: undefined }
        : { ...q }
    );

    if (!working.length) {
      setError("Add at least one statement file.");
      return;
    }

    const hasWork = working.some((q) => q.status !== "processed");
    if (!hasWork) {
      setError("Nothing left to upload — all files are already processed.");
      return;
    }

    runningRef.current = true;
    setRunning(true);
    setError(null);
    setToastDismissed(false);
    setQueue(working);
    queueRef.current = working;

    for (let i = 0; i < working.length; i++) {
      if (working[i].status === "processed") continue;

      working = working.map((q, idx) =>
        idx === i
          ? { ...q, status: "processing" as QueueStatus, message: undefined }
          : q
      );
      queueRef.current = working;
      setQueue([...working]);

      try {
        const res = await api.imports.upload(Number(pid), working[i].file);
        working = working.map((q, idx) =>
          idx === i
            ? {
                ...q,
                status: "processed" as QueueStatus,
                message: res.message,
                transactionsCreated: res.transactions_created,
              }
            : q
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        working = working.map((q, idx) =>
          idx === i
            ? {
                ...q,
                status: "failed" as QueueStatus,
                message: msg,
                transactionsCreated: 0,
              }
            : q
        );
      }
      queueRef.current = working;
      setQueue([...working]);
    }

    runningRef.current = false;
    setRunning(false);
  }, []);

  const value: UploadQueueContextValue = {
    queue,
    running,
    profileId,
    setProfileId,
    error,
    setError,
    toastDismissed,
    setToastDismissed,
    addFiles,
    removeItem,
    clearQueue,
    processQueue,
    counts,
    showProgressToast,
  };

  return (
    <UploadQueueContext.Provider value={value}>{children}</UploadQueueContext.Provider>
  );
}

export function useUploadQueue() {
  const ctx = React.useContext(UploadQueueContext);
  if (!ctx) {
    throw new Error("useUploadQueue must be used within UploadQueueProvider");
  }
  return ctx;
}
