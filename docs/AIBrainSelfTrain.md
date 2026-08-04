# AIBrainSelfTrain — parser feedback loop

**Last updated:** 2026-07-31  
**Status:** v1 implemented (human-in-the-loop + exclusion + pattern memory)

---

## Field note — first Discovery audit (accuracy)

On a real multi-month Discovery import (~212 lines), **zero confirmed parser ghosts** were found.  
Two lines that *looked* wrong were **present on another month’s statement** (bank-side presentation / period boundary) — not invented by LedgerFlow.

**Implication for training:** do not mark “Ghost” until you have checked neighbouring statement periods.  
**Implication for stability:** protect the parser with golden regression tests — see [PARSER_STABILITY.md](./PARSER_STABILITY.md).

---

## Do you understand the phase correctly?

**Yes.** Your mental model is right:

1. Import can create **ghost** (or wrong) lines that are not real statement transactions.
2. A **developer training control** next to each transaction lets you flag mistakes.
3. You pick a **reason** (dropdown) or **Other** (becomes a new dropdown option next time).
4. For **Ghost transaction**, the line is **removed from normal lists** (politely excluded).
5. The system **remembers** so future imports can skip similar noise.
6. Over time the app **gets sharper** — not by magic, but by a feedback loop.

That is classic **human-in-the-loop self-training**. It is doable, and v1 is in the product.

---

## What “self-train” means here (honest scope)

| Capability | v1 (now) | Later |
|------------|----------|--------|
| Flag a bad line with a reason | ✅ | |
| Exclude ghosts from Unallocated / Allocated | ✅ | |
| Grow the reason dropdown from “Other” | ✅ | |
| Skip similar descriptions on **next import** | ✅ pattern memory | |
| Auto-rewrite the PDF/CSV parser code | ❌ not automatic | Heuristic patches from top patterns |
| Large language model that rewrites itself | ❌ out of scope for local app | Optional local LLM assist |
| Train a neural net on your PDFs | ❌ | Research / future |

So: **the app does train from your ticks**, but as a **rules + pattern memory system**, not as a science-fiction self-rewriting AI. That is the correct, shippable design for a local finance tool.

---

## User flow (developer train control)

```
Unallocated / Allocated list
  → each transaction has a DEV train control on the right (outside the card)
  → tick / open
  → choose reason (Ghost transaction ? · Footer noise · … · Other)
  → optional detail
  → Submit
  → if Ghost / Footer / Duplicate → line disappears from normal lists
  → description pattern stored for this user profile
  → next statement import skips matching lines
```

---

## Data model

- `transactions.is_excluded` — hidden from normal queues  
- `transactions.training_reason` / `training_detail` / `trained_at`  
- `training_reasons` — per-profile dropdown (system seeds + user-added “Other”)  
- `training_patterns` — description patterns to skip on future imports  

---

## How the brain “reflects”

1. **Immediate:** exclude bad row so books stay clean.  
2. **Memory:** store pattern from the description.  
3. **Next import:** filter parsed lines against patterns before insert.  
4. **Developer (you):** review `training_patterns` / common ghost labels and harden `discovery_pdf.py` (or bank presets) when the same mistake repeats for everyone.

That last step is the human “AI brain” closing the loop in code when a pattern is universal (e.g. “Total VAT…”).

---

## Default reasons

| Code | Label | Effect |
|------|--------|--------|
| `ghost_transaction` | Ghost transaction | Exclude + learn pattern |
| `footer_noise` | Footer / header noise | Exclude + learn pattern |
| `duplicate_line` | Duplicate line | Exclude + learn pattern |
| `wrong_amount` | Wrong amount / sign | Log only (keep row for fix later) |
| `wrong_date` | Wrong date | Log only |
| `wrong_description` | Wrong description | Log only |
| `other` | Other | New reason code from your text |

---

## Engineering map

| Piece | Location |
|-------|----------|
| Feedback submit | `POST /api/transactions/{id}/train` |
| Reason list | `GET /api/transactions/training/reasons` |
| Apply patterns on import | `backend/app/services/training.py` + `imports.py` |
| UI control | Transactions list (DEV train tick) |
| This document | `docs/AIBrainSelfTrain.md` |

---

## Roadmap (optional)

1. Show “Excluded by train” admin list to restore mistakes.  
2. Auto-suggest code patches when the same ghost hits N times globally.  
3. Per-bank-profile patterns (Discovery vs FNB).  
4. Optional local LLM to propose new skip regexes from feedback text.  

---

## Bottom line

**Yes, this is doable.**  
**Yes, your phase understanding is correct.**  
**v1 trains by exclusion + pattern memory under your supervision** — the honest way to make a statement importer smarter without claiming fake autonomy.
