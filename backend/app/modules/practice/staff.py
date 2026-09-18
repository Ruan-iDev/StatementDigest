"""Staff library, photos, and wages on a project trail (per-day days, deductions, HR notes)."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.config import DATA_DIR, ensure_data_dirs
from app.database import get_db
from app.deps import get_active_profile_id
from app.modules.practice.flags import require_feature
from app.modules.practice.ledgers import get_practice_ledger
from app.modules.practice.models import (
    EntryType,
    PracticeEntry,
    PracticeLedger,
    PracticeProject,
    PracticeStaff,
    PracticeStaffWageHistory,
    PracticeWage,
)
from app.modules.practice.schemas import (
    StaffCreate,
    StaffOut,
    StaffStatementOut,
    StaffUpdate,
    StaffWageHistoryOut,
    SupplierSpendTotals,
    WageCreate,
    WageDeductionOut,
    WageOut,
    WageUpdate,
)
from app.services.money import to_decimal

router = APIRouter()

_ALLOWED_PHOTO = {".png", ".jpg", ".jpeg", ".webp"}
_MAX_PHOTO = 3 * 1024 * 1024
_WAGE_PERIODS = {"day", "week", "biweekly", "monthly"}


def _money(value) -> Decimal:
    n = to_decimal(value)
    return n.quantize(Decimal("0.01"))


def _blank(value: str | None) -> str | None:
    raw = (value or "").strip()
    return raw or None


def _wage_amount(value) -> Decimal | None:
    if value is None or value == "":
        return None
    n = _money(value)
    return n if n > 0 else None


def _wage_period(value: str | None) -> str:
    raw = (value or "week").strip().lower()
    return raw if raw in _WAGE_PERIODS else "week"


def _fmt_days(value) -> str:
    n = to_decimal(value)
    text = format(n.normalize(), "f")
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text or "0"


def _fmt_money_plain(value) -> str:
    return f"{_money(value):,.2f}"


def _as_days(value) -> Decimal:
    n = to_decimal(value)
    if n <= 0:
        raise HTTPException(400, "Days worked must be greater than zero")
    return n


def _clean_wage_lines(raw, *, noun: str) -> list[dict]:
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise HTTPException(400, f"{noun.capitalize()}s must be a list")
    out: list[dict] = []
    for item in raw:
        if isinstance(item, dict):
            desc = str(item.get("description") or "").strip()
            amt_raw = item.get("amount")
        else:
            desc = str(getattr(item, "description", "") or "").strip()
            amt_raw = getattr(item, "amount", None)
        if not desc:
            raise HTTPException(400, f"Each {noun} needs a description")
        if amt_raw is None or amt_raw == "":
            raise HTTPException(400, f"Each {noun} needs an amount")
        amt = _money(amt_raw)
        if amt <= 0:
            raise HTTPException(400, f"Each {noun} amount must be greater than zero")
        out.append({"description": desc, "amount": str(amt)})
    return out


def _line_total(items: list[dict] | None) -> Decimal:
    total = Decimal("0")
    for item in items or []:
        total += _money(item.get("amount") if isinstance(item, dict) else 0)
    return total


def _line_outs(raw) -> list[WageDeductionOut]:
    out: list[WageDeductionOut] = []
    for item in raw or []:
        if not isinstance(item, dict):
            continue
        out.append(
            WageDeductionOut(
                description=str(item.get("description") or ""),
                amount=_money(item.get("amount") or 0),
            )
        )
    return out


def _lines_list(raw) -> list:
    return raw if isinstance(raw, list) else []


def _snapshot_from_existing(existing: PracticeWage) -> tuple[Decimal | None, str | None]:
    """Rate frozen on the payment. Never read the live staff card here."""
    period = _wage_period(existing.rate_period) if existing.rate_period else None
    rate = _wage_amount(existing.rate_amount) if existing.rate_amount is not None else None
    if rate is None and existing.days is not None:
        try:
            days = Decimal(str(existing.days))
        except Exception:
            days = Decimal("0")
        if days > 0:
            deduct = _line_total(_lines_list(existing.deductions))
            extra = _line_total(_lines_list(existing.additions))
            gross = _money(existing.amount) - extra + deduct
            rate = _money(gross / days)
            period = period or "day"
    return rate, period


def _wage_kind(value: str | None, existing: PracticeWage | None = None) -> str:
    raw = (value or (existing.kind if existing and existing.kind else "wage") or "wage").strip().lower()
    if raw == "commission":
        return "commission"
    if raw in ("absence", "absent"):
        return "absence"
    return "wage"


def _settle_wage(
    staff: PracticeStaff,
    *,
    amount,
    days,
    deductions,
    additions=None,
    existing: PracticeWage | None = None,
    staff_changed: bool = False,
    kind: str | None = None,
    override_reason: str | None = None,
) -> dict:
    cleaned_deduct = _clean_wage_lines(deductions, noun="deduction")
    cleaned_add = _clean_wage_lines(additions, noun="extra")
    deduct_total = _line_total(cleaned_deduct)
    add_total = _line_total(cleaned_add)
    if existing is not None and not staff_changed:
        rate, period = _snapshot_from_existing(existing)
        period = period or _wage_period(existing.rate_period) or "week"
    else:
        period = _wage_period(staff.wage_period)
        rate = _wage_amount(staff.wage_amount)

    settled_kind = _wage_kind(kind, existing)
    if settled_kind == "absence":
        reason = _blank(override_reason)
        if reason is None and existing is not None and kind is None:
            reason = _blank(existing.override_reason)
        if days is not None:
            days_val = to_decimal(days)
        elif existing is not None and existing.days is not None:
            days_val = to_decimal(existing.days)
        else:
            days_val = Decimal("0")
        if days_val <= 0:
            raise HTTPException(400, "Enter how many days they were absent")
        return {
            "amount": _money(0),
            "days": days_val,
            "rate_amount": rate,
            "rate_period": period,
            "kind": "absence",
            "override_reason": reason,
            "deductions": [],
            "additions": [],
        }
    if settled_kind == "commission":
        reason = _blank(override_reason)
        if reason is None and existing is not None and kind is None:
            reason = _blank(existing.override_reason)
        if not reason:
            raise HTTPException(400, "A commission override needs a reason")
        if amount is not None:
            gross = _money(amount)
        elif existing is not None:
            existing_deduct = existing.deductions if isinstance(existing.deductions, list) else []
            existing_add = existing.additions if isinstance(existing.additions, list) else []
            gross = _money(existing.amount) + _line_total(existing_deduct) - _line_total(existing_add)
        else:
            raise HTTPException(400, "Enter the commission amount")
        if gross <= 0:
            raise HTTPException(400, "Commission amount must be greater than zero")
        net = gross + add_total - deduct_total
        if net <= 0:
            raise HTTPException(400, "Net commission must be greater than zero after extras and deductions")
        return {
            "amount": net,
            "days": None,
            "rate_amount": rate,
            "rate_period": period,
            "kind": "commission",
            "override_reason": reason,
            "deductions": cleaned_deduct,
            "additions": cleaned_add,
        }

    if period == "day":
        if days is not None:
            days_val = _as_days(days)
        elif existing is not None and existing.days is not None:
            days_val = _as_days(existing.days)
        else:
            raise HTTPException(400, "Enter how many days were worked")
        if rate is None:
            raise HTTPException(
                400,
                "This wage has no stored daily rate. Later staff increases cannot be used to fill it in.",
            )
        gross = _money(days_val * rate)
        net = gross + add_total - deduct_total
        if net <= 0:
            raise HTTPException(400, "Net wage must be greater than zero after extras and deductions")
        return {
            "amount": net,
            "days": days_val,
            "rate_amount": rate,
            "rate_period": "day",
            "kind": "wage",
            "override_reason": None,
            "deductions": cleaned_deduct,
            "additions": cleaned_add,
        }

    if amount is not None:
        gross = _money(amount)
    elif existing is not None:
        existing_deduct = existing.deductions if isinstance(existing.deductions, list) else []
        existing_add = existing.additions if isinstance(existing.additions, list) else []
        gross = _money(existing.amount) + _line_total(existing_deduct) - _line_total(existing_add)
    else:
        raise HTTPException(400, "Wage amount must be greater than zero")
    if gross <= 0:
        raise HTTPException(400, "Wage amount must be greater than zero")
    net = gross + add_total - deduct_total
    if net <= 0:
        raise HTTPException(400, "Net wage must be greater than zero after extras and deductions")
    return {
        "amount": net,
        "days": None,
        "rate_amount": rate,
        "rate_period": period,
        "kind": "wage",
        "override_reason": None,
        "deductions": cleaned_deduct,
        "additions": cleaned_add,
    }


def _wage_title(name: str, row: PracticeWage) -> str:
    if (row.kind or "wage") == "commission":
        return f"Commission · {name}"
    if (row.kind or "wage") == "absence":
        if row.days is not None:
            return f"Absence · {name} · {_fmt_days(row.days)} days"
        return f"Absence · {name}"
    if row.days is not None:
        return f"Wages · {name} · {_fmt_days(row.days)} days"
    return f"Wages · {name}"


def _wage_trail_body(row: PracticeWage) -> str | None:
    lines: list[str] = []
    if (row.kind or "wage") == "absence":
        lines.append("Absent")
        if row.days is not None:
            lines.append(f"{_fmt_days(row.days)} days")
        reason = _blank(row.override_reason)
        if reason:
            lines.append(reason)
        return " · ".join(lines) if lines else "Absent"
    if (row.kind or "wage") == "commission":
        lines.append("Override daily wage")
        reason = _blank(row.override_reason)
        if reason:
            lines.append(reason)
    if row.days is not None and row.rate_amount is not None:
        lines.append(
            f"{_fmt_days(row.days)} days × {_fmt_money_plain(row.rate_amount)} per day"
        )
    for item in row.additions or []:
        if not isinstance(item, dict):
            continue
        desc = str(item.get("description") or "").strip()
        if not desc:
            continue
        lines.append(f"Plus: {desc} {_fmt_money_plain(item.get('amount') or 0)}")
    for item in row.deductions or []:
        if not isinstance(item, dict):
            continue
        desc = str(item.get("description") or "").strip()
        if not desc:
            continue
        lines.append(f"Less: {desc} {_fmt_money_plain(item.get('amount') or 0)}")
    note = _blank(row.notes)
    if note:
        if lines:
            lines.append("")
        lines.append(note)
    return "\n".join(lines) if lines else None


def _history_kind(
    old_amount: Decimal | None,
    old_period: str | None,
    new_amount: Decimal | None,
    new_period: str,
) -> str:
    if old_amount is None:
        return "start"
    if new_amount is not None and old_amount is not None and new_amount > old_amount:
        return "increase"
    if new_amount is not None and old_amount is not None and new_amount < old_amount:
        return "decrease"
    return "period_change"


def _record_wage_history(
    db: Session,
    profile_id: int,
    staff: PracticeStaff,
    *,
    old_amount: Decimal | None = None,
    old_period: str | None = None,
    effective_on: date | None = None,
) -> None:
    new_amount = staff.wage_amount
    if new_amount is None:
        return
    new_period = _wage_period(staff.wage_period)
    old_amt = _wage_amount(old_amount) if old_amount is not None else None
    old_per = _wage_period(old_period) if old_period else None
    if old_amt == _wage_amount(new_amount) and (old_per or new_period) == new_period:
        return
    db.add(
        PracticeStaffWageHistory(
            user_profile_id=profile_id,
            staff_id=staff.id,
            amount=_money(new_amount),
            period=new_period,
            previous_amount=old_amt,
            previous_period=old_per,
            kind=_history_kind(old_amt, old_per, _wage_amount(new_amount), new_period),
            effective_on=effective_on or date.today(),
            created_at=datetime.utcnow(),
        )
    )


def _staff_out(row: PracticeStaff, db: Session | None = None) -> StaffOut:
    data = StaffOut.model_validate(row)
    data.has_photo = bool(row.photo_path)
    if db is not None and row.default_ledger_id:
        led = db.get(PracticeLedger, row.default_ledger_id)
        data.default_ledger_name = led.name if led else None
    return data


def _wage_out(db: Session, row: PracticeWage) -> WageOut:
    staff = db.get(PracticeStaff, row.staff_id)
    project = db.get(PracticeProject, row.project_id)
    led = db.get(PracticeLedger, row.ledger_id) if row.ledger_id else None
    return WageOut(
        id=row.id,
        project_id=row.project_id,
        project_name=project.name if project else None,
        staff_id=row.staff_id,
        staff_name=staff.name if staff else None,
        amount=_money(row.amount),
        days=to_decimal(row.days) if row.days is not None else None,
        rate_amount=_money(row.rate_amount) if row.rate_amount is not None else None,
        rate_period=row.rate_period,
        kind=row.kind or "wage",
        override_reason=row.override_reason,
        ledger_id=row.ledger_id,
        ledger_name=led.name if led else None,
        deductions=_line_outs(row.deductions),
        additions=_line_outs(row.additions),
        occurred_on=row.occurred_on,
        notes=row.notes,
        created_at=row.created_at,
    )


def _get_staff(db: Session, profile_id: int, staff_id: int) -> PracticeStaff:
    row = (
        db.query(PracticeStaff)
        .filter(PracticeStaff.id == staff_id, PracticeStaff.user_profile_id == profile_id)
        .first()
    )
    if not row:
        raise HTTPException(404, "Staff member not found")
    return row


def _get_project(db: Session, profile_id: int, project_id: int) -> PracticeProject:
    row = (
        db.query(PracticeProject)
        .filter(PracticeProject.id == project_id, PracticeProject.user_profile_id == profile_id)
        .first()
    )
    if not row:
        raise HTTPException(404, "Project not found")
    return row


def _sync_wage_trail(db: Session, profile_id: int, row: PracticeWage) -> None:
    staff = db.get(PracticeStaff, row.staff_id)
    name = staff.name if staff else "Staff"
    title = _wage_title(name, row)
    body = _wage_trail_body(row)
    trail = (
        db.query(PracticeEntry)
        .filter(PracticeEntry.user_profile_id == profile_id, PracticeEntry.wage_id == row.id)
        .first()
    )
    if trail:
        trail.title = title
        trail.body = body
        trail.amount = row.amount
        trail.occurred_on = row.occurred_on
        return
    db.add(
        PracticeEntry(
            user_profile_id=profile_id,
            project_id=row.project_id,
            entry_type=EntryType.WAGE.value,
            title=title,
            body=body,
            amount=row.amount,
            wage_id=row.id,
            occurred_on=row.occurred_on or date.today(),
            created_at=datetime.utcnow(),
        )
    )


def _photo_path(rel: str | None) -> Path | None:
    if not rel:
        return None
    p = Path(rel)
    if not p.is_absolute():
        p = DATA_DIR / rel
    return p if p.is_file() else None


@router.get("/staff", response_model=list[StaffOut])
def list_staff(
    include_archived: bool = False,
    q: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    query = db.query(PracticeStaff).filter(PracticeStaff.user_profile_id == profile_id)
    if not include_archived:
        query = query.filter(PracticeStaff.is_archived.is_(False))
    term = (q or "").strip()
    if term:
        like = f"%{term}%"
        query = query.filter(
            or_(
                PracticeStaff.name.ilike(like),
                PracticeStaff.known_as.ilike(like),
                PracticeStaff.job_title.ilike(like),
                PracticeStaff.phone.ilike(like),
                PracticeStaff.email.ilike(like),
                PracticeStaff.id_number.ilike(like),
            )
        )
    rows = query.order_by(PracticeStaff.name.asc()).limit(limit).all()
    return [_staff_out(r, db) for r in rows]


@router.post("/staff", response_model=StaffOut, status_code=201)
def create_staff(
    body: StaffCreate,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    if body.default_ledger_id is not None:
        get_practice_ledger(db, profile_id, body.default_ledger_id, expect_type="expense")
    row = PracticeStaff(
        user_profile_id=profile_id,
        name=body.name.strip(),
        known_as=_blank(body.known_as),
        job_title=_blank(body.job_title),
        id_number=_blank(body.id_number),
        born_on=body.born_on,
        phone=_blank(body.phone),
        email=_blank(body.email),
        address_line1=_blank(body.address_line1),
        address_line2=_blank(body.address_line2),
        city=_blank(body.city),
        postal_code=_blank(body.postal_code),
        country=_blank(body.country) or "South Africa",
        bank_name=_blank(body.bank_name),
        bank_account_name=_blank(body.bank_account_name),
        bank_account_number=_blank(body.bank_account_number),
        bank_branch_code=_blank(body.bank_branch_code),
        wage_amount=_wage_amount(body.wage_amount),
        wage_period=_wage_period(body.wage_period),
        default_ledger_id=body.default_ledger_id,
        notes=_blank(body.notes),
    )
    db.add(row)
    db.flush()
    _record_wage_history(db, profile_id, row, effective_on=body.wage_effective_on)
    db.commit()
    db.refresh(row)
    return _staff_out(row, db)


@router.get("/staff/{staff_id}", response_model=StaffOut)
def get_staff(
    staff_id: int,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    return _staff_out(_get_staff(db, profile_id, staff_id), db)


@router.patch("/staff/{staff_id}", response_model=StaffOut)
def update_staff(
    staff_id: int,
    body: StaffUpdate,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    row = _get_staff(db, profile_id, staff_id)
    data = body.model_dump(exclude_unset=True)
    for key in (
        "name",
        "known_as",
        "job_title",
        "id_number",
        "phone",
        "email",
        "address_line1",
        "address_line2",
        "city",
        "postal_code",
        "country",
        "bank_name",
        "bank_account_name",
        "bank_account_number",
        "bank_branch_code",
        "notes",
    ):
        if key in data and isinstance(data[key], str):
            data[key] = data[key].strip() or (None if key != "name" else data[key].strip())
    if "name" in data and not data["name"]:
        raise HTTPException(400, "Name cannot be blank")
    if "wage_amount" in data:
        data["wage_amount"] = _wage_amount(data["wage_amount"])
    if "wage_period" in data:
        data["wage_period"] = _wage_period(data["wage_period"])
    if "default_ledger_id" in data and data["default_ledger_id"] is not None:
        get_practice_ledger(db, profile_id, data["default_ledger_id"], expect_type="expense")
    effective = data.pop("wage_effective_on", None)
    old_amount = row.wage_amount
    old_period = row.wage_period
    for key, value in data.items():
        setattr(row, key, value)
    row.updated_at = datetime.utcnow()
    _record_wage_history(
        db,
        profile_id,
        row,
        old_amount=old_amount,
        old_period=old_period,
        effective_on=effective,
    )
    # Rate changes are future-only. Payments already on project files keep the
    # rate_amount snapshotted when they were loaded — do not rewrite them.
    db.commit()
    db.refresh(row)
    return _staff_out(row, db)


@router.get("/staff/{staff_id}/photo")
def get_staff_photo(
    staff_id: int,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    row = _get_staff(db, profile_id, staff_id)
    path = _photo_path(row.photo_path)
    if not path:
        raise HTTPException(404, "No photo yet")
    media = "image/jpeg"
    suf = path.suffix.lower()
    if suf == ".png":
        media = "image/png"
    elif suf == ".webp":
        media = "image/webp"
    return FileResponse(path, media_type=media, filename=path.name)


@router.post("/staff/{staff_id}/photo", response_model=StaffOut)
async def upload_staff_photo(
    staff_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    row = _get_staff(db, profile_id, staff_id)
    filename = file.filename or "photo.jpg"
    ext = Path(filename).suffix.lower()
    if ext not in _ALLOWED_PHOTO:
        raise HTTPException(400, "Photo must be PNG, JPG, or WEBP")
    raw = await file.read()
    if not raw:
        raise HTTPException(400, "Empty file")
    if len(raw) > _MAX_PHOTO:
        raise HTTPException(400, "Photo must be 3 MB or smaller")
    old = _photo_path(row.photo_path)
    if old and old.is_file():
        try:
            old.unlink()
        except OSError:
            pass
    ensure_data_dirs()
    rel = f"practice_staff/{profile_id}_{row.id}_{datetime.utcnow().strftime('%H%M%S')}{ext}"
    dest = DATA_DIR / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(raw)
    row.photo_path = rel
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return _staff_out(row, db)


@router.get("/staff/{staff_id}/statement", response_model=StaffStatementOut)
def staff_statement(
    staff_id: int,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    row = _get_staff(db, profile_id, staff_id)
    wages = (
        db.query(PracticeWage)
        .filter(
            PracticeWage.user_profile_id == profile_id,
            PracticeWage.staff_id == row.id,
        )
        .order_by(PracticeWage.occurred_on.asc(), PracticeWage.id.asc())
        .all()
    )
    outs = [_wage_out(db, w) for w in wages]
    paid = sum((_money(w.amount) for w in wages), Decimal("0.00"))
    history = _list_wage_history(db, profile_id, row.id)
    return StaffStatementOut(
        staff=_staff_out(row, db),
        wages=outs,
        wage_history=history,
        totals=SupplierSpendTotals(spent=_money(paid), count=len(outs)),
    )


def _list_wage_history(db: Session, profile_id: int, staff_id: int) -> list[StaffWageHistoryOut]:
    rows = (
        db.query(PracticeStaffWageHistory)
        .filter(
            PracticeStaffWageHistory.user_profile_id == profile_id,
            PracticeStaffWageHistory.staff_id == staff_id,
        )
        .order_by(PracticeStaffWageHistory.effective_on.asc(), PracticeStaffWageHistory.id.asc())
        .all()
    )
    return [StaffWageHistoryOut.model_validate(r) for r in rows]


@router.get("/staff/{staff_id}/wage-history", response_model=list[StaffWageHistoryOut])
def staff_wage_history(
    staff_id: int,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    _get_staff(db, profile_id, staff_id)
    return _list_wage_history(db, profile_id, staff_id)


@router.get("/wages", response_model=list[WageOut])
def list_wages(
    project_id: int | None = None,
    staff_id: int | None = None,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    q = db.query(PracticeWage).filter(PracticeWage.user_profile_id == profile_id)
    if project_id is not None:
        q = q.filter(PracticeWage.project_id == project_id)
    if staff_id is not None:
        q = q.filter(PracticeWage.staff_id == staff_id)
    rows = q.order_by(PracticeWage.occurred_on.asc(), PracticeWage.id.asc()).all()
    return [_wage_out(db, r) for r in rows]


@router.post("/wages", response_model=WageOut, status_code=201)
def create_wage(
    body: WageCreate,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    require_feature(db, profile_id, "projects")
    project = _get_project(db, profile_id, body.project_id)
    staff = _get_staff(db, profile_id, body.staff_id)
    if staff.is_archived:
        raise HTTPException(400, "This staff member is archived")
    ledger_id = body.ledger_id
    if ledger_id is not None:
        get_practice_ledger(db, profile_id, ledger_id, expect_type="expense")
    settled = _settle_wage(
        staff,
        amount=body.amount,
        days=body.days,
        deductions=body.deductions,
        additions=body.additions,
        kind=body.kind,
        override_reason=body.override_reason,
    )
    row = PracticeWage(
        user_profile_id=profile_id,
        project_id=project.id,
        staff_id=staff.id,
        amount=settled["amount"],
        days=settled["days"],
        rate_amount=settled["rate_amount"],
        rate_period=settled["rate_period"],
        kind=settled["kind"],
        override_reason=settled["override_reason"],
        ledger_id=ledger_id,
        deductions=settled["deductions"],
        additions=settled["additions"],
        occurred_on=body.occurred_on or date.today(),
        notes=_blank(body.notes),
    )
    db.add(row)
    db.flush()
    _sync_wage_trail(db, profile_id, row)
    project.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return _wage_out(db, row)


@router.patch("/wages/{wage_id}", response_model=WageOut)
def update_wage(
    wage_id: int,
    body: WageUpdate,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    require_feature(db, profile_id, "projects")
    row = (
        db.query(PracticeWage)
        .filter(PracticeWage.id == wage_id, PracticeWage.user_profile_id == profile_id)
        .first()
    )
    if not row:
        raise HTTPException(404, "Wage not found")
    data = body.model_dump(exclude_unset=True)
    staff_id = data.get("staff_id", row.staff_id)
    staff = _get_staff(db, profile_id, staff_id)
    staff_changed = "staff_id" in data and data["staff_id"] is not None and data["staff_id"] != row.staff_id
    if any(
        key in data
        for key in ("amount", "days", "deductions", "additions", "staff_id", "kind", "override_reason")
    ):
        settled = _settle_wage(
            staff,
            amount=data["amount"] if "amount" in data else None,
            days=data["days"] if "days" in data else None,
            deductions=data["deductions"] if "deductions" in data else row.deductions,
            additions=data["additions"] if "additions" in data else row.additions,
            existing=row,
            staff_changed=staff_changed,
            kind=data["kind"] if "kind" in data else row.kind,
            override_reason=data["override_reason"] if "override_reason" in data else row.override_reason,
        )
        data.update(settled)
    if "ledger_id" in data and data["ledger_id"] is not None:
        get_practice_ledger(db, profile_id, data["ledger_id"], expect_type="expense")
    if "notes" in data:
        data["notes"] = _blank(data["notes"]) if isinstance(data["notes"], str) else data["notes"]
    for key, value in data.items():
        setattr(row, key, value)
    _sync_wage_trail(db, profile_id, row)
    project = db.get(PracticeProject, row.project_id)
    if project:
        project.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return _wage_out(db, row)
