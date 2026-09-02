"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { practiceApi } from "@/modules/practice/lib/api";
import { formatMoney } from "@/lib/utils";
import { staffFileHref, staffWagePeriodLabel, type PracticeStaff, type StaffWrite } from "@/modules/practice/lib/types";
import { StaffFormModal } from "@/modules/practice/pages/staff-form";

function StaffPhoto({ id, hasPhoto }: { id: number; hasPhoto: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!hasPhoto) return;
    let live = true;
    practiceApi.staff.photoObjectUrl(id).then((u) => {
      if (live) setUrl(u);
    });
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, hasPhoto]);
  if (!url) {
    return (
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/40 text-[10px] text-muted-foreground">
        Photo
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
  );
}

export function PracticeStaffLibraryPage() {
  const router = useRouter();
  const [rows, setRows] = useState<PracticeStaff[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PracticeStaff | null>(null);

  async function load(search = query) {
    setRows(await practiceApi.staff.list(false, search, 200));
  }

  useEffect(() => {
    const delay = query.trim() ? 180 : 0;
    const t = window.setTimeout(() => {
      load(query).catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"));
    }, delay);
    return () => window.clearTimeout(t);
  }, [query]);

  async function save(body: StaffWrite, photo?: File | null) {
    let row: PracticeStaff;
    if (editing) {
      row = await practiceApi.staff.update(editing.id, body);
    } else {
      row = await practiceApi.staff.create(body);
    }
    if (photo) await practiceApi.staff.uploadPhoto(row.id, photo);
    await load();
  }

  async function archive(id: number) {
    try {
      await practiceApi.staff.update(id, { is_archived: true });
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not archive");
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <Link
            href="/practice"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" />
            Work Flow
          </Link>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-[hsl(var(--neon-cyan))]">
            Work Flow · People
          </p>
          <h1 className="page-title">Staff</h1>
          <p className="page-subtitle max-w-xl">
            People you pay on jobs. Open a card for their wage statement. Add wages from a project paper
            trail.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          Add staff
        </Button>
      </header>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="max-w-md">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search staff…"
          aria-label="Search staff"
          autoComplete="off"
        />
      </div>

      <div className="space-y-2">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {query.trim() ? `No staff match "${query.trim()}".` : "No staff yet."}
          </p>
        ) : (
          rows.map((row) => (
            <Card
              key={row.id}
              className="cursor-pointer transition-colors hover:border-[hsl(var(--neon-cyan)/0.45)]"
              onClick={() => router.push(staffFileHref(row.id))}
            >
              <CardContent className="flex flex-wrap items-start justify-between gap-3 py-4">
                <div className="flex min-w-0 items-start gap-3">
                  <StaffPhoto id={row.id} hasPhoto={row.has_photo} />
                  <div className="min-w-0 space-y-0.5">
                    <div className="font-medium">{row.name}</div>
                    {row.known_as && row.known_as !== row.name && (
                      <div className="text-sm text-muted-foreground">Known as {row.known_as}</div>
                    )}
                    <div className="text-xs text-muted-foreground">
                      {[
                        row.job_title,
                        row.wage_amount != null && row.wage_amount !== ""
                          ? `${formatMoney(row.wage_amount)} ${staffWagePeriodLabel(row.wage_period).toLowerCase()}`
                          : null,
                        row.phone,
                        row.city,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => router.push(staffFileHref(row.id))}
                  >
                    Statement
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditing(row);
                      setFormOpen(true);
                    }}
                  >
                    Edit
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => void archive(row.id)}>
                    Archive
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <StaffFormModal
        open={formOpen}
        initial={editing}
        onClose={() => setFormOpen(false)}
        onSave={save}
      />
    </div>
  );
}
