"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { api, type BankProfile } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BankProfileWizard } from "@/components/bank-profile-wizard";

function formatUpdated(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function BankProfilesPage() {
  const [profiles, setProfiles] = useState<BankProfile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editProfile, setEditProfile] = useState<{
    id: number;
    name: string;
    bank_type?: string;
  } | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const list = await api.bankProfiles.list();
    setProfiles(list);
    return list;
  }, []);

  useEffect(() => {
    setLoading(true);
    refresh()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [refresh]);

  function openCreate() {
    setEditProfile(null);
    setError(null);
    setMessage(null);
    setWizardOpen(true);
  }

  function openUpdate(p: BankProfile) {
    setEditProfile({ id: p.id, name: p.name, bank_type: p.bank_type });
    setError(null);
    setMessage(null);
    setWizardOpen(true);
  }

  function closeWizard() {
    setWizardOpen(false);
    setEditProfile(null);
  }

  async function remove(id: number, name: string) {
    const ok = confirm(
      `Delete bank profile “${name}”?\n\n` +
        "This also permanently removes any statements and transactions imported with this profile. " +
        "This cannot be undone."
    );
    if (!ok) return;

    setError(null);
    setMessage(null);
    setDeletingId(id);

    // Optimistic: drop from UI immediately so a double-click cannot hit a stale row
    setProfiles((prev) => prev.filter((p) => p.id !== id));

    try {
      await api.bankProfiles.delete(id, true);
      setMessage(`Deleted “${name}”.`);
      await refresh();
    } catch (e: unknown) {
      try {
        await refresh();
      } catch {
        /* ignore */
      }
      const msg =
        e instanceof Error
          ? e.message
          : "Delete failed — is the API running on port 8000?";
      setError(
        /failed to fetch/i.test(msg)
          ? "Could not reach the API. Check that the backend is running on http://127.0.0.1:8000."
          : msg
      );
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-[hsl(var(--neon-cyan))]">
            Setup
          </p>
          <h1 className="page-title">Setup Bank Profile</h1>
          <p className="text-sm text-muted-foreground">
            Choose a bank we already support, name the profile, and upload. Calibration is our job —
            you never map columns or teach layouts.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setError(null);
              setLoading(true);
              refresh()
                .catch((e) => setError(e.message))
                .finally(() => setLoading(false));
            }}
          >
            Refresh list
          </Button>
          <Button onClick={openCreate}>Set up bank profile</Button>
        </div>
      </div>

      {message && (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm">
          {message}
        </div>
      )}
      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      <Card className="neon-cyan border-2">
        <CardHeader>
          <CardTitle>Saved profiles</CardTitle>
          <CardDescription>
            Used when you upload statements. <strong>Update</strong> refreshes our locked
            calibration for that bank (no sample needed).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && profiles.length === 0 ? (
            <p className="text-sm text-muted-foreground">Loading profiles…</p>
          ) : profiles.length === 0 ? (
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground">
                None yet. Pick your bank from our calibrated list to create your first profile.
              </p>
              <Button size="sm" onClick={openCreate}>
                Set up bank profile
              </Button>
            </div>
          ) : (
            <table className="table-dense w-full">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="pb-2">Name</th>
                  <th className="pb-2">Bank</th>
                  <th className="pb-2">Updated</th>
                  <th className="pb-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((p) => (
                  <tr key={p.id} className="border-b border-border/40">
                    <td className="py-2 font-medium">{p.name}</td>
                    <td>
                      <Badge variant="secondary">{p.bank_type}</Badge>
                    </td>
                    <td className="py-2 text-sm text-muted-foreground">
                      <span title={p.updated_at}>{formatUpdated(p.updated_at)}</span>
                    </td>
                    <td className="py-2 text-right">
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          disabled={deletingId === p.id}
                          onClick={() => openUpdate(p)}
                          title="Refresh calibration from LedgerFlow’s locked preset for this bank"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          Update
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={deletingId === p.id}
                          onClick={() => remove(p.id, p.name)}
                        >
                          {deletingId === p.id ? "Deleting…" : "Delete"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <BankProfileWizard
        key={editProfile ? `edit-${editProfile.id}` : "create"}
        open={wizardOpen}
        startAtStep1
        editProfile={editProfile}
        onClose={closeWizard}
        onSaved={() => {
          setMessage(
            editProfile
              ? `Updated “${editProfile.name}” — calibration refreshed.`
              : "Bank profile saved. You can upload statements now."
          );
          refresh().catch(() => undefined);
        }}
      />
    </div>
  );
}
