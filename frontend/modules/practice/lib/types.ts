export type PartyKind = "client" | "supplier";

export type PartyType = "individual" | "business";

export type ProjectStatus = "open" | "on_hold" | "completed" | "cancelled";

export type EntryType =
  | "note"
  | "quote"
  | "invoice"
  | "rfq"
  | "expense"
  | "file"
  | "status"
  | "task"
  | "payment"
  | "meeting"
  | "wage"
  | "travel";

export type DocumentKind = "quote" | "invoice" | "rfq";

export const RFQ_EXPANSION = "Request for Quote";

export function parseDocumentKind(raw: string | null | undefined): DocumentKind {
  if (raw === "invoice" || raw === "rfq") return raw;
  return "quote";
}

export function documentKindLabel(kind: DocumentKind): string {
  if (kind === "invoice") return "Invoice";
  if (kind === "rfq") return "RFQ";
  return "Quote";
}

export type DocumentStatus =
  | "draft"
  | "sent"
  | "accepted"
  | "declined"
  | "invoiced"
  | "paid"
  | "void";

const DOCUMENT_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  declined: "Declined",
  invoiced: "Invoiced",
  paid: "Paid",
  void: "Void",
};

export function documentStatusLabel(status: string | null | undefined): string {
  if (!status) return "";
  return DOCUMENT_STATUS_LABEL[status] || status;
}

export type PracticeFlags = {
  quotes_enabled: boolean;
  invoices_enabled: boolean;
  projects_enabled: boolean;
};

export type PracticeParty = {
  id: number;
  kind: PartyKind;
  party_type: PartyType | string;
  name: string;
  trading_name: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  tax_number: string | null;
  vat_number: string | null;
  business_registration_number: string | null;
  notes: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

export type PracticeEntry = {
  id: number;
  project_id: number;
  entry_type: EntryType;
  title: string;
  body: string | null;
  amount: string | null;
  document_id: number | null;
  document_ids?: number[] | null;
  ledger_id?: number | null;
  expense_id: number | null;
  wage_id?: number | null;
  travel_id?: number | null;
  occurred_on: string | null;
  occurred_time: string | null;
  created_at: string;
};

export type PracticeProject = {
  id: number;
  client_id: number | null;
  client_name: string | null;
  name: string;
  reference: string | null;
  status: ProjectStatus;
  started_on: string | null;
  due_on: string | null;
  summary: string | null;
  checklist?: { id: string; text: string; done: boolean }[];
  is_archived: boolean;
  entry_count: number;
  created_at: string;
  updated_at: string;
};

export type PracticeProjectDetail = PracticeProject & {
  entries: PracticeEntry[];
};

export type PracticeStatus = {
  module: string;
  version: string;
  client_count: number;
  supplier_count: number;
  staff_count?: number;
  product_count?: number;
  project_count: number;
  open_project_count: number;
  entry_count: number;
  quote_count: number;
  invoice_count: number;
};

export type WorkflowYearOption = {
  fy_start_year: number;
  label: string;
  date_from: string;
  date_to: string;
  is_current: boolean;
  has_data: boolean;
};

export type WorkflowOverviewPoint = {
  month_index: number;
  month: string;
  month_name: string;
  label: string;
  quotes: string | number;
  invoices: string | number;
  expenses: string | number;
  wages?: string | number;
};

export type WorkflowOverview = {
  currency: string;
  fy_start_month: number;
  primary_fy_start_year: number;
  primary_label: string;
  available_years: WorkflowYearOption[];
  months: WorkflowOverviewPoint[];
  months_count: number;
  totals: { quotes: string; invoices: string; expenses: string; net: string; payments?: string; wages?: string };
};

export type WorkflowReportLine = {
  id: number;
  kind: string;
  occurred_on: string | null;
  number: string | null;
  title: string;
  client_name: string | null;
  project_id: number | null;
  project_name: string | null;
  document_id: number | null;
  status: string | null;
  amount: string;
};

export type WorkflowPLLine = {
  ledger_id: number | null;
  ledger_name: string;
  amount: string;
  count: number;
};

export type WorkflowPL = {
  income: WorkflowPLLine[];
  expenses: WorkflowPLLine[];
  income_total: string;
  expense_total: string;
  net: string;
};

export type WorkflowReport = {
  currency: string;
  fy_start_month: number;
  primary_fy_start_year: number;
  primary_label: string;
  date_from: string;
  date_to: string;
  available_years: WorkflowYearOption[];
  quotes: WorkflowReportLine[];
  invoices: WorkflowReportLine[];
  payments: WorkflowReportLine[];
  expenses: WorkflowReportLine[];
  wages?: WorkflowReportLine[];
  totals: { quotes: string; invoices: string; expenses: string; net: string; payments?: string; wages?: string };
  pl?: WorkflowPL;
};

export type AddressCard = {
  name?: string | null;
  trading_name?: string | null;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  postal_code?: string | null;
  country?: string | null;
  tax_number?: string | null;
  vat_number?: string | null;
  business_registration_number?: string | null;
  profile_type?: string | null;
  party_type?: string | null;
};

export type DocumentLine = {
  id?: number;
  item: string;
  description: string;
  quantity: string | number;
  unit_price: string | number;
  amount?: string | number;
  sort_order?: number;
};

export type PracticeTemplate = {
  kind: DocumentKind;
  number_code: string;
  number_prefix?: string;
  number_width?: number;
  number_next?: number;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  bank_branch_code: string | null;
  bank_extra: string | null;
  disclaimer: string | null;
};

export type PracticeIssuer = {
  name?: string | null;
  trading_name?: string | null;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  postal_code?: string | null;
  country?: string | null;
  tax_number?: string | null;
  vat_number?: string | null;
  business_registration_number?: string | null;
};

export type PracticeBranding = {
  has_logo: boolean;
  logo_source: "practice" | "profile" | string | null;
  use_profile_issuer: boolean;
  issuer: PracticeIssuer;
  profile_issuer: PracticeIssuer;
  vat_enabled: boolean;
  vat_rate: string | number;
  quotes: PracticeTemplate;
  invoices: PracticeTemplate;
};

export type NoteBlock = {
  type: "text" | "image";
  body?: string;
  path?: string;
  filename?: string;
};

export type BankSnapshot = {
  bank_name?: string | null;
  bank_account_name?: string | null;
  bank_account_number?: string | null;
  bank_branch_code?: string | null;
  bank_extra?: string | null;
};

export type PracticeDocument = {
  id: number;
  kind: DocumentKind;
  number: string;
  title: string;
  amount: string;
  issued_on: string | null;
  due_on: string | null;
  party_id: number | null;
  party_name: string | null;
  project_id: number | null;
  project_name: string | null;
  income_ledger_id: number | null;
  income_ledger_name: string | null;
  source_quote_id: number | null;
  source_quote_number: string | null;
  status: DocumentStatus;
  notes: string | null;
  notes_json?: NoteBlock[] | null;
  vat_enabled?: boolean;
  vat_rate?: string | number;
  subtotal?: string | number;
  vat_amount?: string | number;
  issuer?: AddressCard | null;
  client?: AddressCard | null;
  bank?: BankSnapshot | null;
  disclaimer?: string | null;
  has_logo?: boolean;
  lines: DocumentLine[];
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

export type DocumentPreviewPage = {
  index: number;
  data_url: string;
};

export type DocumentPreview = {
  kind: string;
  number: string;
  title: string;
  page_count: number;
  pages: DocumentPreviewPage[];
};

export type DocumentPrepare = {
  kind: DocumentKind;
  number: string;
  currency: string;
  suggested_title: string;
  issued_on?: string | null;
  issuer: AddressCard;
  client: AddressCard | null;
  party_id: number | null;
  project_id: number | null;
  project_name: string | null;
  default_income_ledger_id: number | null;
  default_income_ledger_name: string | null;
  vat_enabled: boolean;
  vat_rate: string | number;
  has_logo: boolean;
  bank: BankSnapshot | null;
  disclaimer: string | null;
};

export type PracticeLedger = {
  id: number;
  name: string;
  type: "income" | "expense" | string;
  is_archived: boolean;
  sort_order: number;
  created_at: string;
};

export type PracticeTravel = {
  id: number;
  project_id: number;
  staff_id: number;
  staff_name?: string | null;
  ledger_id: number;
  ledger_name?: string | null;
  km: string | number;
  price_per_litre: string | number;
  amount: string | number;
  occurred_on: string | null;
  notes: string | null;
  created_at: string;
};

export type PracticeExpense = {
  id: number;
  project_id: number;
  project_name?: string | null;
  ledger_id: number;
  ledger_name: string | null;
  supplier_id: number | null;
  supplier_name?: string | null;
  description: string;
  vendor_name: string | null;
  amount: string;
  incurred_on: string | null;
  notes: string | null;
  is_archived: boolean;
  created_at: string;
};

export type SupplierStatement = {
  party: PracticeParty;
  expenses: PracticeExpense[];
  totals: { spent: string; count: number };
};

export type ProjectStatement = {
  project: PracticeProject;
  notes: PracticeEntry[];
  quotes: PracticeDocument[];
  invoices: PracticeDocument[];
  expenses: PracticeExpense[];
  payments?: PracticeEntry[];
  wages?: PracticeWage[];
  travels?: PracticeTravel[];
  totals: {
    quotes: string;
    invoices: string;
    expenses: string;
    net: string;
    payments?: string;
    wages?: string;
  };
  currency: string;
  has_logo?: boolean;
  company_name?: string | null;
};

export type PartyWrite = {
  name: string;
  party_type?: PartyType | string;
  trading_name?: string | null;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  postal_code?: string | null;
  country?: string | null;
  tax_number?: string | null;
  vat_number?: string | null;
  business_registration_number?: string | null;
  notes?: string | null;
};

export type ProjectWrite = {
  name: string;
  reference?: string | null;
  client_id?: number | null;
  status?: ProjectStatus;
  started_on?: string | null;
  due_on?: string | null;
  summary?: string | null;
  checklist?: { id: string; text: string; done: boolean }[];
};

export type DocumentWrite = {
  kind: DocumentKind;
  title: string;
  amount?: number | string;
  issued_on?: string | null;
  party_id?: number | null;
  project_id?: number | null;
  income_ledger_id?: number | null;
  source_quote_id?: number | null;
  notes?: string | null;
  notes_json?: NoteBlock[] | null;
  status?: DocumentStatus;
  lines?: { item: string; description: string; quantity: number | string; unit_price: number | string }[];
};

export type ClientFileTab = "quotes" | "invoices" | "projects";

export function clientFileHref(id: number, tab?: ClientFileTab): string {
  const q = new URLSearchParams({ id: String(id) });
  if (tab) q.set("tab", tab);
  return `/practice/clients/file?${q.toString()}`;
}

export function supplierFileHref(id: number): string {
  return `/practice/suppliers/file?id=${id}`;
}

export function staffFileHref(id: number): string {
  return `/practice/staff/file?id=${id}`;
}

export type StaffWagePeriod = "day" | "week" | "biweekly" | "monthly";

export const STAFF_WAGE_PERIODS: { value: StaffWagePeriod; label: string }[] = [
  { value: "day", label: "Per day" },
  { value: "week", label: "Per week" },
  { value: "biweekly", label: "Bi-weekly" },
  { value: "monthly", label: "Monthly" },
];

export function staffWagePeriodLabel(period?: string | null): string {
  return STAFF_WAGE_PERIODS.find((p) => p.value === period)?.label || "Per week";
}

export type WageDeduction = {
  description: string;
  amount: string | number;
};

export function formatWageDays(days: string | number | null | undefined): string {
  if (days == null || days === "") return "";
  const n = Number(days);
  if (!Number.isFinite(n)) return String(days);
  return String(n);
}

export type PracticeStaff = {
  id: number;
  name: string;
  known_as: string | null;
  job_title: string | null;
  id_number: string | null;
  born_on: string | null;
  phone: string | null;
  email: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  bank_branch_code: string | null;
  wage_amount: string | number | null;
  wage_period: StaffWagePeriod | string;
  default_ledger_id?: number | null;
  default_ledger_name?: string | null;
  photo_path: string | null;
  has_photo: boolean;
  notes: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

export type StaffWrite = {
  name: string;
  known_as?: string | null;
  job_title?: string | null;
  id_number?: string | null;
  born_on?: string | null;
  phone?: string | null;
  email?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  postal_code?: string | null;
  country?: string | null;
  bank_name?: string | null;
  bank_account_name?: string | null;
  bank_account_number?: string | null;
  bank_branch_code?: string | null;
  wage_amount?: number | string | null;
  wage_period?: StaffWagePeriod | string | null;
  wage_effective_on?: string | null;
  default_ledger_id?: number | null;
  notes?: string | null;
  is_archived?: boolean;
};

export type PracticeWage = {
  id: number;
  project_id: number;
  project_name?: string | null;
  staff_id: number;
  staff_name?: string | null;
  amount: string;
  days?: string | number | null;
  rate_amount?: string | number | null;
  rate_period?: StaffWagePeriod | string | null;
  kind?: "wage" | "commission" | "absence" | string;
  override_reason?: string | null;
  ledger_id?: number | null;
  ledger_name?: string | null;
  deductions?: WageDeduction[];
  additions?: WageDeduction[];
  occurred_on: string | null;
  notes: string | null;
  created_at: string;
};

export type StaffWageHistory = {
  id: number;
  staff_id: number;
  amount: string | number;
  period: string;
  previous_amount: string | number | null;
  previous_period: string | null;
  kind: "start" | "increase" | "decrease" | "period_change" | string;
  effective_on: string;
  created_at: string;
};

export type StaffStatement = {
  staff: PracticeStaff;
  wages: PracticeWage[];
  wage_history?: StaffWageHistory[];
  totals: { spent: string; count: number };
};

export type PracticeProduct = {
  id: number;
  name: string;
  category?: string | null;
  description: string | null;
  supplier_stock_code: string | null;
  cost_price: string | number;
  markup_percent?: string | number | null;
  retail_price: string | number;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

export type ProductWrite = {
  name: string;
  category?: string | null;
  description?: string | null;
  supplier_stock_code?: string | null;
  cost_price?: number | string | null;
  markup_percent?: number | string | null;
  retail_price?: number | string | null;
  is_archived?: boolean;
};

export function documentEditorHref(opts: {
  kind: DocumentKind;
  id?: number;
  partyId?: number | null;
  projectId?: number | null;
  sourceQuoteId?: number | null;
}): string {
  const q = new URLSearchParams();
  q.set("kind", opts.kind);
  if (opts.id) q.set("id", String(opts.id));
  if (opts.partyId) q.set("party_id", String(opts.partyId));
  if (opts.projectId) q.set("project_id", String(opts.projectId));
  if (opts.sourceQuoteId) q.set("source_quote_id", String(opts.sourceQuoteId));
  return `/practice/document?${q.toString()}`;
}
