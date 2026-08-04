import { REPORT_KEYS } from "@/lib/reports-meta";
import ReportTypeClient from "./report-type-client";

/** Pre-render all known report routes for static desktop export. */
export function generateStaticParams() {
  return REPORT_KEYS.map((type) => ({ type }));
}

export default function ReportTypePage() {
  return <ReportTypeClient />;
}
