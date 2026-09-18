"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Copy,
  Download,
  FolderOpen,
  HardDrive,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { api, type LocalDataInfo } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function formatBytes(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export default function DatabaseSettingsPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [localData, setLocalData] = useState<LocalDataInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [openingPath, setOpeningPath] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);

  async function load() {
    const info = await api.localData.get();
    setLocalData(info);
  }

  useEffect(() => {
    load().catch((e: unknown) =>
      setError(e instanceof Error ? e.message : "Could not load database location")
    );
  }, []);

  async function openFileLocation(target: "data_dir" | "database" = "data_dir") {
    setOpeningPath(true);
    setError(null);
    try {
      const res = await api.localData.open(target);
      setMessage(res.message);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not open file location");
    } finally {
      setOpeningPath(false);
    }
  }

  async function copyPath(path: string) {
    try {
      await navigator.clipboard?.writeText(path);
      setMessage("Path copied to clipboard");
    } catch {
      setError("Could not copy path");
    }
  }

  async function backup() {
    setBackingUp(true);
    setError(null);
    try {
      await api.localData.backup();
      setMessage("Backup downloaded. Keep that zip somewhere safe — it is how you move to another PC.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not create backup");
    } finally {
      setBackingUp(false);
    }
  }

  async function restore(file: File | undefined) {
    if (!file) return;
    const ok = window.confirm(
      "Restore this backup onto this PC? It replaces the current database, uploads and logos. You cannot undo this except by restoring another backup."
    );
    if (!ok) return;
    setRestoring(true);
    setError(null);
    try {
      const res = await api.localData.restore(file);
      setMessage(res.message);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not restore backup");
    } finally {
      setRestoring(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link
          href="/settings"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Settings
        </Link>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-[hsl(var(--neon-violet))]">
          Settings · This PC
        </p>
        <h1 className="page-title">Database</h1>
        <p className="page-subtitle max-w-2xl">
          Ledger Flow and Work Flow share one local database on this computer. Backup before you
          move to another device; restore that zip on the new PC.
        </p>
      </header>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {message && (
        <p className="rounded-xl border-2 border-[hsl(var(--neon-lime)/0.45)] bg-[hsl(var(--neon-lime)/0.08)] px-4 py-2 text-sm">
          {message}
        </p>
      )}

      <Card className="neon-lime border-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-4 w-4" />
            Your data on this PC
          </CardTitle>
          <CardDescription className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(var(--neon-lime))]" />
            <span>
              Everything stays on this device. Nothing is uploaded to a cloud.
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!localData && !error && (
            <p className="text-sm text-muted-foreground">Loading location…</p>
          )}
          {localData && (
            <>
              <div className="rounded-xl border border-[hsl(var(--neon-lime)/0.4)] bg-[hsl(var(--neon-lime)/0.08)] px-3 py-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                    Database file
                  </Label>
                  <Badge variant="secondary">
                    {localData.database_exists ? "On this device" : "Will be created"}
                  </Badge>
                  {localData.database_exists && (
                    <Badge variant="outline">{formatBytes(localData.database_size_bytes)}</Badge>
                  )}
                  <Badge variant="outline">
                    {localData.is_custom_location ? "Custom location" : "Documents default"}
                  </Badge>
                </div>
                <p className="break-all font-mono text-xs sm:text-sm leading-relaxed">
                  {localData.database_path}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Data folder:{" "}
                  <span className="font-mono break-all">{localData.data_dir}</span>
                </p>
                <p className="text-[11px] text-muted-foreground">{localData.privacy_note}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => void openFileLocation("data_dir")}
                  disabled={openingPath}
                >
                  <FolderOpen className="mr-1.5 h-4 w-4" />
                  {openingPath ? "Opening…" : "Open file location"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void openFileLocation("database")}
                  disabled={openingPath}
                >
                  <FolderOpen className="mr-1.5 h-4 w-4" />
                  Show database file
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void copyPath(localData.database_path)}
                >
                  <Copy className="mr-1 h-3.5 w-3.5" />
                  Copy path
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="section-panel neon-violet border-2">
        <CardHeader>
          <CardTitle>Move to another device</CardTitle>
          <CardDescription>
            Backup downloads a zip of the database, statement uploads, and logos. Restore that zip
            on the new PC (or this one after a wipe).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void backup()} disabled={backingUp || restoring}>
            <Download className="mr-1.5 h-4 w-4" />
            {backingUp ? "Preparing backup…" : "Backup database"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            onChange={(e) => void restore(e.target.files?.[0])}
          />
          <Button
            type="button"
            variant="outline"
            disabled={backingUp || restoring}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="mr-1.5 h-4 w-4" />
            {restoring ? "Restoring…" : "Restore backup"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
