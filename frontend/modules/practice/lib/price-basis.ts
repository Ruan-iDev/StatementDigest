export type PriceBasis = "whole" | "square_meter" | "unit" | "meter";

export function defaultPriceBasis(family: string | null | undefined): PriceBasis | null {
  if (family === "timber") return "whole";
  if (family === "square_meter") return "square_meter";
  if (family === "linear_meter") return "meter";
  return null;
}

export function priceBasisOf(
  family: string | null | undefined,
  value: string | null | undefined,
): PriceBasis | null {
  const raw = (value || "").trim().toLowerCase();
  if (family === "timber" || family === "square_meter") {
    if (raw === "whole" || raw === "square_meter") return raw;
    return family === "square_meter" ? "square_meter" : "whole";
  }
  if (family === "linear_meter") {
    if (raw === "unit" || raw === "meter") return raw;
    return "meter";
  }
  return null;
}

export function priceBasisOptions(
  family: string | null | undefined,
): { id: PriceBasis; label: string }[] {
  if (family === "timber" || family === "square_meter") {
    return [
      { id: "whole", label: "Price per whole" },
      { id: "square_meter", label: "Price per square meter" },
    ];
  }
  if (family === "linear_meter") {
    return [
      { id: "unit", label: "Price per unit" },
      { id: "meter", label: "Price per meter" },
    ];
  }
  return [];
}

export function priceBasisLabel(basis: PriceBasis | null): string | null {
  if (basis === "whole") return "Price per whole";
  if (basis === "square_meter") return "Price per square meter";
  if (basis === "unit") return "Price per unit";
  if (basis === "meter") return "Price per meter";
  return null;
}

export function priceBasisShort(basis: PriceBasis | null): string | null {
  if (basis === "whole") return "per whole";
  if (basis === "square_meter") return "per m²";
  if (basis === "unit") return "per unit";
  if (basis === "meter") return "per m";
  return null;
}

export function retailCaption(basis: PriceBasis | null): string {
  if (basis === "whole") return "Retail per whole";
  if (basis === "square_meter") return "Retail per m²";
  if (basis === "unit") return "Retail per unit";
  if (basis === "meter") return "Retail per meter";
  return "Retail price";
}

export function sizeAsk(
  family: string | null | undefined,
  basisValue: string | null | undefined,
  cutAndEdge = false,
): { length: boolean; width: boolean; lengthRequired: boolean; widthRequired: boolean } {
  const cutHost = family === "timber" || family === "square_meter" || family === "quantitative";
  if (cutAndEdge && cutHost) {
    return { length: true, width: true, lengthRequired: true, widthRequired: true };
  }
  const basis = priceBasisOf(family, basisValue);
  const areaFamily = family === "timber" || family === "square_meter";
  return {
    length:
      basis === "square_meter" ||
      basis === "meter" ||
      (basis === "whole" && areaFamily) ||
      (basis === "unit" && family === "linear_meter"),
    width: basis === "square_meter" || (basis === "whole" && areaFamily),
    lengthRequired: basis === "square_meter" || basis === "meter",
    widthRequired: basis === "square_meter",
  };
}

/** Quantity when the rate is for one item. Area or length when the rate is measured. Null when a required size is missing. */
export function measureForPrice(
  family: string | null | undefined,
  basisValue: string | null | undefined,
  quantity: number,
  lengthMm: number | null,
  widthMm: number | null,
): number | null {
  const basis = priceBasisOf(family, basisValue);
  if (basis === "square_meter") {
    if (lengthMm == null || widthMm == null || lengthMm <= 0 || widthMm <= 0) return null;
    return quantity * (lengthMm / 1000) * (widthMm / 1000);
  }
  if (basis === "meter") {
    if (lengthMm == null || lengthMm <= 0) return null;
    return quantity * (lengthMm / 1000);
  }
  return quantity;
}
