"use client";

import { useState } from "react";
import { Download, RefreshCw, CheckCircle2, AlertCircle, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDesktopBridge, isDesktopApp } from "@/lib/desktop";
import {
  APP_VERSION,
  UPDATE_MANIFEST_URL,
  fetchUpdateManifest,
  isNewerVersion,
  type UpdateManifest,
} from "@/lib/version";

type Status =
  | "idle"
  | "checking"
  | "up-to-date"
  | "available"
  | "downloading"
  | "downloaded"
  | "error"
  | "offline";

/**
 * Settings → App updates: check a public manifest over HTTPS and download the
 * latest portable build when a newer version is published.
 */
export function AppUpdatesCard() {
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [remote, setRemote] = useState<UpdateManifest | null>(null);
  const [downloadPath, setDownloadPath] = useState<string | null>(null);

  async function checkForUpdates() {
    setStatus("checking");
    setMessage(null);
    setRemote(null);
    setDownloadPath(null);

    if (!navigator.onLine) {
      setStatus("offline");
      setMessage("You appear to be offline. Connect to the internet and try again.");
      return;
    }

    try {
      const manifest = await fetchUpdateManifest();
      setRemote(manifest);
      if (isNewerVersion(manifest.version, APP_VERSION)) {
        setStatus("available");
        setMessage(
          `Version ${manifest.version} is available (you have ${APP_VERSION}).`
        );
      } else {
        setStatus("up-to-date");
        setMessage(`You are on the latest version (${APP_VERSION}).`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Update check failed";
      if (/internet|network|fetch|Failed to fetch|reach/i.test(msg)) {
        setStatus("offline");
      } else {
        setStatus("error");
      }
      setMessage(msg);
    }
  }

  async function downloadUpdate() {
    if (!remote?.downloadUrl) return;
    setStatus("downloading");
    setMessage("Downloading update… keep this window open.");
    setDownloadPath(null);

    const bridge = getDesktopBridge();
    const suggested = `LedgerFlow-${remote.version}-Portable.exe`;

    try {
      if (bridge?.downloadUpdate) {
        const result = await bridge.downloadUpdate(remote.downloadUrl, suggested);
        if (!result.ok) {
          throw new Error(result.message || "Download failed");
        }
        setStatus("downloaded");
        setDownloadPath(result.path || null);
        setMessage(
          result.path
            ? `Downloaded to ${result.path}. Close LedgerFlow, run the new file, and you can delete the old portable .exe.`
            : result.message || "Download finished. Run the new installer/portable file."
        );
        return;
      }

      // Browser / dev: open download in a new tab
      if (bridge?.openExternal) {
        await bridge.openExternal(remote.downloadUrl);
      } else {
        window.open(remote.downloadUrl, "_blank", "noopener,noreferrer");
      }
      setStatus("downloaded");
      setMessage(
        "Download started in your browser. When it finishes, close LedgerFlow and run the new file."
      );
    } catch (e: unknown) {
      setStatus("error");
      setMessage(e instanceof Error ? e.message : "Download failed");
    }
  }

  const channelConfigured = Boolean(UPDATE_MANIFEST_URL);

  return (
    <Card className="section-panel neon-cyan border-2 lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          App updates
          <span className="rounded-md border border-border/70 bg-muted/50 px-2 py-0.5 font-mono text-xs font-normal text-muted-foreground">
            v{APP_VERSION}
          </span>
          {isDesktopApp() && (
            <span className="rounded-md border border-[hsl(var(--neon-cyan)/0.35)] bg-[hsl(var(--neon-cyan)/0.08)] px-2 py-0.5 text-[10px] font-normal uppercase tracking-wide text-[hsl(var(--neon-cyan))]">
              Desktop
            </span>
          )}
        </CardTitle>
        <CardDescription>
          Check online for a newer LedgerFlow build. Requires an internet connection. Your
          statements and database stay on this PC — only the app package is downloaded.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!channelConfigured && (
          <p className="rounded-lg border border-[hsl(var(--neon-amber)/0.45)] bg-[hsl(var(--neon-amber)/0.08)] px-3 py-2 text-xs text-muted-foreground">
            Update channel is not configured for this build. The developer must host a{" "}
            <code className="rounded bg-muted px-1">latest.json</code> manifest and set{" "}
            <code className="rounded bg-muted px-1">NEXT_PUBLIC_UPDATE_MANIFEST_URL</code> when
            packaging. See <code className="rounded bg-muted px-1">docs/UPDATES.md</code>.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={checkForUpdates}
            disabled={status === "checking" || status === "downloading" || !channelConfigured}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${status === "checking" ? "animate-spin" : ""}`}
            />
            {status === "checking" ? "Checking…" : "Check for updates"}
          </Button>

          {status === "available" && remote && (
            <Button type="button" variant="secondary" onClick={downloadUpdate}>
              <Download className="mr-2 h-4 w-4" />
              Download v{remote.version}
            </Button>
          )}

          {status === "downloading" && (
            <Button type="button" variant="secondary" disabled>
              <Download className="mr-2 h-4 w-4 animate-pulse" />
              Downloading…
            </Button>
          )}
        </div>

        {message && (
          <div
            className={
              status === "up-to-date" || status === "downloaded"
                ? "flex gap-2 rounded-xl border-2 border-[hsl(var(--neon-lime)/0.45)] bg-[hsl(var(--neon-lime)/0.08)] px-3 py-2.5 text-sm"
                : status === "available"
                  ? "flex gap-2 rounded-xl border-2 border-[hsl(var(--neon-cyan)/0.45)] bg-[hsl(var(--neon-cyan)/0.08)] px-3 py-2.5 text-sm"
                  : status === "offline" || status === "error"
                    ? "flex gap-2 rounded-xl border-2 border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm"
                    : "flex gap-2 rounded-xl border border-border/60 bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground"
            }
          >
            {status === "up-to-date" || status === "downloaded" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--neon-lime))]" />
            ) : status === "offline" ? (
              <WifiOff className="mt-0.5 h-4 w-4 shrink-0" />
            ) : status === "error" ? (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            ) : null}
            <div className="min-w-0 space-y-1">
              <p>{message}</p>
              {remote?.releaseNotes && status === "available" && (
                <p className="whitespace-pre-wrap text-xs text-muted-foreground">
                  {remote.releaseNotes}
                </p>
              )}
              {downloadPath && (
                <p className="break-all font-mono text-[11px] text-muted-foreground">
                  {downloadPath}
                </p>
              )}
            </div>
          </div>
        )}

        <p className="text-[11px] leading-snug text-muted-foreground">
          After installing a new portable build, this version label in the footer should change.
          Tell support the version when reporting bugs (e.g. <strong>v{APP_VERSION}</strong>).
        </p>
      </CardContent>
    </Card>
  );
}
