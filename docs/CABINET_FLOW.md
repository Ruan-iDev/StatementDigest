# Cabinet Flow — living brief

**Last updated:** 2026-10-02  
**Status:** Production desk is open. Clients, projects, and the products catalogue are shared with Work Flow. Jobcards are open. Cabinets is still coming soon.  
**Resume here** if a session drops. Then [MODULES.md](./MODULES.md) and [TODO.md](./TODO.md) Next phase §5.

This file is the source of truth for *what Cabinet Flow is*. It is not a build plan with tasks checked off in code.

---

## One sentence

Cabinet Flow is the **production desk**. Work Flow (WF) is the financial company and project desk. Ledger Flow (LF) is the books. They share one login, one SQLite file, and one EXE.

## Shape agreed 2026-10-02

Say **WF**, **CF**, and **LF** for the three modules.

| Desk | Job |
|------|-----|
| **WF** | Financial company and project management: clients, suppliers, staff, quotes, invoices, reports, and the money on a project file |
| **CF** | Company and project **production**: the job library, and later the jobcard |
| **LF** | Bank statements and ledgers |

**Dashboard.** Button order is Clients, Jobcards, Projects, Cabinets, Products. Clients and projects are the same records as WF. Jobcards lists every jobcard in number order, JC-001 then JC-002. The same order is in the sidebar.

**Products.** One catalogue. WF → Products and CF → Products open the same list. Families:

| Family | What it is |
|--------|------------|
| Timber Products | Optimisable boards and solid timber — melamine, veneer, solid wood. Also stores max length, max width, and thickness (mm), plus a supplier code and a stock code |
| Square Meter Products | Sold by area — granite, glass, paint, vinyl. Same sheet fields as timber: max length, max width, thickness (mm), supplier code, and stock code |
| Linear Meter Products | Sold by length. Same fields as timber: max length, max width, thickness (mm), supplier code, and stock code |
| Quantitative Products | Counted items. Everything that was already in the catalogue. Same fields as timber: max length, max width, thickness (mm), supplier code, and stock code |
| Labour | Kept off the counted list. Supplier code and stock code are separate. No max length, max width, or thickness |

Timber, square metre, linear metre, and quantitative products store max length, max width, thickness, a supplier code, and a stock code. Labour stores the supplier code and the stock code only. The product card shows a size when the product has one, then the supplier code and the stock code.

**Price switch.** Timber and square metre products choose Price per whole or Price per square meter. Linear products choose Price per unit or Price per meter. The retail figure is that rate. Switching leaves the number as typed. Existing timber is per whole, existing square metre products are per square metre, and existing linear products are per metre. Quantitative and labour stay a count times retail. On a jobcard, per square metre needs length and width, and per metre needs length. Whole and unit price how many, and a size can still be written down. A length past the max length, or a width past the max width, cannot be added. A blank maximum means that side has no limit. Paint can be stored as 1000 × 1000. A granite slab can be stored as its real size, for example 3000 × 2500. A quantitative line asks for how many, so the sizes stay on the product.

**Cutting labour.** When Cut and Edge is on, a timber, square metre, or quantitative product can link labour with Add labour. Each link has a quantity per sheet. Adding that product to a jobcard also adds the labour as a child line. Pieces of the same product are placed on its max length × max width. Ten different sizes that fit on one sheet add the labour once. A second sheet adds it again, so the labour quantity is the per-sheet quantity times the sheets used. With no sheet size, each piece counts as its own sheet. This placement has no blade kerf yet. The labour line can be dragged with the other lines, and Save keeps that order. Deleting the labour line leaves it off until the number of pieces of that product changes. Edging as its own child line is still to come.

**Default markups.** Above each family button is that family’s default markup. A product with a blank markup uses it, and its retail follows the cost. A markup typed on the product overrides the default. Clearing that field returns the product to the family default. Products that already have their own markup keep it.

**Clients.** CF → client opens a **job library** (current and previous). Each jobcard shows the created date and the last edited date on the left. The job total, then Duplicate, Edit, and Delete, sit snapped on the right. Duplicate copies the jobcard, its lines, and its total under a new JC number. Delete removes it. A job can be assigned to a project. The client card itself is the WF client.

**Projects.** CF → project is the same folder as WF. The CF view shows **only jobcards assigned to that project**. When the folder has a client, **Add jobcards** lists that client’s jobcards. Several can be ticked and added. A jobcard already on another project moves here. Remove takes it off the project and leaves it on the client. The financial file stays in WF.

**New jobcard.** CF → client → New jobcard opens the jobcard. The system number is `JC-001` and counts up. The client name sits under it; the three-dot menu moves the jobcard to another client. Job reference is the user’s own reference. Under that reference, **Products** and **Pricing** switch the stages. **Optimization** appears under Pricing when cut-and-edge pieces are placed on sheets. With no sheets to place, that button stays hidden. Opening it lists each of those products, how many sheets it uses, and the pieces on those sheets. Save, Save and Close, and Close sit under that. Add, on Products, opens the product families, then that family’s library grouped by the product’s group. A group is set on the product. A name that is not on the list offers **Create group**. Choosing a product asks how many, and for size when the family uses it. The Products list shows quantity, name, and dimensions. The price is on Pricing.

**Pricing.** Products is the basket. Pricing is where the job is priced, and that total is the job total on the client file and the jobcard list. Cut and edge timber, square metre, and quantitative products are placed on the product’s max sheet and charged as the number of sheets times the sheet value. Price per whole uses the retail price as the sheet value. Price per square metre uses the full sheet area times the m² rate. With no sheet size, each piece is its own sheet. Square metre products that are not cut and edge are added together into one area. Linear products of the same kind are added together into one length, or one count when priced per unit. Other products are added together by quantity. Cutting labour stays its own line. This sheet count has no blade kerf yet.

**Cabinets.** Third CF dashboard button, and a sidebar item. This is where default cabinets are constructed for the system and for quoting. The page is **Coming soon** until that constructor is briefed.

## Jobcard production brief (2026-10-02)

Ruan described the next jobcard in one pass and asked for it to be split into departments, with this file as the place to come back to. Do not paste the iDev-ERP optimizer. `Services/OptimizationEngine.ts` talks to Supabase and the iDev job shape. The packer to port later is `Services/nestEngine.ts`, with the nest rules in `Services/optimizationNestPolicy.ts`. Blade kerf, board trim, and grain stay in iDev construction standards until that port.

**Department 1 — Print and the Cut and Edge tick. Built 2026-10-02.**
The jobcard ribbon has Print. Quote is listed and will use the Work Flow default quote template once the optimizer can run. Jobcard prints the lines on screen. Cutting list is Coming soon. Every product, in all five families, has a Cut and Edge tick. It is off by default. Off means the jobcard adds the product as defined and the optimizer skips it. On means a later add step asks for the component size, and only those products are nested.

**Department 2 — Adding a cut part, and edging as a child. Cutting labour is built. Edging is not.**
When Cut and Edge is ticked, Add asks for quantity and the component length and width. Timber, square metre, and quantitative products can link labour on the product. The jobcard adds that labour once per sheet those pieces use. A timber part will also ask whether to edge the length and the width, on both sides or on one side only. Ticking an edge opens the linear metre products so one can be chosen. The edging length is added automatically as a child line of that part. Unticked products stay a single line and are not nested.

**Department 3 — Parts on the jobcard. Built 2026-10-02. Double-click edit is still to come.**
Each line has a handle. Drag the handle to arrange the lines. Tick a box, or drag a rectangle across the lines, to select them. The selection shows Duplicate selected, Delete selected, and Group selected. Every delete asks “Are you sure”.

**Department 4 — Groups. Built 2026-10-02.**
Group selected asks for a name. The group collapses and expands, and the handle on the group moves every line in it. Selecting a group and grouping again nests the old group inside the new one. A group can be duplicated or deleted. Delete asks “Are you sure”. The order and the groups stay after Save.

**Department 5 — Built-in optimizer, then the quote. Pricing uses the sheet count. The drawn nest is not built.**
The Pricing page places Cut and Edge parts with the current sheet count and charges sheets times the sheet value. The jobcard shows an **Optimization** button under Pricing when that placement produces sheets. The page lists those products, the sheet count, and the pieces. A cut-and-edge square-metre product with no sheet size is priced as cut area, so it does not show the button. The drawn nest from `Services/nestEngine.ts` is still to be ported. Do not paste `Services/OptimizationEngine.ts`. The Quote print will use the Work Flow default quote template once that nest can be drawn. The cutting list stays Coming soon. Cabinets remain Coming soon.

Built 2026-10-02: CF nav, dashboard (clients, projects, cabinets, products), shared client list, job library, jobcard, shared project folders, adding a client’s jobcards onto a project, shared product families, timber sheet size and codes. Not built: cabinet constructor, nesting, saw files.

---

## What was agreed (2026-09-30)

The owner asked whether the separate ERP could be built into Cabinet Flow. The agreed reading:

1. **iDev-ERP is the reference**, not the code we paste in. We keep its product knowledge (screens, flows, shop rules) and design a similar system that belongs in this app.
2. **Cabinet Flow is that new system.** Ledger Flow and Work Flow stay as they are.
3. **No coding** until the owner names a slice. Do not add `cabinet_*` tables, do not register a backend module, do not replace the coming-soon hub.
4. The system **lives inside this app** (local machine, same database, same EXE). It does not keep iDev-ERP’s cloud database or its multi-user live editing.

---

## Reference product (do not import it)

| | |
|--|--|
| **Name** | iDev-ERP (`package.json` name `mycuttinglist-app`, version **4.4.29** on 2026-09-30) |
| **On this PC** | `C:\Users\Ruan Farquhar\OneDrive\PersoanL Files\Documents\GitHub\iDev-ERP` |
| **GitHub** | Same account as this app (`Ruan-iDev`). On 2026-09-30 the public repo list showed **StatementDigest** only. Treat iDev-ERP as the local repo above. |
| **Stack there** | Vite + React, Supabase (cloud Postgres), realtime document locks, multi-tenant workspaces and roles |
| **Stack here** | Electron portable EXE, Next.js static UI, FastAPI, local SQLite |

Read these files in the ERP repo when a slice needs the real shop behaviour. Do not copy secrets, `.env`, or customer exports into this repo.

| ERP file | What it holds |
|----------|----------------|
| `APPLICATION_BLUEPRINT.md` | Screen map: quotes, factory, materials, library |
| `README.md` | Hub navigation (Quotes, Factory, Materials, Management) |
| `CONSTRUCTOR.md` | Parametric assemblies, finishes, doors |
| `PROCESS_FLOW.md` | Quote → order → factory |
| `DATABASE_BLUEPRINT.md` | Supabase tables (reference only — Cabinet Flow gets its own `cabinet_*` tables) |
| `ENGINE_CONTRACT.md` | Pricing / expand pipeline contract |
| `Services/constructorResolve.ts`, `doorResolve.ts`, `exportOptiPlanCSV.ts`, `OptimizationEngine.ts` | Constructor, doors, saw files, nesting |

iDev-ERP **keeps running** for live workshops until a LedgerFlow slice is good enough to switch. Moving old Supabase jobs into this app is a separate decision (see Open below).

---

## What the cabinet shop actually does

This is the behaviour Cabinet Flow is meant to grow into. Wording follows the ERP blueprint (July–September 2026).

**Quotes.** A quotation screen whose lines are a cutting list (panels, edging, hardware, doors, labour), not a plain price list. Save the job, then order it. VAT comes from one workshop setting. A refresh calculates price; editing the list marks the price dirty until refresh.

**Library and constructor.** Reusable cabinet units. An assembly is a recipe of parts and formulas. A library unit points at an assembly. Adding a unit expands into boards, hardware, tops, stone, glass, and labour. Finishes are chosen globally, with per-line exceptions. Doors hang off the carcass (nested assembly); melamine doors nest as boards, other door types price by area.

**Materials.** Stock libraries the shop maintains: boards, edging, hardware, doors, stone, tops, glass, labour. Excel in and out.

**Nest and saw.** Parts are laid on sheets. The nest feeds the quote (sheet count and cutting fee). Export talks to the machines the shop already uses: **MaxCut** CSV and **OptiPlan** CSV (column layout, drilling notes, and “Input Panel” rows matter — see ERP `Services/exportOptiPlanCSV.ts` and `Schema Layout Info Files/`). Parts that do not fit a sheet block order and export.

**Factory.** Ordered quotes become factory jobs: new, in progress, completed, archive, deliveries, job cards. Factory status is separate from the sales quote.

**People and money, in the ERP today.** Clients, invoices, staff, contractors, and roles (consultant vs factory vs admin), with two people able to lock the same quote. That collaboration model stays in iDev-ERP. It is not part of this local module.

---

## How it sits in LedgerFlow

Three modules, one app:

| Module | Owns |
|--------|------|
| **Ledger Flow** | Bank statements, transactions, ledgers, rules, profit and loss |
| **Work Flow** | Clients, suppliers, staff, a simple products catalogue, quotes, invoices, RFQs, project files and costing |
| **Cabinet Flow** | The cabinet shop: materials, unit library, constructor, cutting-list jobs, nest, saw files, factory board |

Plug-in rules (same as Work Flow, from [MODULES.md](./MODULES.md)):

- `backend/app/modules/cabinet/` and `frontend/modules/cabinet/`
- Tables prefixed `cabinet_`, every row has `user_profile_id`
- Thin pages under `frontend/app/cabinet/`
- Same session, same `X-Profile-Id`, same trial gate, same SQLite file
- Settings → Modules On/Off when the first real slice ships
- No second login, no second database, no Supabase client inside the EXE

**Already on screen:** sidebar tile and `/cabinet` coming-soon hub (`frontend/app/cabinet/page.tsx`, `CABINET_FLOW` in `frontend/modules/registry.ts`). Leave that hub until a slice is requested.

### Overlap with Work Flow (not locked)

Work Flow already has clients, products, quotes, and invoices. Those documents are simple lines (description, qty, price). A cabinet quote is a cutting list plus a constructor. The lean, written here so it is not forgotten:

- Cabinet Flow owns the **shop engine** (library, constructor, cut list, nest, factory, saw export).
- Clients and money **link** to Work Flow and Ledger Flow where a record already exists (a cabinet job can point at a client; a finished invoice can post to an income ledger the way Work Flow already does).
- Do not build a third copy of “a client” or “a tax invoice” until the owner says the cabinet quote must be its own document from the first screen.

This lean is **not** a locked decision. See Open.

---

## Suggested order when building starts

Each line is a later slice. None of them are started.

1. Materials libraries and the unit library (no pricing engine yet)
2. Constructor expand onto a cutting list
3. Quotation screen and price refresh
4. Nest, then MaxCut / OptiPlan export
5. Factory board (status only once a quote can be ordered)
6. Links into Work Flow clients and Ledger Flow income

---

## Open (owner has not picked)

| Topic | Lean written 2026-09-30 |
|-------|-------------------------|
| Cabinet quote vs Work Flow quote | Shop engine in Cabinet Flow; link clients and posted money to the modules that already have them |
| Supabase history | Leave live jobs in iDev-ERP until a slice here replaces that screen. No import of old jobs until asked |
| Several people editing one job live | Out of this module. This app is one machine. Cloud roles would be a different product |
| Settings On/Off switch | Add with the first slice that has real screens, not before |

---

## Do not

- Paste the Vite app into `frontend/` or point the EXE at Supabase
- Merge the iDev-ERP git history into this repo
- Scaffold `cabinet_*` tables or a backend router before the owner names a slice
- Open locked bank parsers because Cabinet Flow needs something
- Copy `.env`, passcodes, or customer cutting lists from the ERP folder into this repo
