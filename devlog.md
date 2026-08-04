# LedgerFlow — Development Log

Living document. Append **newest day at the top** under [Log](#log).  
Hours are **focused development time** for that calendar day (design + build + debug + verify), estimated from session work unless logged more precisely.

| Metric | Value |
|--------|------:|
| **Total hours (all days)** | **12.0** |
| **Days logged** | 1 |
| **Last updated** | 2026-07-31 (EOD) |

---

## How to maintain this file

1. At the **start** of a work day, add a new `### YYYY-MM-DD` section at the **top** of the Log.  
2. Bullet what landed (features, fixes, docs, parsers). Prefer plain language.  
3. At **end of day**, set `Hours: X.X` for that stamp and update the **Total hours** table above.  
4. Optional: note who worked (`Solo` / pair) and environment notes.  

---

## Log

### 2026-07-31

**Hours: 12.0** (end-of-day estimate for a long single session)  
**Who:** Solo  

#### Auth & shell
- Free passwords + classic strength meter (advisory only)  
- Guest login (ephemeral; nothing saved)  
- Post-login → Dashboard  
- Footer: powered by IdevConsulting (Pty) Ltd  
- Global currency dropdown; Individual/Business profiles; logo + reg/VAT letterhead  

#### Upload & transactions UX
- Multi-file upload queue; disclaimer gate  
- Queue scroll: top → mid-track → bottom (no jump thrash)  
- Transactions: Unallocated/Allocated; month groups; collapse prefs **cleared on wipe**  
- Capitec: `Bank Fee` under amount (meta row with Ref); never Fee+Amount net  
- Wipe year/month + clear expand/collapse memory for wiped period  

#### Parsers (four locked islands)
| Bank | Module | Status |
|------|--------|--------|
| Discovery Personal | `discovery_pdf.py` | ✅ Locked — **226 txs · 100%** human |
| FNB Gold Business | `fnb_pdf.py` | ✅ Locked — **1000+ txs · 100%** human |
| Capitec Business | `capitec_pdf.py` | ✅ Locked — sample edition-1; **bulk TBD** |
| Nedbank Personal | `nedbank_pdf.py` | ✅ Locked — sample edition-1; **bulk TBD** |

- Capitec: Amount only; fee-only R0 + fee; Bank Charges fee siblings; Monthly Service Fee kept  
- Nedbank: dual-column fee vs `*` debit; R0.00 description lines kept  
- Isolation docs: `docs/PARSER_STABILITY.md`  
- Backend: single process default (`LEDGERFLOW_RELOAD=1` for watch) — fixed dual-server 0-tx imports  
- Regression: 7 tests green  

#### Reporting (skeleton)
- Hub + detail routes; monthly FY chart; graph type memory  
- Chart Y-axis: Amount label left of currency ticks  
- **Not calibrated yet** — waiting on Discovery data capture  

#### Ops
- Full docs pass EOD: TODO, DECISIONS, FILE_TREE, PARSING, PARSER_STABILITY, README, this log  

---

### Next phase (do in order)

1. **Capture Discovery Personal data** — multi-statement import; confirm against PDFs  
2. **Reporting calibration** — only after data is in (charts, P&L, SA reports, budgets, PDF)  
3. **Later:** bulk Capitec Business + Nedbank Personal multi-statement accuracy  

---

## Running total by month

| Month | Hours |
|-------|------:|
| 2026-07 | 12.0 |
| **All time** | **12.0** |
