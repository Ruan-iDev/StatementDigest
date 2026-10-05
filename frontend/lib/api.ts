/**
 * API client for local LedgerFlow backend (default http://127.0.0.1:8470).
 */

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://127.0.0.1:8470/api";

const PROFILE_STORAGE_KEY = "ledgerflow-active-profile-id";
const AUTH_TOKEN_KEY = "ledgerflow-auth-token";
const GUEST_FLAG_KEY = "ledgerflow-guest";

/** Active workspace id sent as X-Profile-Id on every API call. */
export function getStoredProfileId(): number | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function setStoredProfileId(id: number | null) {
  if (typeof window === "undefined") return;
  if (id == null) localStorage.removeItem(PROFILE_STORAGE_KEY);
  else localStorage.setItem(PROFILE_STORAGE_KEY, String(id));
}

/** Guest tokens live in sessionStorage only (gone when the tab/browser closes). */
export function isGuestMode(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(GUEST_FLAG_KEY) === "1";
}

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(AUTH_TOKEN_KEY) || localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setAuthToken(token: string | null, opts?: { guest?: boolean }) {
  if (typeof window === "undefined") return;
  if (!token) {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
    sessionStorage.removeItem(GUEST_FLAG_KEY);
    return;
  }
  if (opts?.guest) {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    sessionStorage.setItem(AUTH_TOKEN_KEY, token);
    sessionStorage.setItem(GUEST_FLAG_KEY, "1");
  } else {
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
    sessionStorage.removeItem(GUEST_FLAG_KEY);
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  }
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function authHeaders(extra?: HeadersInit, opts?: { json?: boolean }): HeadersInit {
  const profileId = getStoredProfileId();
  const authToken = getAuthToken();
  return {
    ...(opts?.json !== false ? { "Content-Type": "application/json" } : {}),
    ...(profileId != null ? { "X-Profile-Id": String(profileId) } : {}),
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    ...extra,
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: authHeaders(
        init?.headers,
        { json: !(init?.body instanceof FormData) }
      ),
      cache: "no-store",
    });
  } catch {
    throw new ApiError(
      0,
      "Could not reach the API (Failed to fetch). Is the backend running on http://127.0.0.1:8470?"
    );
  }
  if (!res.ok) {
    let detail = res.statusText || `HTTP ${res.status}`;
    try {
      const j = await res.json();
      detail = j.detail || JSON.stringify(j);
    } catch {
      /* ignore */
    }
    if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/auth/")) {
      // Session dead — clear token so AuthGate can show login
      setAuthToken(null);
    }
    // Data folder wiped but browser still has old workspace id → drop it so
    // the next request can resolve the real active profile.
    if (
      res.status === 404 &&
      typeof window !== "undefined" &&
      typeof detail === "string" &&
      /user profile not found|no user profiles configured|active profile not found/i.test(detail)
    ) {
      setStoredProfileId(null);
    }
    throw new ApiError(res.status, typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** Shared fetch helper for bolt-on modules. Do not duplicate auth/profile headers. */
export { request as apiRequest };

/**
 * Authenticated binary download (PDFs, etc.).
 * window.open(url) cannot send Authorization headers — always use this for exports.
 */
async function downloadAuthenticated(
  path: string,
  fallbackFilename: string
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: "GET",
      headers: authHeaders(undefined, { json: false }),
      cache: "no-store",
    });
  } catch {
    throw new ApiError(
      0,
      "Could not reach the API (Failed to fetch). Is the backend running on http://127.0.0.1:8470?"
    );
  }
  if (!res.ok) {
    let detail = res.statusText || `HTTP ${res.status}`;
    try {
      const j = await res.json();
      detail = j.detail || JSON.stringify(j);
    } catch {
      /* ignore */
    }
    if (res.status === 401 && typeof window !== "undefined") {
      setAuthToken(null);
    }
    throw new ApiError(res.status, typeof detail === "string" ? detail : JSON.stringify(detail));
  }

  const blob = await res.blob();
  let filename = fallbackFilename;
  const cd = res.headers.get("Content-Disposition") || "";
  const m = /filename\*?=(?:UTF-8''|")?([^\";]+)/i.exec(cd);
  if (m?.[1]) {
    try {
      filename = decodeURIComponent(m[1].replace(/"/g, "").trim());
    } catch {
      filename = m[1].replace(/"/g, "").trim();
    }
  }

  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // Delay revoke so the download can start
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}

// ── Types ────────────────────────────────────────────────────────────────

export type Ledger = {
  id: number;
  name: string;
  type: string;
  parent_id: number | null;
  parent_name?: string | null;
  depth?: number;
  is_system: boolean;
  is_archived: boolean;
  budget_monthly: string | null;
  budget_annual: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type BankProfile = {
  id: number;
  name: string;
  bank_type: string;
  calibration_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

/** Entry from GET /bank-profiles/supported-banks (brand catalog). */
export type SupportedBank = {
  id: string;
  bank_type: string;
  /** Brand label shown in the UI (e.g. FNB, Capitec). */
  label: string;
  description: string;
  suggested_name: string;
  formats?: string;
  /** Internal calibrated layouts tried automatically for this brand. */
  layouts?: { id: string; label: string; status: string }[];
};

export type Transaction = {
  id: number;
  bank_profile_id: number;
  date: string;
  description: string;
  amount: string;
  /** Capitec Business: fee column as on the statement */
  fee_amount?: string | null;
  /** Capitec Business: Amount column as on the statement */
  principal_amount?: string | null;
  balance: string | null;
  reference: string | null;
  ledger_id: number | null;
  is_categorised: boolean;
  rule_id: number | null;
  notes: string | null;
  source_file: string | null;
  import_batch_id: number | null;
  is_excluded?: boolean;
  training_reason?: string | null;
  training_detail?: string | null;
  trained_at?: string | null;
  created_at: string;
  bank_profile_name?: string | null;
  ledger_name?: string | null;
};

export type TrainingReason = {
  code: string;
  label: string;
  hint?: string | null;
  is_system: boolean;
  use_count: number;
};

export type Rule = {
  id: number;
  name: string;
  match_type: string;
  match_value: string | null;
  match_json: Record<string, unknown> | null;
  ledger_id: number;
  priority: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  applied_count?: number;
};

export type ImportBatch = {
  id: number;
  bank_profile_id: number;
  filename: string;
  uploaded_at: string;
  status: string;
  transaction_count: number;
  error_message: string | null;
  bank_profile_name?: string | null;
};


export type SaReportTxnLine = {
  transaction_id: number;
  date: string;
  description: string;
  amount: string;
  ledger_id: number | null;
  ledger_name: string | null;
  reference: string | null;
  source_file: string | null;
  drill_ledger_id: number | null;
  running_balance: string | null;
};

export type SaReportLedgerLine = {
  ledger_id: number;
  ledger_name: string;
  ledger_type: string;
  amount: string;
  debit: string;
  credit: string;
  txn_count: number;
  note: string | null;
};

export type SaReportSection = {
  key: string;
  title: string;
  kind: string;
  lines: SaReportLedgerLine[];
  transactions: SaReportTxnLine[];
  summary: Record<string, string>;
  stub_message: string | null;
};

export type SaSupportReport = {
  report_key: string;
  title: string;
  period_label: string;
  date_from: string;
  date_to: string;
  currency: string;
  status: string;
  notes: string[];
  available_years: FinancialYearOption[];
  sections: SaReportSection[];
  totals: Record<string, string>;
};

export type SaReportCatalogItem = {
  key: string;
  title: string;
  group: string;
  status: string;
};

export type DashboardStats = {
  pending_count: number;
  total_transactions: number;
  categorised_count: number;
  ledger_count: number;
  rule_count: number;
  recent_batches: ImportBatch[];
  income_mtd: string;
  expenses_mtd: string;
};

export type PLLineItem = {
  ledger_id: number;
  ledger_name: string;
  ledger_type: string;
  amount: string;
  budget: string | null;
  variance: string | null;
  budget_pct: string | null;
  traffic_light: string;
};

export type PLReport = {
  period_label: string;
  date_from: string;
  date_to: string;
  currency: string;
  income_lines: PLLineItem[];
  expense_lines: PLLineItem[];
  other_lines: PLLineItem[];
  total_income: string;
  total_expenses: string;
  net_result: string;
};

export type PLMatrixMonthCol = {
  month_index: number;
  month: string;
  month_name: string;
  label: string;
};

export type PLMatrixLedgerRow = {
  ledger_id: number;
  ledger_name: string;
  ledger_type: string;
  amounts: string[];
  total: string;
};

export type PLMatrixReport = {
  currency: string;
  fy_start_month: number;
  fy_start_year: number;
  label: string;
  date_from: string;
  date_to: string;
  is_current_fy: boolean;
  available_years: FinancialYearOption[];
  months: PLMatrixMonthCol[];
  income_rows: PLMatrixLedgerRow[];
  expense_rows: PLMatrixLedgerRow[];
  transfer_rows: PLMatrixLedgerRow[];
  month_income_totals: string[];
  month_expense_totals: string[];
  month_transfer_totals: string[];
  month_net_totals: string[];
  total_income: string;
  total_expenses: string;
  total_transfers: string;
  net_result: string;
};

export type BudgetMatrixLedgerRow = {
  ledger_id: number;
  ledger_name: string;
  ledger_type: string;
  budgets: string[];
  actuals: string[];
  budget_total: string;
  actual_total: string;
  variance_total: string;
};

export type BudgetMatrixReport = {
  currency: string;
  fy_start_month: number;
  fy_start_year: number;
  label: string;
  date_from: string;
  date_to: string;
  is_current_fy: boolean;
  available_years: FinancialYearOption[];
  months: PLMatrixMonthCol[];
  income_rows: BudgetMatrixLedgerRow[];
  expense_rows: BudgetMatrixLedgerRow[];
  other_rows: BudgetMatrixLedgerRow[];
  month_income_budgets: string[];
  month_income_actuals: string[];
  month_expense_budgets: string[];
  month_expense_actuals: string[];
  total_income_budget: string;
  total_income_actual: string;
  total_expense_budget: string;
  total_expense_actual: string;
};

export type MonthlyComparisonPoint = {
  month_index: number;
  month: string;
  month_name: string;
  label: string;
  income: string;
  expenses: string;
  income_budget: string;
  expense_budget: string;
  net: string;
  compare_month?: string | null;
  compare_label?: string | null;
  compare_income?: string;
  compare_expenses?: string;
  compare_income_budget?: string;
  compare_expense_budget?: string;
  compare_net?: string;
};

export type FinancialYearOption = {
  fy_start_year: number;
  label: string;
  date_from: string;
  date_to: string;
  is_current: boolean;
  has_data: boolean;
};

export type MonthlyComparisonReport = {
  currency: string;
  fy_start_month: number;
  primary_fy_start_year: number;
  primary_label: string;
  compare_fy_start_year?: number | null;
  compare_label?: string | null;
  available_years: FinancialYearOption[];
  months: MonthlyComparisonPoint[];
  months_count: number;
};

export type AppSettings = {
  fy_start_month: number;
  currency: string;
  active_profile_id?: number | null;
  active_profile_name?: string | null;
};

/** On-device storage paths (SQLite + uploads). Never cloud. */
export type LocalDataInfo = {
  data_dir: string;
  database_path: string;
  uploads_dir: string;
  logos_dir: string;
  database_exists: boolean;
  database_size_bytes?: number | null;
  storage_mode: string;
  is_custom_location?: boolean;
  default_data_dir?: string;
  privacy_note: string;
};

export type LocalDataOpenResult = {
  opened: string;
  message: string;
};

export type ProfileType = "individual" | "business";

export type UserProfile = {
  id: number;
  name: string;
  /** individual | business — business may include a letterhead logo */
  profile_type?: ProfileType | string;
  /** Visible unique attestation id (e.g. LF-A1B2C3D4-E5F67890) */
  public_id?: string | null;
  full_name?: string | null;
  business_name?: string | null;
  business_registration_number?: string | null;
  vat_number?: string | null;
  email?: string | null;
  phone?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  postal_code?: string | null;
  country?: string | null;
  tax_number?: string | null;
  notes?: string | null;
  has_logo?: boolean;
  fy_start_month: number;
  currency: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
  /** Extra client workspace — username+password required on switch when true */
  has_password?: boolean;
  workspace_username?: string | null;
  ledger_count: number;
  bank_profile_count: number;
  transaction_count: number;
};

export type WizardOption = {
  key: string;
  label: string;
  help?: string;
  default: boolean;
  type?: string;
  visible?: boolean;
};

export type DissectResult = {
  bank_type: string;
  suggested_name: string;
  detected_format: string;
  calibration: Record<string, unknown>;
  columns: string[];
  detected_columns: { name: string; role: string }[];
  options: WizardOption[];
  parsed_preview: {
    date?: string | null;
    description?: string | null;
    amount?: string | null;
    balance?: string | null;
    reference?: string | null;
  }[];
  sample_rows: Record<string, unknown>[];
  message: string;
};

export type LicenseStatus = {
  trial_days: number;
  trial_started_at?: string | null;
  days_remaining: number;
  expired: boolean;
  licensed: boolean;
  license_kind?: string | null;
  message: string;
  can_use_app: boolean;
  /** True when trial ended — view data only, no edits/exports */
  read_only: boolean;
};

// ── Endpoints ────────────────────────────────────────────────────────────

export const api = {
  health: () => request<{ status: string }>("/health"),
  license: {
    status: () => request<LicenseStatus>("/license/status"),
    activate: (key: string) =>
      request<LicenseStatus>("/license/activate", {
        method: "POST",
        body: JSON.stringify({ key }),
      }),
  },
  auth: {
    status: () =>
      request<{
        has_users: boolean;
        authenticated: boolean;
        username?: string | null;
        user_id?: number | null;
        is_guest?: boolean;
      }>("/auth/status"),
    suggestPassword: () =>
      request<{ password: string; length: number; note: string }>("/auth/suggest-password"),
    register: (body: { username: string; password: string }) =>
      request<{
        token: string;
        username: string;
        user_id: number;
        message: string;
        is_guest?: boolean;
      }>("/auth/register", { method: "POST", body: JSON.stringify(body) }),
    login: (body: { username: string; password: string }) =>
      request<{
        token: string;
        username: string;
        user_id: number;
        message: string;
        is_guest?: boolean;
      }>("/auth/login", { method: "POST", body: JSON.stringify(body) }),
    guest: () =>
      request<{
        token: string;
        username: string;
        user_id: number;
        message: string;
        is_guest: boolean;
      }>("/auth/guest", { method: "POST" }),
    logout: () => request<{ message: string }>("/auth/logout", { method: "POST" }),
    me: () =>
      request<{
        user_id: number;
        username: string;
        created_at: string | null;
        is_guest?: boolean;
      }>("/auth/me"),
    changePassword: (body: { current_password: string; new_password: string }) =>
      request<{ message: string }>("/auth/change-password", {
        method: "POST",
        body: JSON.stringify(body),
      }),
  },
  dashboard: () => request<DashboardStats>("/dashboard"),
  disclaimers: {
    uploadContent: () =>
      request<{
        version: string;
        title: string;
        body: string;
        short: string;
        context: string;
        profile_public_id?: string | null;
      }>("/disclaimers/upload"),
    uploadStatus: () =>
      request<{
        version: string;
        has_accepted_current: boolean;
        last_accepted_at: string | null;
        acceptance_count: number;
      }>("/disclaimers/upload/status"),
    acceptUpload: (body: {
      disclaimer_version: string;
      context?: string;
      file_count?: number;
      user_agent?: string;
    }) =>
      request<{
        id: number;
        disclaimer_version: string;
        accepted_at: string;
        file_count: number;
        message: string;
      }>("/disclaimers/upload/accept", {
        method: "POST",
        body: JSON.stringify(body),
      }),
  },
  profiles: {
    list: () => request<UserProfile[]>("/profiles"),
    active: () => request<UserProfile>("/profiles/active"),
    get: (id: number) => request<UserProfile>(`/profiles/${id}`),
    create: (body: {
      name: string;
      profile_type?: ProfileType | string;
      full_name?: string | null;
      business_name?: string | null;
      business_registration_number?: string | null;
      vat_number?: string | null;
      email?: string | null;
      phone?: string | null;
      /** Extra client profiles only — with password */
      workspace_username?: string | null;
      password?: string | null;
      copy_ledgers_from_id?: number | null;
      copy_bank_profiles_from_id?: number | null;
      seed_default_ledgers?: boolean;
    }) =>
      request<UserProfile>("/profiles", { method: "POST", body: JSON.stringify(body) }),
    update: (id: number, body: Partial<UserProfile>) =>
      request<UserProfile>(`/profiles/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    switch: (
      profile_id: number,
      opts?: { password?: string; workspace_username?: string }
    ) =>
      request<UserProfile>("/profiles/switch", {
        method: "POST",
        body: JSON.stringify({
          profile_id,
          ...(opts?.workspace_username
            ? { workspace_username: opts.workspace_username }
            : {}),
          ...(opts?.password != null && opts.password !== ""
            ? { password: opts.password }
            : {}),
        }),
      }),
    delete: (id: number) => request<void>(`/profiles/${id}`, { method: "DELETE" }),
    resetWorkspaceLogin: (
      id: number,
      body: { workspace_username: string; password: string }
    ) =>
      request<UserProfile>(`/profiles/${id}/workspace-login`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    uploadLogo: (id: number, file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return request<UserProfile>(`/profiles/${id}/logo`, { method: "POST", body: fd });
    },
    deleteLogo: (id: number) =>
      request<UserProfile>(`/profiles/${id}/logo`, { method: "DELETE" }),
    /** Authenticated logo fetch → object URL (caller should revoke). */
    logoObjectUrl: async (id: number): Promise<string | null> => {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE}/profiles/${id}/logo`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: "no-store",
      });
      if (!res.ok) return null;
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    },
  },
  settings: {
    get: () => request<AppSettings>("/settings"),
    update: (body: Partial<AppSettings>) =>
      request<AppSettings>("/settings", { method: "PATCH", body: JSON.stringify(body) }),
  },
  localData: {
    get: () => request<LocalDataInfo>("/local-data"),
    open: (target: "data_dir" | "database" | "uploads_dir" | "logos_dir" = "data_dir") =>
      request<LocalDataOpenResult>("/local-data/open", {
        method: "POST",
        body: JSON.stringify({ target }),
      }),
    backup: () => downloadAuthenticated("/local-data/backup", "LedgerFlow-backup.zip"),
    restore: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return request<{ message: string; database_path: string }>("/local-data/restore", {
        method: "POST",
        body: fd,
      });
    },
  },
  ledgers: {
    list: (includeArchived = false) =>
      request<Ledger[]>(`/ledgers?include_archived=${includeArchived}`),
    create: (body: Partial<Ledger> & { name: string; type: string }) =>
      request<Ledger>("/ledgers", { method: "POST", body: JSON.stringify(body) }),
    update: (id: number, body: Partial<Ledger>) =>
      request<Ledger>(`/ledgers/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    archive: (id: number) =>
      request<Ledger>(`/ledgers/${id}`, { method: "DELETE" }),
  },
  bankProfiles: {
    list: () => request<BankProfile[]>("/bank-profiles"),
    get: (id: number) => request<BankProfile>(`/bank-profiles/${id}`),
    /** Banks we have calibrated — for the guided picker only. */
    supportedBanks: () =>
      request<{ banks: SupportedBank[] }>("/bank-profiles/supported-banks"),
    create: (body: { name: string; bank_type: string; calibration_data?: Record<string, unknown> }) =>
      request<BankProfile>("/bank-profiles", { method: "POST", body: JSON.stringify(body) }),
    update: (id: number, body: Partial<BankProfile>) =>
      request<BankProfile>(`/bank-profiles/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    delete: (id: number, force = true) =>
      request<void>(`/bank-profiles/${id}?force=${force}`, { method: "DELETE" }),
    preset: (bankType: string) =>
      request<Record<string, unknown>>(`/bank-profiles/presets/${bankType}`),
    dissect: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return request<DissectResult>("/bank-profiles/dissect", { method: "POST", body: fd });
    },
    preview: async (file: File, bankType: string, calibration: Record<string, unknown>) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("bank_type", bankType);
      fd.append("calibration_json", JSON.stringify(calibration));
      return request<{
        columns: string[];
        sample_rows: Record<string, string>[];
        parsed_preview: Record<string, string | null>[];
        detected_format: string;
        message: string;
      }>("/bank-profiles/preview", { method: "POST", body: fd });
    },
  },
  imports: {
    list: () => request<ImportBatch[]>("/imports"),
    upload: async (bankProfileId: number, file: File) => {
      const fd = new FormData();
      fd.append("bank_profile_id", String(bankProfileId));
      fd.append("file", file);
      return request<{
        batch: ImportBatch;
        transactions_created: number;
        rules_applied: number;
        message: string;
      }>("/imports/upload", { method: "POST", body: fd });
    },
  },
  transactions: {
    list: (params: Record<string, string | number | boolean | undefined> = {}) => {
      const q = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== "") q.set(k, String(v));
      });
      return request<Transaction[]>(`/transactions?${q}`);
    },
    pendingCount: () => request<{ count: number }>("/transactions/pending/count"),
    periods: () =>
      request<{
        total: number;
        years: {
          year: number;
          count: number;
          months: { month: number; count: number }[];
        }[];
      }>("/transactions/periods"),
    wipe: (body: { year: number; month?: number | null }) =>
      request<{ deleted: number; year: number; month: number | null; message: string }>(
        "/transactions/wipe",
        { method: "POST", body: JSON.stringify(body) }
      ),
    update: (
      id: number,
      body: { ledger_id?: number | null; notes?: string; is_categorised?: boolean }
    ) =>
      request<Transaction>(`/transactions/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    trainingReasons: () => request<TrainingReason[]>("/transactions/training/reasons"),
    train: (
      id: number,
      body: { reason_code: string; detail?: string; custom_label?: string }
    ) =>
      request<{
        transaction_id: number;
        is_excluded: boolean;
        training_reason: string;
        message: string;
      }>(`/transactions/${id}/train`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    bulkCategorise: (transaction_ids: number[], ledger_id: number) =>
      request<{ updated: number }>("/transactions/bulk-categorise", {
        method: "POST",
        body: JSON.stringify({ transaction_ids, ledger_id }),
      }),
    createRule: (body: {
      transaction_ids: number[];
      name: string;
      match_type: string;
      match_value?: string;
      ledger_id: number;
      priority?: number;
    }) =>
      request<{ rule_id: number; matched: number; message: string }>(
        "/transactions/create-rule",
        { method: "POST", body: JSON.stringify(body) }
      ),
    applyRules: () =>
      request<{ matched: number; message: string }>("/transactions/apply-rules", {
        method: "POST",
      }),
  },
  rules: {
    list: () => request<Rule[]>("/rules"),
    create: (body: Partial<Rule> & { name: string; match_type: string; ledger_id: number }) =>
      request<{ rule_id: number; matched: number; message: string }>("/rules", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    update: (id: number, body: Partial<Rule>) =>
      request<{ rule_id: number; matched: number; message: string }>(`/rules/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    delete: (id: number) => request<void>(`/rules/${id}`, { method: "DELETE" }),
    applyAll: () =>
      request<{ matched: number; message: string }>("/rules/apply-all", { method: "POST" }),
  },
  reports: {
    pl: (params: Record<string, string | number | undefined> = {}) => {
      const q = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== "") q.set(k, String(v));
      });
      return request<PLReport>(`/reports/pl?${q}`);
    },
    plMatrix: (params: { fy_start_year?: number | string } = {}) => {
      const q = new URLSearchParams();
      if (params.fy_start_year != null) q.set("fy_start_year", String(params.fy_start_year));
      const qs = q.toString();
      return request<PLMatrixReport>(`/reports/pl-matrix${qs ? `?${qs}` : ""}`);
    },
    budgetMatrix: (params: { fy_start_year?: number | string } = {}) => {
      const q = new URLSearchParams();
      if (params.fy_start_year != null) q.set("fy_start_year", String(params.fy_start_year));
      const qs = q.toString();
      return request<BudgetMatrixReport>(`/reports/budget-matrix${qs ? `?${qs}` : ""}`);
    },
    monthlyComparison: (params: {
      fy_start_year?: number | string;
      compare_fy_start_year?: number | string;
    } = {}) => {
      const q = new URLSearchParams();
      if (params.fy_start_year != null) q.set("fy_start_year", String(params.fy_start_year));
      if (params.compare_fy_start_year != null)
        q.set("compare_fy_start_year", String(params.compare_fy_start_year));
      const qs = q.toString();
      return request<MonthlyComparisonReport>(
        `/reports/monthly-comparison${qs ? `?${qs}` : ""}`
      );
    },
    /**
     * Download P&amp;L PDF (portrait A4 matrix) with auth headers.
     * Prefer fy_start_year so the PDF matches the on-screen financial year.
     */
    downloadPlPdf: async (
      params: {
        fy_start_year?: number | string;
        /** turnover | expenses | budget | cashflow | pl — shapes period PDF body */
        report_type?: string;
        period?: string;
        date_from?: string;
        date_to?: string;
        /** Comma-separated YYYY-MM for period reports */
        months?: string;
      } = {}
    ) => {
      const q = new URLSearchParams();
      if (params.fy_start_year != null) q.set("fy_start_year", String(params.fy_start_year));
      if (params.report_type) q.set("report_type", params.report_type);
      if (params.period) q.set("period", params.period);
      if (params.date_from) q.set("date_from", params.date_from);
      if (params.date_to) q.set("date_to", params.date_to);
      if (params.months) q.set("months", params.months);
      const slug =
        params.report_type === "turnover"
          ? "Turnover"
          : params.report_type === "expenses"
            ? "Expense_Summary"
            : params.report_type === "budget"
              ? "Budget_vs_Actual"
              : params.report_type === "cashflow"
                ? "Cashflow"
                : params.fy_start_year != null && !params.months
                  ? `PL_FY${params.fy_start_year}`
                  : "Report";
      const label =
        params.fy_start_year != null && !params.months
          ? slug
          : `${slug}_${params.date_from || "from"}_${params.date_to || "to"}`;
      await downloadAuthenticated(`/reports/pl/pdf?${q}`, `${label}.pdf`);
    },
    /** Landscape monthly overview chart PDF (Income · Spending · Budget). */
    downloadMonthlyOverviewPdf: async (params: { fy_start_year?: number | string } = {}) => {
      const q = new URLSearchParams();
      if (params.fy_start_year != null) q.set("fy_start_year", String(params.fy_start_year));
      const label = params.fy_start_year != null ? `FY${params.fy_start_year}` : "current";
      await downloadAuthenticated(
        `/reports/monthly-comparison/pdf?${q}`,
        `Monthly_Overview_${label}.pdf`
      );
    },
    catalog: () => request<SaReportCatalogItem[]>("/reports/catalog"),
    sa: (
      key: string,
      params: {
        fy_start_year?: number | string;
        period?: string;
        date_from?: string;
        date_to?: string;
        ledger_id?: number | string;
      } = {}
    ) => {
      const q = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== "") q.set(k, String(v));
      });
      const qs = q.toString();
      return request<SaSupportReport>(`/reports/${key}${qs ? `?${qs}` : ""}`);
    },
    downloadSaPdf: async (
      key: string,
      params: {
        fy_start_year?: number | string;
        period?: string;
        date_from?: string;
        date_to?: string;
        ledger_id?: number | string;
      } = {}
    ) => {
      const q = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== "") q.set(k, String(v));
      });
      const label =
        params.fy_start_year != null ? `FY${params.fy_start_year}` : "report";
      await downloadAuthenticated(
        `/reports/sa/${key}/pdf?${q}`,
        `${key}_${label}.pdf`
      );
    },

  },
};
