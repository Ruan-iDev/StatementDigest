# File tree — what does what

**Last updated:** 2026-09-02 · app v2.1.0 (reserved local ports 3470 / 8470)  

Only project-owned paths (not `node_modules` / `.venv` contents).

```text
App - LedgerFlow/
│
├── README.md                 # Quick start (run backend + frontend)
├── package.json              # Root: npm run dev starts full stack
├── devlog.md                 # Daily living log + next phase
├── docker-compose.yml        # Optional container run
├── docs/                     # ★ Product + engineering source of truth
│   ├── README.md             # Index of docs
│   ├── WHAT_IS_THIS_APP.md   # Vision, audience, pillars
│   ├── USER_FLOW.md          # Step-by-step UX
│   ├── PARSING_AND_PROFILES.md  # How statements are understood
│   ├── PARSER_STABILITY.md   # Locked bank islands + verification
│   ├── FILE_TREE.md          # This file
│   ├── TODO.md               # Living backlog + next phase
│   ├── DECISIONS.md          # Agreed decisions log
│   ├── CABINET_FLOW.md       # Living Cabinet Flow brief (2026-09-30, no code)
│   ├── AIBrainSelfTrain.md
│   └── DISCLAIMER_AND_LIABILITY.md
│
├── backend/                  # FastAPI API + parsing + DB access
│   ├── run.py                # uvicorn :8470 (reload via LEDGERFLOW_RELOAD=1)
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── smoke_test.py
│   ├── tests/
│   │   └── test_parser_regression.py  # Golden locked-bank contracts
│   └── app/
│       ├── main.py           # App factory, CORS, core routers, mount_modules()
│       ├── config.py         # Paths, settings
│       ├── database.py       # SQLAlchemy engine / session (+ module model import)
│       ├── models.py         # Core only: Profiles, BankProfile, Ledger, Transaction, …
│       ├── modules/          # Bolt-on products (see docs/MODULES.md)
│       │   ├── registry.py   # Discover, import models, mount routers
│       │   └── practice/     # Clients, suppliers, staff, products, project files, paper trail
│       ├── schemas.py
│       ├── seed.py           # Starter ledgers (incl. Bank Charges & Fees)
│       ├── security.py / guest_sessions.py / deps.py
│       ├── api/
│       │   ├── auth.py
│       │   ├── bank_profiles.py  # CRUD + dissect + preview + Update
│       │   ├── imports.py        # Upload → parse → Capitec fee assign → rules
│       │   ├── transactions.py   # List/allocate/wipe/train
│       │   ├── ledgers.py
│       │   ├── rules.py
│       │   ├── reports.py
│       │   ├── profiles.py
│       │   ├── settings.py
│       │   └── disclaimers.py
│       └── services/
│           ├── money.py
│           ├── rules_engine.py
│           ├── reports.py
│           ├── pdf_report.py / letterhead.py
│           ├── training.py
│           ├── capitec_fees.py    # Capitec fee → Bank Charges siblings
│           └── parsers/
│               ├── base.py           # Route PDF/CSV to bank islands
│               ├── detect.py         # Wizard auto-dissect
│               ├── discovery_pdf.py  # LOCKED Discovery Personal
│               ├── fnb_pdf.py        # LOCKED FNB Gold Business
│               ├── capitec_pdf.py    # LOCKED Capitec Business
│               └── nedbank_pdf.py    # LOCKED Nedbank Personal
│
├── frontend/                 # Next.js UI
│   ├── package.json
│   ├── app/
│   │   ├── layout.tsx        # Shell + sidebar + footer
│   │   ├── page.tsx          # Dashboard
│   │   ├── globals.css
│   │   ├── upload/           # Queue + disclaimer + bank profile select
│   │   ├── pending/          # Transactions (Unallocated | Allocated)
│   │   ├── reports/          # Hub + [type] detail
│   │   ├── settings/
│   │   ├── bank-profiles/
│   │   ├── ledgers/
│   │   ├── rules/
│   │   ├── profiles/
│   │   ├── terms/
│   │   └── practice/         # Thin routes only — UI lives in modules/practice
│   ├── modules/
│   │   ├── registry.ts       # Enabled modules → sidebar + dashboard
│   │   └── practice/         # Practice hub, libraries, project file
│   ├── components/
│   │   ├── sidebar.tsx
│   │   ├── bank-profile-wizard.tsx
│   │   ├── upload-queue-provider.tsx
│   │   ├── upload-progress-toast.tsx
│   │   ├── wipe-transactions-modal.tsx
│   │   ├── monthly-comparison-chart.tsx
│   │   ├── report-detail-view.tsx
│   │   ├── auth-*.tsx / guest-banner / password-strength-meter
│   │   └── ui/
│   └── lib/
│       ├── api.ts
│       ├── utils.ts
│       ├── currencies.ts
│       └── reports-meta.ts
│
├── data/                     # Local-only (do not commit secrets)
│   ├── ledgerflow.db
│   ├── uploads/
│   └── logos/
│
├── samples/
│   └── fnb_sample.csv
│
├── scripts/
│   ├── start-dev.ps1       # one-command: API + UI (npm run dev)
│   ├── start-backend.ps1
│   └── start-frontend.ps1
│
└── LICENSE                   # MIT
```


## Responsibility map

| User-facing feature | Frontend | Backend |
|---------------------|----------|---------|
| Auth / guest | `auth-*`, `password-strength-meter` | `api/auth.py` |
| Dashboard | `app/page.tsx` | `GET /api/dashboard` |
| Bank profile wizard / Update | `bank-profile-wizard.tsx` | `bank_profiles` + dissect |
| Upload + queue | `app/upload/`, queue provider | `imports` + disclaimer |
| Transactions | `app/pending/` | `transactions` (+ wipe clears collapse prefs) |
| Rules | `app/rules/` | `rules` + `rules_engine` |
| P&L + monthly chart | `app/reports/`, chart component | `reports` + `pdf_report` |
| Settings / profiles | `app/settings/`, `app/profiles/` | `settings`, `profiles` |

## Ports

Hardcoded for this app so they do not collide with Next `:3000` or uvicorn `:8000`.

| Service | URL |
|---------|-----|
| UI | http://localhost:3470 |
| API | http://127.0.0.1:8470 |
| API docs | http://127.0.0.1:8470/docs |

**Never** open `:8470/` expecting the app UI — that is API only.

## Parser islands (do not cross-taint)

See [PARSER_STABILITY.md](./PARSER_STABILITY.md).

| Module | Bank | Verification |
|--------|------|----------------|
| `discovery_pdf.py` | Discovery Personal | 226 · 100% |
| `fnb_pdf.py` | FNB Gold Business | 1000+ · 100% |
| `capitec_pdf.py` | Capitec Business | Sample locked; bulk TBD |
| `nedbank_pdf.py` | Nedbank Personal | Sample locked; bulk TBD |
