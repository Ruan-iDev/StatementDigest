"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Loader2, CheckCircle2, X, ListChecks } from "lucide-react";
import { useUploadQueue } from "@/components/upload-queue-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Floating bottom-right progress chip while uploads run (or just finished).
 * Visible on all routes so the user can navigate during background processing.
 * Auto-dismisses when the user opens Transactions (that was the toast's goal).
 */
export function UploadProgressToast() {
  const pathname = usePathname();
  const {
    running,
    counts,
    showProgressToast,
    setToastDismissed,
    queue,
  } = useUploadQueue();

  const onTransactionsPage =
    pathname === "/pending" || pathname.startsWith("/pending/");

  // User already went to Transactions — hide complete/progress toast permanently for this batch
  useEffect(() => {
    if (onTransactionsPage && showProgressToast && !running) {
      setToastDismissed(true);
    }
  }, [onTransactionsPage, showProgressToast, running, setToastDismissed]);

  // Don't show toast while on Transactions (intent was to get them here)
  if (onTransactionsPage) return null;
  if (!showProgressToast) return null;

  const total = counts.total;
  const current = Math.max(counts.current, running ? 1 : counts.processed + counts.failed);
  const done = !running && (counts.processed > 0 || counts.failed > 0);
  const currentName =
    queue.find((q) => q.status === "processing")?.file.name ||
    queue.filter((q) => q.status === "processed").slice(-1)[0]?.file.name;

  // On the upload page itself, keep toast compact but still useful if scrolled away
  const onUploadPage = pathname === "/upload";

  return (
    <div
      className={cn(
        "fixed bottom-5 right-5 z-[60] w-[min(100vw-2rem,22rem)]",
        "rounded-2xl border-2 bg-card/95 p-4 shadow-lg backdrop-blur-md",
        running
          ? "border-[hsl(var(--neon-amber)/0.7)] shadow-[0_0_24px_hsl(var(--neon-amber)/0.35)]"
          : "border-[hsl(var(--neon-lime)/0.65)] shadow-[0_0_24px_hsl(var(--neon-lime)/0.3)]"
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2",
            running
              ? "border-[hsl(var(--neon-amber))] bg-[hsl(var(--neon-amber)/0.15)] text-[hsl(var(--neon-amber))]"
              : "border-[hsl(var(--neon-lime))] bg-[hsl(var(--neon-lime)/0.15)] text-[hsl(var(--neon-lime))]"
          )}
        >
          {running ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <CheckCircle2 className="h-5 w-5" />
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          {running ? (
            <>
              <p className="text-sm font-semibold tracking-tight">
                Uploading {current}/{total}
              </p>
              <p className="truncate text-xs text-muted-foreground" title={currentName}>
                {currentName || "Processing statements…"}
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-[hsl(var(--neon-amber))] transition-all duration-500"
                  style={{
                    width: `${total ? Math.round(((counts.processed + (running ? 0.35 : 0)) / total) * 100) : 0}%`,
                  }}
                />
              </div>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold tracking-tight">Upload complete</p>
              <p className="text-xs text-muted-foreground">
                {counts.processed} processed
                {counts.failed ? ` · ${counts.failed} failed` : ""}
                {counts.txs ? ` · ${counts.txs} transactions` : ""}
              </p>
            </>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-2">
            {done && (
              <Link href="/pending" onClick={() => setToastDismissed(true)}>
                <Button
                  type="button"
                  size="sm"
                  className="border-2 border-[hsl(var(--neon-magenta)/0.55)] bg-[hsl(var(--neon-magenta)/0.15)] text-foreground shadow-[0_0_12px_hsl(var(--neon-magenta)/0.25)] hover:bg-[hsl(var(--neon-magenta)/0.25)]"
                >
                  <ListChecks className="mr-1.5 h-3.5 w-3.5" />
                  View transactions
                </Button>
              </Link>
            )}
            {!onUploadPage && running && (
              <Link href="/upload">
                <Button type="button" size="sm" variant="outline">
                  Open queue
                </Button>
              </Link>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="ml-auto h-8 w-8 p-0"
              onClick={() => setToastDismissed(true)}
              aria-label="Dismiss"
              disabled={running}
              title={running ? "Wait until uploads finish" : "Dismiss"}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
