import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.config import UPLOADS_DIR
from app.database import get_db
from app.api.disclaimers import require_recent_upload_acceptance
from app.deps import get_active_profile_id
from app.models import BankProfile, ImportBatch, ImportStatus, Transaction
from app.schemas import ImportBatchOut, ImportResult
from app.services.bank_accounts import apply_meta_to_batch, ensure_system_ledgers, refresh_openings
from app.services.capitec_fees import apply_capitec_fees_to_bank_ledger
from app.services.statement_meta import meta_from_pdf_bytes
from app.services.parsers import parse_statement
from app.services.rules_engine import apply_rules_to_transactions
from app.services.training import should_skip_description

router = APIRouter(prefix="/imports", tags=["imports"])


def _batch_out(batch: ImportBatch) -> ImportBatchOut:
    return ImportBatchOut(
        id=batch.id,
        bank_profile_id=batch.bank_profile_id,
        filename=batch.filename,
        uploaded_at=batch.uploaded_at,
        status=batch.status,
        transaction_count=batch.transaction_count,
        error_message=batch.error_message,
        bank_profile_name=batch.bank_profile.name if batch.bank_profile else None,
        bank_account_id=batch.bank_account_id,
        account_number=batch.account_number,
        statement_opening=batch.statement_opening,
        statement_closing=batch.statement_closing,
        period_start=batch.period_start,
        period_end=batch.period_end,
    )


@router.get("", response_model=list[ImportBatchOut])
def list_batches(
    limit: int = 50,
    db: Session = Depends(get_db),
    user_profile_id: int = Depends(get_active_profile_id),
):
    batches = (
        db.query(ImportBatch)
        .filter(ImportBatch.user_profile_id == user_profile_id)
        .order_by(ImportBatch.uploaded_at.desc())
        .limit(limit)
        .all()
    )
    return [_batch_out(b) for b in batches]


@router.get("/{batch_id}", response_model=ImportBatchOut)
def get_batch(
    batch_id: int,
    db: Session = Depends(get_db),
    user_profile_id: int = Depends(get_active_profile_id),
):
    batch = db.get(ImportBatch, batch_id)
    if not batch or batch.user_profile_id != user_profile_id:
        raise HTTPException(404, "Import batch not found")
    return _batch_out(batch)


@router.post("/upload", response_model=ImportResult)
async def upload_statement(
    bank_profile_id: int = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user_profile_id: int = Depends(get_active_profile_id),
):
    # Server-side gate: must have accepted current disclaimer recently
    require_recent_upload_acceptance(db, user_profile_id)

    profile = db.get(BankProfile, bank_profile_id)
    if not profile or profile.user_profile_id != user_profile_id:
        raise HTTPException(404, "Bank profile not found")

    filename = file.filename or "statement.csv"
    ext = Path(filename).suffix.lower()
    if ext not in {".csv", ".pdf", ".txt", ".tsv"}:
        raise HTTPException(400, "Only CSV and PDF files are supported")

    dest_name = f"{uuid.uuid4().hex}{ext}"
    dest_path = UPLOADS_DIR / dest_name
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

    content = await file.read()
    dest_path.write_bytes(content)

    batch = ImportBatch(
        user_profile_id=user_profile_id,
        bank_profile_id=profile.id,
        filename=filename,
        status=ImportStatus.PARSING.value,
        transaction_count=0,
    )
    db.add(batch)
    db.commit()
    db.refresh(batch)

    try:
        cal = profile.calibration_data or {}
        if not isinstance(cal, dict):
            cal = {}
        else:
            cal = dict(cal)

        # Always inject bank identity so PDF routing cannot miss (esp. Capitec).
        cal["bank_type"] = profile.bank_type or cal.get("bank_type")
        name_l = (profile.name or "").lower()
        bt_l = str(profile.bank_type or "").lower()
        if (
            "capitec" in name_l
            or bt_l.startswith("capitec")
            or cal.get("capitec_preset")
            or cal.get("capitec_business")
            or str(cal.get("parser") or "").lower().startswith("capitec")
        ):
            from app.services.parsers.capitec_pdf import CAPITEC_BUSINESS_PRESET

            # Preset first, then saved cal (saved wins on overlapping keys), then force flags
            cal = {**CAPITEC_BUSINESS_PRESET, **cal}
            cal["parser"] = "capitec_business"
            cal["capitec_preset"] = True
            cal["capitec_business"] = True
            cal["bank_family"] = "Capitec"
            cal["combine_fees_into_amount"] = False
            if ext == ".pdf":
                cal["file_type"] = "pdf"
        elif (
            "nedbank" in name_l
            or bt_l.startswith("nedbank")
            or cal.get("nedbank_preset")
            or str(cal.get("parser") or "").lower().startswith("nedbank")
        ):
            from app.services.parsers.nedbank_pdf import NEDBANK_PERSONAL_PRESET

            cal = {**NEDBANK_PERSONAL_PRESET, **cal}
            cal["parser"] = "nedbank_text"
            cal["nedbank_preset"] = True
            cal["bank_family"] = "Nedbank"
            if ext == ".pdf":
                cal["file_type"] = "pdf"

        parsed = parse_statement(dest_path, cal, filename)

        # Safety net: if 0 rows on PDF, try content-based bank recovery
        # (wrong bank profile selected is a common cause of silent zeros).
        if not parsed and ext == ".pdf":
            import pdfplumber as _pdfplumber

            try:
                with _pdfplumber.open(dest_path) as _pdf:
                    _sample = "\n".join((p.extract_text() or "") for p in _pdf.pages[:4])
            except Exception:
                _sample = ""

            from app.services.parsers.nedbank_pdf import (
                NEDBANK_PERSONAL_PRESET,
                looks_like_nedbank_text,
                parse_nedbank_pdf_text,
            )
            from app.services.parsers.capitec_pdf import (
                CAPITEC_BUSINESS_PRESET,
                looks_like_capitec_text,
                parse_capitec_pdf_text,
            )

            if looks_like_nedbank_text(_sample):
                parsed = parse_nedbank_pdf_text(content, dict(NEDBANK_PERSONAL_PRESET))
            elif looks_like_capitec_text(_sample):
                parsed = parse_capitec_pdf_text(content, dict(CAPITEC_BUSINESS_PRESET))
            elif (
                "nedbank" in name_l
                or bt_l.startswith("nedbank")
                or cal.get("nedbank_preset")
            ):
                parsed = parse_nedbank_pdf_text(content, {**NEDBANK_PERSONAL_PRESET, **cal})
            elif (
                "capitec" in name_l
                or bt_l.startswith("capitec")
                or cal.get("capitec_business")
            ):
                parsed = parse_capitec_pdf_text(content, {**CAPITEC_BUSINESS_PRESET, **cal})

        created_ids: list[int] = []
        skipped_trained = 0
        for p in parsed:
            if should_skip_description(db, user_profile_id, p.description):
                skipped_trained += 1
                continue
            tx = Transaction(
                user_profile_id=user_profile_id,
                bank_profile_id=profile.id,
                date=p.date,
                description=p.description,
                amount=p.amount,
                fee_amount=getattr(p, "fee_amount", None),
                principal_amount=getattr(p, "principal_amount", None),
                balance=p.balance,
                reference=p.reference,
                is_categorised=False,
                source_file=filename,
                import_batch_id=batch.id,
                is_excluded=False,
            )
            db.add(tx)
            db.flush()
            created_ids.append(tx.id)

        batch.transaction_count = len(created_ids)
        batch.status = ImportStatus.COMPLETED.value
        if not created_ids:
            batch.error_message = (
                f"Parser returned {len(parsed)} line(s) but none were saved"
                + (f" ({skipped_trained} skipped by training patterns)" if skipped_trained else "")
                + ". Check bank profile type/calibration (Update sample) or re-try after backend restart."
            )
        else:
            batch.error_message = None
        db.commit()

        # Capitec Business: Fees column → Bank Charges & Fees ledger (before user rules)
        fees_assigned = (
            apply_capitec_fees_to_bank_ledger(db, created_ids) if created_ids else 0
        )
        # Re-count batch if fee sibling rows were added
        if fees_assigned:
            batch_tx_count = (
                db.query(Transaction)
                .filter(Transaction.import_batch_id == batch.id)
                .count()
            )
            batch.transaction_count = batch_tx_count
            db.commit()
            # Include newly created fee lines in rule target list is unnecessary
            # (they are already categorised). Rules only touch uncategorised.

        # Double-entry: link the statement to its real bank account (account
        # number + printed opening/closing from the header). Never fails the import.
        try:
            meta = meta_from_pdf_bytes(content, profile.bank_type) if ext == ".pdf" else None
            batch.source_upload = dest_name
            ensure_system_ledgers(db, user_profile_id)
            apply_meta_to_batch(db, batch, meta, meta_source="pdf_header", bank_profile=profile)
            refresh_openings(db, user_profile_id)
            db.commit()
        except Exception as link_exc:  # noqa: BLE001
            db.rollback()
            import logging

            logging.getLogger(__name__).warning(
                "bank account linking failed for batch %s: %s", batch.id, link_exc
            )

        # Live-apply existing rules to new imports
        rules_applied = apply_rules_to_transactions(db, created_ids) if created_ids else 0
        db.refresh(batch)

        if not created_ids:
            msg = (
                f"No transactions captured from “{filename}” "
                f"(parsed={len(parsed)}, training_skipped={skipped_trained}). "
                "For Capitec Business, ensure the profile bank type is Capitec and the API is running "
                "the latest parser, then wipe and re-upload."
            )
        else:
            fee_note = (
                f" {fees_assigned} Capitec fee(s) auto-assigned to Bank Charges & Fees."
                if fees_assigned
                else ""
            )
            msg = (
                f"Imported {batch.transaction_count} transaction(s). "
                f"{rules_applied} auto-categorised by rules."
                + fee_note
                + (
                    f" Skipped {skipped_trained} trained noise pattern(s)."
                    if skipped_trained
                    else ""
                )
            )

        return ImportResult(
            batch=_batch_out(batch),
            transactions_created=len(created_ids),
            rules_applied=rules_applied,
            message=msg,
        )
    except Exception as exc:
        batch.status = ImportStatus.FAILED.value
        batch.error_message = str(exc)
        db.commit()
        raise HTTPException(400, f"Parse failed: {exc}") from exc
