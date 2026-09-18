"use client";

import { useEffect, useMemo, useState } from "react";
import { TypeaheadSelect } from "@/components/ui/typeahead-select";
import { practiceApi } from "@/modules/practice/lib/api";
import type { AddressCard, PartyKind, PracticeParty } from "@/modules/practice/lib/types";

export function partyToCard(party: PracticeParty): AddressCard {
  return {
    name: party.name,
    trading_name: party.trading_name,
    contact_name: party.contact_name,
    email: party.email,
    phone: party.phone,
    address_line1: party.address_line1,
    address_line2: party.address_line2,
    city: party.city,
    postal_code: party.postal_code,
    country: party.country,
    tax_number: party.tax_number,
    vat_number: party.vat_number,
    business_registration_number: party.business_registration_number,
    party_type: party.party_type,
  };
}

export function tradingAsLine(name?: string | null, trading?: string | null): string | null {
  const n = (name || "").trim();
  const t = (trading || "").trim();
  if (!t || t === n) return null;
  return `t/a ${t}`;
}

function hint(p: PracticeParty): string {
  return [p.city, p.email, p.phone].filter(Boolean).join(" · ");
}

type Props = {
  kind?: PartyKind;
  value: number | null;
  selectedName?: string | null;
  selectedTradingName?: string | null;
  onSelect: (party: PracticeParty) => void;
  onClear?: () => void;
  tabIndex?: number;
};

export function ClientPicker({
  kind = "client",
  value,
  selectedName,
  selectedTradingName,
  onSelect,
  onClear,
  tabIndex,
}: Props) {
  const [rows, setRows] = useState<PracticeParty[]>([]);

  useEffect(() => {
    let cancelled = false;
    practiceApi.parties
      .list(kind, false, undefined, 200)
      .then((list) => {
        if (!cancelled) setRows(list);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [kind]);

  const options = useMemo(
    () =>
      rows.map((p) => ({
        id: String(p.id),
        label: p.name,
        hint: [tradingAsLine(p.name, p.trading_name), hint(p)].filter(Boolean).join(" · ") || undefined,
      })),
    [rows]
  );

  const fallback = [selectedName, tradingAsLine(selectedName, selectedTradingName)]
    .filter(Boolean)
    .join(" · ");

  return (
    <TypeaheadSelect
      options={options}
      value={value != null ? String(value) : ""}
      fallbackLabel={fallback}
      placeholder={kind === "supplier" ? "Type to filter vendors…" : "Type a client…"}
      allowEmpty={Boolean(onClear)}
      emptyLabel={kind === "supplier" ? "No vendor" : "Clear"}
      emptyMessage={
        kind === "supplier" ? "No vendors match." : "No clients match. Add them in the Clients library first."
      }
      aria-label={kind === "supplier" ? "Vendor" : "Client"}
      tabIndex={tabIndex}
      onChange={(id) => {
        if (!id) {
          onClear?.();
          return;
        }
        const party = rows.find((p) => String(p.id) === id);
        if (party) onSelect(party);
      }}
    />
  );
}
