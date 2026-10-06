"""Rule matching and live strip of the pending queue.

When a rule is created or edited it is immediately applied to all
currently uncategorised transactions (live strip).
"""

from __future__ import annotations

import re
from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session

from app.models import Rule, Transaction
from app.services.money import to_decimal


def transaction_matches_rule(tx: Transaction, rule: Rule) -> bool:
    if not rule.is_active:
        return False

    match_type = (rule.match_type or "").lower()
    desc = (tx.description or "")
    desc_l = desc.lower()
    value = (rule.match_value or "").strip()
    mj = rule.match_json or {}
    if not isinstance(mj, dict):
        mj = {}

    # Optional account scope (any match type): match_json.bank_account_ids = [ids].
    scope = mj.get("bank_account_ids")
    if scope:
        try:
            allowed = {int(x) for x in (scope if isinstance(scope, (list, tuple, set)) else [scope])}
        except (TypeError, ValueError):
            return False
        if tx.bank_account_id not in allowed:
            return False

    if match_type == "contains":
        return bool(value) and value.lower() in desc_l

    if match_type == "exact":
        return bool(value) and desc_l == value.lower()

    if match_type == "regex":
        if not value:
            return False
        try:
            return re.search(value, desc, re.IGNORECASE) is not None
        except re.error:
            return False

    if match_type == "amount_exact":
        try:
            target = to_decimal(value if value else mj.get("amount"))
            return tx.amount == target
        except (ValueError, TypeError):
            return False

    if match_type == "amount_range":
        try:
            lo = to_decimal(mj.get("min", value))
            hi = to_decimal(mj.get("max", mj.get("min", value)))
            return lo <= tx.amount <= hi
        except (ValueError, TypeError):
            return False

    if match_type == "combination":
        # match_json: { "contains": "...", "regex": "...", "amount_min": ..., "amount_max": ...,
        #               "exact": "...", "bank_account_ids": [..] }
        ok = True
        if "contains" in mj and mj["contains"]:
            ok = ok and str(mj["contains"]).lower() in desc_l
        if "exact" in mj and mj["exact"]:
            ok = ok and desc_l == str(mj["exact"]).lower()
        if "regex" in mj and mj["regex"]:
            try:
                ok = ok and re.search(str(mj["regex"]), desc, re.IGNORECASE) is not None
            except re.error:
                ok = False
        if "amount_exact" in mj and mj["amount_exact"] is not None:
            try:
                ok = ok and tx.amount == to_decimal(mj["amount_exact"])
            except (ValueError, TypeError):
                ok = False
        if "amount_min" in mj and mj["amount_min"] is not None:
            try:
                ok = ok and tx.amount >= to_decimal(mj["amount_min"])
            except (ValueError, TypeError):
                ok = False
        if "amount_max" in mj and mj["amount_max"] is not None:
            try:
                ok = ok and tx.amount <= to_decimal(mj["amount_max"])
            except (ValueError, TypeError):
                ok = False
        # Also honour simple match_value as contains if provided
        if value:
            ok = ok and value.lower() in desc_l
        return ok

    return False


def apply_rule_to_pending(db: Session, rule: Rule) -> int:
    """Apply a single rule to all uncategorised transactions. Returns match count."""
    if not rule.is_active:
        return 0

    pending = (
        db.query(Transaction)
        .filter(
            Transaction.is_categorised.is_(False),
            Transaction.user_profile_id == rule.user_profile_id,
        )
        .all()
    )
    matched = 0
    for tx in pending:
        if transaction_matches_rule(tx, rule):
            tx.ledger_id = rule.ledger_id
            tx.is_categorised = True
            tx.rule_id = rule.id
            matched += 1
    if matched:
        db.commit()
    return matched


def apply_all_rules_to_pending(db: Session, user_profile_id: int | None = None) -> int:
    """Re-run all active rules by priority (higher first). Live strip entire queue."""
    rq = db.query(Rule).filter(Rule.is_active.is_(True))
    tq = db.query(Transaction).filter(Transaction.is_categorised.is_(False))
    if user_profile_id is not None:
        rq = rq.filter(Rule.user_profile_id == user_profile_id)
        tq = tq.filter(Transaction.user_profile_id == user_profile_id)
    rules = rq.order_by(Rule.priority.desc(), Rule.id.asc()).all()
    pending = tq.all()
    total = 0
    for tx in pending:
        for rule in rules:
            if transaction_matches_rule(tx, rule):
                tx.ledger_id = rule.ledger_id
                tx.is_categorised = True
                tx.rule_id = rule.id
                total += 1
                break  # highest priority wins
    if total:
        db.commit()
    return total


def apply_rules_to_transactions(db: Session, transaction_ids: list[int]) -> int:
    """Apply active rules only to the given transaction IDs (e.g. after import)."""
    if not transaction_ids:
        return 0
    txs = db.query(Transaction).filter(
        Transaction.id.in_(transaction_ids),
        Transaction.is_categorised.is_(False),
    ).all()
    if not txs:
        return 0
    profile_id = txs[0].user_profile_id
    rules = (
        db.query(Rule)
        .filter(Rule.is_active.is_(True), Rule.user_profile_id == profile_id)
        .order_by(Rule.priority.desc(), Rule.id.asc())
        .all()
    )
    total = 0
    for tx in txs:
        for rule in rules:
            if transaction_matches_rule(tx, rule):
                tx.ledger_id = rule.ledger_id
                tx.is_categorised = True
                tx.rule_id = rule.id
                total += 1
                break
    if total:
        db.commit()
    return total
