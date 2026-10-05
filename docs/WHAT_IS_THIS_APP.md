# What this app is all about

**Product name:** LedgerFlow  
**Last updated:** 2026-09-02 · app **v2.1.0**

---

## One sentence

A **local-first** app that helps ordinary people (not accountants) turn bank statements into **categorised transactions**, **rules that auto-repeat**, and a clear **Profit & Loss** view they can share with an accountant.

---

## Who it’s for

- Small business owners and sole traders who **don’t know accounting jargon**
- Example persona: **a florist** who has a Discovery or FNB statement PDF/CSV and needs:
  - “Where did my money go?”
  - “What was profit this month?”
  - “Give my bookkeeper a clean PDF”

They should never need to understand double-entry, chart of accounts theory, or “calibration JSON.”

---

## What it does (product pillars)

1. **Bank profile (learn once)**  
   Teach the app how *this bank’s statement* is laid out (using a sample file). Saved so every future upload of that bank format works without re-teaching.

2. **Upload statements (batch-safe)**  
   Upload up to **12 statements at a time**; process **one by one** with progress and no browser timeout.

3. **Transactions (was “Unallocated”)**  
   Review transactions by month. Assign a **ledger**, edit type/details if needed, **allocate**, or create a **rule**.

4. **Rules (remember forever)**  
   “Anything like Checkers → Expenses / Supplies.” Apply to similar past rows (user can tick/untick), then auto-apply on all future imports so the user never sees those rows again.

5. **Reporting**  
   Month-by-month P&L for the financial year; click a total to drill into transactions; re-assign or unallocate if wrong; export/print PDF (portrait or landscape) for the accountant.

6. **Settings**  
   Manage bank profiles, ledgers, rules, and simple preferences (currency, FY start). Day-to-day work starts from the dashboard hubs, not buried menus.

7. **Practice (module, in progress on `feature/practice-module`)**  
   Bolt-on desk for **clients**, **suppliers**, **project files**, then quotes and invoices. A project is a file you open — info sheet plus a dated paper trail. It shares login, workspace, and the local database with the core books. It does not replace statement upload.

8. **Cabinet Flow (production desk, 2026-10-02)**  
   Same clients, projects, and products as Work Flow. Cabinet Flow is where jobs will be produced. New jobcard is still coming soon. Detail: [CABINET_FLOW.md](./CABINET_FLOW.md).

---

## What it is *not*

- Not cloud accounting (Xero/Sage replacement with bank feeds)
- Not multi-user login / company permissions (today: single local machine)
- Not a bank scraper (user uploads statements)
- Not AI-required (local heuristics + user confirmation; optional local LLM is future-only)
- Not tax filing software

---

## Privacy & data

- Everything runs **on the user’s machine**
- SQLite + uploads under `data/`
- No analytics, no paid cloud APIs for core features
- **Multiple local profiles (workspaces)** — e.g. Personal vs Business — never mix transactions, ledgers, bank setups, or rules. New profiles are clean unless the user chooses to copy ledger structure and/or bank profiles from another profile.

---

## Current UI hubs (dashboard)

1. **Upload Statement**  
2. **Transactions** (rename from “Unallocated Transactions” — see USER_FLOW)  
3. **Reporting**  
4. **Settings** → Bank profiles · Ledger accounts · Rules · preferences  

---

## Tech stack (implementation)

| Layer | Choice |
|-------|--------|
| UI | Next.js 14 + TypeScript + Tailwind |
| API | FastAPI (Python) |
| DB | SQLite |
| Reports PDF | ReportLab |
| Statement parse | CSV + PDF (pdfplumber), driven by **bank profile recipe** (see PARSING_AND_PROFILES.md) |

---

## Success looks like

Florist opens app → creates bank profile from real Discovery sample → uploads a year of statements (queued) → spends an evening categorising with rules → never re-does Checkers → prints P&L PDF for the accountant.
