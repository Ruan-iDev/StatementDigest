# Modules — how LedgerFlow grows without rewriting the core

**Last updated:** 2026-09-16 · main · Work Flow in the EXE; **Cabinet Flow** named, not built

This is the map for adding **Work Flow** (Practice: clients, suppliers, staff, products, quotes, invoices, RFQs, project files) and any later bolt-on. Read this before editing module code.

**Named, not started:** **Cabinet Flow** — next bolt-on. Brief still to come; do not scaffold until [TODO.md](./TODO.md) Next phase §5 has the spec.

---

## Two kinds of isolation (easy to mix up)

| What | What it isolates | When you use it |
|------|------------------|-----------------|
| **Git branch** | Unfinished *work* | Build Practice here so the shipping EXE on `Develop---EXE-Build` stays safe |
| **Code module** | Feature *ownership* | Clients / invoices live in `modules/practice`, not in `app/models.py` |

You need **both**.

- A branch alone still dumps invoices into the statement app.
- A module folder on the shipping branch still ships half-built UI if you merge too early.

They are **not** two apps. One login, one SQLite file, one portable EXE. When you cut a release, **core + every enabled module** ship together. That is what “when I update, cores and modules are affected” means.

This is a **modular monolith**, not a plugin store and not microservices.

---

## Git workflow (do this every session)

```text
main
 └── Develop---EXE-Build          ← shipping / EXE-safe core
      └── feature/practice-module ← you are here
```

### Daily work
1. `git checkout feature/practice-module`
2. Build Practice (and only Practice) in `backend/app/modules/practice` and `frontend/modules/practice`
3. Leave parsers, ledgers, rules, and reporting alone unless you are fixing a **shared** hook

### Core EXE bug while Practice is in flight
1. `git checkout Develop---EXE-Build`
2. Fix and commit there
3. `git checkout feature/practice-module`
4. `git merge Develop---EXE-Build`  
   Practice picks up the core fix. Do **not** copy-paste the fix onto the module branch.

### Practice is ready to ship
1. Merge `feature/practice-module` → `Develop---EXE-Build`
2. Cut the portable EXE as usual (`docs/DESKTOP_BUILD.md`)
3. Testers get **one** installer: statements + Practice

Never develop Practice on `Develop---EXE-Build`. That branch is the last known good EXE.

---

## What is core vs Practice

**Core stays:** login, guest, license/trial, workspaces (profiles), statement upload, bank parsers, transactions, ledgers, rules, reporting, settings, theme, sidebar chrome.

**Practice owns:** clients (debtors), suppliers (creditors), staff, products, quotes, invoices, project files, the dated paper trail.

Practice **uses** core: same session token, same `X-Profile-Id`, same trial read-only gate, same SQLite file. It does **not** fork auth or invent a second database.

---

## Folder map

```text
backend/app/modules/
  registry.py                 # discover, import models, mount routers
  practice/
    manifest.py               # id, name, version, how to mount
    models.py                 # practice_* tables only
    schemas.py
    api.py                    # /api/practice/...

frontend/modules/
  registry.ts                 # enabled modules → nav + dashboard tiles
  practice/
    manifest.ts
    lib/api.ts                # calls core apiRequest (shared auth headers)
    lib/types.ts
    pages/                    # real UI

frontend/app/practice/        # thin Next.js routes only (needed for static EXE export)
  page.tsx                    # imports PracticeHubPage
  clients/  suppliers/  staff/  products/  projects/  file/  quotes/  invoices/
```

Core touch points (keep these tiny):

| File | Why the core must know |
|------|------------------------|
| `backend/app/main.py` | `mount_modules(app)` + `GET /api/modules` |
| `backend/app/database.py` | `import_module_models()` so `create_all` sees Practice tables |
| `frontend/components/sidebar.tsx` | appends `moduleNavItems()` |
| `frontend/app/page.tsx` | renders `ENABLED_MODULES` hub tiles |
| `frontend/lib/api.ts` | exports `apiRequest` so modules do not copy auth headers |

If a change is not in the list above and is not inside `modules/`, ask whether it belongs in core.

---

## How a module plugs in

1. Package under `backend/app/modules/<id>/` with a `MANIFEST`.
2. Add the id to `ENABLED_MODULE_IDS` in `registry.py`.
3. Frontend manifest in `frontend/modules/<id>/manifest.ts`.
4. Add that manifest to `ENABLED_MODULES` in `frontend/modules/registry.ts`.
5. Thin pages under `frontend/app/<id>/` that only re-export module pages.

Disable a module without deleting it: remove the id from both registries.

---

## Cabinet Flow (planned)

**Status:** name only (2026-09-13). Product owner will explain later.

Same plug-in rules as Work Flow when it starts:

- Package `backend/app/modules/cabinet/` + `frontend/modules/cabinet/`
- Own `cabinet_*` tables, `user_profile_id` on every row
- Register in both `ENABLED_MODULE_IDS` / `ENABLED_MODULES`
- Thin routes under `frontend/app/cabinet/`
- Settings → Modules On/Off
- Does not fork auth or a second database

Until the brief lands: sidebar tile + `/cabinet` coming-soon hub only. No `cabinet_*` tables and no Settings switch.

---

## Practice product shape (agreed direction)

You asked for a CRM. The useful name here is **project file**, not a sales CRM.

```text
Clients library     Suppliers library
        \                 /
         \               /
          Project file  ← you open this
          ├─ Info sheet (name, client, status, dates, notes)
          └─ Paper trail (newest first)
                + Add → Note (ready)
                       → Quote (next)
                       → Invoice (next)
                       → File (next)
```

Every `+ Add` is a row in `practice_entries` with a timestamp. Status changes also write a trail row. That is the “when was what done” record.

Quotes and invoices will be first-class documents later, and **also** appear as trail entries on the project they belong to.

Tables (created on next API start, prefixed so they never clash with core):

| Table | Role |
|-------|------|
| `practice_parties` | Clients and suppliers (`kind` = `client` \| `supplier`) |
| `practice_staff` | People you pay on jobs |
| `practice_stock_items` | Products library (name, description, category, supplier code, cost, markup %, retail) — goods, labour, other |
| `practice_projects` | The file / job |
| `practice_entries` | Dated paper trail |

All rows carry `user_profile_id`. Workspaces never mix Practice data, same as they never mix transactions.

---

## What is already working on this branch

- Module registry (backend + frontend)
- **Settings → Modules** — independent On/Off for Quotes, Invoices, Projects
- Practice hub in the dashboard and sidebar (tiles hide when their switch is off)
- Clients / suppliers libraries
- Staff library
- **Products library** — name, description, category (typed, grouped), supplier stock code, cost, markup %, retail; type-to-pick on quote/invoice lines (goods, labour, other)
- Projects library + project file
- **+ Add** on a project: Notes / Quote / Invoice / Expense
- Quotes and invoices as standalone libraries (optional project attach)
- **Create invoice from quote** (needs both switches on)
- Invoice → core **income** ledger; expense → core **expense** ledger
- **Pull statement** on a project file (notes, quotes, invoices, running costs)
- Theme packs: Settings → Appearance (`docs/THEME.md`)

Not built yet: attachments, matching an invoice to a bank transaction, product qty-on-hand.

---

## Rules so core stays safe

1. Do not add Practice columns to `transactions`, `ledgers`, or `user_profiles`.
2. Do not import Practice models from `app.models`.
3. Do not put Practice routes in `backend/app/api/`.
4. Do not put Practice UI in `frontend/components/` except shared primitives already there (Button, Card, Modal).
5. When Practice needs something from core (auth, profile, money format), **import it** — do not copy it.
6. Locked bank parsers stay locked. Practice is not a reason to open them.

---

## Next slices (when we continue)

1. Quote document + trail entry
2. Invoice document + trail entry
3. Attach files to a project
4. Optional later: match a paid invoice to a statement transaction (a **link**, not a merge of the two products)
