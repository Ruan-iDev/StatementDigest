from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class PartyCreate(BaseModel):
    kind: str = Field(pattern="^(client|supplier)$")
    party_type: str = "individual"
    name: str = Field(min_length=1, max_length=200)
    trading_name: Optional[str] = None
    contact_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = "South Africa"
    tax_number: Optional[str] = None
    vat_number: Optional[str] = None
    business_registration_number: Optional[str] = None
    notes: Optional[str] = None


class PartyUpdate(BaseModel):
    party_type: Optional[str] = None
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    trading_name: Optional[str] = None
    contact_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
    tax_number: Optional[str] = None
    vat_number: Optional[str] = None
    business_registration_number: Optional[str] = None
    notes: Optional[str] = None
    is_archived: Optional[bool] = None


class PartyOut(ORMModel):
    id: int
    kind: str
    party_type: str = "individual"
    name: str
    trading_name: Optional[str] = None
    contact_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
    tax_number: Optional[str] = None
    vat_number: Optional[str] = None
    business_registration_number: Optional[str] = None
    notes: Optional[str] = None
    is_archived: bool
    created_at: datetime
    updated_at: datetime


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=240)
    reference: Optional[str] = None
    client_id: Optional[int] = None
    status: str = "open"
    started_on: Optional[date] = None
    due_on: Optional[date] = None
    summary: Optional[str] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=240)
    reference: Optional[str] = None
    client_id: Optional[int] = None
    status: Optional[str] = None
    started_on: Optional[date] = None
    due_on: Optional[date] = None
    summary: Optional[str] = None
    is_archived: Optional[bool] = None


class EntryCreate(BaseModel):
    entry_type: str = "note"
    title: str = Field(min_length=1, max_length=240)
    body: Optional[str] = None
    amount: Optional[Decimal] = None
    document_id: Optional[int] = None
    occurred_on: Optional[date] = None
    occurred_time: Optional[str] = None


class EntryUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=240)
    body: Optional[str] = None
    amount: Optional[Decimal] = None
    document_id: Optional[int] = None
    occurred_on: Optional[date] = None
    occurred_time: Optional[str] = None


class EntryOut(ORMModel):
    id: int
    project_id: int
    entry_type: str
    title: str
    body: Optional[str] = None
    amount: Optional[Decimal] = None
    document_id: Optional[int] = None
    expense_id: Optional[int] = None
    wage_id: Optional[int] = None
    occurred_on: Optional[date] = None
    occurred_time: Optional[str] = None
    created_at: datetime


class ProjectOut(ORMModel):
    id: int
    client_id: Optional[int] = None
    client_name: Optional[str] = None
    name: str
    reference: Optional[str] = None
    status: str
    started_on: Optional[date] = None
    due_on: Optional[date] = None
    summary: Optional[str] = None
    is_archived: bool
    entry_count: int = 0
    created_at: datetime
    updated_at: datetime


class ProjectDetailOut(ProjectOut):
    entries: list[EntryOut] = Field(default_factory=list)


class PracticeStatusOut(BaseModel):
    module: str
    version: str
    client_count: int
    supplier_count: int
    staff_count: int = 0
    product_count: int = 0
    project_count: int
    open_project_count: int
    entry_count: int
    quote_count: int = 0
    invoice_count: int = 0


class WorkflowYearOption(BaseModel):
    fy_start_year: int
    label: str
    date_from: date
    date_to: date
    is_current: bool
    has_data: bool


class WorkflowOverviewPoint(BaseModel):
    month_index: int
    month: str
    month_name: str
    label: str
    quotes: Decimal = Decimal("0")
    invoices: Decimal = Decimal("0")
    expenses: Decimal = Decimal("0")
    wages: Decimal = Decimal("0")


class WorkflowOverviewOut(BaseModel):
    currency: str
    fy_start_month: int
    primary_fy_start_year: int
    primary_label: str
    available_years: list[WorkflowYearOption] = Field(default_factory=list)
    months: list[WorkflowOverviewPoint]
    months_count: int = 12
    totals: StatementTotals


class WorkflowReportLine(BaseModel):
    id: int
    kind: str
    occurred_on: Optional[date] = None
    number: Optional[str] = None
    title: str
    client_name: Optional[str] = None
    project_id: Optional[int] = None
    project_name: Optional[str] = None
    document_id: Optional[int] = None
    status: Optional[str] = None
    amount: Decimal


class WorkflowReportOut(BaseModel):
    currency: str
    fy_start_month: int
    primary_fy_start_year: int
    primary_label: str
    date_from: date
    date_to: date
    available_years: list[WorkflowYearOption] = Field(default_factory=list)
    quotes: list[WorkflowReportLine] = Field(default_factory=list)
    invoices: list[WorkflowReportLine] = Field(default_factory=list)
    payments: list[WorkflowReportLine] = Field(default_factory=list)
    expenses: list[WorkflowReportLine] = Field(default_factory=list)
    wages: list[WorkflowReportLine] = Field(default_factory=list)
    totals: StatementTotals


class FeatureFlagsOut(BaseModel):
    quotes_enabled: bool
    invoices_enabled: bool
    projects_enabled: bool


class FeatureFlagsUpdate(BaseModel):
    quotes_enabled: Optional[bool] = None
    invoices_enabled: Optional[bool] = None
    projects_enabled: Optional[bool] = None


class DocumentLineIn(BaseModel):
    item: str = ""
    description: str = ""
    quantity: Decimal = Decimal("1")
    unit_price: Decimal = Decimal("0")


class DocumentLineOut(ORMModel):
    id: int
    item: str = ""
    description: str
    quantity: Decimal
    unit_price: Decimal
    amount: Decimal
    sort_order: int


class AddressCard(BaseModel):
    name: Optional[str] = None
    trading_name: Optional[str] = None
    contact_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
    tax_number: Optional[str] = None
    vat_number: Optional[str] = None
    business_registration_number: Optional[str] = None
    profile_type: Optional[str] = None
    party_type: Optional[str] = None


class DocumentCreate(BaseModel):
    kind: str = Field(pattern="^(quote|invoice|rfq)$")
    title: str = Field(min_length=1, max_length=240)
    amount: Optional[Decimal] = None
    issued_on: Optional[date] = None
    due_on: Optional[date] = None
    party_id: Optional[int] = None
    project_id: Optional[int] = None
    income_ledger_id: Optional[int] = None
    source_quote_id: Optional[int] = None
    notes: Optional[str] = None
    notes_json: Optional[list] = None
    status: str = "draft"
    lines: list[DocumentLineIn] = Field(default_factory=list)


class DocumentUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=240)
    amount: Optional[Decimal] = None
    issued_on: Optional[date] = None
    due_on: Optional[date] = None
    party_id: Optional[int] = None
    project_id: Optional[int] = None
    income_ledger_id: Optional[int] = None
    notes: Optional[str] = None
    notes_json: Optional[list] = None
    status: Optional[str] = None
    is_archived: Optional[bool] = None
    lines: Optional[list[DocumentLineIn]] = None


class InvoiceFromQuote(BaseModel):
    income_ledger_id: int
    issued_on: Optional[date] = None
    due_on: Optional[date] = None
    notes: Optional[str] = None


class DocumentOut(ORMModel):
    id: int
    kind: str
    number: str
    title: str
    amount: Decimal
    issued_on: Optional[date] = None
    due_on: Optional[date] = None
    party_id: Optional[int] = None
    party_name: Optional[str] = None
    project_id: Optional[int] = None
    project_name: Optional[str] = None
    income_ledger_id: Optional[int] = None
    income_ledger_name: Optional[str] = None
    source_quote_id: Optional[int] = None
    source_quote_number: Optional[str] = None
    status: str
    notes: Optional[str] = None
    notes_json: Optional[list] = None
    vat_enabled: bool = False
    vat_rate: Decimal = Decimal("15")
    subtotal: Decimal = Decimal("0")
    vat_amount: Decimal = Decimal("0")
    issuer: Optional[AddressCard] = None
    client: Optional[AddressCard] = None
    bank: Optional[dict] = None
    disclaimer: Optional[str] = None
    has_logo: bool = False
    lines: list[DocumentLineOut] = Field(default_factory=list)
    is_archived: bool
    created_at: datetime
    updated_at: datetime


class NoteImageOut(BaseModel):
    path: str
    filename: str


class DocumentPreviewPage(BaseModel):
    index: int
    data_url: str


class DocumentPreviewOut(BaseModel):
    kind: str
    number: str
    title: str
    page_count: int
    pages: list[DocumentPreviewPage] = Field(default_factory=list)


class DocumentPrepareOut(BaseModel):
    kind: str
    number: str
    currency: str = "ZAR"
    suggested_title: str
    issued_on: Optional[date] = None
    issuer: AddressCard
    client: Optional[AddressCard] = None
    party_id: Optional[int] = None
    project_id: Optional[int] = None
    project_name: Optional[str] = None
    default_income_ledger_id: Optional[int] = None
    default_income_ledger_name: Optional[str] = None
    vat_enabled: bool = False
    vat_rate: Decimal = Decimal("15")
    has_logo: bool = False
    bank: Optional[dict] = None
    disclaimer: Optional[str] = None


class TemplateOut(BaseModel):
    kind: str
    number_code: str
    number_prefix: str
    number_width: int
    number_next: int
    bank_name: Optional[str] = None
    bank_account_name: Optional[str] = None
    bank_account_number: Optional[str] = None
    bank_branch_code: Optional[str] = None
    bank_extra: Optional[str] = None
    disclaimer: Optional[str] = None


class TemplateUpdate(BaseModel):
    number_code: Optional[str] = None
    bank_name: Optional[str] = None
    bank_account_name: Optional[str] = None
    bank_account_number: Optional[str] = None
    bank_branch_code: Optional[str] = None
    bank_extra: Optional[str] = None
    disclaimer: Optional[str] = None


class VatUpdate(BaseModel):
    vat_enabled: bool
    vat_rate: Optional[Decimal] = None


class IssuerDetails(BaseModel):
    name: Optional[str] = None
    trading_name: Optional[str] = None
    contact_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = "South Africa"
    tax_number: Optional[str] = None
    vat_number: Optional[str] = None
    business_registration_number: Optional[str] = None


class IssuerUpdate(BaseModel):
    use_profile_data: bool = False
    details: Optional[IssuerDetails] = None


class BrandingOut(BaseModel):
    has_logo: bool
    logo_source: Optional[str] = None  # practice | profile
    use_profile_issuer: bool = False
    issuer: IssuerDetails
    profile_issuer: IssuerDetails
    vat_enabled: bool = False
    vat_rate: Decimal = Decimal("15")
    quotes: TemplateOut
    invoices: TemplateOut


class ExpenseCreate(BaseModel):
    project_id: int
    ledger_id: int
    description: str = Field(min_length=1, max_length=240)
    amount: Decimal
    incurred_on: Optional[date] = None
    supplier_id: Optional[int] = None
    vendor_name: Optional[str] = None
    notes: Optional[str] = None


class ExpenseUpdate(BaseModel):
    ledger_id: Optional[int] = None
    description: Optional[str] = Field(default=None, min_length=1, max_length=240)
    amount: Optional[Decimal] = None
    incurred_on: Optional[date] = None
    supplier_id: Optional[int] = None
    vendor_name: Optional[str] = None
    notes: Optional[str] = None


class ExpenseOut(ORMModel):
    id: int
    project_id: int
    project_name: Optional[str] = None
    ledger_id: int
    ledger_name: Optional[str] = None
    supplier_id: Optional[int] = None
    supplier_name: Optional[str] = None
    description: str
    vendor_name: Optional[str] = None
    amount: Decimal
    incurred_on: Optional[date] = None
    notes: Optional[str] = None
    is_archived: bool
    created_at: datetime


class ProductCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    category: Optional[str] = Field(default=None, max_length=80)
    description: Optional[str] = None
    supplier_stock_code: Optional[str] = None
    cost_price: Decimal = Decimal("0")
    markup_percent: Optional[Decimal] = None
    retail_price: Decimal = Decimal("0")


class ProductUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    category: Optional[str] = Field(default=None, max_length=80)
    description: Optional[str] = None
    supplier_stock_code: Optional[str] = None
    cost_price: Optional[Decimal] = None
    markup_percent: Optional[Decimal] = None
    retail_price: Optional[Decimal] = None
    is_archived: Optional[bool] = None


class ProductOut(ORMModel):
    id: int
    name: str
    category: Optional[str] = None
    description: Optional[str] = None
    supplier_stock_code: Optional[str] = None
    cost_price: Decimal
    markup_percent: Optional[Decimal] = None
    retail_price: Decimal
    is_archived: bool
    created_at: datetime
    updated_at: datetime


class StaffCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    known_as: Optional[str] = None
    job_title: Optional[str] = None
    id_number: Optional[str] = None
    born_on: Optional[date] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = "South Africa"
    bank_name: Optional[str] = None
    bank_account_name: Optional[str] = None
    bank_account_number: Optional[str] = None
    bank_branch_code: Optional[str] = None
    wage_amount: Optional[Decimal] = None
    wage_period: Optional[str] = "week"
    wage_effective_on: Optional[date] = None
    notes: Optional[str] = None


class StaffUpdate(StaffCreate):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    is_archived: Optional[bool] = None


class StaffOut(ORMModel):
    id: int
    name: str
    known_as: Optional[str] = None
    job_title: Optional[str] = None
    id_number: Optional[str] = None
    born_on: Optional[date] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
    bank_name: Optional[str] = None
    bank_account_name: Optional[str] = None
    bank_account_number: Optional[str] = None
    bank_branch_code: Optional[str] = None
    wage_amount: Optional[Decimal] = None
    wage_period: str = "week"
    photo_path: Optional[str] = None
    has_photo: bool = False
    notes: Optional[str] = None
    is_archived: bool
    created_at: datetime
    updated_at: datetime


class StaffWageHistoryOut(ORMModel):
    id: int
    staff_id: int
    amount: Decimal
    period: str
    previous_amount: Optional[Decimal] = None
    previous_period: Optional[str] = None
    kind: str
    effective_on: date
    created_at: datetime


class WageDeductionIn(BaseModel):
    description: str = ""
    amount: Decimal = Decimal("0")


class WageDeductionOut(BaseModel):
    description: str
    amount: Decimal


class WageCreate(BaseModel):
    project_id: int
    staff_id: int
    amount: Optional[Decimal] = None
    days: Optional[Decimal] = None
    occurred_on: Optional[date] = None
    notes: Optional[str] = None
    deductions: list[WageDeductionIn] = Field(default_factory=list)
    additions: list[WageDeductionIn] = Field(default_factory=list)


class WageUpdate(BaseModel):
    staff_id: Optional[int] = None
    amount: Optional[Decimal] = None
    days: Optional[Decimal] = None
    occurred_on: Optional[date] = None
    notes: Optional[str] = None
    deductions: Optional[list[WageDeductionIn]] = None
    additions: Optional[list[WageDeductionIn]] = None


class WageOut(ORMModel):
    id: int
    project_id: int
    project_name: Optional[str] = None
    staff_id: int
    staff_name: Optional[str] = None
    amount: Decimal
    days: Optional[Decimal] = None
    rate_amount: Optional[Decimal] = None
    rate_period: Optional[str] = None
    deductions: list[WageDeductionOut] = Field(default_factory=list)
    additions: list[WageDeductionOut] = Field(default_factory=list)
    occurred_on: Optional[date] = None
    notes: Optional[str] = None
    created_at: datetime


class SupplierSpendTotals(BaseModel):
    spent: Decimal = Decimal("0")
    count: int = 0


class StaffStatementOut(BaseModel):
    staff: StaffOut
    wages: list[WageOut] = Field(default_factory=list)
    wage_history: list[StaffWageHistoryOut] = Field(default_factory=list)
    totals: SupplierSpendTotals


class SupplierStatementOut(BaseModel):
    party: PartyOut
    expenses: list[ExpenseOut] = Field(default_factory=list)
    totals: SupplierSpendTotals


class StatementTotals(BaseModel):
    quotes: Decimal
    invoices: Decimal
    expenses: Decimal
    net: Decimal
    payments: Decimal = Decimal("0")
    wages: Decimal = Decimal("0")


class ProjectStatementOut(BaseModel):
    project: ProjectOut
    notes: list[EntryOut]
    quotes: list[DocumentOut]
    invoices: list[DocumentOut]
    expenses: list[ExpenseOut]
    payments: list[EntryOut] = Field(default_factory=list)
    totals: StatementTotals
    currency: str = "ZAR"
    has_logo: bool = False
