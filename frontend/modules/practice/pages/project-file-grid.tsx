"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { PracticeProject } from "@/modules/practice/lib/types";

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  on_hold: "On hold",
  completed: "Completed",
  cancelled: "Cancelled",
};

function statusStripe(status: string): string {
  if (status === "completed") return "hsl(var(--neon-lime))";
  if (status === "on_hold") return "hsl(var(--neon-amber))";
  if (status === "cancelled") return "hsl(var(--muted-foreground))";
  return "hsl(var(--neon-cyan))";
}

export function projectFileLabel(row: Pick<PracticeProject, "reference" | "name">): string {
  const ref = (row.reference || "").trim();
  const name = (row.name || "").trim();
  if (ref && name) return `${ref} - ${name}`;
  return name || ref || "Project";
}

export function sortProjectFiles<T extends Pick<PracticeProject, "reference" | "name">>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const left = `${(a.reference || "").trim()} ${(a.name || "").trim()}`.trim();
    const right = `${(b.reference || "").trim()} ${(b.name || "").trim()}`.trim();
    return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
  });
}

/** Windows File Explorer folder yellows — stay gold in light and dark. */
function WindowsFolderIcon({ status, number }: { status: string; number: string }) {
  const stripe = statusStripe(status);
  const uid = `folder-${number.replace(/[^a-zA-Z0-9_-]/g, "") || "x"}`;
  return (
    <svg viewBox="0 0 80 64" className="h-[10.65rem] w-[13.2rem]" aria-hidden="true">
      <defs>
        <linearGradient id={`${uid}-back`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#E8B84A" />
          <stop offset="100%" stopColor="#C99216" />
        </linearGradient>
        <linearGradient id={`${uid}-front`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFE27A" />
          <stop offset="42%" stopColor="#F5C242" />
          <stop offset="100%" stopColor="#E0A41E" />
        </linearGradient>
        <linearGradient id={`${uid}-tab`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F3D36A" />
          <stop offset="100%" stopColor="#D4A017" />
        </linearGradient>
      </defs>
      <ellipse cx="40" cy="60" rx="28" ry="2.4" fill="#000" opacity="0.12" />
      <path
        d="M8 20h22.5c1.4 0 2.5-.8 3.2-2l2.2-3.6c.7-1.2 1.9-2 3.3-2H48c2.2 0 4 1.8 4 4v3.6H11.5C9.6 20 8 21.6 8 23.5V20z"
        fill={`url(#${uid}-tab)`}
        stroke="#C49218"
        strokeWidth="0.8"
        strokeLinejoin="round"
      />
      <rect
        x="8"
        y="19.5"
        width="64"
        height="36"
        rx="3.2"
        fill={`url(#${uid}-back)`}
        stroke="#C49218"
        strokeWidth="0.8"
      />
      <path
        d="M6.5 26.5h67c2.1 0 3.7 1.7 3.6 3.8l-1.8 26.2c-.2 2.3-2.1 4-4.4 4H12.1c-2.3 0-4.2-1.7-4.4-4L6 30.3c-.2-2.1 1.4-3.8 3.5-3.8z"
        fill={`url(#${uid}-front)`}
        stroke="#C49218"
        strokeWidth="0.9"
        strokeLinejoin="round"
      />
      <path
        d="M9 28.2h61.2"
        fill="none"
        stroke="#FFF6C8"
        strokeWidth="1.4"
        opacity="0.55"
        strokeLinecap="round"
      />
      <rect x="12" y="56.4" width="56" height="2.6" rx="0.7" fill={stripe} />
    </svg>
  );
}

export function ProjectFileGrid({
  projects,
  showClient = false,
  hrefFor,
}: {
  projects: PracticeProject[];
  showClient?: boolean;
  hrefFor?: (row: PracticeProject) => string;
}) {
  const listed = sortProjectFiles(projects);
  return (
    <div
      className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] justify-items-center gap-x-3 gap-y-5"
      role="list"
      aria-label="Project files"
    >
      {listed.map((row) => {
        const number = (row.reference || "").trim();
        const name = (row.name || "").trim() || "Project";
        const client = showClient ? (row.client_name || "").trim() : "";
        const status = STATUS_LABEL[row.status] ?? row.status;
        const uid = `n${row.id}`;
        return (
          <Link
            key={row.id}
            href={hrefFor ? hrefFor(row) : `/practice/file?id=${row.id}`}
            role="listitem"
            title={`${number ? `${number} · ` : ""}${name}${client ? ` · ${client}` : ""} · ${status}`}
            className={cn(
              "group flex w-full max-w-[14.5rem] flex-col items-center rounded-lg px-1.5 py-2 text-center",
              "hover:bg-accent/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            )}
          >
            <span className="relative inline-flex">
              <WindowsFolderIcon status={row.status} number={uid} />
              <span className="pointer-events-none absolute inset-x-[11%] top-[40%] bottom-[11%] flex flex-col items-center justify-center gap-0.5 px-1">
                <span className="line-clamp-1 w-full text-base font-extrabold leading-tight tracking-tight text-[#5c3d08] drop-shadow-[0_1px_0_rgba(255,236,170,0.9)]">
                  {number || "—"}
                </span>
                <span className="line-clamp-2 w-full text-[13px] font-semibold leading-snug tracking-tight text-[#5c3d08] drop-shadow-[0_1px_0_rgba(255,236,170,0.85)]">
                  {name}
                </span>
                {client ? (
                  <span className="line-clamp-1 w-full text-[11px] font-medium leading-tight text-[#7a5420]/90">
                    {client}
                  </span>
                ) : null}
              </span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
