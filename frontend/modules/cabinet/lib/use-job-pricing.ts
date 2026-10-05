"use client";

import { useEffect, useRef, useState } from "react";
import { cabinetApi } from "@/modules/cabinet/lib/api";
import type { CabinetJobLine, CabinetJobLineWrite, PricingResult } from "@/modules/cabinet/lib/types";

type PricingPayload = Array<
  CabinetJobLineWrite & {
    detail?: string | null;
    name?: string | null;
    family?: string | null;
    unit_price?: number | null;
  }
>;

function num(value: string | number | null | undefined): number {
  if (value == null || value === "") return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sizeOrNull(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  return num(value);
}

function pricingPayload(lines: CabinetJobLine[]): PricingPayload {
  return lines.flatMap((line) => {
    if (!line.product_id) return [];
    return [
      {
        product_id: line.product_id,
        quantity: num(line.quantity),
        length_mm: sizeOrNull(line.length_mm),
        width_mm: sizeOrNull(line.width_mm),
        source_product_id: line.source_product_id ?? null,
        detail: line.detail ?? null,
        unit_price: num(line.unit_price),
        name: line.name,
        family: line.family,
      },
    ];
  });
}

const emptyPricing: PricingResult = { rows: [], ex_vat: 0, vat: 0, total: 0 };

export function useJobPricing(lines: CabinetJobLine[]) {
  const [result, setResult] = useState<PricingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const request = useRef(0);
  const signature = JSON.stringify(pricingPayload(lines));

  useEffect(() => {
    const token = ++request.current;
    const body = JSON.parse(signature) as PricingPayload;
    if (body.length === 0) {
      setResult(emptyPricing);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    cabinetApi.jobs
      .pricing(body)
      .then((priced) => {
        if (token === request.current) {
          setResult(priced);
          setError(null);
        }
      })
      .catch((reason: unknown) => {
        if (token === request.current) {
          setError(reason instanceof Error ? reason.message : "Could not price this jobcard");
        }
      })
      .finally(() => {
        if (token === request.current) setLoading(false);
      });
  }, [signature]);

  return { result, error, loading };
}
