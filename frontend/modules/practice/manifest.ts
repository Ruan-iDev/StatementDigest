import { Workflow } from "lucide-react";
import type { ModuleManifest } from "@/modules/registry";

export const practiceManifest: ModuleManifest = {
  id: "practice",
  name: "Work Flow",
  description: "Clients, suppliers, products, quotes, invoices, and project files.",
  href: "/practice",
  accent: "amber",
  icon: Workflow,
  nav: [{ href: "/practice", label: "Work Flow", icon: Workflow, accent: "amber" }],
};
