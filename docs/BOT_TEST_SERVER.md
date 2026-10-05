# Bot test server (isolated parser-accuracy workspace)

**Purpose:** let bots / agents import real statements and run accuracy work
without ever touching the user's real LedgerFlow data
(`Documents/LedgerFlow/Data` on Windows, API on `:8470`, UI on `:3470`).

## Hard rules

- Always set `LEDGERFLOW_DATA` to a separate folder. Bot default:
  `/workspace/ledgerflow-bot-data`. Never point it at `Documents/LedgerFlow`.
- Always use a port other than `8470` for the API (bot default **8471**) and
  other than `3470` for the UI (bot default **3471**).
- Real statements (`samples/bot-corpus/`) are personal data: gitignored, never
  committed or pushed. Commit code, tests and docs only.
- `backend/tests/conftest.py` points pytest at a throwaway temp data dir when
  `LEDGERFLOW_DATA` is unset, so tests cannot create or modify the Documents DB.

## Start the API

```bash
scripts/start-bot-test-server.sh
# same as:
cd backend
LEDGERFLOW_DATA=/workspace/ledgerflow-bot-data LEDGERFLOW_PORT=8471 \
LEDGERFLOW_CORS_ORIGINS='["http://localhost:3471","http://127.0.0.1:3471"]' \
  .venv/bin/python run.py
```

The script refuses to start if `LEDGERFLOW_DATA` contains `Documents/LedgerFlow`
or the port is `8470`.

Windows (PowerShell) equivalent:

```powershell
$env:LEDGERFLOW_DATA = "$env:TEMP\ledgerflow-bot-data"
$env:LEDGERFLOW_PORT = "8471"
$env:LEDGERFLOW_CORS_ORIGINS = '["http://localhost:3471","http://127.0.0.1:3471"]'
cd backend; .\.venv\Scripts\python.exe run.py
```

## Point the frontend at it

The UI reads `NEXT_PUBLIC_API_URL` (`frontend/lib/api.ts`):

```bash
cd frontend
NEXT_PUBLIC_API_URL=http://127.0.0.1:8471/api npx next dev -p 3471
```

Open http://127.0.0.1:3471. The API must allow that origin
(`LEDGERFLOW_CORS_ORIGINS`, set by the script above).

## Docker

`docker-compose.bot.yml` runs backend `:8471` + frontend `:3471` with a
separate named volume `ledgerflow-bot-data` (not `./data`), and mounts
`samples/bot-corpus/` read-only at `/corpus`:

```bash
docker compose -f docker-compose.bot.yml -p ledgerflow-bot up
```

## Bot workspace / profile

On a fresh bot data dir:

1. `POST /api/auth/register` — local bot account (credentials kept only in
   `$LEDGERFLOW_DATA/BOT_CREDENTIALS.txt`, chmod 600, never committed).
2. `POST /api/profiles` with `{"name": "Bot Test – Parser Accuracy"}`.
3. Accept the upload disclaimer for that profile
   (`POST /api/disclaimers/upload/accept`), then create bank profiles via
   `/api/bank-profiles/dissect` + `POST /api/bank-profiles` and import with
   `POST /api/imports/upload` (header `X-Profile-Id: <id>`).

Created 2026-10-05: profile **"Bot Test – Parser Accuracy"**, id **2**,
public id `LF-FF703F07-A402452D`, data `/workspace/ledgerflow-bot-data/ledgerflow.db`.

## Reconciliation harness

```bash
cd backend
python reconcile_corpus.py              # all banks, summary per product
python reconcile_corpus.py --bank fnb -v
python -m pytest tests/test_corpus_reconcile.py -q   # one test per PDF; skips without corpus
```

For each PDF under `samples/bot-corpus/<bank>/` it parses with that bank's
island only (`discovery/` → `discovery_pdf`, `fnb/` → `fnb_pdf`), reads the
printed opening/closing balance and period, and checks:

- opening + sum(amounts) == closing (± R0.01)
- the running balance chain row by row (FNB prints balances)
- every transaction date falls inside the statement period (catches year bugs)

Mismatches are printed with the file path. Override the corpus location with
`--corpus` or `LEDGERFLOW_BOT_CORPUS`.
