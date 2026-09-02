"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import type { PartyKind, PartyType, PartyWrite, PracticeParty } from "@/modules/practice/lib/types";

type Props = {
  open: boolean;
  kind: PartyKind;
  initial?: PracticeParty | null;
  onClose: () => void;
  onSave: (body: PartyWrite) => Promise<void>;
};

const empty: PartyWrite = {
  name: "",
  party_type: "individual",
  trading_name: "",
  contact_name: "",
  email: "",
  phone: "",
  address_line1: "",
  address_line2: "",
  city: "",
  postal_code: "",
  country: "South Africa",
  vat_number: "",
  business_registration_number: "",
  notes: "",
};

export function PartyFormModal({ open, kind, initial, onClose, onSave }: Props) {
  const noun = kind === "client" ? "client" : "supplier";
  const [form, setForm] = useState<PartyWrite>(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm({
        name: initial.name,
        party_type: (initial.party_type as PartyType) || "individual",
        trading_name: initial.trading_name || "",
        contact_name: initial.contact_name || "",
        email: initial.email || "",
        phone: initial.phone || "",
        address_line1: initial.address_line1 || "",
        address_line2: initial.address_line2 || "",
        city: initial.city || "",
        postal_code: initial.postal_code || "",
        country: initial.country || "South Africa",
        vat_number: initial.vat_number || "",
        business_registration_number: initial.business_registration_number || "",
        notes: initial.notes || "",
      });
    } else {
      setForm(empty);
    }
    setError(null);
  }, [open, initial]);

  function set<K extends keyof PartyWrite>(key: K, value: PartyWrite[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    if (!form.name?.trim()) return;
    setBusy(true);
    try {
      setError(null);
      const clean = { ...form, name: form.name.trim() };
      await onSave(clean);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  const isBiz = form.party_type === "business";

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeOnOutside={false}
      title={initial ? `Edit ${noun}` : `New ${noun}`}
      description="These details pull through to quotes and invoices."
      className="max-w-2xl"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Type</Label>
          <Select
            value={String(form.party_type || "individual")}
            onChange={(e) => set("party_type", e.target.value as PartyType)}
          >
            <option value="individual">Individual</option>
            <option value="business">Business</option>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Name</Label>
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        {isBiz && (
          <div className="space-y-1.5">
            <Label>Trading as (t/a)</Label>
            <Input
              value={form.trading_name || ""}
              onChange={(e) => set("trading_name", e.target.value)}
            />
          </div>
        )}
        <div className="space-y-1.5">
          <Label>Contact person</Label>
          <Input
            value={form.contact_name || ""}
            onChange={(e) => set("contact_name", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Email</Label>
          <Input type="email" value={form.email || ""} onChange={(e) => set("email", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Phone</Label>
          <Input value={form.phone || ""} onChange={(e) => set("phone", e.target.value)} />
        </div>
        <div className="sm:col-span-2 space-y-1.5">
          <Label>Address</Label>
          <Input
            value={form.address_line1 || ""}
            onChange={(e) => set("address_line1", e.target.value)}
            placeholder="Street"
          />
        </div>
        <div className="sm:col-span-2 space-y-1.5">
          <Input
            value={form.address_line2 || ""}
            onChange={(e) => set("address_line2", e.target.value)}
            placeholder="Suburb / extra line"
          />
        </div>
        <div className="space-y-1.5">
          <Label>City</Label>
          <Input value={form.city || ""} onChange={(e) => set("city", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Postal code</Label>
          <Input value={form.postal_code || ""} onChange={(e) => set("postal_code", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Country</Label>
          <Input value={form.country || ""} onChange={(e) => set("country", e.target.value)} />
        </div>
        {isBiz && (
          <>
            <div className="space-y-1.5">
              <Label>Registration number</Label>
              <Input
                value={form.business_registration_number || ""}
                onChange={(e) => set("business_registration_number", e.target.value)}
                placeholder="CIPC / company reg"
              />
            </div>
            <div className="space-y-1.5">
              <Label>VAT number</Label>
              <Input value={form.vat_number || ""} onChange={(e) => set("vat_number", e.target.value)} />
            </div>
          </>
        )}
        <div className="sm:col-span-2 space-y-1.5">
          <Label>Notes</Label>
          <textarea
            value={form.notes || ""}
            onChange={(e) => set("notes", e.target.value)}
            rows={2}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        {error && <p className="sm:col-span-2 text-sm text-destructive">{error}</p>}
        <div className="sm:col-span-2 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void save()} disabled={busy || !form.name?.trim()}>
            {initial ? "Save changes" : `Add ${noun}`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
