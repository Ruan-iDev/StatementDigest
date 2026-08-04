"""Parser self-train helpers — human feedback → exclusion + future import filters.

See docs/AIBrainSelfTrain.md for the product philosophy.
"""

from __future__ import annotations

from datetime import datetime
from typing import Iterable

from sqlalchemy.orm import Session

from app.models import TrainingPattern, TrainingReason, Transaction

# Built-in starter reasons (seeded per profile on first use)
SYSTEM_REASONS: list[dict[str, str]] = [
    {
        "code": "ghost_transaction",
        "label": "Ghost transaction",
        "hint": "This line is not on the real bank statement. Exclude it and teach the parser to skip similar lines.",
    },
    {
        "code": "footer_noise",
        "label": "Footer / header noise",
        "hint": "Bank boilerplate (VAT totals, interest tables, addresses) wrongly imported as a transaction.",
    },
    {
        "code": "duplicate_line",
        "label": "Duplicate line",
        "hint": "Same transaction already imported correctly elsewhere.",
    },
    {
        "code": "wrong_amount",
        "label": "Wrong amount / sign",
        "hint": "Amount or inflow/outflow sign is incorrect.",
    },
    {
        "code": "wrong_date",
        "label": "Wrong date",
        "hint": "Date was misread from the statement.",
    },
    {
        "code": "wrong_description",
        "label": "Wrong description",
        "hint": "Details text was mangled or incomplete.",
    },
    {
        "code": "other",
        "label": "Other",
        "hint": "Specify your own reason — it will be added to this dropdown for next time.",
    },
]


def ensure_system_reasons(db: Session, user_profile_id: int) -> None:
    existing = {
        r.code
        for r in db.query(TrainingReason)
        .filter(TrainingReason.user_profile_id == user_profile_id)
        .all()
    }
    added = False
    for item in SYSTEM_REASONS:
        if item["code"] in existing:
            continue
        db.add(
            TrainingReason(
                user_profile_id=user_profile_id,
                code=item["code"],
                label=item["label"],
                hint=item["hint"],
                is_system=True,
                use_count=0,
            )
        )
        added = True
    if added:
        db.commit()


def list_reasons(db: Session, user_profile_id: int) -> list[TrainingReason]:
    ensure_system_reasons(db, user_profile_id)
    return (
        db.query(TrainingReason)
        .filter(TrainingReason.user_profile_id == user_profile_id)
        .order_by(TrainingReason.is_system.desc(), TrainingReason.use_count.desc(), TrainingReason.label)
        .all()
    )


def _slug_code(label: str) -> str:
    import re

    base = re.sub(r"[^a-z0-9]+", "_", (label or "other").strip().lower()).strip("_")
    return (base or "other")[:70]


def submit_training(
    db: Session,
    tx: Transaction,
    reason_code: str,
    detail: str | None = None,
    custom_label: str | None = None,
) -> Transaction:
    """Record feedback. Ghost / noise reasons exclude the tx from normal lists."""
    ensure_system_reasons(db, tx.user_profile_id)
    code = (reason_code or "other").strip().lower()
    detail = (detail or "").strip() or None

    if code == "other":
        label = (custom_label or detail or "Other").strip()
        new_code = _slug_code(label)
        if new_code == "other" and detail:
            new_code = _slug_code(detail[:40])
        existing = (
            db.query(TrainingReason)
            .filter(
                TrainingReason.user_profile_id == tx.user_profile_id,
                TrainingReason.code == new_code,
            )
            .first()
        )
        if not existing:
            db.add(
                TrainingReason(
                    user_profile_id=tx.user_profile_id,
                    code=new_code,
                    label=label[:200],
                    hint="Added by you while training the parser.",
                    is_system=False,
                    use_count=1,
                )
            )
        else:
            existing.use_count = (existing.use_count or 0) + 1
        code = new_code
    else:
        reason = (
            db.query(TrainingReason)
            .filter(
                TrainingReason.user_profile_id == tx.user_profile_id,
                TrainingReason.code == code,
            )
            .first()
        )
        if reason:
            reason.use_count = (reason.use_count or 0) + 1

    exclude_codes = {"ghost_transaction", "footer_noise", "duplicate_line"}
    tx.training_reason = code
    tx.training_detail = detail
    tx.trained_at = datetime.utcnow()
    if code in exclude_codes or code.startswith("ghost"):
        tx.is_excluded = True

    # Learn a skip pattern for ghost/noise so future imports filter similar lines
    if tx.is_excluded and tx.description:
        pattern = (tx.description or "").strip()
        if len(pattern) >= 4:
            already = (
                db.query(TrainingPattern)
                .filter(
                    TrainingPattern.user_profile_id == tx.user_profile_id,
                    TrainingPattern.pattern_value == pattern,
                )
                .first()
            )
            if not already:
                db.add(
                    TrainingPattern(
                        user_profile_id=tx.user_profile_id,
                        reason_code=code,
                        match_type="contains" if len(pattern) > 24 else "exact",
                        pattern_value=pattern[:500],
                        source_transaction_id=tx.id,
                        hit_count=0,
                    )
                )

    db.commit()
    db.refresh(tx)
    return tx


def filter_parsed_by_training(
    db: Session,
    user_profile_id: int,
    descriptions_and_amounts: Iterable[tuple[str, object]],
) -> list[bool]:
    """Return keep-flags for each parsed row (True = keep)."""
    patterns = (
        db.query(TrainingPattern)
        .filter(TrainingPattern.user_profile_id == user_profile_id)
        .all()
    )
    if not patterns:
        return [True] * len(list(descriptions_and_amounts))

    keep: list[bool] = []
    # Re-iterate if needed
    items = list(descriptions_and_amounts)
    for desc, _amt in items:
        d = (desc or "").strip()
        d_l = d.lower()
        drop = False
        for p in patterns:
            pv = (p.pattern_value or "").strip()
            if not pv:
                continue
            if p.match_type == "exact":
                if d_l == pv.lower():
                    drop = True
                    p.hit_count = (p.hit_count or 0) + 1
                    break
            else:
                if pv.lower() in d_l:
                    drop = True
                    p.hit_count = (p.hit_count or 0) + 1
                    break
        keep.append(not drop)
    if patterns:
        db.commit()
    return keep


def should_skip_description(db: Session, user_profile_id: int, description: str) -> bool:
    flags = filter_parsed_by_training(db, user_profile_id, [(description, 0)])
    return not flags[0] if flags else False
