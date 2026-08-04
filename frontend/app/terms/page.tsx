import type { Metadata } from "next";
import Link from "next/link";
import { Scale } from "lucide-react";

export const metadata: Metadata = {
  title: "Terms of Use — LedgerFlow",
  description: "Terms of use and disclaimer for LedgerFlow",
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-12">
      <header className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-[hsl(var(--neon-cyan))]">
          Legal
        </p>
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border-2 border-[hsl(var(--neon-cyan)/0.6)] bg-[hsl(var(--neon-cyan)/0.1)] text-[hsl(var(--neon-cyan))] shadow-[0_0_16px_hsl(var(--neon-cyan)/0.25)]">
            <Scale className="h-5 w-5" />
          </div>
          <div>
            <h1 className="page-title">Terms of Use</h1>
            <p className="page-subtitle">LedgerFlow · last updated 31 July 2026</p>
          </div>
        </div>
      </header>

      <div className="rounded-2xl border-2 border-[hsl(var(--neon-amber)/0.5)] bg-[hsl(var(--neon-amber)/0.08)] px-5 py-4 text-sm leading-relaxed">
        <p className="font-semibold text-foreground">Important disclaimer</p>
        <p className="mt-2 text-muted-foreground">
          Under no circumstances whatsoever shall this application, nor its creators, authors,
          contributors, or distributors, be held responsible or liable for any incorrect, incomplete,
          misleading, or otherwise unsuitable data produced, displayed, exported, or shared by or
          through this app. LedgerFlow is merely a tool to assist with the soul-draining tasks of
          everyday life and to aid users in organising their own information.{" "}
          <strong className="text-foreground">
            It is the sole responsibility of each user to double-check all information as it is
            processed before sharing that processed information with any third party outside the
            boundaries of this app.
          </strong>
        </p>
      </div>

      <article className="prose-terms space-y-6 text-sm leading-relaxed text-foreground">
        <section className="space-y-2 rounded-2xl border border-border/70 bg-card/80 p-5">
          <h2 className="text-base font-semibold tracking-tight">1. Acceptance of these terms</h2>
          <p className="text-muted-foreground">
            By installing, opening, or using LedgerFlow (“the App”), you agree to be bound by these
            Terms of Use. If you do not agree, do not use the App. Continued use constitutes
            acceptance of the current version of these terms.
          </p>
        </section>

        <section className="space-y-2 rounded-2xl border border-border/70 bg-card/80 p-5">
          <h2 className="text-base font-semibold tracking-tight">2. Nature of the service</h2>
          <p className="text-muted-foreground">
            LedgerFlow is a local-first personal finance helper. It is designed to help you import
            bank statements, categorise transactions, apply simple rules, and produce reports for
            your own use. The App is provided as a convenience tool only. It is{" "}
            <strong className="text-foreground">not</strong> professional accounting, tax, legal,
            investment, or financial advice, and it is not a substitute for a qualified accountant,
            tax practitioner, or bookkeeper.
          </p>
        </section>

        <section className="space-y-2 rounded-2xl border border-border/70 bg-card/80 p-5">
          <h2 className="text-base font-semibold tracking-tight">3. No warranty</h2>
          <p className="text-muted-foreground">
            The App is provided “as is” and “as available”, without warranties of any kind, whether
            express, implied, or statutory—including but not limited to merchantability, fitness for
            a particular purpose, accuracy, completeness, reliability, or non-infringement. We do
            not warrant that parsing of bank statements, categorisation, rules, calculations,
            reports, PDFs, or any other output will be free of errors, omissions, or defects.
          </p>
        </section>

        <section className="space-y-2 rounded-2xl border border-border/70 bg-card/80 p-5">
          <h2 className="text-base font-semibold tracking-tight">4. Limitation of liability</h2>
          <p className="text-muted-foreground">
            To the maximum extent permitted by applicable law, under no circumstances whatsoever
            shall the App, its creators, authors, contributors, maintainers, or distributors be
            liable for any direct, indirect, incidental, special, consequential, exemplary, or
            punitive damages, or any loss of profits, revenue, data, goodwill, business
            opportunity, or tax position, arising out of or related to your use of (or inability to
            use) the App—including any incorrect data produced by the App—whether based on
            warranty, contract, tort (including negligence), or any other legal theory, even if
            advised of the possibility of such damages.
          </p>
          <p className="text-muted-foreground">
            Without limiting the above, you specifically acknowledge that bank statement formats
            vary, automated parsing and rules can misclassify amounts or descriptions, and reports
            may not match official bank or accounting records.
          </p>
        </section>

        <section className="space-y-2 rounded-2xl border border-border/70 bg-card/80 p-5">
          <h2 className="text-base font-semibold tracking-tight">5. Your responsibility</h2>
          <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
            <li>
              You are solely responsible for verifying all imported, calculated, categorised, and
              exported information before relying on it or sharing it with anyone else.
            </li>
            <li>
              You must double-check all processed information before sharing it with any third
              party outside the boundaries of this App (including accountants, tax authorities,
              banks, partners, or other software).
            </li>
            <li>
              You remain responsible for your own compliance with tax, accounting, and regulatory
              obligations in your jurisdiction.
            </li>
            <li>
              You are responsible for safeguarding your device, backups, and any data stored
              locally by the App.
            </li>
          </ul>
        </section>

        <section className="space-y-2 rounded-2xl border border-border/70 bg-card/80 p-5">
          <h2 className="text-base font-semibold tracking-tight">6. Local data and privacy</h2>
          <p className="text-muted-foreground">
            The App is designed to run primarily on your machine using local storage (for example
            SQLite databases and uploaded files on your device). You control what files you import
            and what you export. Creators of the App do not receive your bank statements or
            personal financial data through ordinary use of a local installation, unless you
            independently choose to send files or information to them.
          </p>
        </section>

        <section className="space-y-2 rounded-2xl border-2 border-[hsl(var(--neon-amber)/0.45)] bg-[hsl(var(--neon-amber)/0.08)] p-5">
          <h2 className="text-base font-semibold tracking-tight">
            6A. Device security — do not leave the App open
          </h2>
          <p className="text-muted-foreground">
            This App is a house of sensitive financial information. You must not leave LedgerFlow
            open and unlocked for other people to use. We strongly recommend that you{" "}
            <strong className="text-foreground">log out</strong> before leaving your device
            unattended, and that you use a strong password stored only where you control it. Anyone
            with access to an unlocked session may view or change your data. You are responsible for
            physical and session security of the device on which the App runs.
          </p>
        </section>

        <section className="space-y-2 rounded-2xl border border-border/70 bg-card/80 p-5">
          <h2 className="text-base font-semibold tracking-tight">6B. Passwords and lockout</h2>
          <p className="text-muted-foreground">
            Login passwords are stored only as one-way cryptographic hashes (not recoverable plain
            text). You may choose any password you wish; the App may show a strength indicator as
            guidance only and does not enforce a minimum complexity policy. There is no “forgot
            password” email recovery. If you forget your password, the account remains locked. You
            may change a password only by proving the current password. You are advised to back up
            any generated password before registration.
          </p>
        </section>

        <section className="space-y-2 rounded-2xl border border-border/70 bg-card/80 p-5">
          <h2 className="text-base font-semibold tracking-tight">7. Acceptable use</h2>
          <p className="text-muted-foreground">
            You agree to use the App only for lawful purposes and only with data you are entitled
            to process. You must not use the App to commit fraud, misrepresent financial
            information, or violate any applicable law.
          </p>
        </section>

        <section className="space-y-2 rounded-2xl border border-border/70 bg-card/80 p-5">
          <h2 className="text-base font-semibold tracking-tight">8. Third-party materials</h2>
          <p className="text-muted-foreground">
            Bank statements, formats, and marks belong to their respective institutions. The App
            does not claim affiliation with any bank unless expressly stated. References to bank
            names are for practical parsing and configuration only.
          </p>
        </section>

        <section className="space-y-2 rounded-2xl border border-border/70 bg-card/80 p-5">
          <h2 className="text-base font-semibold tracking-tight">9. Changes to the App and terms</h2>
          <p className="text-muted-foreground">
            Features may change, improve, or be removed over time. These Terms may be updated
            periodically. The “last updated” date at the top of this page indicates the current
            version. Your continued use after changes constitutes acceptance of the revised terms.
          </p>
        </section>

        <section className="space-y-2 rounded-2xl border border-border/70 bg-card/80 p-5">
          <h2 className="text-base font-semibold tracking-tight">10. Governing principles</h2>
          <p className="text-muted-foreground">
            These Terms are intended to be interpreted in a manner that maximises the disclaimer of
            warranties and limitation of liability to the fullest extent allowed by law. If any
            provision is held unenforceable, the remaining provisions continue in full force and
            effect. Nothing in these Terms excludes liability that cannot be excluded under
            applicable mandatory consumer law.
          </p>
        </section>

        <section className="space-y-2 rounded-2xl border-2 border-[hsl(var(--neon-cyan)/0.4)] bg-[hsl(var(--neon-cyan)/0.06)] p-5">
          <h2 className="text-base font-semibold tracking-tight">In plain language</h2>
          <p className="text-muted-foreground">
            This App is a helper, not a guarantee. It tries to make tedious money admin a bit less
            painful. Always re-read the numbers and categories yourself before you hand anything to
            an accountant, SARS, a bank, or anyone else. If something is wrong, it is on you to
            catch it—not on the App or the people who built it.
          </p>
        </section>
      </article>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/"
          className="inline-flex h-9 items-center rounded-md border-2 border-input bg-card/60 px-3 text-sm font-medium hover:border-[hsl(var(--neon-cyan)/0.5)] hover:bg-accent"
        >
          Back to Home
        </Link>
      </div>
    </div>
  );
}
