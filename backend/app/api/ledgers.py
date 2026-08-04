from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_active_profile_id
from app.models import Ledger
from app.schemas import LedgerCreate, LedgerOut, LedgerUpdate

router = APIRouter(prefix="/ledgers", tags=["ledgers"])


def _depth_and_parent_name(
    ledger: Ledger, by_id: dict[int, Ledger]
) -> tuple[int, str | None]:
    parent_name = None
    depth = 0
    if ledger.parent_id and ledger.parent_id in by_id:
        parent_name = by_id[ledger.parent_id].name
        cur = ledger.parent_id
        seen = {ledger.id}
        while cur and cur in by_id and cur not in seen:
            seen.add(cur)
            depth += 1
            cur = by_id[cur].parent_id
    return depth, parent_name


def _to_out(ledger: Ledger, by_id: dict[int, Ledger]) -> LedgerOut:
    depth, parent_name = _depth_and_parent_name(ledger, by_id)
    return LedgerOut(
        id=ledger.id,
        name=ledger.name,
        type=ledger.type,
        parent_id=ledger.parent_id,
        parent_name=parent_name,
        depth=depth,
        is_system=ledger.is_system,
        is_archived=ledger.is_archived,
        budget_monthly=ledger.budget_monthly,
        budget_annual=ledger.budget_annual,
        sort_order=ledger.sort_order,
        created_at=ledger.created_at,
        updated_at=ledger.updated_at,
    )


def _would_cycle(db: Session, ledger_id: int, new_parent_id: int | None, profile_id: int) -> bool:
    """True if setting parent_id would create a cycle."""
    if new_parent_id is None:
        return False
    if new_parent_id == ledger_id:
        return True
    cur = new_parent_id
    seen = set()
    while cur is not None:
        if cur == ledger_id:
            return True
        if cur in seen:
            return True
        seen.add(cur)
        parent = db.get(Ledger, cur)
        if not parent or parent.user_profile_id != profile_id:
            break
        cur = parent.parent_id
    return False


def _tree_sort(ledgers: list[Ledger]) -> list[Ledger]:
    """Depth-first order under parents, stable by sort_order/name."""
    by_parent: dict[int | None, list[Ledger]] = {}
    for lg in ledgers:
        by_parent.setdefault(lg.parent_id, []).append(lg)
    for kids in by_parent.values():
        kids.sort(key=lambda x: (x.sort_order, x.name.lower(), x.id))

    out: list[Ledger] = []

    def walk(parent_id: int | None) -> None:
        for child in by_parent.get(parent_id, []):
            out.append(child)
            walk(child.id)

    walk(None)
    # Orphans whose parent is missing from the list
    remaining = [lg for lg in ledgers if lg not in out]
    remaining.sort(key=lambda x: (x.sort_order, x.name.lower(), x.id))
    out.extend(remaining)
    return out


@router.get("", response_model=list[LedgerOut])
def list_ledgers(
    include_archived: bool = False,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    q = db.query(Ledger).filter(Ledger.user_profile_id == profile_id)
    if not include_archived:
        q = q.filter(Ledger.is_archived.is_(False))
    rows = q.all()
    by_id = {lg.id: lg for lg in rows}
    ordered = _tree_sort(rows)
    return [_to_out(lg, by_id) for lg in ordered]


@router.post("", response_model=LedgerOut, status_code=201)
def create_ledger(
    payload: LedgerCreate,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    if payload.parent_id is not None:
        parent = db.get(Ledger, payload.parent_id)
        if not parent or parent.user_profile_id != profile_id:
            raise HTTPException(400, "Parent ledger not found in this profile")
        if parent.is_archived:
            raise HTTPException(400, "Cannot attach a sub-ledger under an archived parent")
    ledger = Ledger(
        user_profile_id=profile_id,
        name=payload.name,
        type=payload.type,
        parent_id=payload.parent_id,
        is_system=False,
        budget_monthly=payload.budget_monthly,
        budget_annual=payload.budget_annual,
        sort_order=payload.sort_order,
    )
    db.add(ledger)
    db.commit()
    db.refresh(ledger)
    rows = db.query(Ledger).filter(Ledger.user_profile_id == profile_id).all()
    by_id = {lg.id: lg for lg in rows}
    return _to_out(ledger, by_id)


@router.get("/{ledger_id}", response_model=LedgerOut)
def get_ledger(
    ledger_id: int,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    ledger = db.get(Ledger, ledger_id)
    if not ledger or ledger.user_profile_id != profile_id:
        raise HTTPException(404, "Ledger not found")
    rows = db.query(Ledger).filter(Ledger.user_profile_id == profile_id).all()
    by_id = {lg.id: lg for lg in rows}
    return _to_out(ledger, by_id)


@router.patch("/{ledger_id}", response_model=LedgerOut)
def update_ledger(
    ledger_id: int,
    payload: LedgerUpdate,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    ledger = db.get(Ledger, ledger_id)
    if not ledger or ledger.user_profile_id != profile_id:
        raise HTTPException(404, "Ledger not found")
    data = payload.model_dump(exclude_unset=True)
    if "parent_id" in data:
        new_parent = data["parent_id"]
        if new_parent is not None:
            parent = db.get(Ledger, new_parent)
            if not parent or parent.user_profile_id != profile_id:
                raise HTTPException(400, "Parent ledger not found in this profile")
            if _would_cycle(db, ledger_id, new_parent, profile_id):
                raise HTTPException(400, "Cannot set parent — that would create a circular hierarchy")
    for k, v in data.items():
        setattr(ledger, k, v)
    db.commit()
    db.refresh(ledger)
    rows = db.query(Ledger).filter(Ledger.user_profile_id == profile_id).all()
    by_id = {lg.id: lg for lg in rows}
    return _to_out(ledger, by_id)


@router.delete("/{ledger_id}", response_model=LedgerOut)
def archive_ledger(
    ledger_id: int,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    ledger = db.get(Ledger, ledger_id)
    if not ledger or ledger.user_profile_id != profile_id:
        raise HTTPException(404, "Ledger not found")
    ledger.is_archived = True
    db.commit()
    db.refresh(ledger)
    rows = db.query(Ledger).filter(Ledger.user_profile_id == profile_id).all()
    by_id = {lg.id: lg for lg in rows}
    return _to_out(ledger, by_id)
