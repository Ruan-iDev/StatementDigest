"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, CheckCircle2, RefreshCw } from "lucide-react";
import { api, type SupportedBank } from "@/lib/api";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

type Phase = "gate" | "form" | "done";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Called after profile is saved successfully. */
  onSaved?: () => void;
  /** Start at the create form (skip gate). Use from Settings. */
  startAtStep1?: boolean;
  /** After save, navigate to dashboard (first-run path). */
  goDashboardOnSave?: boolean;
  /**
   * When set, refresh this profile’s calibration from our locked preset
   * (no sample upload — calibration is our job, not the user’s).
   */
  editProfile?: { id: number; name: string; bank_type?: string } | null;
};

/**
 * Guided bank-profile setup:
 * 1) Which bank? (dropdown of banks we have calibrated)
 * 2) Name the profile
 * 3) Save — our preset is applied automatically
 *
 * Users never upload samples or map columns.
 * Available in guest mode so users can test their bank before creating an account.
 */
export function BankProfileWizard({
  open,
  onClose,
  onSaved,
  startAtStep1 = false,
  goDashboardOnSave = false,
  editProfile = null,
}: Props) {
  const router = useRouter();
  const isUpdate = Boolean(editProfile?.id);
  const [phase, setPhase] = useState<Phase>(startAtStep1 || isUpdate ? "form" : "gate");
  const [banks, setBanks] = useState<SupportedBank[]>([]);
  const [banksLoading, setBanksLoading] = useState(false);
  const [bankId, setBankId] = useState("");
  const [name, setName] = useState(editProfile?.name || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedName, setSavedName] = useState("");

  useEffect(() => {
    if (!open) return;
    setPhase(startAtStep1 || isUpdate ? "form" : "gate");
    setName(editProfile?.name || "");
    setError(null);
    setSavedName("");
    setLoading(false);

    let cancelled = false;
    setBanksLoading(true);
    api.bankProfiles
      .supportedBanks()
      .then((res) => {
        if (cancelled) return;
        const list = res.banks || [];
        setBanks(list);
        if (isUpdate && editProfile?.bank_type) {
          const match = list.find(
            (b) => b.bank_type.toLowerCase() === editProfile.bank_type!.toLowerCase()
          );
          setBankId(match?.id || list[0]?.id || "");
        } else if (!bankId && list[0]) {
          setBankId(list[0].id);
          if (!name.trim()) setName(list[0].suggested_name || list[0].label);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load supported banks");
        }
      })
      .finally(() => {
        if (!cancelled) setBanksLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-init when modal opens / edit target changes
  }, [open, editProfile?.id, startAtStep1, isUpdate]);

  function reset() {
    setPhase(startAtStep1 || isUpdate ? "form" : "gate");
    setBankId(banks[0]?.id || "");
    setName(editProfile?.name || "");
    setLoading(false);
    setError(null);
    setSavedName("");
  }

  function handleClose() {
    reset();
    onClose();
  }

  function selectedBank(): SupportedBank | undefined {
    return banks.find((b) => b.id === bankId);
  }

  function onBankChange(id: string) {
    setBankId(id);
    setError(null);
    const b = banks.find((x) => x.id === id);
    if (!b) return;
    // Auto-suggest name when empty or still matching a previous suggestion
    const prev = selectedBank();
    if (
      !name.trim() ||
      (prev && (name === prev.suggested_name || name === prev.label || name === prev.bank_type))
    ) {
      setName(b.suggested_name || b.label);
    }
  }

  async function proceedSave() {
    const bank = selectedBank();
    if (!bank) {
      setError("Please choose which bank you use.");
      return;
    }
    if (!name.trim()) {
      setError("Please give this bank profile a name (e.g. Discovery Personal).");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Fetch our locked calibration — never ask the user to teach the layout
      const calibration = await api.bankProfiles.preset(bank.bank_type);
      let profile;
      if (isUpdate && editProfile) {
        profile = await api.bankProfiles.update(editProfile.id, {
          name: name.trim(),
          bank_type: bank.bank_type,
          calibration_data: calibration,
        });
      } else {
        profile = await api.bankProfiles.create({
          name: name.trim(),
          bank_type: bank.bank_type,
          calibration_data: calibration,
        });
      }
      setSavedName(profile.name);
      setPhase("done");
      onSaved?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not save profile");
    } finally {
      setLoading(false);
    }
  }

  function finish() {
    handleClose();
    if (goDashboardOnSave && !isUpdate) {
      router.push("/");
    }
  }

  const title =
    phase === "gate"
      ? "Bank profile required"
      : phase === "form"
        ? isUpdate
          ? "Update bank profile"
          : "Set up bank profile"
        : isUpdate
          ? "Profile updated"
          : "Profile ready";

  const description =
    phase === "gate"
      ? "Before you can upload statements, tell us which bank you use. We already know how to read the banks on our list."
      : phase === "form"
        ? isUpdate
          ? "Refresh this profile with our latest calibration for the selected bank. No sample upload needed."
          : "Pick your bank from the list, name the profile, and you are done. Calibration is handled by LedgerFlow."
        : undefined;

  return (
    <Modal
      open={open}
      onClose={phase === "gate" || phase === "done" ? handleClose : undefined}
      hideClose={phase === "form"}
      title={title}
      description={description}
      className="max-w-lg"
    >
      {error && (
        <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
          {error}
        </div>
      )}

      {phase === "gate" && (
        <div className="space-y-5">
          <p className="text-sm leading-relaxed text-muted-foreground">
            <strong className="text-foreground">Cannot proceed yet</strong> — you need a bank
            profile first. Choose from banks we have already calibrated so statements import
            cleanly. You do not need to teach the app or map columns.
          </p>
          <div className="rounded-xl border border-border/70 bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
            Supported today: Discovery Personal, FNB Gold Business, Capitec Business, Nedbank
            Personal. More banks are added after we calibrate them.
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="button" onClick={() => setPhase("form")}>
              <Building2 className="mr-2 h-4 w-4" />
              Set up bank profile
            </Button>
          </div>
        </div>
      )}

      {phase === "form" && (
        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="bank-select">Which bank are you using?</Label>
            <Select
              id="bank-select"
              value={bankId}
              disabled={banksLoading || loading || banks.length === 0}
              onChange={(e) => onBankChange(e.target.value)}
            >
              {banksLoading && <option value="">Loading banks…</option>}
              {!banksLoading && banks.length === 0 && (
                <option value="">No supported banks available</option>
              )}
              {banks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </Select>
            {selectedBank() && (
              <p className="text-xs text-muted-foreground">
                {selectedBank()!.description}
                {selectedBank()!.formats ? ` · ${selectedBank()!.formats}` : ""}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="profile-name">Profile name</Label>
            <Input
              id="profile-name"
              placeholder='e.g. "Discovery Personal" or "FNB Business"'
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus={!isUpdate}
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              This label appears when you upload statements. You can rename it later.
            </p>
          </div>

          <div className="rounded-xl border border-[hsl(var(--neon-cyan)/0.35)] bg-[hsl(var(--neon-cyan)/0.08)] px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
            <strong className="text-foreground">No calibration step.</strong> LedgerFlow applies a
            locked reader for this bank. If a layout changes later, we update it in an app release —
            you only pick the bank again or refresh this profile.
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void proceedSave()}
              disabled={loading || banksLoading || !bankId}
            >
              {loading ? (
                isUpdate ? (
                  "Updating…"
                ) : (
                  "Saving…"
                )
              ) : isUpdate ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Refresh calibration
                </>
              ) : (
                "Create bank profile"
              )}
            </Button>
          </div>
        </div>
      )}

      {phase === "done" && (
        <div className="space-y-5 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-[hsl(var(--neon-lime))]" />
          <div>
            <p className="font-medium">
              {isUpdate
                ? `Profile “${savedName}” was updated`
                : `Profile “${savedName}” is ready`}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {isUpdate
                ? "Future uploads use our latest calibration for this bank."
                : "You can upload statements now. Find this profile under Settings → Bank Profiles."}
            </p>
          </div>
          <Button type="button" onClick={finish} className="w-full sm:w-auto">
            {goDashboardOnSave && !isUpdate ? "Go to Dashboard" : "Done"}
          </Button>
        </div>
      )}
    </Modal>
  );
}
