"""Seed starter ledgers and default settings on first run."""

from sqlalchemy.orm import Session

from app.models import AppSettings, Ledger, LedgerType, UserProfile


# Starter ledgers – system but still editable / archivable by the user
STARTER_LEDGERS: list[dict] = [
    # Income
    {"name": "Salary / Wages", "type": LedgerType.INCOME.value, "sort_order": 10},
    {"name": "Interest Received", "type": LedgerType.INCOME.value, "sort_order": 20},
    {"name": "Dividends", "type": LedgerType.INCOME.value, "sort_order": 30},
    {"name": "Rental Income", "type": LedgerType.INCOME.value, "sort_order": 40},
    {"name": "Sales / Invoice Income", "type": LedgerType.INCOME.value, "sort_order": 45},
    {"name": "Other Income", "type": LedgerType.INCOME.value, "sort_order": 50},
    {"name": "Transfers In (non-taxable)", "type": LedgerType.TRANSFER.value, "sort_order": 60},
    # Expenses
    {"name": "Cost of Sales / Purchases", "type": LedgerType.EXPENSE.value, "sort_order": 100},
    {"name": "Bank Charges & Fees", "type": LedgerType.EXPENSE.value, "sort_order": 110},
    {"name": "Insurance", "type": LedgerType.EXPENSE.value, "sort_order": 120},
    {"name": "Medical / Health", "type": LedgerType.EXPENSE.value, "sort_order": 130},
    {"name": "Motor Vehicle (fuel, maintenance, insurance)", "type": LedgerType.EXPENSE.value, "sort_order": 140},
    {"name": "Home Office / Rent", "type": LedgerType.EXPENSE.value, "sort_order": 150},
    {"name": "Utilities", "type": LedgerType.EXPENSE.value, "sort_order": 160},
    {"name": "Subscriptions & Software", "type": LedgerType.EXPENSE.value, "sort_order": 170},
    {"name": "Professional Fees (accounting, legal)", "type": LedgerType.EXPENSE.value, "sort_order": 180},
    {"name": "Travel & Accommodation", "type": LedgerType.EXPENSE.value, "sort_order": 190},
    {"name": "Entertainment / Meals", "type": LedgerType.EXPENSE.value, "sort_order": 200},
    {"name": "Education / Training", "type": LedgerType.EXPENSE.value, "sort_order": 210},
    {"name": "Donations", "type": LedgerType.EXPENSE.value, "sort_order": 220},
    {"name": "Other Operating Expenses", "type": LedgerType.EXPENSE.value, "sort_order": 230},
    # Capital / Other
    {"name": "Asset Purchases (to be capitalised)", "type": LedgerType.CAPITAL.value, "sort_order": 300},
    {"name": "Loan Repayments (capital portion)", "type": LedgerType.CAPITAL.value, "sort_order": 310},
    {"name": "Transfers Out", "type": LedgerType.TRANSFER.value, "sort_order": 320},
    {"name": "Personal Drawings", "type": LedgerType.OTHER.value, "sort_order": 330},
]

DEFAULT_SETTINGS = {
    "fy_start_month": "3",  # March – South Africa
    "currency": "ZAR",
}


def seed_ledgers_for_profile(db: Session, user_profile_id: int) -> int:
    """Insert starter ledgers for a profile when it has none. Returns count created."""
    if db.query(Ledger).filter(Ledger.user_profile_id == user_profile_id).count() > 0:
        return 0
    n = 0
    for item in STARTER_LEDGERS:
        db.add(
            Ledger(
                user_profile_id=user_profile_id,
                name=item["name"],
                type=item["type"],
                is_system=True,
                is_archived=False,
                budget_monthly=None,
                budget_annual=None,
                sort_order=item["sort_order"],
            )
        )
        n += 1
    db.commit()
    return n


def seed_if_empty(db: Session) -> None:
    """Bootstrap default user profile + ledgers (multi-profile aware)."""
    from app.migrate_schema import ensure_default_profile

    ensure_default_profile(db)

    # Keep legacy global settings keys for compatibility
    for key, value in DEFAULT_SETTINGS.items():
        existing = db.query(AppSettings).filter(AppSettings.key == key).first()
        if not existing:
            db.add(AppSettings(key=key, value=value))
    db.commit()
