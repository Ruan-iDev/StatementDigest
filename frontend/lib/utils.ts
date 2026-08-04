import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMoney(
  value: string | number | null | undefined,
  currency = "ZAR"
): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(n)) return "—";
  const abs = Math.abs(n).toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return n < 0 ? `-${currency} ${abs}` : `${currency} ${abs}`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Date(value + (value.length === 10 ? "T00:00:00" : "")).toLocaleDateString(
      "en-ZA",
      { year: "numeric", month: "short", day: "numeric" }
    );
  } catch {
    return value;
  }
}
