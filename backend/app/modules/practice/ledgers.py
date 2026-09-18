"""Work Flow ledgers — own chart of accounts, not Ledger Flow."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_active_profile_id
from app.modules.practice.models import PracticeLedger
from app.modules.practice.schemas import PracticeLedgerCreate, PracticeLedgerOut, PracticeLedgerUpdate

router = APIRouter()

_LEDGER_TYPES = {"income", "expense"}


def get_practice_ledger(
    db: Session, profile_id: int, ledger_id: int, *, expect_type: str | None = None
) -> PracticeLedger:
    row = (
        db.query(PracticeLedger)
        .filter(PracticeLedger.id == ledger_id, PracticeLedger.user_profile_id == profile_id)
        .first()
    )
    if not row:
        raise HTTPException(404, "Work Flow ledger not found")
    if expect_type and row.type != expect_type:
        raise HTTPException(400, f"Pick a {expect_type} ledger")
    return row


def find_or_create_ledger(
    db: Session, profile_id: int, name: str, ledger_type: str
) -> PracticeLedger:
    label = (name or "").strip()
    if not label:
        raise HTTPException(400, "Ledger needs a name")
    kind = (ledger_type or "").strip().lower()
    if kind not in _LEDGER_TYPES:
        raise HTTPException(400, "Ledger type must be income or expense")
    existing = (
        db.query(PracticeLedger)
        .filter(
            PracticeLedger.user_profile_id == profile_id,
            PracticeLedger.type == kind,
            PracticeLedger.is_archived.is_(False),
            PracticeLedger.name == label,
        )
        .first()
    )
    if existing:
        return existing
    row = PracticeLedger(
        user_profile_id=profile_id,
        name=label,
        type=kind,
        sort_order=0,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(row)
    db.flush()
    return row


@router.get("/ledgers", response_model=list[PracticeLedgerOut])
def list_ledgers(
    type: str | None = Query(default=None, pattern="^(income|expense)$"),
    include_archived: bool = False,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    q = db.query(PracticeLedger).filter(PracticeLedger.user_profile_id == profile_id)
    if type:
        q = q.filter(PracticeLedger.type == type)
    if not include_archived:
        q = q.filter(PracticeLedger.is_archived.is_(False))
    return q.order_by(PracticeLedger.type.asc(), PracticeLedger.name.asc()).all()


@router.post("/ledgers", response_model=PracticeLedgerOut, status_code=201)
def create_ledger(
    body: PracticeLedgerCreate,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    row = find_or_create_ledger(db, profile_id, body.name, body.type)
    db.commit()
    db.refresh(row)
    return row


@router.patch("/ledgers/{ledger_id}", response_model=PracticeLedgerOut)
def update_ledger(
    ledger_id: int,
    body: PracticeLedgerUpdate,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    row = get_practice_ledger(db, profile_id, ledger_id)
    data = body.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        data["name"] = data["name"].strip()
        if not data["name"]:
            raise HTTPException(400, "Ledger needs a name")
    for key, value in data.items():
        setattr(row, key, value)
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return row
