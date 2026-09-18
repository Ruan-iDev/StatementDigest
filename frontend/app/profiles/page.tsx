"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Check,
  ChevronDown,
  HardDrive,
  ImagePlus,
  KeyRound,
  Plus,
  Trash2,
  UserRound,
} from "lucide-react";
import { api, type ProfileType, type UserProfile } from "@/lib/api";
import { useProfile } from "@/components/profile-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import { ChangePasswordCard } from "@/components/change-password-card";
import { useAuth } from "@/components/auth-provider";
import { TrialBadge } from "@/components/trial-gate";

export default function MyProfilePage() {
  const router = useRouter();
  const { isGuest, username: signedInUsername } = useAuth();
  const {
    profiles,
    active,
    refresh,
    switchProfile,
    requestSwitchProfile,
    loading: ctxLoading,
  } = useProfile();
  const [form, setForm] = useState<Partial<UserProfile>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  /** Profile Details card starts collapsed to reduce clutter */
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Create new profile (modal)
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<ProfileType>("individual");
  const [newBusinessName, setNewBusinessName] = useState("");
  const [newRegNumber, setNewRegNumber] = useState("");
  const [newVatNumber, setNewVatNumber] = useState("");
  const [newLogoFile, setNewLogoFile] = useState<File | null>(null);
  const [copyLedgersFrom, setCopyLedgersFrom] = useState<number | null>(null);
  const [copyBanksFrom, setCopyBanksFrom] = useState<number | null>(null);
  const [seedDefaults, setSeedDefaults] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newWorkspaceUser, setNewWorkspaceUser] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPassword2, setNewPassword2] = useState("");

  const [resetTarget, setResetTarget] = useState<UserProfile | null>(null);
  const [resetUser, setResetUser] = useState("");
  const [resetPw, setResetPw] = useState("");
  const [resetPw2, setResetPw2] = useState("");
  const [resetBusy, setResetBusy] = useState(false);

  function openCreateProfile() {
    setNewName("");
    setNewType("individual");
    setNewBusinessName("");
    setNewRegNumber("");
    setNewVatNumber("");
    setNewLogoFile(null);
    setCopyLedgersFrom(null);
    setCopyBanksFrom(null);
    setSeedDefaults(true);
    setNewWorkspaceUser("");
    setNewPassword("");
    setNewPassword2("");
    setError(null);
    setCreateOpen(true);
  }

  function closeCreateProfile() {
    if (creating) return;
    setCreateOpen(false);
  }

  async function saveWorkspaceLoginReset() {
    if (!resetTarget) return;
    const user = resetUser.trim();
    if (user.length < 2) {
      setError("Workspace username must be at least 2 characters.");
      return;
    }
    if (!resetPw) {
      setError("Enter a new workspace password.");
      return;
    }
    if (resetPw !== resetPw2) {
      setError("New password and confirmation do not match.");
      return;
    }
    setResetBusy(true);
    try {
      setError(null);
      await api.profiles.resetWorkspaceLogin(resetTarget.id, {
        workspace_username: user,
        password: resetPw,
      });
      setMessage(`Workspace login updated for “${resetTarget.name}”. Username: ${user}`);
      setResetTarget(null);
      setResetPw("");
      setResetPw2("");
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not reset workspace login");
    } finally {
      setResetBusy(false);
    }
  }

  useEffect(() => {
    if (active) {
      setForm({
        name: active.name,
        profile_type: (active.profile_type as ProfileType) || "individual",
        full_name: active.full_name ?? "",
        business_name: active.business_name ?? "",
        business_registration_number: active.business_registration_number ?? "",
        vat_number: active.vat_number ?? "",
        email: active.email ?? "",
        phone: active.phone ?? "",
        address_line1: active.address_line1 ?? "",
        address_line2: active.address_line2 ?? "",
        city: active.city ?? "",
        postal_code: active.postal_code ?? "",
        country: active.country ?? "South Africa",
        tax_number: active.tax_number ?? "",
        notes: active.notes ?? "",
      });
    }
  }, [active]);

  // Load authenticated logo preview
  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;
    async function load() {
      if (!active?.has_logo || !active.id) {
        setLogoPreview(null);
        return;
      }
      const url = await api.profiles.logoObjectUrl(active.id);
      if (cancelled) {
        if (url) URL.revokeObjectURL(url);
        return;
      }
      setLogoPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      revoked = url;
    }
    void load();
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [active?.id, active?.has_logo, active?.updated_at]);

  async function saveDetails() {
    if (!active) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const ptype = (form.profile_type as ProfileType) || "individual";
      await api.profiles.update(active.id, {
        name: form.name || active.name,
        profile_type: ptype,
        full_name: form.full_name || null,
        business_name: ptype === "business" ? form.business_name || null : null,
        business_registration_number:
          ptype === "business" ? form.business_registration_number || null : null,
        vat_number: ptype === "business" ? form.vat_number || null : null,
        email: form.email || null,
        phone: form.phone || null,
        address_line1: form.address_line1 || null,
        address_line2: form.address_line2 || null,
        city: form.city || null,
        postal_code: form.postal_code || null,
        country: form.country || null,
        tax_number: ptype === "individual" ? form.tax_number || null : null,
        notes: form.notes || null,
      });
      setMessage("Profile details saved");
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function onLogoPick(file: File | null) {
    if (!active || !file) return;
    if ((form.profile_type || active.profile_type) !== "business") {
      setError("Switch profile type to Business before uploading a logo");
      return;
    }
    setLogoBusy(true);
    setError(null);
    try {
      await api.profiles.uploadLogo(active.id, file);
      setMessage("Business logo saved — it will appear on printed reports");
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Logo upload failed");
    } finally {
      setLogoBusy(false);
    }
  }

  async function removeLogo() {
    if (!active) return;
    setLogoBusy(true);
    setError(null);
    try {
      await api.profiles.deleteLogo(active.id);
      setMessage("Logo removed");
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not remove logo");
    } finally {
      setLogoBusy(false);
    }
  }

  async function createProfile() {
    if (!newName.trim()) {
      setError("Give the new profile a name");
      return;
    }
    if (newType === "business" && !newBusinessName.trim() && !newName.trim()) {
      setError("Business profiles need a name");
      return;
    }
    if (newWorkspaceUser.trim().length < 2) {
      setError("Set a workspace username (at least 2 characters) for this client profile.");
      return;
    }
    if (!newPassword.trim()) {
      setError("Set a workspace password — required when switching into this client’s books.");
      return;
    }
    if (newPassword !== newPassword2) {
      setError("Workspace password and confirmation do not match.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const created = await api.profiles.create({
        name: newName.trim(),
        profile_type: newType,
        business_name: newType === "business" ? newBusinessName.trim() || null : null,
        business_registration_number:
          newType === "business" ? newRegNumber.trim() || null : null,
        vat_number: newType === "business" ? newVatNumber.trim() || null : null,
        workspace_username: newWorkspaceUser.trim(),
        password: newPassword,
        copy_ledgers_from_id: copyLedgersFrom,
        copy_bank_profiles_from_id: copyBanksFrom,
        seed_default_ledgers: !copyLedgersFrom && seedDefaults,
      });
      if (newType === "business" && newLogoFile) {
        try {
          await api.profiles.uploadLogo(created.id, newLogoFile);
        } catch (e: unknown) {
          setError(
            e instanceof Error
              ? `Profile created, but logo upload failed: ${e.message}`
              : "Profile created, but logo upload failed"
          );
        }
      }
      const unlockUser = newWorkspaceUser.trim();
      const unlockPw = newPassword;
      setMessage(`Created “${created.name}” — switching now`);
      setCreateOpen(false);
      setNewName("");
      setNewBusinessName("");
      setNewRegNumber("");
      setNewVatNumber("");
      setNewLogoFile(null);
      setNewType("individual");
      setNewWorkspaceUser("");
      setNewPassword("");
      setNewPassword2("");
      setCreating(false);
      // Just created with these credentials — switch without re-prompt
      await switchProfile(created.id, {
        workspace_username: unlockUser,
        password: unlockPw,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Create failed");
      setCreating(false);
    }
  }

  async function removeProfile(p: UserProfile) {
    if (profiles.length <= 1) {
      setError("You cannot delete the only profile");
      return;
    }
    const ok = confirm(
      `Delete profile “${p.name}” and ALL of its data (transactions, bank profiles, ledgers, rules)?\n\nThis cannot be undone.`
    );
    if (!ok) return;
    setError(null);
    setMessage(null);
    try {
      await api.profiles.delete(p.id);
      await refresh();
      setMessage(`Deleted “${p.name}”`);
      // Active workspace was removed — reload so every screen picks the new active id
      if (p.is_active) {
        window.location.reload();
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Delete failed");
      // Ensure list matches server if a partial failure left UI stale
      await refresh().catch(() => undefined);
    }
  }

  const formType = (form.profile_type as ProfileType) || "individual";
  const isBusinessForm = formType === "business";

  if (ctxLoading && !active) {
    return <p className="text-sm text-muted-foreground">Loading profiles…</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="relative space-y-1">
        <div className="absolute right-0 top-0">
          <TrialBadge />
        </div>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-[hsl(var(--neon-violet))]">
          Settings
        </p>
        <h1 className="page-title pr-28 sm:pr-36">My Profile</h1>
        <p className="page-subtitle max-w-xl">
          Each profile is a separate workspace. Choose <strong>Individual</strong> or{" "}
          <strong>Business</strong>. Business profiles can add a logo used as letterhead on printed
          reports.
        </p>
      </header>

      {message && (
        <div className="rounded-xl border border-[hsl(var(--neon-lime)/0.45)] bg-[hsl(var(--neon-lime)/0.1)] px-3 py-2 text-sm">
          {message}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
          {error}
        </div>
      )}

      <Card className="neon-lime border-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-4 w-4" />
            Database
          </CardTitle>
          <CardDescription>
            Location, backup and restore live under app Settings — they apply to Ledger Flow and Work
            Flow together.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" variant="outline" onClick={() => router.push("/settings/data")}>
            Open database settings
          </Button>
        </CardContent>
      </Card>

      <Card className="neon-violet border-2">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              <UserRound className="h-4 w-4" />
              Your profiles
            </CardTitle>
            <CardDescription>
              Switch workspace — only the active profile’s data is shown
              {signedInUsername ? (
                <>
                  {" "}
                  · signed in as{" "}
                  <span className="font-medium text-foreground">{signedInUsername}</span>
                </>
              ) : isGuest ? (
                <> · guest session</>
              ) : null}
            </CardDescription>
          </div>
          <Button
            size="sm"
            className="shrink-0"
            onClick={openCreateProfile}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Create new profile
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {profiles.map((p) => {
            const isBiz = (p.profile_type || "individual") === "business";
            const personLabel = isBiz
              ? (p.business_name && p.business_name.trim()) ||
                (p.full_name && p.full_name.trim()) ||
                null
              : (p.full_name && p.full_name.trim()) ||
                (p.business_name && p.business_name.trim()) ||
                null;
            return (
              <div
                key={p.id}
                className={cn(
                  "flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2.5",
                  p.is_active
                    ? "border-[hsl(var(--neon-violet)/0.55)] bg-[hsl(var(--neon-violet)/0.1)]"
                    : "border-border/70 bg-card/60"
                )}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{p.name}</span>
                    {p.is_active && <Badge variant="secondary">Active</Badge>}
                    <Badge variant="outline">
                      {(p.profile_type || "individual") === "business"
                        ? "Business"
                        : "Individual"}
                    </Badge>
                    {p.has_logo && <Badge variant="secondary">Logo</Badge>}
                    {p.has_password && (
                      <Badge
                        variant="outline"
                        className="border-[hsl(var(--neon-violet)/0.45)] text-[hsl(var(--neon-violet))]"
                      >
                        Locked
                        {p.workspace_username ? ` · ${p.workspace_username}` : ""}
                      </Badge>
                    )}
                  </div>
                  {/* Person / business label so multi-profile installs stay distinguishable */}
                  <p className="mt-0.5 text-xs font-medium text-foreground/80">
                    {personLabel ? (
                      <>
                        <span className="text-muted-foreground font-normal">
                          {isBiz ? "Business · " : "Username · "}
                        </span>
                        {personLabel}
                      </>
                    ) : (
                      <span className="font-normal text-muted-foreground">
                        No person name set — edit profile details below
                      </span>
                    )}
                    {p.email?.trim() ? (
                      <span className="font-normal text-muted-foreground">
                        {" "}
                        · {p.email.trim()}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {p.transaction_count} txns · {p.ledger_count} ledgers ·{" "}
                    {p.bank_profile_count} bank profiles
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(p.has_password || p.workspace_username) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setResetTarget(p);
                        setResetUser(p.workspace_username || "");
                        setResetPw("");
                        setResetPw2("");
                        setError(null);
                        setMessage(null);
                      }}
                    >
                      <KeyRound className="mr-1 h-3.5 w-3.5" />
                      Reset login
                    </Button>
                  )}
                  {!p.is_active && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => requestSwitchProfile(p.id)}
                    >
                      <Check className="mr-1 h-3.5 w-3.5" />
                      Switch
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={profiles.length <= 1}
                    onClick={() => removeProfile(p)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {active && (
        <Card className="neon-cyan border-2">
          <button
            type="button"
            className="flex w-full items-start justify-between gap-3 px-6 py-4 text-left transition-colors hover:bg-muted/20"
            onClick={() => setDetailsOpen((o) => !o)}
            aria-expanded={detailsOpen}
            aria-controls="profile-details-panel"
          >
            <div className="min-w-0 space-y-1">
              <CardTitle className="text-base">Profile Details — {active.name}</CardTitle>
              <CardDescription>
                {detailsOpen
                  ? "Optional contact details. Business logos appear on PDF report letterheads."
                  : "Click to expand contact details, type, and letterhead fields."}
              </CardDescription>
            </div>
            <ChevronDown
              className={cn(
                "mt-0.5 h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200",
                detailsOpen && "rotate-180"
              )}
              aria-hidden
            />
          </button>
          {detailsOpen && (
          <CardContent id="profile-details-panel" className="grid gap-3 border-t border-border/50 pt-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Profile type</Label>
              <div className="inline-flex rounded-xl border border-border/70 bg-muted/30 p-1">
                <button
                  type="button"
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all",
                    !isBusinessForm
                      ? "bg-[hsl(var(--neon-cyan)/0.2)] text-foreground shadow-sm ring-1 ring-[hsl(var(--neon-cyan)/0.45)]"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => setForm((f) => ({ ...f, profile_type: "individual" }))}
                >
                  <UserRound className="h-3.5 w-3.5" />
                  Individual
                </button>
                <button
                  type="button"
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all",
                    isBusinessForm
                      ? "bg-[hsl(var(--neon-violet)/0.2)] text-foreground shadow-sm ring-1 ring-[hsl(var(--neon-violet)/0.45)]"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => setForm((f) => ({ ...f, profile_type: "business" }))}
                >
                  <Building2 className="h-3.5 w-3.5" />
                  Business
                </button>
              </div>
            </div>

            <div className="space-y-1 sm:col-span-2 rounded-xl border border-[hsl(var(--neon-violet)/0.4)] bg-[hsl(var(--neon-violet)/0.08)] px-3 py-3">
              <Label>Profile attestation ID</Label>
              <p className="font-mono text-sm font-semibold tracking-wide">
                {active.public_id || "Generating…"}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Unique code for this workspace. Stored with disclaimer Accept events. Not government
                ID.
              </p>
              {active.public_id && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-1"
                  onClick={() => {
                    void navigator.clipboard?.writeText(active.public_id || "");
                    setMessage("Attestation ID copied");
                  }}
                >
                  Copy ID
                </Button>
              )}
            </div>

            <div className="space-y-1 sm:col-span-2">
              <Label>Profile name</Label>
              <Input
                value={form.name ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Personal or Florist business"
              />
            </div>

            {isBusinessForm && (
              <div className="space-y-1 sm:col-span-2">
                <Label>Business / trading name</Label>
                <Input
                  value={form.business_name ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, business_name: e.target.value }))}
                  placeholder="Shown on printed letterhead"
                />
              </div>
            )}

            {isBusinessForm && (
              <>
                <div className="space-y-1">
                  <Label>Business registration number</Label>
                  <Input
                    value={form.business_registration_number ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, business_registration_number: e.target.value }))
                    }
                    placeholder="e.g. 2020/123456/07"
                    className="font-mono"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    CIPC / company registration number (printed on letterhead).
                  </p>
                </div>
                <div className="space-y-1">
                  <Label>VAT number</Label>
                  <Input
                    value={form.vat_number ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, vat_number: e.target.value }))}
                    placeholder="e.g. 4123456789"
                    className="font-mono"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    SARS VAT registration number (printed on letterhead).
                  </p>
                </div>
              </>
            )}

            {isBusinessForm && (
              <div className="space-y-2 sm:col-span-2 rounded-xl border border-border/70 bg-card/60 p-3">
                <Label className="flex items-center gap-2">
                  <ImagePlus className="h-3.5 w-3.5" />
                  Business logo
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  PNG, JPG, WEBP or GIF · max 3&nbsp;MB. Applied as letterhead on exported PDF
                  reports.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex h-16 w-28 items-center justify-center overflow-hidden rounded-lg border border-border/70 bg-muted/40">
                    {logoPreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={logoPreview}
                        alt="Business logo"
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <span className="text-[10px] text-muted-foreground">No logo</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <label className="inline-flex">
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        className="hidden"
                        disabled={logoBusy}
                        onChange={(e) => {
                          const f = e.target.files?.[0] || null;
                          void onLogoPick(f);
                          e.target.value = "";
                        }}
                      />
                      <span className="inline-flex h-8 cursor-pointer items-center rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-accent">
                        {logoBusy ? "Uploading…" : active.has_logo ? "Replace logo" : "Upload logo"}
                      </span>
                    </label>
                    {active.has_logo && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={logoBusy}
                        onClick={() => void removeLogo()}
                      >
                        <Trash2 className="mr-1 h-3.5 w-3.5" />
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-1">
              <Label>{isBusinessForm ? "Contact person" : "Full name"}</Label>
              <Input
                value={form.full_name ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Phone</Label>
              <Input
                value={form.phone ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
            {!isBusinessForm && (
              <div className="space-y-1">
                <Label>Tax number</Label>
                <Input
                  value={form.tax_number ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, tax_number: e.target.value }))}
                  placeholder="Optional personal tax reference"
                />
              </div>
            )}
            <div className="space-y-1 sm:col-span-2">
              <Label>Address line 1</Label>
              <Input
                value={form.address_line1 ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, address_line1: e.target.value }))}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Address line 2</Label>
              <Input
                value={form.address_line2 ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, address_line2: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>City</Label>
              <Input
                value={form.city ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Postal code</Label>
              <Input
                value={form.postal_code ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, postal_code: e.target.value }))}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Country</Label>
              <Input
                value={form.country ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Notes</Label>
              <Input
                value={form.notes ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <div className="sm:col-span-2">
              <Button onClick={saveDetails} disabled={saving}>
                {saving ? "Saving…" : "Save details"}
              </Button>
            </div>
          </CardContent>
          )}
        </Card>
      )}

      <Modal
        open={createOpen}
        onClose={closeCreateProfile}
        title="Create new profile"
        description="Choose Individual or Business. Business can include a logo for report letterheads."
        className="max-w-lg"
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Profile type</Label>
            <div className="inline-flex rounded-xl border border-border/70 bg-muted/30 p-1">
              <button
                type="button"
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all",
                  newType === "individual"
                    ? "bg-[hsl(var(--neon-lime)/0.2)] ring-1 ring-[hsl(var(--neon-lime)/0.45)]"
                    : "text-muted-foreground"
                )}
                onClick={() => {
                  setNewType("individual");
                  setNewLogoFile(null);
                }}
              >
                <UserRound className="h-3.5 w-3.5" />
                Individual
              </button>
              <button
                type="button"
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all",
                  newType === "business"
                    ? "bg-[hsl(var(--neon-lime)/0.2)] ring-1 ring-[hsl(var(--neon-lime)/0.45)]"
                    : "text-muted-foreground"
                )}
                onClick={() => setNewType("business")}
              >
                <Building2 className="h-3.5 w-3.5" />
                Business
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <Label>New profile name</Label>
            <Input
              placeholder={
                newType === "business" ? 'e.g. "Acme Trading CC"' : 'e.g. "Personal" or "Spouse"'
              }
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
            />
          </div>

          {newType === "business" && (
            <>
              <div className="space-y-1">
                <Label>Business / trading name (letterhead)</Label>
                <Input
                  placeholder="Optional if same as profile name"
                  value={newBusinessName}
                  onChange={(e) => setNewBusinessName(e.target.value)}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Business registration number</Label>
                  <Input
                    placeholder="e.g. 2020/123456/07"
                    value={newRegNumber}
                    onChange={(e) => setNewRegNumber(e.target.value)}
                    className="font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label>VAT number</Label>
                  <Input
                    placeholder="e.g. 4123456789"
                    value={newVatNumber}
                    onChange={(e) => setNewVatNumber(e.target.value)}
                    className="font-mono"
                  />
                </div>
              </div>
              <div className="space-y-2 rounded-xl border border-border/70 p-3">
                <Label className="flex items-center gap-2">
                  <ImagePlus className="h-3.5 w-3.5" />
                  Business logo (optional)
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Printed at the top of PDF reports as a professional letterhead.
                </p>
                <Input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={(e) => setNewLogoFile(e.target.files?.[0] || null)}
                />
                {newLogoFile && (
                  <p className="text-xs text-muted-foreground">Selected: {newLogoFile.name}</p>
                )}
              </div>
            </>
          )}

          <div className="space-y-2 rounded-xl border border-border/70 p-3">
            <p className="text-sm font-medium">Copy ledger accounts from</p>
            <p className="text-xs text-muted-foreground">
              Tick one source, or leave none and use default starter ledgers.
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={copyLedgersFrom == null && seedDefaults}
                onChange={() => {
                  setCopyLedgersFrom(null);
                  setSeedDefaults(true);
                }}
              />
              Default starter ledgers (clean structure)
            </label>
            {profiles.map((p) => (
              <label key={`lg-${p.id}`} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={copyLedgersFrom === p.id}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setCopyLedgersFrom(p.id);
                      setSeedDefaults(false);
                    } else {
                      setCopyLedgersFrom(null);
                      setSeedDefaults(true);
                    }
                  }}
                />
                {p.name} ({p.ledger_count} ledgers)
              </label>
            ))}
          </div>

          <div className="space-y-2 rounded-xl border border-border/70 p-3">
            <p className="text-sm font-medium">Copy bank profiles from</p>
            <p className="text-xs text-muted-foreground">
              Optional. Copies how statements are read — not your transaction history.
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={copyBanksFrom == null}
                onChange={() => setCopyBanksFrom(null)}
              />
              None (set up banks later)
            </label>
            {profiles.map((p) => (
              <label key={`bp-${p.id}`} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={copyBanksFrom === p.id}
                  onChange={(e) => setCopyBanksFrom(e.target.checked ? p.id : null)}
                />
                {p.name} ({p.bank_profile_count} bank profiles)
              </label>
            ))}
          </div>

          <div className="space-y-2 rounded-xl border-2 border-[hsl(var(--neon-violet)/0.4)] bg-[hsl(var(--neon-violet)/0.06)] p-3">
            <p className="text-sm font-medium">Workspace username &amp; password (required)</p>
            <p className="text-xs text-muted-foreground">
              Your main profile is already protected by app login. Extra client books need their own
              credentials — switching into them opens a full-app unlock gate (username + password or
              Cancel).
            </p>
            <div className="space-y-2">
              <div className="space-y-1">
                <Label htmlFor="new-ws-user">Workspace username</Label>
                <Input
                  id="new-ws-user"
                  autoComplete="username"
                  value={newWorkspaceUser}
                  onChange={(e) => setNewWorkspaceUser(e.target.value)}
                  placeholder="e.g. client login name"
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="new-prof-pw">Workspace password</Label>
                  <Input
                    id="new-prof-pw"
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="new-prof-pw2">Confirm password</Label>
                  <Input
                    id="new-prof-pw2"
                    type="password"
                    autoComplete="new-password"
                    value={newPassword2}
                    onChange={(e) => setNewPassword2(e.target.value)}
                    className="font-mono"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t border-border/50 pt-3">
            <Button type="button" variant="ghost" onClick={closeCreateProfile} disabled={creating}>
              Cancel
            </Button>
            <Button onClick={() => void createProfile()} disabled={creating}>
              {creating ? "Creating…" : "Create profile & switch"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(resetTarget)}
        onClose={() => {
          if (resetBusy) return;
          setResetTarget(null);
        }}
        title={resetTarget ? `Reset login — ${resetTarget.name}` : "Reset workspace login"}
        description="You are already signed into LedgerFlow, so you can set a new workspace username and password without the old one. There is no email recovery."
      >
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="reset-ws-user">Workspace username</Label>
            <Input
              id="reset-ws-user"
              autoComplete="off"
              value={resetUser}
              onChange={(e) => setResetUser(e.target.value)}
              placeholder="Username used when switching into this profile"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="reset-ws-pw">New workspace password</Label>
            <Input
              id="reset-ws-pw"
              type="password"
              autoComplete="new-password"
              value={resetPw}
              onChange={(e) => setResetPw(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="reset-ws-pw2">Confirm password</Label>
            <Input
              id="reset-ws-pw2"
              type="password"
              autoComplete="new-password"
              value={resetPw2}
              onChange={(e) => setResetPw2(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              disabled={resetBusy}
              onClick={() => setResetTarget(null)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={resetBusy} onClick={() => void saveWorkspaceLoginReset()}>
              {resetBusy ? "Saving…" : "Save new login"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* App login password only — not workspace credentials */}
      {!isGuest && <ChangePasswordCard />}

      <Button variant="outline" onClick={() => router.push("/settings")}>
        Back to Settings
      </Button>
    </div>
  );
}
