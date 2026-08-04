from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_active_profile_id
from app.models import Ledger, Rule, Transaction
from app.schemas import RuleApplyResult, RuleCreate, RuleOut, RuleUpdate
from app.services.rules_engine import apply_rule_to_pending, apply_all_rules_to_pending

router = APIRouter(prefix="/rules", tags=["rules"])


def _rule_out(rule: Rule, db: Session) -> RuleOut:
    count = db.query(Transaction).filter(Transaction.rule_id == rule.id).count()
    return RuleOut(
        id=rule.id,
        name=rule.name,
        match_type=rule.match_type,
        match_value=rule.match_value,
        match_json=rule.match_json,
        ledger_id=rule.ledger_id,
        priority=rule.priority,
        is_active=rule.is_active,
        created_at=rule.created_at,
        updated_at=rule.updated_at,
        applied_count=count,
    )


@router.get("", response_model=list[RuleOut])
def list_rules(
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    rules = (
        db.query(Rule)
        .filter(Rule.user_profile_id == profile_id)
        .order_by(Rule.priority.desc(), Rule.name.asc())
        .all()
    )
    return [_rule_out(r, db) for r in rules]


@router.post("", response_model=RuleApplyResult, status_code=201)
def create_rule(
    payload: RuleCreate,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    ledger = db.get(Ledger, payload.ledger_id)
    if not ledger or ledger.user_profile_id != profile_id:
        raise HTTPException(400, "Ledger not found")
    rule = Rule(
        user_profile_id=profile_id,
        name=payload.name,
        match_type=payload.match_type,
        match_value=payload.match_value,
        match_json=payload.match_json,
        ledger_id=payload.ledger_id,
        priority=payload.priority,
        is_active=payload.is_active,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    matched = apply_rule_to_pending(db, rule) if rule.is_active else 0
    return RuleApplyResult(
        rule_id=rule.id,
        matched=matched,
        message=f"Rule created. {matched} pending transaction(s) auto-categorised.",
    )


@router.get("/{rule_id}", response_model=RuleOut)
def get_rule(
    rule_id: int,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    rule = db.get(Rule, rule_id)
    if not rule or rule.user_profile_id != profile_id:
        raise HTTPException(404, "Rule not found")
    return _rule_out(rule, db)


@router.patch("/{rule_id}", response_model=RuleApplyResult)
def update_rule(
    rule_id: int,
    payload: RuleUpdate,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    rule = db.get(Rule, rule_id)
    if not rule or rule.user_profile_id != profile_id:
        raise HTTPException(404, "Rule not found")
    data = payload.model_dump(exclude_unset=True)
    if "ledger_id" in data and data["ledger_id"] is not None:
        ledger = db.get(Ledger, data["ledger_id"])
        if not ledger or ledger.user_profile_id != profile_id:
            raise HTTPException(400, "Ledger not found")
    for k, v in data.items():
        setattr(rule, k, v)
    db.commit()
    db.refresh(rule)
    matched = apply_rule_to_pending(db, rule) if rule.is_active else 0
    return RuleApplyResult(
        rule_id=rule.id,
        matched=matched,
        message=f"Rule updated. {matched} pending transaction(s) auto-categorised.",
    )


@router.delete("/{rule_id}", status_code=204)
def delete_rule(
    rule_id: int,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    rule = db.get(Rule, rule_id)
    if not rule or rule.user_profile_id != profile_id:
        raise HTTPException(404, "Rule not found")
    db.query(Transaction).filter(Transaction.rule_id == rule_id).update(
        {Transaction.rule_id: None}
    )
    db.delete(rule)
    db.commit()
    return None


@router.post("/apply-all", response_model=RuleApplyResult)
def apply_all(
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    matched = apply_all_rules_to_pending(db, user_profile_id=profile_id)
    return RuleApplyResult(
        rule_id=0,
        matched=matched,
        message=f"Applied all active rules. {matched} transaction(s) categorised.",
    )
