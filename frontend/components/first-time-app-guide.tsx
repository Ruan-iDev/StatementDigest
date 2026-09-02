"use client";

import { useEffect, useState, type ReactElement } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  FileBarChart,
  HardDrive,
  Lock,
  ListTodo,
  Sparkles,
  Upload,
  Building2,
  ListPlus,
  LayoutDashboard,
  ShieldAlert,
  Timer,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  APP_GUIDE_SEEN_KEY,
  shouldForceAppGuide,
} from "@/lib/first-time-flags";
import { cn } from "@/lib/utils";

type GuideCard = {
  n: number;
  title: string;
  body: string;
  icon: ReactElement;
  accent: "cyan" | "violet" | "magenta" | "lime" | "amber";
};

const CARDS: GuideCard[] = [
  {
    n: 1,
    title: "Welcome",
    body: "LedgerFlow keeps your money story local and private — on this computer only.",
    icon: <Sparkles className="h-5 w-5" />,
    accent: "violet",
  },
  {
    n: 2,
    title: "Two modules",
    body: "Ledger Flow is the books — upload, transactions, reporting, settings. Work Flow is clients, products, quotes, invoices, and projects.",
    icon: <LayoutDashboard className="h-5 w-5" />,
    accent: "violet",
  },
  {
    n: 3,
    title: "Select your bank",
    body: "On Upload, pick a bank we already know how to read. No mapping columns — that work is ours.",
    icon: <Building2 className="h-5 w-5" />,
    accent: "cyan",
  },
  {
    n: 4,
    title: "Upload",
    body: "Three steps: select bank → add statements → process. Calm and guided.",
    icon: <Upload className="h-5 w-5" />,
    accent: "cyan",
  },
  {
    n: 5,
    title: "Transactions",
    body: "Unallocated needs a home. Allocated is sorted. A pink pulse means work is waiting.",
    icon: <ListTodo className="h-5 w-5" />,
    accent: "magenta",
  },
  {
    n: 6,
    title: "Assign & allocate",
    body: "Choose “Assign to Ledger…”, then Allocate. One line at a time — or several at once.",
    icon: <Check className="h-5 w-5" />,
    accent: "magenta",
  },
  {
    n: 7,
    title: "Rules",
    body: "Teach once with the rule button on a line. Matching lines are sorted for you next time.",
    icon: <ListPlus className="h-5 w-5" />,
    accent: "lime",
  },
  {
    n: 8,
    title: "Reports",
    body: "See profit, spend, and budgets when ready. Export only when you choose to.",
    icon: <FileBarChart className="h-5 w-5" />,
    accent: "lime",
  },
];

const ACCENT: Record<
  GuideCard["accent"],
  { ring: string; icon: string; glow: string }
> = {
  cyan: {
    ring: "border-[hsl(var(--neon-cyan)/0.45)]",
    icon: "border-[hsl(var(--neon-cyan)/0.55)] bg-[hsl(var(--neon-cyan)/0.12)] text-[hsl(var(--neon-cyan))]",
    glow: "hover:shadow-[0_0_24px_hsl(var(--neon-cyan)/0.15)]",
  },
  violet: {
    ring: "border-[hsl(var(--neon-violet)/0.45)]",
    icon: "border-[hsl(var(--neon-violet)/0.55)] bg-[hsl(var(--neon-violet)/0.12)] text-[hsl(var(--neon-violet))]",
    glow: "hover:shadow-[0_0_24px_hsl(var(--neon-violet)/0.15)]",
  },
  magenta: {
    ring: "border-[hsl(var(--neon-magenta)/0.45)]",
    icon: "border-[hsl(var(--neon-magenta)/0.55)] bg-[hsl(var(--neon-magenta)/0.12)] text-[hsl(var(--neon-magenta))]",
    glow: "hover:shadow-[0_0_24px_hsl(var(--neon-magenta)/0.15)]",
  },
  lime: {
    ring: "border-[hsl(var(--neon-lime)/0.45)]",
    icon: "border-[hsl(var(--neon-lime)/0.55)] bg-[hsl(var(--neon-lime)/0.12)] text-[hsl(var(--neon-lime))]",
    glow: "hover:shadow-[0_0_24px_hsl(var(--neon-lime)/0.15)]",
  },
  amber: {
    ring: "border-[hsl(var(--neon-amber)/0.45)]",
    icon: "border-[hsl(var(--neon-amber)/0.55)] bg-[hsl(var(--neon-amber)/0.12)] text-[hsl(var(--neon-amber))]",
    glow: "hover:shadow-[0_0_24px_hsl(var(--neon-amber)/0.15)]",
  },
};

type Props = {
  /** Called when the user finishes the guide */
  onFinished: () => void;
};

/**
 * First-run guide: 8 hub cards (4-col grid) + full-width cards 09 (data) & 10 (trial).
 */
export function FirstTimeAppGuide({ onFinished }: Props) {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  function finish() {
    try {
      if (!shouldForceAppGuide()) {
        localStorage.setItem(APP_GUIDE_SEEN_KEY, "1");
      }
    } catch {
      /* ignore */
    }
    onFinished();
  }

  return (
    <div
      className={cn(
        "fixed inset-0 z-[90] flex flex-col bg-black/80 backdrop-blur-md transition-opacity duration-500",
        entered ? "opacity-100" : "opacity-0"
      )}
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-guide-title"
    >
      <div
        className={cn(
          "mx-auto flex h-full w-full max-w-5xl flex-col px-4 py-6 transition-all duration-700 sm:px-8 sm:py-10",
          entered ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
        )}
      >
        {/* Header */}
        <header className="mb-5 shrink-0 text-center sm:mb-6">
          {shouldForceAppGuide() && (
            <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.2em] text-amber-200/80">
              Preview · force first-time guide
            </p>
          )}
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border-2 border-[hsl(var(--neon-cyan)/0.5)] bg-[hsl(var(--neon-cyan)/0.1)] text-[hsl(var(--neon-cyan))] shadow-[0_0_20px_hsl(var(--neon-cyan)/0.25)]">
            <BookOpen className="h-5 w-5" />
          </div>
          <h1
            id="app-guide-title"
            className="text-2xl font-semibold tracking-tight text-white sm:text-3xl"
          >
            How to use LedgerFlow
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-white/50">
            Ten quiet cards. No rush.
          </p>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-4 sm:space-y-4">
          {/* Cards 01–08 — 4-column grid */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
            {CARDS.map((card, i) => {
              const a = ACCENT[card.accent];
              return (
                <article
                  key={card.n}
                  className={cn(
                    "flex flex-col rounded-2xl border bg-card/90 p-4 text-left shadow-sm backdrop-blur-sm transition-all duration-300",
                    a.ring,
                    a.glow,
                    entered ? "opacity-100" : "opacity-0"
                  )}
                  style={{ transitionDelay: entered ? `${80 + i * 45}ms` : "0ms" }}
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-xl border-2",
                        a.icon
                      )}
                    >
                      {card.icon}
                    </div>
                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      {String(card.n).padStart(2, "0")}
                    </span>
                  </div>
                  <h2 className="text-sm font-semibold tracking-tight text-foreground">
                    {card.title}
                  </h2>
                  <p className="mt-1.5 flex-1 text-xs leading-relaxed text-muted-foreground">
                    {card.body}
                  </p>
                </article>
              );
            })}
          </div>

          {/* Card 09 — full-width data / backup */}
          <article
            className={cn(
              "relative overflow-hidden rounded-2xl border-2 border-[hsl(var(--neon-amber)/0.65)] bg-gradient-to-br from-[hsl(var(--neon-amber)/0.18)] via-card/95 to-[hsl(var(--neon-amber)/0.08)] p-5 text-left shadow-[0_0_40px_hsl(var(--neon-amber)/0.2)] transition-all duration-500 sm:p-6",
              entered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
            )}
            style={{ transitionDelay: entered ? "480ms" : "0ms" }}
          >
            <div
              className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-[hsl(var(--neon-amber)/0.15)] blur-2xl"
              aria-hidden
            />
            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border-2 border-[hsl(var(--neon-amber)/0.7)] bg-[hsl(var(--neon-amber)/0.15)] text-[hsl(var(--neon-amber))] shadow-[0_0_20px_hsl(var(--neon-amber)/0.35)]">
                <HardDrive className="h-7 w-7" />
              </div>
              <div className="min-w-0 flex-1 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-[hsl(var(--neon-amber))]" />
                    <h2 className="text-base font-semibold tracking-tight text-foreground sm:text-lg">
                      Your data lives on this PC
                    </h2>
                  </div>
                  <span className="rounded-full border border-[hsl(var(--neon-amber)/0.5)] bg-[hsl(var(--neon-amber)/0.12)] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[hsl(var(--neon-amber))]">
                    09 · important
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-foreground/90">
                  LedgerFlow stores everything <strong>locally</strong> on your computer — not in
                  our cloud. Find the folder anytime under{" "}
                  <strong>Settings → My Profile → Your data on this PC</strong> (open the database
                  folder from there).
                </p>
                <ul className="space-y-1.5 text-xs leading-relaxed text-muted-foreground sm:text-[13px]">
                  <li className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(var(--neon-amber))]" />
                    <span>
                      <strong className="text-foreground/90">Back up regularly</strong> if you do
                      not want to lose your books — copy that folder to a drive or cloud of{" "}
                      <em>your</em> choice.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(var(--neon-amber))]" />
                    <span>
                      <strong className="text-foreground/90">You</strong> are responsible for backups
                      and for who can access this machine.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(var(--neon-amber))]" />
                    <span>
                      LedgerFlow is <strong className="text-foreground/90">not responsible</strong>{" "}
                      for data loss, device failure, or information leaked in any way.
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </article>

          {/* Card 10 — full-width trial / read-only (final commercial clarity) */}
          <article
            className={cn(
              "relative overflow-hidden rounded-2xl border-2 border-[hsl(var(--neon-violet)/0.6)] bg-gradient-to-br from-[hsl(var(--neon-violet)/0.2)] via-card/95 to-[hsl(var(--neon-cyan)/0.08)] p-5 text-left shadow-[0_0_40px_hsl(var(--neon-violet)/0.18)] transition-all duration-500 sm:p-6",
              entered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
            )}
            style={{ transitionDelay: entered ? "560ms" : "0ms" }}
          >
            <div
              className="pointer-events-none absolute -left-10 bottom-0 h-36 w-36 rounded-full bg-[hsl(var(--neon-violet)/0.2)] blur-2xl"
              aria-hidden
            />
            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border-2 border-[hsl(var(--neon-violet)/0.65)] bg-[hsl(var(--neon-violet)/0.15)] text-[hsl(var(--neon-violet))] shadow-[0_0_20px_hsl(var(--neon-violet)/0.35)]">
                <Timer className="h-7 w-7" />
              </div>
              <div className="min-w-0 flex-1 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Eye className="h-4 w-4 text-[hsl(var(--neon-violet))]" />
                    <h2 className="text-base font-semibold tracking-tight text-foreground sm:text-lg">
                      30-day tester access
                    </h2>
                  </div>
                  <span className="rounded-full border border-[hsl(var(--neon-violet)/0.5)] bg-[hsl(var(--neon-violet)/0.12)] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[hsl(var(--neon-violet))]">
                    10 · access
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-foreground/90">
                  This install includes <strong>30 days</strong> of full use from first open (shown
                  on <strong>My Profile</strong> as days remaining). The software is our product;
                  your data stays safely stored on this PC.
                </p>
                <ul className="space-y-1.5 text-xs leading-relaxed text-muted-foreground sm:text-[13px]">
                  <li className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(var(--neon-violet))]" />
                    <span>
                      After 30 days the app switches to{" "}
                      <strong className="text-foreground/90">read-only</strong>: you can still{" "}
                      <em>see</em> your books on screen.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(var(--neon-violet))]" />
                    <span>
                      Locked until unlock:{" "}
                      <strong className="text-foreground/90">
                        uploads, allocations, rules, wipe, print &amp; export
                      </strong>
                      .
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(var(--neon-violet))]" />
                    <span>
                      Enter an <strong className="text-foreground/90">unlock key</strong> (or a new
                      licensed build / future subscription) to work fully again — we never delete
                      your local files.
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </article>
        </div>

        {/* Footer */}
        <footer className="mt-4 flex shrink-0 flex-col items-center gap-3 border-t border-white/10 pt-5 sm:mt-5">
          <p className="flex items-center gap-1.5 text-[11px] text-white/40">
            <Lock className="h-3 w-3" />
            Local only · back up if it matters to you
          </p>
          <Button
            type="button"
            className="h-11 min-w-[14rem] gap-2 bg-white text-black hover:bg-white/90"
            onClick={finish}
          >
            Got it — enter the app
            <ArrowRight className="h-4 w-4" />
          </Button>
        </footer>
      </div>
    </div>
  );
}

/** Whether the guide should open for this session */
export function shouldShowAppGuide(): boolean {
  if (typeof window === "undefined") return false;
  if (shouldForceAppGuide()) return true;
  try {
    return localStorage.getItem(APP_GUIDE_SEEN_KEY) !== "1";
  } catch {
    return true;
  }
}

/** Clear “seen” when force-testing first-time flows */
export function resetAppGuideSeenIfForced(): void {
  if (typeof window === "undefined") return;
  if (!shouldForceAppGuide()) return;
  try {
    localStorage.removeItem(APP_GUIDE_SEEN_KEY);
  } catch {
    /* ignore */
  }
}
