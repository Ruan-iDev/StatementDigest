import {
  ArrowLeftRight,
  Building2,
  Car,
  FileArchive,
  FileSpreadsheet,
  HeartPulse,
  Landmark,
  Layers,
  Percent,
  PieChart,
  Receipt,
  Scale,
  Target,
  TrendingUp,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { NeonAccent } from "@/components/hub-tile";

/** Classic management reports (existing). */
export type ClassicReportKey = "pl" | "turnover" | "expenses" | "budget" | "cashflow";

/** SA tax / accounting support reports. */
export type SaReportKey =
  | "taxable-income"
  | "interest-summary"
  | "medical-credit"
  | "travel-motor"
  | "capital-schedule"
  | "provisional-tax"
  | "vat-201"
  | "irp5-emp201"
  | "related-party"
  | "trial-balance"
  | "general-ledger"
  | "cashflow-indirect"
  | "fy-pack"
  | "consolidation";

export type ReportKey = ClassicReportKey | SaReportKey;

export type ReportMeta = {
  key: ReportKey;
  title: string;
  description: string;
  icon: LucideIcon;
  accent: NeonAccent;
  sarsNote: string;
  href: string;
  group: "management" | "individual" | "companies" | "cross";
  /** live | partial | stub — mirrors backend catalog */
  status?: "live" | "partial" | "stub";
  kind: "classic" | "sa";
};

export const REPORTS: ReportMeta[] = [
  {
    key: "pl",
    title: "Profit & Loss",
    description:
      "Full financial year: months left→right, ledgers top→bottom (Income, Expenses, Transfers).",
    icon: Scale,
    accent: "lime",
    sarsNote:
      "Supports year-end bookkeeping and provisional-tax estimates (not a SARS eFiling form).",
    href: "/reports/pl",
    group: "management",
    kind: "classic",
  },
  {
    key: "turnover",
    title: "Turnover Statement",
    description: "Gross income / receipts by ledger — useful turnover and gross-income view.",
    icon: TrendingUp,
    accent: "cyan",
    sarsNote: "Helps track turnover thresholds relevant to small business and VAT registration.",
    href: "/reports/turnover",
    group: "management",
    kind: "classic",
  },
  {
    key: "expenses",
    title: "Expense Summary",
    description: "Spending by ledger — deduction-style breakdown of categorised outflows.",
    icon: PieChart,
    accent: "magenta",
    sarsNote: "Supports expense review for ITR12 / business deduction workpapers.",
    href: "/reports/expenses",
    group: "management",
    kind: "classic",
  },
  {
    key: "budget",
    title: "Budget vs Actual",
    description:
      "Budgeted ledgers only — full year matrix with Budget | Actual columns per month.",
    icon: Target,
    accent: "amber",
    sarsNote: "Internal control report — keep spending on plan before tax season.",
    href: "/reports/budget",
    group: "management",
    kind: "classic",
  },
  {
    key: "cashflow",
    title: "Cashflow Snapshot",
    description: "Income vs expenses, transfers and net cash movement for the period.",
    icon: ArrowLeftRight,
    accent: "violet",
    sarsNote: "Cash position overview for savings, drawdowns and provisional tax cash planning.",
    href: "/reports/cashflow",
    group: "management",
    kind: "classic",
  },
  // Individual
  {
    key: "taxable-income",
    title: "Taxable income worksheet",
    description: "Income less expenses; transfers & drawings excluded.",
    icon: Wallet,
    accent: "lime",
    sarsNote: "ITR12-style workpaper — not an official return.",
    href: "/reports/taxable-income",
    group: "individual",
    status: "live",
    kind: "sa",
  },
  {
    key: "interest-summary",
    title: "IT3(b)-style interest summary",
    description: "Interest Received ledger totals and source transactions.",
    icon: Landmark,
    accent: "cyan",
    sarsNote: "Supports IT3(b) interest review — not a bank certificate.",
    href: "/reports/interest-summary",
    group: "individual",
    status: "live",
    kind: "sa",
  },
  {
    key: "medical-credit",
    title: "Medical tax credit support",
    description: "Medical / Health spend listing for MTC support.",
    icon: HeartPulse,
    accent: "magenta",
    sarsNote: "Spend schedule only — credit rates not calculated.",
    href: "/reports/medical-credit",
    group: "individual",
    status: "partial",
    kind: "sa",
  },
  {
    key: "travel-motor",
    title: "Travel / motor log",
    description: "Motor Vehicle and Travel & Accommodation totals.",
    icon: Car,
    accent: "amber",
    sarsNote: "Totals from ledgers — km log fields coming later.",
    href: "/reports/travel-motor",
    group: "individual",
    status: "partial",
    kind: "sa",
  },
  {
    key: "capital-schedule",
    title: "Capital schedule",
    description: "Capital-type ledger movements (assets, loan capital).",
    icon: FileSpreadsheet,
    accent: "violet",
    sarsNote: "Capital workpaper — not a depreciation register.",
    href: "/reports/capital-schedule",
    group: "individual",
    status: "live",
    kind: "sa",
  },
  {
    key: "provisional-tax",
    title: "Provisional tax tracker",
    description: "SARS / provisional tax ledger payments vs estimated taxable income.",
    icon: Receipt,
    accent: "lime",
    sarsNote: "Cash tracker for IRP6 planning — not a liability calculator.",
    href: "/reports/provisional-tax",
    group: "individual",
    status: "live",
    kind: "sa",
  },
  // Companies
  {
    key: "vat-201",
    title: "VAT 201 pack",
    description: "VAT ledger + sales/purchases heuristics at 15%.",
    icon: Percent,
    accent: "cyan",
    sarsNote: "VAT 201 workpaper — not an eFiling return.",
    href: "/reports/vat-201",
    group: "companies",
    status: "partial",
    kind: "sa",
  },
  {
    key: "irp5-emp201",
    title: "IRP5 / EMP201 support",
    description: "Placeholder for employer payroll returns.",
    icon: Building2,
    accent: "magenta",
    sarsNote: "Stub — wage ledger totals for hand-off only.",
    href: "/reports/irp5-emp201",
    group: "companies",
    status: "stub",
    kind: "sa",
  },
  {
    key: "related-party",
    title: "Related-party / drawings",
    description: "Company funding, drawings, family support schedules.",
    icon: Users,
    accent: "amber",
    sarsNote: "Loan-account style schedule for closely held entities.",
    href: "/reports/related-party",
    group: "companies",
    status: "live",
    kind: "sa",
  },
  {
    key: "trial-balance",
    title: "Trial balance",
    description: "Cash-book TB with debit/credit mapped from ledger types.",
    icon: Scale,
    accent: "lime",
    sarsNote: "Management TB from bank categorisation.",
    href: "/reports/trial-balance",
    group: "companies",
    status: "live",
    kind: "sa",
  },
  {
    key: "general-ledger",
    title: "General ledger",
    description: "Per-ledger transactions with running balance.",
    icon: Layers,
    accent: "violet",
    sarsNote: "Source drill-down: click a ledger line for transactions.",
    href: "/reports/general-ledger",
    group: "companies",
    status: "live",
    kind: "sa",
  },
  {
    key: "cashflow-indirect",
    title: "Cash-flow (indirect)",
    description: "Indirect outline from taxable / capital / related-party.",
    icon: ArrowLeftRight,
    accent: "cyan",
    sarsNote: "Stub outline — not IAS 7.",
    href: "/reports/cashflow-indirect",
    group: "companies",
    status: "stub",
    kind: "sa",
  },
  // Cross
  {
    key: "fy-pack",
    title: "FY pack",
    description: "Year-end index of support reports (+ PDF summaries).",
    icon: FileArchive,
    accent: "amber",
    sarsNote: "Bundles key SA workpapers for the selected FY.",
    href: "/reports/fy-pack",
    group: "cross",
    status: "partial",
    kind: "sa",
  },
  {
    key: "consolidation",
    title: "Multi-profile consolidation",
    description: "Minimal stub listing workspaces on this install.",
    icon: Layers,
    accent: "magenta",
    sarsNote: "Profiles stay isolated — roll-up not implemented yet.",
    href: "/reports/consolidation",
    group: "cross",
    status: "stub",
    kind: "sa",
  },
];

export function getReportMeta(key: string): ReportMeta | undefined {
  return REPORTS.find((r) => r.key === key);
}

export const REPORT_KEYS = REPORTS.map((r) => r.key);

export function reportsByGroup(group: ReportMeta["group"]): ReportMeta[] {
  return REPORTS.filter((r) => r.group === group);
}

export function isSaReportKey(key: string): key is SaReportKey {
  return REPORTS.some((r) => r.key === key && r.kind === "sa");
}

export function isClassicReportKey(key: string): key is ClassicReportKey {
  return REPORTS.some((r) => r.key === key && r.kind === "classic");
}
