import {
  ArrowLeftRight,
  PieChart,
  Scale,
  Target,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import type { NeonAccent } from "@/components/hub-tile";

export type ReportKey = "pl" | "turnover" | "expenses" | "budget" | "cashflow";

export type ReportMeta = {
  key: ReportKey;
  title: string;
  description: string;
  icon: LucideIcon;
  accent: NeonAccent;
  sarsNote: string;
  href: string;
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
  },
  {
    key: "turnover",
    title: "Turnover Statement",
    description: "Gross income / receipts by ledger — useful turnover and gross-income view.",
    icon: TrendingUp,
    accent: "cyan",
    sarsNote: "Helps track turnover thresholds relevant to small business and VAT registration.",
    href: "/reports/turnover",
  },
  {
    key: "expenses",
    title: "Expense Summary",
    description: "Spending by ledger — deduction-style breakdown of categorised outflows.",
    icon: PieChart,
    accent: "magenta",
    sarsNote: "Supports expense review for ITR12 / business deduction workpapers.",
    href: "/reports/expenses",
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
  },
  {
    key: "cashflow",
    title: "Cashflow Snapshot",
    description: "Income vs expenses, transfers and net cash movement for the period.",
    icon: ArrowLeftRight,
    accent: "violet",
    sarsNote: "Cash position overview for savings, drawdowns and provisional tax cash planning.",
    href: "/reports/cashflow",
  },
];

export function getReportMeta(key: string): ReportMeta | undefined {
  return REPORTS.find((r) => r.key === key);
}

export const REPORT_KEYS = REPORTS.map((r) => r.key);
