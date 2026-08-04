"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Eye,
  EyeOff,
  KeyRound,
  RefreshCw,
  User,
  UserRound,
  X,
} from "lucide-react";
import { api, setAuthToken, setStoredProfileId } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordStrengthMeter } from "@/components/password-strength-meter";
import { getDesktopBridge, isDesktopApp } from "@/lib/desktop";
import { FORCE_FIRST_TIME_SETUP } from "@/lib/first-time-flags";
import { setLastUser } from "@/lib/last-user";
import { cn } from "@/lib/utils";

type Step = "welcome" | "personal" | "kind" | "business" | "credentials";
type ProfileKind = "individual" | "business";

type Props = {
  onAuthenticated: (token: string, username: string, opts?: { guest?: boolean }) => void;
};

/**
 * FirstTimeSetup — calm multi-step day-zero onboarding.
 * Close stays available until a real session is established.
 */
export function FirstTimeSetup({ onAuthenticated }: Props) {
  const [step, setStep] = useState<Step>("welcome");
  const [entered, setEntered] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [desktop, setDesktop] = useState(false);

  // Personal
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // Kind + business
  const [kind, setKind] = useState<ProfileKind | null>(null);
  const [businessName, setBusinessName] = useState("");
  const [businessReg, setBusinessReg] = useState("");
  const [vatNumber, setVatNumber] = useState("");

  // Credentials
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [suggestNote, setSuggestNote] = useState<string | null>(null);

  useEffect(() => {
    setDesktop(isDesktopApp());
    const id = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  // Soft re-enter animation when step changes
  useEffect(() => {
    setEntered(false);
    const id = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(id);
  }, [step]);

  function go(next: Step) {
    setError(null);
    setStep(next);
  }

  function progressIndex(): number {
    if (step === "welcome") return 0;
    if (step === "personal") return 1;
    if (step === "kind") return 2;
    if (step === "business") return 3;
    return kind === "business" ? 4 : 3;
  }

  function progressTotal(): number {
    // welcome + personal + kind + (business?) + credentials
    return kind === "business" ? 5 : 4;
  }

  async function enterAsGuest() {
    setError(null);
    setBusy(true);
    try {
      const res = await api.auth.guest();
      onAuthenticated(res.token, res.username, { guest: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not start guest session");
    } finally {
      setBusy(false);
    }
  }

  function closeApp() {
    void getDesktopBridge()?.windowClose?.();
  }

  function validatePersonal(): boolean {
    if (fullName.trim().length < 2) {
      setError("Please enter your name (at least 2 characters).");
      return false;
    }
    return true;
  }

  function validateBusiness(): boolean {
    if (businessName.trim().length < 2) {
      setError("Please enter your business name.");
      return false;
    }
    return true;
  }

  async function refreshSuggestion() {
    setError(null);
    try {
      const s = await api.auth.suggestPassword();
      setPassword(s.password);
      setConfirm(s.password);
      setSuggestNote(s.note);
      setShowPw(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not generate password");
    }
  }

  async function finishSetup() {
    setError(null);
    const u = username.trim();
    if (u.length < 2) {
      setError("Username must be at least 2 characters.");
      return;
    }
    if (!password) {
      setError("Please choose a password.");
      return;
    }
    if (password !== confirm) {
      setError("Password and confirmation do not match.");
      return;
    }
    if (!kind) {
      setError("Please choose Personal or Business.");
      go("kind");
      return;
    }

    setBusy(true);
    try {
      const auth = await api.auth.register({ username: u, password });
      // Must store token before profile APIs (they require Authorization)
      setAuthToken(auth.token);

      const displayName =
        kind === "business"
          ? businessName.trim() || fullName.trim() || u
          : fullName.trim() || u;

      // First workspace is protected by app login — no separate workspace credentials.
      // Extra client profiles (My Profile → Create) get their own username + password.
      const profile = await api.profiles.create({
        name: displayName,
        profile_type: kind,
        full_name: fullName.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        business_name: kind === "business" ? businessName.trim() || null : null,
        business_registration_number:
          kind === "business" ? businessReg.trim() || null : null,
        vat_number: kind === "business" ? vatNumber.trim() || null : null,
        seed_default_ledgers: true,
      });

      setStoredProfileId(profile.id);
      setLastUser({
        username: auth.username,
        displayName: fullName.trim() || auth.username,
      });
      onAuthenticated(auth.token, auth.username);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not finish setup";
      if (/failed to fetch|could not reach the api|api unavailable|networkerror/i.test(msg)) {
        setError(
          "Could not reach the local API. Fully quit LedgerFlow (Task Manager → end LedgerFlow / " +
            "ledgerflow-api), then open the app once and retry. Do not rename the Data folder while open."
        );
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  const fieldClass =
    "h-11 border-white/15 bg-white/5 text-white placeholder:text-white/30 focus-visible:ring-[hsl(var(--neon-cyan)/0.5)]";
  const labelClass = "text-white/70";

  return (
    <div className="relative flex h-full min-h-full flex-col bg-black text-white">
      {FORCE_FIRST_TIME_SETUP && (
        <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-md border border-amber-400/40 bg-amber-500/10 px-2 py-1 text-[10px] uppercase tracking-wide text-amber-100/90">
          Preview · FORCE_FIRST_TIME_SETUP
        </div>
      )}

      <div
        className={cn(
          "flex flex-1 flex-col items-center justify-center px-6 py-10 transition-all duration-500 ease-out",
          entered ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
        )}
      >
        {/* Quiet progress (hidden on welcome) */}
        {step !== "welcome" && (
          <div className="mb-8 flex items-center gap-1.5" aria-hidden>
            {Array.from({ length: progressTotal() }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1 rounded-full transition-all",
                  i <= progressIndex()
                    ? "w-6 bg-white/70"
                    : "w-3 bg-white/15"
                )}
              />
            ))}
          </div>
        )}

        {step === "welcome" && (
          <div className="w-full max-w-lg text-center">
            <BrandLogo size="lg" />
            <p className="mt-5 text-xs uppercase tracking-[0.2em] text-white/40">LedgerFlow</p>
            <h1 className="mt-4 text-3xl font-medium tracking-tight sm:text-4xl">
              Welcome, new user
            </h1>
            <p className="mx-auto mt-5 max-w-md text-sm leading-relaxed text-white/55 sm:text-base">
              Click <span className="text-white/80">Next</span> if you want to set up your profile,
              or choose <span className="text-white/80">Log in as Guest</span> to jump in and browse
              the app without any setup.
            </p>

            {error && <ErrorBox message={error} />}

            <div className="mx-auto mt-10 flex w-full max-w-sm flex-col gap-3">
              <Button
                type="button"
                className="h-11 w-full gap-2 bg-white text-black hover:bg-white/90"
                disabled={busy}
                onClick={() => go("personal")}
              >
                Next
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full gap-2 border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
                disabled={busy}
                onClick={() => void enterAsGuest()}
              >
                <UserRound className="h-4 w-4" />
                {busy ? "Please wait…" : "Log in as Guest"}
              </Button>
            </div>

            <p className="mx-auto mt-6 max-w-sm text-[11px] leading-relaxed text-white/35">
              Guest mode saves nothing. When you are ready for a locked private account, set up your
              profile.
            </p>
          </div>
        )}

        {step === "personal" && (
          <div className="w-full max-w-md">
            <Header
              kicker="Step 1"
              title="About you"
              blurb="Just the basics. You can change these later in Settings."
            />
            <div className="mt-8 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="fts-name" className={labelClass}>
                  Your name
                </Label>
                <Input
                  id="fts-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Ruan Farquhar"
                  className={fieldClass}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fts-email" className={labelClass}>
                  Email <span className="text-white/35">(optional)</span>
                </Label>
                <Input
                  id="fts-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className={fieldClass}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fts-phone" className={labelClass}>
                  Phone <span className="text-white/35">(optional)</span>
                </Label>
                <Input
                  id="fts-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Optional"
                  className={fieldClass}
                />
              </div>
            </div>
            {error && <ErrorBox message={error} />}
            <NavRow
              busy={busy}
              onBack={() => go("welcome")}
              onNext={() => {
                if (validatePersonal()) go("kind");
              }}
            />
          </div>
        )}

        {step === "kind" && (
          <div className="w-full max-w-md text-center">
            <Header
              kicker="Step 2"
              title="How will you use this?"
              blurb="Choose one. You can add another workspace later."
            />
            {error && <ErrorBox message={error} />}
            <div className="mx-auto mt-10 flex w-full max-w-sm flex-col gap-3">
              <ChoiceCard
                active={kind === "individual"}
                icon={<User className="h-5 w-5" />}
                title="Personal"
                subtitle="Private household finances"
                onClick={() => {
                  setKind("individual");
                  setError(null);
                  go("credentials");
                }}
              />
              <ChoiceCard
                active={kind === "business"}
                icon={<Briefcase className="h-5 w-5" />}
                title="Business"
                subtitle="Trading name, reg / VAT for reports"
                onClick={() => {
                  setKind("business");
                  setError(null);
                  go("business");
                }}
              />
            </div>
            <div className="mx-auto mt-8 flex w-full max-w-sm justify-start">
              <Button
                type="button"
                variant="outline"
                className="gap-2 border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
                disabled={busy}
                onClick={() => go("personal")}
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            </div>
          </div>
        )}

        {step === "business" && (
          <div className="w-full max-w-md">
            <Header
              kicker="Step 3"
              title="Business details"
              blurb="Used on letterheads and printed reports. Only the name is required now."
            />
            <div className="mt-8 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="fts-biz" className={labelClass}>
                  Business name
                </Label>
                <Input
                  id="fts-biz"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Trading or registered name"
                  className={fieldClass}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fts-reg" className={labelClass}>
                  Registration number <span className="text-white/35">(optional)</span>
                </Label>
                <Input
                  id="fts-reg"
                  value={businessReg}
                  onChange={(e) => setBusinessReg(e.target.value)}
                  placeholder="CIPC / company reg"
                  className={fieldClass}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fts-vat" className={labelClass}>
                  VAT number <span className="text-white/35">(optional)</span>
                </Label>
                <Input
                  id="fts-vat"
                  value={vatNumber}
                  onChange={(e) => setVatNumber(e.target.value)}
                  placeholder="Optional"
                  className={fieldClass}
                />
              </div>
            </div>
            {error && <ErrorBox message={error} />}
            <NavRow
              busy={busy}
              onBack={() => go("kind")}
              onNext={() => {
                if (validateBusiness()) go("credentials");
              }}
            />
          </div>
        )}

        {step === "credentials" && (
          <div className="w-full max-w-md">
            <Header
              kicker={kind === "business" ? "Step 4" : "Step 3"}
              title="Secure your account"
              blurb="This password locks your local data. There is no email recovery — store it safely."
            />
            <div className="mt-8 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="fts-user" className={labelClass}>
                  Username
                </Label>
                <Input
                  id="fts-user"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Choose a username"
                  className={fieldClass}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="fts-pass" className={labelClass}>
                    Password
                  </Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 border-white/20 bg-transparent text-xs text-white/80 hover:bg-white/10 hover:text-white"
                    onClick={() => void refreshSuggestion()}
                    disabled={busy}
                  >
                    <RefreshCw className="h-3 w-3" />
                    Suggest 15-key
                  </Button>
                </div>
                <div className="relative">
                  <Input
                    id="fts-pass"
                    type={showPw ? "text" : "password"}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={cn(fieldClass, "pr-10 font-mono")}
                    placeholder="Create a strong password"
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-white/45 hover:text-white"
                    onClick={() => setShowPw((s) => !s)}
                    aria-label={showPw ? "Hide password" : "Show password"}
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {password.length > 0 && (
                  <div className="pt-1 [&_.text-muted-foreground]:text-white/40">
                    <PasswordStrengthMeter password={password} />
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fts-confirm" className={labelClass}>
                  Confirm password
                </Label>
                <Input
                  id="fts-confirm"
                  type={showPw ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className={cn(fieldClass, "font-mono")}
                  placeholder="Repeat password"
                />
              </div>
              <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2.5 text-[11px] leading-relaxed text-white/65">
                <p className="font-medium text-amber-100/90">Back up this password first</p>
                <p className="mt-1">
                  If you lose it, this local account cannot be recovered — only changed later by
                  proving the current password.
                </p>
                {suggestNote && <p className="mt-2 text-white/45">{suggestNote}</p>}
              </div>
            </div>
            {error && <ErrorBox message={error} />}
            <div className="mt-8 flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                className="gap-2 border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
                disabled={busy}
                onClick={() => go(kind === "business" ? "business" : "kind")}
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <Button
                type="button"
                className="h-11 min-w-[10rem] gap-2 bg-white text-black hover:bg-white/90"
                disabled={busy}
                onClick={() => void finishSetup()}
              >
                <KeyRound className="h-4 w-4" />
                {busy ? "Creating…" : "Create & enter"}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Close always available until logged in */}
      <div className="flex shrink-0 justify-center pb-10 pt-2">
        {desktop ? (
          <Button
            type="button"
            variant="outline"
            className="min-w-[10rem] gap-2 border-white/15 bg-transparent text-white/70 hover:border-red-400/50 hover:bg-red-500/15 hover:text-red-100"
            disabled={busy}
            onClick={closeApp}
          >
            <X className="h-4 w-4" />
            Close
          </Button>
        ) : (
          <p className="text-[11px] text-white/30">Close the browser tab when you are done.</p>
        )}
      </div>
    </div>
  );
}

function BrandLogo({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/splash-logo.svg"
      alt="LedgerFlow"
      className={
        size === "lg"
          ? "mx-auto h-auto w-[min(140px,36vw)] drop-shadow-[0_0_28px_rgba(92,225,255,0.25)]"
          : "mx-auto h-auto w-[min(88px,28vw)] drop-shadow-[0_0_22px_rgba(92,225,255,0.22)]"
      }
    />
  );
}

function Header({
  kicker,
  title,
  blurb,
}: {
  kicker: string;
  title: string;
  blurb: string;
}) {
  return (
    <div className="text-center">
      <BrandLogo size="md" />
      <p className="mt-4 text-xs uppercase tracking-[0.2em] text-white/40">{kicker}</p>
      <h1 className="mt-3 text-2xl font-medium tracking-tight sm:text-3xl">{title}</h1>
      <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-white/50">{blurb}</p>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="mx-auto mt-6 max-w-sm rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-100">
      {message}
    </div>
  );
}

function NavRow({
  busy,
  onBack,
  onNext,
}: {
  busy: boolean;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="mt-8 flex items-center justify-between gap-3">
      <Button
        type="button"
        variant="outline"
        className="gap-2 border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
        disabled={busy}
        onClick={onBack}
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </Button>
      <Button
        type="button"
        className="h-11 min-w-[8rem] gap-2 bg-white text-black hover:bg-white/90"
        disabled={busy}
        onClick={onNext}
      >
        Next
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

function ChoiceCard({
  active,
  icon,
  title,
  subtitle,
  onClick,
}: {
  active: boolean;
  icon: React.ReactElement;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border px-4 py-4 text-left transition-colors",
        active
          ? "border-white/50 bg-white/10"
          : "border-white/15 bg-white/[0.03] hover:border-white/30 hover:bg-white/[0.06]"
      )}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-white/80">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-white">{title}</span>
        <span className="mt-0.5 block text-xs text-white/45">{subtitle}</span>
      </span>
    </button>
  );
}
