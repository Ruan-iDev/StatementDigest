"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { formatDate, formatMoney } from "@/lib/utils";
import { formatWageDays, staffWagePeriodLabel } from "@/modules/practice/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { practiceApi } from "@/modules/practice/lib/api";
import { StaffFormModal } from "@/modules/practice/pages/staff-form";
import type { PracticeStaff, StaffStatement, StaffWrite } from "@/modules/practice/lib/types";

export function PracticeStaffFilePage() {
  const search = useSearchParams();
  const id = Number(search.get("id") || "");
  const [data, setData] = useState<StaffStatement | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const validId = Number.isFinite(id) && id > 0;

  async function load() {
    const stmt = await practiceApi.staff.statement(id);
    setData(stmt);
    if (stmt.staff.has_photo) {
      const url = await practiceApi.staff.photoObjectUrl(stmt.staff.id);
      setPhotoUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    }
  }

  useEffect(() => {
    if (!validId) {
      setError("Open a staff member from the Staff library.");
      return;
    }
    load().catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not open staff file"));
    return () => {
      setPhotoUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [id, validId]);

  async function save(body: StaffWrite, photo?: File | null) {
    if (!data) return;
    await practiceApi.staff.update(data.staff.id, body);
    if (photo) await practiceApi.staff.uploadPhoto(data.staff.id, photo);
    await load();
  }

  if (!validId) {
    return <p className="text-sm text-muted-foreground">{error}</p>;
  }

  const staff: PracticeStaff | undefined = data?.staff;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link
          href="/practice/staff"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Staff
        </Link>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-[hsl(var(--neon-cyan))]">
          Staff statement
        </p>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-start gap-3">
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt="" className="h-16 w-16 rounded-2xl object-cover" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border text-[10px] text-muted-foreground">
                Photo
              </div>
            )}
            <div>
              <h1 className="page-title">{staff?.name || "Staff"}</h1>
              {staff?.known_as && staff.known_as !== staff.name && (
                <p className="page-subtitle">Known as {staff.known_as}</p>
              )}
              <p className="text-xs text-muted-foreground">
                {[
                  staff?.job_title,
                  staff?.wage_amount != null && staff.wage_amount !== ""
                    ? `${formatMoney(staff.wage_amount)} ${staffWagePeriodLabel(staff.wage_period).toLowerCase()}`
                    : null,
                  staff?.phone,
                  staff?.email,
                  staff?.city,
                ]
                  .filter(Boolean)
                  .join(" · ") || "Wages paid on project files."}
              </p>
            </div>
          </div>
          {staff && (
            <Button type="button" variant="outline" onClick={() => setEditOpen(true)}>
              Edit details
            </Button>
          )}
        </div>
      </header>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card className="section-panel neon-cyan border-2">
        <CardHeader>
          <CardDescription>Total wages paid</CardDescription>
          <CardTitle className="text-lg tabular-nums">
            {data ? formatMoney(data.totals.spent) : "…"}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {data ? `${data.totals.count} ${data.totals.count === 1 ? "payment" : "payments"}` : ""}
          </p>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Wage increases</CardTitle>
          <CardDescription>
            Dated rate changes on this staff card for future wages. Oldest at the top. Past payments
            on project files stay at the rate they were loaded at.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {!data?.wage_history?.length ? (
            <p className="text-sm text-muted-foreground">
              No rate trail yet. Set a wage on Edit details and give it an effective date.
            </p>
          ) : (
            data.wage_history.map((h) => {
              const kindLabel =
                h.kind === "increase"
                  ? "Increase"
                  : h.kind === "decrease"
                    ? "Decrease"
                    : h.kind === "period_change"
                      ? "Period change"
                      : "Starting rate";
              return (
                <div
                  key={h.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 py-2 last:border-0"
                >
                  <span className="min-w-0">
                    <span className="text-sm font-medium">{kindLabel}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {formatDate(h.effective_on)}
                      {h.previous_amount != null
                        ? ` · was ${formatMoney(h.previous_amount)} ${staffWagePeriodLabel(h.previous_period).toLowerCase()}`
                        : ""}
                    </span>
                  </span>
                  <span className="tabular-nums text-sm font-semibold">
                    {formatMoney(h.amount)} {staffWagePeriodLabel(h.period).toLowerCase()}
                  </span>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Wages paid</CardTitle>
          <CardDescription>
            Oldest at the top. Each line keeps the rate used that day. Open a project to see the
            paper trail. Payslips come later.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {!data || data.wages.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No wages yet. Add Wages from a project paper trail.
            </p>
          ) : (
            data.wages.map((w) => (
              <Link
                key={w.id}
                href={`/practice/file?id=${w.project_id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-transparent px-1 py-2 text-sm hover:border-[hsl(var(--neon-cyan)/0.45)]"
              >
                <span className="min-w-0">
                  <span className="font-medium">{w.project_name || "Project"}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {[
                      w.occurred_on ? formatDate(w.occurred_on) : "No date",
                      w.days != null && w.days !== ""
                        ? `${formatWageDays(w.days)} days${
                            w.rate_amount != null && w.rate_amount !== ""
                              ? ` × ${formatMoney(w.rate_amount)}/day`
                              : ""
                          }`
                        : null,
                      (w.additions || []).length
                        ? `plus ${(w.additions || []).map((d) => d.description).join(", ")}`
                        : null,
                      (w.deductions || []).length
                        ? `less ${(w.deductions || []).map((d) => d.description).join(", ")}`
                        : null,
                      w.notes || null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className="tabular-nums font-semibold">{formatMoney(w.amount)}</span>
              </Link>
            ))
          )}
        </CardContent>
      </Card>

      {staff && (
        <StaffFormModal open={editOpen} initial={staff} onClose={() => setEditOpen(false)} onSave={save} />
      )}
    </div>
  );
}
