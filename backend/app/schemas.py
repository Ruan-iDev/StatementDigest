"""Pydantic request/response schemas. Money fields use Decimal."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ── User profiles (isolated workspaces) ───────────────────────────────────


class UserProfileOut(ORMModel):
    id: int
    name: str
    profile_type: str = "individual"  # individual | business
    public_id: Optional[str] = None  # visible unique attestation id
    full_name: Optional[str] = None
    business_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
    tax_number: Optional[str] = None
    business_registration_number: Optional[str] = None
    vat_number: Optional[str] = None
    notes: Optional[str] = None
    has_logo: bool = False
    fy_start_month: int = 3
    currency: str = "ZAR"
    created_at: datetime
    updated_at: datetime
    is_active: bool = False  # currently selected workspace
    # True when this is an extra client workspace with credentials (switch gate)
    has_password: bool = False
    workspace_username: Optional[str] = None  # set for extra profiles only
    ledger_count: int = 0
    bank_profile_count: int = 0
    transaction_count: int = 0


class UserProfileUpdate(BaseModel):
    name: Optional[str] = None
    profile_type: Optional[str] = None  # individual | business
    full_name: Optional[str] = None
    business_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
    tax_number: Optional[str] = None
    business_registration_number: Optional[str] = None
    vat_number: Optional[str] = None
    notes: Optional[str] = None
    fy_start_month: Optional[int] = Field(None, ge=1, le=12)
    currency: Optional[str] = None


class UserProfileCreate(BaseModel):
    name: str = "New Profile"
    profile_type: str = "individual"  # individual | business
    full_name: Optional[str] = None
    business_name: Optional[str] = None
    business_registration_number: Optional[str] = None
    vat_number: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    # Extra client workspaces only — required together when adding a new profile on My Profile
    workspace_username: Optional[str] = Field(None, max_length=120)
    password: Optional[str] = Field(None, min_length=1, max_length=1024)
    # Copy structure from another profile (clean slate otherwise)
    copy_ledgers_from_id: Optional[int] = None
    copy_bank_profiles_from_id: Optional[int] = None
    # Seed default starter ledgers when not copying ledgers
    seed_default_ledgers: bool = True


class UserProfileSwitch(BaseModel):
    profile_id: int
    # Required when target is an extra locked workspace
    workspace_username: Optional[str] = Field(None, max_length=120)
    password: Optional[str] = Field(None, max_length=1024)


# ── Settings ──────────────────────────────────────────────────────────────


class SettingsOut(BaseModel):
    fy_start_month: int = 3
    currency: str = "ZAR"
    active_profile_id: Optional[int] = None
    active_profile_name: Optional[str] = None


class SettingsUpdate(BaseModel):
    fy_start_month: Optional[int] = Field(None, ge=1, le=12)
    currency: Optional[str] = None


# ── Local data (on-device storage) ─────────────────────────────────────────


class LocalDataOut(BaseModel):
    """Where LedgerFlow stores data on this PC — never uploaded to a cloud."""

    data_dir: str
    database_path: str
    uploads_dir: str
    logos_dir: str
    database_exists: bool
    database_size_bytes: Optional[int] = None
    storage_mode: str = "local_only"
    # True when LEDGERFLOW_DATA overrides the default Documents location
    is_custom_location: bool = False
    default_data_dir: str = ""
    privacy_note: str = (
        "All of your financial data is stored only on this computer. "
        "LedgerFlow does not upload statements, transactions, or profiles to any cloud service."
    )


class LocalDataOpenBody(BaseModel):
    """Which local path to reveal in the system file manager."""

    target: str = Field(
        default="data_dir",
        description="One of: data_dir, database, uploads_dir, logos_dir",
    )


class LocalDataOpenResult(BaseModel):
    opened: str
    message: str


# ── Bank profiles ─────────────────────────────────────────────────────────


class BankProfileCreate(BaseModel):
    name: str
    bank_type: str = "Other"
    calibration_data: dict[str, Any] = Field(default_factory=dict)


class BankProfileUpdate(BaseModel):
    name: Optional[str] = None
    bank_type: Optional[str] = None
    calibration_data: Optional[dict[str, Any]] = None


class BankProfileOut(ORMModel):
    id: int
    name: str
    bank_type: str
    calibration_data: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class CalibrationPreviewRequest(BaseModel):
    """Preview parse of an uploaded sample using proposed calibration."""
    bank_type: str = "Other"
    calibration_data: dict[str, Any] = Field(default_factory=dict)


class CalibrationPreviewRow(BaseModel):
    date: Optional[str] = None
    description: Optional[str] = None
    amount: Optional[str] = None
    balance: Optional[str] = None
    reference: Optional[str] = None


class CalibrationPreviewResponse(BaseModel):
    columns: list[str] = Field(default_factory=list)
    sample_rows: list[dict[str, Any]] = Field(default_factory=list)
    parsed_preview: list[CalibrationPreviewRow] = Field(default_factory=list)
    detected_format: str = "csv"
    message: str = ""


class WizardOption(BaseModel):
    key: str
    label: str
    help: str = ""
    default: bool = False
    type: str = "yes_no"
    visible: bool = True


class DetectedColumn(BaseModel):
    name: str
    role: str


class DissectResponse(BaseModel):
    """Friendly bank-profile wizard payload after dissecting a sample statement."""

    bank_type: str = "Other"
    suggested_name: str = ""
    detected_format: str = "csv"
    calibration: dict[str, Any] = Field(default_factory=dict)
    columns: list[str] = Field(default_factory=list)
    detected_columns: list[DetectedColumn] = Field(default_factory=list)
    options: list[WizardOption] = Field(default_factory=list)
    parsed_preview: list[CalibrationPreviewRow] = Field(default_factory=list)
    sample_rows: list[dict[str, Any]] = Field(default_factory=list)
    message: str = ""


# ── Ledgers ───────────────────────────────────────────────────────────────


class LedgerCreate(BaseModel):
    name: str
    type: str
    parent_id: Optional[int] = None
    budget_monthly: Optional[Decimal] = None
    budget_annual: Optional[Decimal] = None
    sort_order: int = 0


class LedgerUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    parent_id: Optional[int] = None
    is_archived: Optional[bool] = None
    budget_monthly: Optional[Decimal] = None
    budget_annual: Optional[Decimal] = None
    sort_order: Optional[int] = None


class LedgerOut(ORMModel):
    id: int
    name: str
    type: str
    parent_id: Optional[int]
    parent_name: Optional[str] = None
    depth: int = 0
    is_system: bool
    is_archived: bool
    budget_monthly: Optional[Decimal]
    budget_annual: Optional[Decimal]
    sort_order: int
    created_at: datetime
    updated_at: datetime


# ── Rules ─────────────────────────────────────────────────────────────────


class RuleCreate(BaseModel):
    name: str
    match_type: str
    match_value: Optional[str] = None
    match_json: Optional[dict[str, Any]] = None
    ledger_id: int
    priority: int = 0
    is_active: bool = True


class RuleUpdate(BaseModel):
    name: Optional[str] = None
    match_type: Optional[str] = None
    match_value: Optional[str] = None
    match_json: Optional[dict[str, Any]] = None
    ledger_id: Optional[int] = None
    priority: Optional[int] = None
    is_active: Optional[bool] = None


class RuleOut(ORMModel):
    id: int
    name: str
    match_type: str
    match_value: Optional[str]
    match_json: Optional[dict[str, Any]]
    ledger_id: int
    priority: int
    is_active: bool
    created_at: datetime
    updated_at: datetime
    applied_count: int = 0  # set by API when useful


class RuleApplyResult(BaseModel):
    rule_id: int
    matched: int
    message: str


# ── Transactions ──────────────────────────────────────────────────────────


class TransactionOut(ORMModel):
    id: int
    bank_profile_id: int
    date: date
    description: str
    amount: Decimal
    # Capitec Business: as on statement (amount is still cash total for ledgers)
    fee_amount: Optional[Decimal] = None
    principal_amount: Optional[Decimal] = None
    balance: Optional[Decimal]
    reference: Optional[str]
    ledger_id: Optional[int]
    is_categorised: bool
    rule_id: Optional[int]
    notes: Optional[str]
    source_file: Optional[str]
    import_batch_id: Optional[int]
    is_excluded: bool = False
    training_reason: Optional[str] = None
    training_detail: Optional[str] = None
    trained_at: Optional[datetime] = None
    created_at: datetime
    bank_profile_name: Optional[str] = None
    ledger_name: Optional[str] = None


class TransactionUpdate(BaseModel):
    ledger_id: Optional[int] = None
    notes: Optional[str] = None
    is_categorised: Optional[bool] = None


class TrainingReasonOut(BaseModel):
    code: str
    label: str
    hint: Optional[str] = None
    is_system: bool = False
    use_count: int = 0


class TrainTransactionRequest(BaseModel):
    reason_code: str
    detail: Optional[str] = None
    custom_label: Optional[str] = None


class TrainTransactionResult(BaseModel):
    transaction_id: int
    is_excluded: bool
    training_reason: str
    message: str


class BulkCategoriseRequest(BaseModel):
    transaction_ids: list[int]
    ledger_id: int


class BulkCategoriseResult(BaseModel):
    updated: int


class CreateRuleFromTransactionRequest(BaseModel):
    """Create a rule from one or more pending transactions and live-strip queue."""
    transaction_ids: list[int]
    name: str
    match_type: str = "contains"
    match_value: Optional[str] = None
    match_json: Optional[dict[str, Any]] = None
    ledger_id: int
    priority: int = 10
    # If True, also categorise the selected transactions even if they don't match
    force_selected: bool = True


# ── Import batches ────────────────────────────────────────────────────────


class ImportBatchOut(ORMModel):
    id: int
    bank_profile_id: int
    filename: str
    uploaded_at: datetime
    status: str
    transaction_count: int
    error_message: Optional[str]
    bank_profile_name: Optional[str] = None


class ImportResult(BaseModel):
    batch: ImportBatchOut
    transactions_created: int
    rules_applied: int
    message: str


# ── Reports ───────────────────────────────────────────────────────────────


class PLLineItem(BaseModel):
    ledger_id: int
    ledger_name: str
    ledger_type: str
    amount: Decimal
    budget: Optional[Decimal] = None
    variance: Optional[Decimal] = None
    budget_pct: Optional[Decimal] = None
    traffic_light: str  # green | amber | red | none


class PLReport(BaseModel):
    period_label: str
    date_from: date
    date_to: date
    currency: str
    income_lines: list[PLLineItem]
    expense_lines: list[PLLineItem]
    other_lines: list[PLLineItem] = Field(default_factory=list)
    total_income: Decimal
    total_expenses: Decimal
    net_result: Decimal


class MonthlyComparisonPoint(BaseModel):
    """One month slot in a financial year (always 12 slots, L→R)."""

    month_index: int  # 0–11 within the FY
    month: str  # YYYY-MM (primary FY)
    month_name: str  # Mar, Apr, …
    label: str  # e.g. Mar 2026
    income: Decimal = Decimal("0")
    expenses: Decimal = Decimal("0")
    income_budget: Decimal = Decimal("0")
    expense_budget: Decimal = Decimal("0")
    net: Decimal = Decimal("0")
    # Optional comparison FY values (aligned by month index)
    compare_month: Optional[str] = None
    compare_label: Optional[str] = None
    compare_income: Decimal = Decimal("0")
    compare_expenses: Decimal = Decimal("0")
    compare_income_budget: Decimal = Decimal("0")
    compare_expense_budget: Decimal = Decimal("0")
    compare_net: Decimal = Decimal("0")


class FinancialYearOption(BaseModel):
    fy_start_year: int
    label: str
    date_from: date
    date_to: date
    is_current: bool
    has_data: bool


class MonthlyComparisonReport(BaseModel):
    currency: str
    fy_start_month: int
    primary_fy_start_year: int
    primary_label: str
    compare_fy_start_year: Optional[int] = None
    compare_label: Optional[str] = None
    available_years: list[FinancialYearOption] = Field(default_factory=list)
    months: list[MonthlyComparisonPoint]  # always 12, left → right
    months_count: int = 12


class PLMatrixMonthCol(BaseModel):
    """One month column in a financial-year P&L matrix (always 12, L→R)."""

    month_index: int  # 0–11
    month: str  # YYYY-MM
    month_name: str  # Mar, Apr, …
    label: str  # Mar 2022


class PLMatrixLedgerRow(BaseModel):
    ledger_id: int
    ledger_name: str
    ledger_type: str
    # 12 month amounts left→right (same order as months)
    amounts: list[Decimal] = Field(default_factory=list)
    total: Decimal = Decimal("0")


class PLMatrixReport(BaseModel):
    """Full financial year P&L: months as columns, ledgers as rows."""

    currency: str
    fy_start_month: int
    fy_start_year: int
    label: str
    date_from: date
    date_to: date
    is_current_fy: bool
    # Years with categorised activity (for year switcher buttons)
    available_years: list[FinancialYearOption] = Field(default_factory=list)
    months: list[PLMatrixMonthCol]  # always 12
    income_rows: list[PLMatrixLedgerRow] = Field(default_factory=list)
    expense_rows: list[PLMatrixLedgerRow] = Field(default_factory=list)
    transfer_rows: list[PLMatrixLedgerRow] = Field(default_factory=list)
    month_income_totals: list[Decimal] = Field(default_factory=list)
    month_expense_totals: list[Decimal] = Field(default_factory=list)
    month_transfer_totals: list[Decimal] = Field(default_factory=list)
    month_net_totals: list[Decimal] = Field(default_factory=list)
    total_income: Decimal = Decimal("0")
    total_expenses: Decimal = Decimal("0")
    total_transfers: Decimal = Decimal("0")
    net_result: Decimal = Decimal("0")


class BudgetMatrixLedgerRow(BaseModel):
    """One ledger with per-month budget + actual (only ledgers that have a budget preset)."""

    ledger_id: int
    ledger_name: str
    ledger_type: str
    # Parallel arrays, 12 months L→R
    budgets: list[Decimal] = Field(default_factory=list)
    actuals: list[Decimal] = Field(default_factory=list)
    budget_total: Decimal = Decimal("0")
    actual_total: Decimal = Decimal("0")
    variance_total: Decimal = Decimal("0")  # budget − actual (expense: under budget is positive)


class BudgetMatrixReport(BaseModel):
    """FY matrix: months L→R, dual columns Budget | Actual per month. Budgeted ledgers only."""

    currency: str
    fy_start_month: int
    fy_start_year: int
    label: str
    date_from: date
    date_to: date
    is_current_fy: bool
    available_years: list[FinancialYearOption] = Field(default_factory=list)
    months: list[PLMatrixMonthCol]  # always 12
    income_rows: list[BudgetMatrixLedgerRow] = Field(default_factory=list)
    expense_rows: list[BudgetMatrixLedgerRow] = Field(default_factory=list)
    other_rows: list[BudgetMatrixLedgerRow] = Field(default_factory=list)
    # Section totals per month (budget / actual)
    month_income_budgets: list[Decimal] = Field(default_factory=list)
    month_income_actuals: list[Decimal] = Field(default_factory=list)
    month_expense_budgets: list[Decimal] = Field(default_factory=list)
    month_expense_actuals: list[Decimal] = Field(default_factory=list)
    total_income_budget: Decimal = Decimal("0")
    total_income_actual: Decimal = Decimal("0")
    total_expense_budget: Decimal = Decimal("0")
    total_expense_actual: Decimal = Decimal("0")


class DashboardStats(BaseModel):
    pending_count: int
    total_transactions: int
    categorised_count: int
    ledger_count: int
    rule_count: int
    recent_batches: list[ImportBatchOut]
    income_mtd: Decimal
    expenses_mtd: Decimal
