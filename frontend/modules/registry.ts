import type { LucideIcon } from "lucide-react";
import {
  Archive,
  BookOpen,
  FileBarChart,
  FileText,
  FolderOpen,
  Package,
  Receipt,
  Settings,
  Upload,
  ListTodo,
  Users,
  Building2,
  Contact,
  Settings2,
  Workflow,
} from "lucide-react";
import { practiceManifest } from "@/modules/practice/manifest";

export type ModuleAccent = "cyan" | "magenta" | "lime" | "violet" | "amber";

export type ModuleNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  accent: ModuleAccent;
  /** Highlight when the path matches this prefix (defaults to href). */
  match?: string;
};

export type AppModuleId = "ledger-flow" | "work-flow" | "cabinet-flow";

export type AppModule = {
  id: AppModuleId;
  name: string;
  subtitle?: string;
  description: string;
  href: string;
  accent: ModuleAccent;
  icon: LucideIcon;
  items: ModuleNavItem[];
};

export type ModuleManifest = {
  id: string;
  name: string;
  description: string;
  href: string;
  accent: ModuleAccent;
  icon: LucideIcon;
  nav: ModuleNavItem[];
};

/** Enabled bolt-on modules shipped with this build. */
export const ENABLED_MODULES: ModuleManifest[] = [practiceManifest];

export const LEDGER_FLOW: AppModule = {
  id: "ledger-flow",
  name: "Ledger Flow",
  subtitle: "Accounting",
  description: "Statements, transactions, reporting, and setup.",
  href: "/",
  accent: "violet",
  icon: BookOpen,
  items: [
    {
      href: "/upload",
      label: "Upload Statement",
      icon: Upload,
      accent: "cyan",
    },
    {
      href: "/pending",
      label: "Transactions",
      icon: ListTodo,
      accent: "magenta",
    },
    {
      href: "/reports",
      label: "Reporting",
      icon: FileBarChart,
      accent: "lime",
    },
    {
      href: "/settings",
      label: "Settings",
      icon: Settings,
      accent: "violet",
      match: "/settings",
    },
  ],
};

export const WORK_FLOW: AppModule = {
  id: "work-flow",
  name: "Work Flow",
  subtitle: "Projects",
  description: "Clients, suppliers, products, quotes, invoices, and project files.",
  href: "/practice",
  accent: "amber",
  icon: Workflow,
  items: [
    {
      href: "/practice/clients",
      label: "Clients",
      icon: Users,
      accent: "amber",
    },
    {
      href: "/practice/suppliers",
      label: "Suppliers",
      icon: Building2,
      accent: "violet",
    },
    {
      href: "/practice/staff",
      label: "Staff",
      icon: Contact,
      accent: "cyan",
    },
    {
      href: "/practice/products",
      label: "Products",
      icon: Package,
      accent: "lime",
    },
    {
      href: "/practice/projects",
      label: "Projects",
      icon: FolderOpen,
      accent: "cyan",
      match: "/practice/projects",
    },
    {
      href: "/practice/quotes",
      label: "Quotes",
      icon: FileText,
      accent: "lime",
    },
    {
      href: "/practice/invoices",
      label: "Invoices",
      icon: Receipt,
      accent: "magenta",
    },
    {
      href: "/practice/reports",
      label: "Reports",
      icon: FileBarChart,
      accent: "lime",
    },
    {
      href: "/practice/configuration",
      label: "Configuration",
      icon: Settings2,
      accent: "violet",
    },
  ],
};

export const CABINET_FLOW: AppModule = {
  id: "cabinet-flow",
  name: "Cabinet Flow",
  subtitle: "Coming soon",
  description: "Next module — brief still to come.",
  href: "/cabinet",
  accent: "cyan",
  icon: Archive,
  items: [],
};

export const APP_MODULES: AppModule[] = [LEDGER_FLOW, WORK_FLOW, CABINET_FLOW];

const LEDGER_NESTED = ["/profiles", "/ledgers", "/rules", "/bank-profiles"];

export function isWorkFlowPath(pathname: string): boolean {
  return pathname === "/practice" || pathname.startsWith("/practice/");
}

export function isCabinetFlowPath(pathname: string): boolean {
  return pathname === "/cabinet" || pathname.startsWith("/cabinet/");
}

export function isLedgerFlowPath(pathname: string): boolean {
  if (pathname === "/terms" || pathname.startsWith("/terms/")) return false;
  if (isWorkFlowPath(pathname)) return false;
  if (isCabinetFlowPath(pathname)) return false;
  return true;
}

export function moduleForPath(pathname: string): AppModule | null {
  if (isCabinetFlowPath(pathname)) return CABINET_FLOW;
  if (isWorkFlowPath(pathname)) return WORK_FLOW;
  if (isLedgerFlowPath(pathname)) return LEDGER_FLOW;
  return null;
}

export function itemIsActive(item: ModuleNavItem, pathname: string): boolean {
  const base = item.match || item.href;
  if (item.href === "/settings" || base === "/settings") {
    return (
      pathname === "/settings" ||
      pathname.startsWith("/settings/") ||
      LEDGER_NESTED.some((p) => pathname === p || pathname.startsWith(p + "/"))
    );
  }
  if (item.href === "/practice/projects" || base === "/practice/projects") {
    return (
      pathname === "/practice/projects" ||
      pathname.startsWith("/practice/projects/") ||
      pathname === "/practice/file" ||
      pathname.startsWith("/practice/file/")
    );
  }
  if (item.href === "/practice/quotes") {
    return pathname.startsWith("/practice/quotes") || pathname.includes("kind=quote");
  }
  if (item.href === "/practice/invoices") {
    return pathname.startsWith("/practice/invoices") || pathname.includes("kind=invoice");
  }
  if (item.href === "/practice/suppliers") {
    return pathname.startsWith("/practice/suppliers") || pathname.includes("kind=rfq");
  }
  if (item.href === "/reports") {
    return pathname === "/reports" || pathname.startsWith("/reports/");
  }
  return pathname === base || pathname.startsWith(base + "/");
}

export function moduleNavItems(): ModuleNavItem[] {
  return ENABLED_MODULES.flatMap((m) => m.nav);
}
