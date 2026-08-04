"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Building2, CheckCircle2 } from "lucide-react";
import { api, type DissectResult, type WizardOption } from "@/lib/api";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Phase = "gate" | "step1" | "step2" | "done";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Called after profile is saved successfully. */
  onSaved?: () => void;
  /** Start at wizard step 1 (skip gate). Use from Settings. */
  startAtStep1?: boolean;
  /** After save, navigate to dashboard (first-run path). */
  goDashboardOnSave?: boolean;
  /**
   * When set, wizard re-calibrates this existing bank profile (Update flow)
   * instead of creating a new one. Name is pre-filled; calibration is replaced
   * from a new sample statement.
   */
  editProfile?: { id: number; name: string; bank_type?: string } | null;
};

function YesNoToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex gap-2">
      <Button
        type="button"
        size="sm"
        variant={value ? "default" : "outline"}
        onClick={() => onChange(true)}
      >
        Yes
      </Button>
      <Button
        type="button"
        size="sm"
        variant={!value ? "default" : "outline"}
        onClick={() => onChange(false)}
      >
        No
      </Button>
    </div>
  );
}

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
  const [phase, setPhase] = useState<Phase>(startAtStep1 || isUpdate ? "step1" : "gate");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dissect, setDissect] = useState<DissectResult | null>(null);
  const [name, setName] = useState(editProfile?.name || "");
  const [optionValues, setOptionValues] = useState<Record<string, boolean>>({});
  const [savedName, setSavedName] = useState("");

  function reset() {
    setPhase(startAtStep1 || isUpdate ? "step1" : "gate");
    setFile(null);
    setLoading(false);
    setError(null);
    setDissect(null);
    setName(editProfile?.name || "");
    setOptionValues({});
    setSavedName("");
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function uploadSample() {
    if (!file) {
      setError("Choose a sample bank statement first");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await api.bankProfiles.dissect(file);
      setDissect(result);
      // Keep existing name when updating; only suggest name for create
      if (!isUpdate || !name.trim()) {
        setName(result.suggested_name || editProfile?.name || "");
      }
      const opts: Record<string, boolean> = {};
      for (const o of result.options) {
        opts[o.key] = o.default;
      }
      setOptionValues(opts);
      setPhase("step2");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not read this statement");
    } finally {
      setLoading(false);
    }
  }

  async function proceedSave() {
    if (!dissect) return;
    if (!name.trim()) {
      setError("Please give this bank profile a name (e.g. Discovery)");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Keep bank-family presets intact (Capitec: fee shown beside amount, never added)
      const calibration: Record<string, unknown> = {
        ...dissect.calibration,
        include_personal_details: optionValues.include_personal_details ?? false,
        include_account_number: optionValues.include_personal_details ?? false,
        include_card_number: optionValues.include_card_number ?? false,
      };
      let bankType = dissect.bank_type || editProfile?.bank_type || "Other";
      // Name-based safety: don't lose bank-family routing if wizard type is Other
      const nameL = name.trim().toLowerCase();
      if (
        nameL.includes("capitec") ||
        bankType.toLowerCase().includes("capitec") ||
        calibration.capitec_preset ||
        calibration.capitec_business
      ) {
        bankType = "Capitec";
        calibration.parser = "capitec_business";
        calibration.capitec_preset = true;
        calibration.capitec_business = true;
        // Match statement: never sum Fees into Amount
        calibration.combine_fees_into_amount = false;
        calibration.bank_family = "Capitec";
        calibration.fees_column = calibration.fees_column || "Fees";
      } else if (
        nameL.includes("nedbank") ||
        bankType.toLowerCase().includes("nedbank") ||
        calibration.nedbank_preset
      ) {
        bankType = "Nedbank";
        calibration.parser = "nedbank_text";
        calibration.nedbank_preset = true;
        calibration.bank_family = "Nedbank";
      }
      let profile;
      if (isUpdate && editProfile) {
        profile = await api.bankProfiles.update(editProfile.id, {
          name: name.trim(),
          bank_type: bankType,
          calibration_data: calibration,
        });
      } else {
        profile = await api.bankProfiles.create({
          name: name.trim(),
          bank_type: bankType,
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
      : phase === "step1"
        ? isUpdate
          ? "Update bank profile — new sample"
          : "Create bank profile — Step 1"
        : phase === "step2"
          ? isUpdate
            ? "Update bank profile — confirm layout"
            : "Create bank profile — Step 2"
          : isUpdate
            ? "Profile updated"
            : "Profile ready";

  const description =
    phase === "gate"
      ? "We need to learn how your bank statement is laid out before importing transactions."
      : phase === "step1"
        ? isUpdate
          ? "Upload a current sample statement so we can re-learn this bank’s layout if it changed."
          : "Upload one sample statement (PDF or CSV). We only use it to teach the app."
        : phase === "step2"
          ? isUpdate
            ? "Review columns and options, then save. Existing imports stay; only how future statements are read is updated."
            : "Name this profile and confirm what we found. No technical scripts — just plain options."
          : undefined;

  return (
    <Modal
      open={open}
      onClose={phase === "gate" || phase === "done" ? handleClose : undefined}
      hideClose={phase === "step1" || phase === "step2"}
      title={title}
      description={description}
      className="max-w-xl"
    >
      {error && (
        <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
          {error}
        </div>
      )}

      {phase === "gate" && (
        <div className="space-y-5">
          <p className="text-sm leading-relaxed text-muted-foreground">
            <strong className="text-foreground">Cannot proceed</strong> — you have not created a
            bank profile yet. A profile tells LedgerFlow how to read <em>your</em> bank&apos;s
            statement (columns, money signs, what to skip).
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="button" onClick={() => setPhase("step1")}>
              <Building2 className="mr-2 h-4 w-4" />
              Create Bank Profile
            </Button>
          </div>
        </div>
      )}

      {phase === "step1" && (
        <div className="space-y-5">
          <div className="rounded-xl border-2 border-dashed border-[hsl(var(--neon-cyan)/0.4)] bg-[hsl(var(--neon-cyan)/0.06)] p-6 text-center">
            <Upload className="mx-auto mb-3 h-8 w-8 text-[hsl(var(--neon-cyan))]" />
            <Label className="mb-2 block text-sm font-medium">Sample bank statement</Label>
            <Input
              type="file"
              accept=".csv,.pdf,.txt,.tsv"
              className="mx-auto max-w-sm cursor-pointer"
              onChange={(e) => {
                setFile(e.target.files?.[0] || null);
                setError(null);
              }}
            />
            {file && (
              <p className="mt-2 text-xs text-muted-foreground">
                {file.name} · {(file.size / 1024).toFixed(1)} KB
              </p>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {isUpdate
              ? "Tip: use a recent statement from the same bank/account type so layout changes are picked up."
              : "Tip: use a real statement from Discovery, FNB, Capitec, or your bank. We skip personal headers and footers, and focus on the transaction list."}
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="button" onClick={uploadSample} disabled={loading || !file}>
              {loading ? "Reading statement…" : "Upload & continue"}
            </Button>
          </div>
        </div>
      )}

      {phase === "step2" && dissect && (
        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="profile-name">Bank profile name</Label>
            <Input
              id="profile-name"
              placeholder='e.g. "Discovery" or "Standard Bank"'
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Detected bank family: <strong>{dissect.bank_type}</strong> · format:{" "}
              {dissect.detected_format.toUpperCase()}
              {isUpdate ? " · saving will refresh calibration and the Updated date" : ""}
            </p>
          </div>

          <div className="rounded-xl border border-border/80 bg-muted/40 p-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Columns we found
            </p>
            {dissect.detected_columns.length === 0 ? (
              <p className="text-sm text-muted-foreground">No column headers detected yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {dissect.detected_columns.map((c) => (
                  <li key={c.name} className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium">{c.name || "—"}</span>
                    <span className="text-xs text-muted-foreground">{c.role}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-muted-foreground">{dissect.message}</p>
          </div>

          <div className="space-y-3">
            {dissect.options
              .filter((o: WizardOption) => o.visible !== false)
              .map((o) => (
                <div
                  key={o.key}
                  className="flex flex-col gap-2 rounded-xl border border-border/60 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{o.label}</p>
                    {o.help && <p className="text-xs text-muted-foreground">{o.help}</p>}
                  </div>
                  <YesNoToggle
                    value={optionValues[o.key] ?? o.default}
                    onChange={(v) => setOptionValues((prev) => ({ ...prev, [o.key]: v }))}
                  />
                </div>
              ))}
          </div>

          {dissect.parsed_preview.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-border/80">
              <p className="border-b bg-muted/50 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Preview (first transactions)
              </p>
              <div className="max-h-40 overflow-auto">
                <table className="table-dense w-full">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="px-2 py-1.5">Date</th>
                      <th className="px-2 py-1.5">Details</th>
                      <th className="px-2 py-1.5 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dissect.parsed_preview.map((r, i) => (
                      <tr key={i} className="border-b border-border/40">
                        <td className="px-2 py-1.5 whitespace-nowrap">{r.date}</td>
                        <td className="max-w-[12rem] truncate px-2 py-1.5">{r.description}</td>
                        <td
                          className={cn(
                            "px-2 py-1.5 text-right tabular-nums",
                            r.amount && String(r.amount).startsWith("-")
                              ? "text-red-600 dark:text-red-400"
                              : "text-emerald-700 dark:text-emerald-400"
                          )}
                        >
                          {r.amount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="button" onClick={proceedSave} disabled={loading}>
              {loading
                ? isUpdate
                  ? "Updating…"
                  : "Saving…"
                : isUpdate
                  ? "Save updated layout"
                  : "Proceed"}
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
                : `Profile “${savedName}” is saved`}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {isUpdate
                ? "The Updated timestamp is refreshed. Future statement uploads use the new layout."
                : "You can find it under Settings → Bank Profiles. You can now upload statements on the dashboard."}
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
