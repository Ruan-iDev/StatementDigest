# Decisions log

**Last updated:** 2026-08-06 · v1.4.0  

Record **agreed** product/tech decisions so we don’t re-debate after session drops.  
Format: date · decision · why · status.

---

## Agreed

| Date | Decision | Why | Status |
|------|----------|-----|--------|
| 2026-07-31 | Dashboard hubs: Upload, Transactions, Reporting, Settings | Simpler than many nav items | Agreed |
| 2026-07-31 | Settings contains: Bank profiles, Ledgers, Rules (+ prefs) | Setup tools nested under Settings | Agreed |
| 2026-07-31 | Soft grey UI + neon section accents | Finance apps feel lifeless | Agreed (implemented v1) |
| 2026-07-31 | **Cannot upload without a bank profile**; modal gate → Create Bank Profile | Parser needs a recipe; florist-safe order | Agreed |
| 2026-07-31 | Profile creation uses **sample statement first**, then name + options | Teach from real file | Agreed |
| 2026-07-31 | Users never maintain a “script terminal”; friendly options only | Non-technical users | Agreed |
| 2026-07-31 | Upload queue: multi-file; process **one-by-one**; background toast | Large statements / UX | Agreed |
| 2026-07-31 | Rules: preview similar txs; apply selection; future auto-allocate | Power without complexity | Agreed |
| 2026-07-31 | Keep **original** bank type/details when user edits (for rules) | Rules stay stable | Agreed |
| 2026-07-31 | Reporting drill-down → edit ledger or unallocate | Fix mistakes without SQL | Agreed |
| 2026-07-31 | PDF export: portrait **and** landscape | Accountant sharing | Agreed |
| 2026-07-31 | Living docs in `docs/` + root `devlog.md` | Resume after dropped sessions | Agreed |
| 2026-07-31 | **Password**: any non-empty; strength meter advisory only | Lower friction | Agreed |
| 2026-07-31 | **Guest login**: no app account required | Try without registering | Agreed |
| 2026-08-06 | **Guest = full product** (bank profiles, import, ledgers, reports); local SQLite writes allowed; no account password | Users must prove *their* bank works before subscribe; free account still for locked private login | Agreed |
| 2026-08-06 | **No user-facing bank profiles** — Upload Step 1 is **Select your bank** (supported banks only); Settings bank-profile tile removed; backend still auto-creates internal bank profile for import routing | Banks are fixed calibrated options; extra naming step was friction | Agreed |
| 2026-08-06 | **Bank dropdown = brand only** (FNB, Capitec, Discovery, Nedbank); each brand has multiple backend calibrated **layouts** tried on import | Users pick bank; we absorb product/language variants (e.g. FNB Gold Business + Fusion AF personal) | Agreed |
| 2026-07-31 | **Parser islands**: one module per bank; routing only in `base`/`detect` | Prevent cross-bank taint | Agreed |
| 2026-07-31 | **Discovery Personal** locked — 226 txs human 100% accurate | Production trust | Agreed |
| 2026-07-31 | **FNB Gold Business** locked — 1000+ txs human 100% accurate | Production trust | Agreed |
| 2026-07-31 | **Capitec Business** locked (sample edition-1); bulk import TBD | Protect fees/Amount contract | Agreed |
| 2026-07-31 | **Nedbank Personal** locked (sample edition-1); bulk import TBD | Protect fee vs `*` debit rules | Agreed |
| 2026-07-31 | Capitec: Amount column only; Fees as UI `Bank Fee`; never Fee+Amount net | Match statement; avoid confusion | Agreed |
| 2026-07-31 | Capitec fee-only (Monthly Service Fee): amount R0 + fee; fee siblings → Bank Charges | Capture all lines; ledger fees correctly | Agreed |
| 2026-07-31 | Nedbank: dual-column Fees+Debit → Bank Fee; `*` alone → normal debit; keep R0.00 lines | Match statement | Agreed |
| 2026-07-31 | Backend default **no file-watch reload** (`LEDGERFLOW_RELOAD=1` to enable) | Dual reload parents caused 0-tx imports | Agreed |
| 2026-07-31 | Wipe transactions also clears month expand/collapse localStorage for wiped period | Consistency after re-import | Agreed |
| 2026-07-31 | **Next phase**: (1) Capture Discovery data → (2) calibrate Reporting → (3) bulk Capitec/Nedbank later | Reporting needs real numbers | Agreed |
| 2026-08-04 | **Distribution targets: (A) installable PC app + (B) installable mobile app** — not public multi-tenant SaaS first | Data stays on-device; testers install; privacy | Agreed (direction) |
| 2026-08-04 | **PC app** packages current stack (UI + local API + SQLite on disk) as a real installer | Reuse Next/FastAPI; file on user’s machine | Agreed (direction) |
| 2026-08-04 | **Trial Option C**: after 30 days, view books OK; block writes/exports until license key | Fair trial without hard wipe | Agreed · v1.3 |
| 2026-08-04 | **Primary workspace** = app login only; **extra profiles** set workspace username+password at create; switch = full-app gate | Multi-client aides; no separate “lock form” on My Profile | Agreed · v1.3 |
| 2026-08-04 | Settings hub = five tiles (Profile, Bank, Ledgers, Rules, Preferences); hide rules maintenance | Cleaner setup surface | Agreed · v1.3 |
| 2026-08-04 | Dashboard monthly chart = **same** Reporting `MonthlyComparisonChart` component | One source of truth; not a fork | Agreed · v1.3 |
| 2026-08-04 | Returning login: username+password only (no register tabs); register via first-time setup | Less confusion for existing users | Agreed · v1.3 |
| 2026-08-04 | **Mobile**: Android via **APK** first; iOS is a separate store build (not APK) | APK ≠ all phones | Agreed (direction) |
| 2026-08-04 | Core product logic stays one backend family; shells wrap it (desktop / mobile) | Avoid two unrelated codebases | Agreed (direction) |

---

## Open (need owner choice later)

| Topic | Options | Lean |
|-------|---------|------|
| Desktop shell | Tauri 2 (lighter) vs Electron (heavier) | **Tauri 2 + Python sidecar** lean |
| Mobile architecture | Full local Python on device vs lighter local engine vs companion-to-PC | TBD after PC shell works |
| Login multi-user cloud | Local open app vs real accounts | Local open for now; cloud not primary |
| Opening/Closing balance lines | Exclude always vs store as markers | Exclude from P&L (done for parsers) |
| PII defaults | Store account number in DB or never | Default **No** / don’t store |
| Profile per | Bank brand vs bank+account | Brand first; refine later |
| Queue storage | In-memory jobs vs DB table | In-memory OK; DB table if crash recovery needed |
| Capitec / Nedbank bulk bar | Same “1000+ verified” as FNB | Run bulk import when ready |

When an open item is decided, move it to **Agreed** and update USER_FLOW / TODO.
