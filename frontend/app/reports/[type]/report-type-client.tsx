"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { getReportMeta, type ReportKey, REPORT_KEYS } from "@/lib/reports-meta";
import { ReportDetailView } from "@/components/report-detail-view";

function isReportKey(v: string): v is ReportKey {
  return (REPORT_KEYS as string[]).includes(v);
}

/** Dedicated report screen — not the Reporting hub. */
export default function ReportTypeClient() {
  const params = useParams();
  const router = useRouter();
  const type = String(params?.type || "");

  useEffect(() => {
    if (type && !isReportKey(type)) {
      router.replace("/reports");
    }
  }, [type, router]);

  if (!isReportKey(type)) {
    return (
      <p className="text-sm text-muted-foreground">Unknown report — returning to hub…</p>
    );
  }

  const meta = getReportMeta(type);
  if (!meta) {
    return null;
  }

  return <ReportDetailView reportKey={type} meta={meta} />;
}
