# LedgerFlow

**Local-first personal finance** — upload bank statements (PDF/CSV), categorise into ledgers, auto-strip with rules, and generate Profit & Loss reports with budgets and PDF export.

Everything runs on your machine. SQLite in `Documents/LedgerFlow/Data` by default. No cloud, no analytics, no paid APIs.

## Product documentation (keep updated)

When a chat or session drops, **continue from these files** — they are the source of truth for vision and backlog:

| Doc | What it is |
|-----|------------|
| [docs/README.md](docs/README.md) | Index |
| [docs/TODO.md](docs/TODO.md) | Living todo + **next phase** |
| [devlog.md](devlog.md) | Daily log + hours |
| [docs/PARSER_STABILITY.md](docs/PARSER_STABILITY.md) | Locked bank parsers (do not cross-taint) |
| [docs/WHAT_IS_THIS_APP.md](docs/WHAT_IS_THIS_APP.md) | What the app is about |
| [docs/USER_FLOW.md](docs/USER_FLOW.md) | Step-by-step user journey |
| [docs/PARSING_AND_PROFILES.md](docs/PARSING_AND_PROFILES.md) | How bank statements are read |
| [docs/FILE_TREE.md](docs/FILE_TREE.md) | What each file/folder does |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Agreed decisions log |

### Current release

**v2.1.3** portable Windows EXE (`desktop/dist/LedgerFlow-2.1.3-Portable.exe`) — see [docs/RELEASE_NOTES.md](docs/RELEASE_NOTES.md).

### Next phase (after v1.4.0)

1. **Capture Discovery Personal** multi-statement data  
2. **Calibrate Reporting** against that data  
3. Later: bulk Capitec + Nedbank accuracy; OTA channel; code signing  

### Parser islands (edition-1 locked)

| Bank | Module | Verification |
|------|--------|----------------|
| Discovery Personal | `discovery_pdf.py` | 226 · 100% |
| FNB Gold Business | `fnb_pdf.py` | 1000+ · 100% |
| Capitec Business | `capitec_pdf.py` | Sample locked; bulk TBD |
| Nedbank Personal | `nedbank_pdf.py` | Sample locked; bulk TBD |
| Bank Zero Check | `bank_zero_pdf.py` | Sample island (Jun/Jul 2026) |

## Stack

| Layer    | Tech |
|----------|------|
| Frontend | Next.js 14 (App Router) + TypeScript + Tailwind + shadcn-style UI |
| Backend  | Python 3.11+ · FastAPI · SQLAlchemy |
| Database | SQLite (`Documents/LedgerFlow/Data/ledgerflow.db` by default) |
| PDF      | ReportLab (Windows-friendly; WeasyPrint not required) |
| Parsers  | Isolated bank modules (Discovery / FNB / Capitec / Nedbank / Bank Zero) + pdfplumber |

## Project layout

```
├── backend/          # FastAPI app
│   ├── app/
│   │   ├── api/      # REST routes
│   │   ├── services/ # parsers, rules, reports, PDF
│   │   ├── models.py
│   │   ├── seed.py   # starter ledgers
│   │   └── main.py
│   ├── requirements.txt
│   └── run.py
├── frontend/         # Next.js UI
├── data/             # SQLite DB + uploads (local only)
├── samples/          # Sample FNB CSV for testing
├── scripts/          # start-backend.ps1 / start-frontend.ps1
└── docker-compose.yml
```

## Prerequisites

- **Python 3.11+** on PATH (`python --version`)
- **Node.js 18+** and npm
- Windows, macOS, or Linux

## Run locally (recommended)

From the **project root**, start **both** the API and the UI with one command:

```powershell
npm run dev
```

Or:

```powershell
.\scripts\start-dev.ps1
```

That opens two PowerShell windows (API + UI), waits until both are healthy, and opens the browser.

| Service | URL |
|---------|-----|
| UI | [http://localhost:3470](http://localhost:3470) |
| API | [http://127.0.0.1:8470](http://127.0.0.1:8470) |
| API docs | [http://127.0.0.1:8470/docs](http://127.0.0.1:8470/docs) |

On first backend start the DB is created and starter ledgers are seeded.

**Useful flags / scripts**

```powershell
npm run dev              # both services (default)
npm run dev:backend      # API only
npm run dev:frontend     # UI only
npm run dev:install      # force reinstall deps, then start both (no browser)
.\scripts\start-dev.ps1 -NoBrowser
.\scripts\start-dev.ps1 -Install
```

Close the **LedgerFlow API** / **LedgerFlow UI** windows (or Ctrl+C in each) to stop.

### Manual start (two terminals)

**Backend**

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python run.py
```

**Note:** `run.py` uses a **single process** by default (no file-watch reload). Dual reload parents on Windows previously caused empty statement imports. For auto-reload while coding: `$env:LEDGERFLOW_RELOAD=1; python run.py`.

**Frontend**

```powershell
cd frontend
npm install
npm run dev
```

Optional env (frontend):

```env
NEXT_PUBLIC_API_URL=http://127.0.0.1:8470/api
```

## Quick test path

1. Open **Bank Profiles** → bank type **FNB** → upload `samples/fnb_sample.csv` → **Preview parse** → name it e.g. `FNB Cheque` → **Save profile**.
2. **Upload** → select profile → upload the same sample CSV.
3. **Pending Queue** → assign ledgers, or select rows → **Create rule from selection** (live-strips matching pending txs).
4. **Reports** → P&L → **Export PDF**.

## Core behaviours

- **Live rule strip**: creating or editing a rule immediately applies it to all uncategorised transactions.
- **Zero-value ledgers** never appear in P&L or PDF.
- **Money** stored/calculated as `Decimal` (never float).
- **Audit**: raw description, source file, and `rule_id` when auto-applied.
- **Archive** ledgers instead of hard delete.

## API overview

| Area | Endpoints |
|------|-----------|
| Health | `GET /api/health` |
| Dashboard | `GET /api/dashboard` |
| Settings | `GET/PATCH /api/settings` |
| Ledgers | CRUD under `/api/ledgers` |
| Bank profiles | `/api/bank-profiles` + `POST .../preview` |
| Imports | `POST /api/imports/upload` |
| Transactions | `/api/transactions` (pending, bulk, create-rule) |
| Rules | `/api/rules` (+ apply-all) |
| Reports | `GET /api/reports/pl`, `GET /api/reports/pl/pdf` |

## Optional Docker

```powershell
docker compose up --build
```

Mounts `./data` for the SQLite file. Prefer native venv + npm on Windows for simpler PDF/parser deps.

## Future extension points

- Bulk accuracy pass: Capitec Business + Nedbank Personal multi-statement imports  
- Standard Bank / Absa parsers (**new modules only** — never edit locked islands)  
- Ledger hierarchy / tax report mapping  
- Local LLM-assisted categorisation  
- OCR for scanned PDF statements  

## License

MIT — see `LICENSE` in the project root.
