"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { practiceApi } from "@/modules/practice/lib/api";
import { STAFF_WAGE_PERIODS, type PracticeStaff, type StaffWrite } from "@/modules/practice/lib/types";

type Props = {
  open: boolean;
  initial?: PracticeStaff | null;
  onClose: () => void;
  onSave: (body: StaffWrite, photo?: File | null) => Promise<void>;
};

const empty: StaffWrite = {
  name: "",
  known_as: "",
  job_title: "",
  id_number: "",
  born_on: "",
  phone: "",
  email: "",
  address_line1: "",
  address_line2: "",
  city: "",
  postal_code: "",
  country: "South Africa",
  bank_name: "",
  bank_account_name: "",
  bank_account_number: "",
  bank_branch_code: "",
  wage_amount: "",
  wage_period: "week",
  wage_effective_on: "",
  notes: "",
};

export function StaffFormModal({ open, initial, onClose, onSave }: Props) {
  const [form, setForm] = useState<StaffWrite>(empty);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPhoto(null);
    setError(null);
    if (initial) {
      setForm({
        name: initial.name,
        known_as: initial.known_as || "",
        job_title: initial.job_title || "",
        id_number: initial.id_number || "",
        born_on: initial.born_on || "",
        phone: initial.phone || "",
        email: initial.email || "",
        address_line1: initial.address_line1 || "",
        address_line2: initial.address_line2 || "",
        city: initial.city || "",
        postal_code: initial.postal_code || "",
        country: initial.country || "South Africa",
        bank_name: initial.bank_name || "",
        bank_account_name: initial.bank_account_name || "",
        bank_account_number: initial.bank_account_number || "",
        bank_branch_code: initial.bank_branch_code || "",
        wage_amount: initial.wage_amount != null && initial.wage_amount !== "" ? String(initial.wage_amount) : "",
        wage_period: initial.wage_period || "week",
        wage_effective_on: new Date().toISOString().slice(0, 10),
        notes: initial.notes || "",
      });
      let revoked = false;
      if (initial.has_photo) {
        practiceApi.staff.photoObjectUrl(initial.id).then((url) => {
          if (!revoked) setPreview(url);
        });
      } else {
        setPreview(null);
      }
      return () => {
        revoked = true;
      };
    }
    setForm({ ...empty, wage_effective_on: new Date().toISOString().slice(0, 10) });
    setPreview(null);
  }, [open, initial]);

  useEffect(() => {
    return () => {
      if (preview && preview.startsWith("blob:")) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function set<K extends keyof StaffWrite>(key: K, value: StaffWrite[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    if (!form.name?.trim()) return;
    setBusy(true);
    try {
      setError(null);
      await onSave(
        {
          ...form,
          name: form.name.trim(),
          born_on: form.born_on?.trim() ? form.born_on : null,
          wage_amount: form.wage_amount === "" || form.wage_amount == null ? null : form.wage_amount,
          wage_period: form.wage_period || "week",
          wage_effective_on: form.wage_effective_on?.trim() ? form.wage_effective_on : null,
        },
        photo
      );
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeOnOutside={false}
      title={initial ? "Edit staff" : "Add staff"}
      description="Personal details stay on this device. The photo is stored for later biometric clock-in — not sent to the cloud."
      className="max-w-2xl"
    >
      <div className="space-y-4">
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap items-start gap-4">
          <div className="h-24 w-24 overflow-hidden rounded-2xl border-2 border-border bg-muted/40">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">
                No photo
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label>Photo (for later biometrics)</Label>
            <Input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                setPhoto(file);
                if (preview && preview.startsWith("blob:")) URL.revokeObjectURL(preview);
                setPreview(file ? URL.createObjectURL(file) : null);
              }}
            />
            <p className="text-[11px] text-muted-foreground">PNG, JPG or WEBP · max 3 MB</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Full name</Label>
            <Input value={form.name || ""} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Known as</Label>
            <Input value={form.known_as || ""} onChange={(e) => set("known_as", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Job title</Label>
            <Input
              value={form.job_title || ""}
              onChange={(e) => set("job_title", e.target.value)}
              placeholder="Installer, driver…"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Wage</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={form.wage_amount == null ? "" : String(form.wage_amount)}
              onChange={(e) => set("wage_amount", e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Paid</Label>
            <Select
              value={(form.wage_period as string) || "week"}
              onChange={(e) => set("wage_period", e.target.value)}
            >
              {STAFF_WAGE_PERIODS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Wage effective from</Label>
            <Input
              type="date"
              value={form.wage_effective_on || ""}
              onChange={(e) => set("wage_effective_on", e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Dated when this rate starts for new wages. Payments already on project files keep the
              rate they were loaded at — later increases do not rewrite the books. Each change is
              kept on the staff wage paper trail for HR.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>ID number</Label>
            <Input value={form.id_number || ""} onChange={(e) => set("id_number", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Date of birth</Label>
            <Input type="date" value={form.born_on || ""} onChange={(e) => set("born_on", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input value={form.phone || ""} onChange={(e) => set("phone", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input value={form.email || ""} onChange={(e) => set("email", e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Address</Label>
            <Input
              value={form.address_line1 || ""}
              onChange={(e) => set("address_line1", e.target.value)}
              placeholder="Street"
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
          <div className="space-y-1.5 sm:col-span-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Bank (for payslips later)
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Bank</Label>
            <Input value={form.bank_name || ""} onChange={(e) => set("bank_name", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Account name</Label>
            <Input
              value={form.bank_account_name || ""}
              onChange={(e) => set("bank_account_name", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Account number</Label>
            <Input
              value={form.bank_account_number || ""}
              onChange={(e) => set("bank_account_number", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Branch code</Label>
            <Input
              value={form.bank_branch_code || ""}
              onChange={(e) => set("bank_branch_code", e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Notes</Label>
            <textarea
              value={form.notes || ""}
              onChange={(e) => set("notes", e.target.value)}
              rows={2}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void save()} disabled={busy || !form.name?.trim()}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
