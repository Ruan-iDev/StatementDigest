import { apiRequest, getAuthToken, getStoredProfileId } from "@/lib/api";
import type {
  DocumentKind,
  DocumentPrepare,
  DocumentPreview,
  DocumentWrite,
  PartyKind,
  PartyWrite,
  PracticeBranding,
  PracticeDocument,
  PracticeIssuer,
  PracticeEntry,
  PracticeExpense,
  PracticeLedger,
  PracticeFlags,
  PracticeParty,
  PracticeProject,
  PracticeProjectDetail,
  PracticeStaff,
  PracticeStatus,
  PracticeProduct,
  PracticeTemplate,
  PracticeTravel,
  PracticeWage,
  ProjectStatement,
  ProjectWrite,
  StaffStatement,
  StaffWrite,
  ProductWrite,
  SupplierStatement,
  WorkflowOverview,
  WorkflowReport,
} from "./types";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://127.0.0.1:8470/api";

export const practiceApi = {
  status: () => apiRequest<PracticeStatus>("/practice/status"),
  overview: (fyStartYear?: number) => {
    const q = new URLSearchParams();
    if (fyStartYear != null) q.set("fy_start_year", String(fyStartYear));
    const suffix = q.toString() ? `?${q}` : "";
    return apiRequest<WorkflowOverview>(`/practice/overview${suffix}`);
  },
  reports: (fyStartYear?: number) => {
    const q = new URLSearchParams();
    if (fyStartYear != null) q.set("fy_start_year", String(fyStartYear));
    const suffix = q.toString() ? `?${q}` : "";
    return apiRequest<WorkflowReport>(`/practice/reports${suffix}`);
  },
  ledgers: {
    list: (type?: "income" | "expense", includeArchived = false) => {
      const q = new URLSearchParams();
      if (type) q.set("type", type);
      if (includeArchived) q.set("include_archived", "true");
      const suffix = q.toString() ? `?${q}` : "";
      return apiRequest<PracticeLedger[]>(`/practice/ledgers${suffix}`);
    },
    create: (body: { name: string; type: "income" | "expense" }) =>
      apiRequest<PracticeLedger>("/practice/ledgers", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    update: (id: number, body: { name?: string; type?: "income" | "expense"; is_archived?: boolean }) =>
      apiRequest<PracticeLedger>(`/practice/ledgers/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
  },
  flags: {
    get: () => apiRequest<PracticeFlags>("/practice/flags"),
    update: (body: Partial<PracticeFlags>) =>
      apiRequest<PracticeFlags>("/practice/flags", {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
  },
  parties: {
    get: (id: number) => apiRequest<PracticeParty>(`/practice/parties/${id}`),
    list: (kind?: PartyKind, includeArchived = false, search?: string, limit = 50) => {
      const q = new URLSearchParams();
      if (kind) q.set("kind", kind);
      if (includeArchived) q.set("include_archived", "true");
      if (search?.trim()) q.set("q", search.trim());
      q.set("limit", String(limit));
      const suffix = q.toString() ? `?${q}` : "";
      return apiRequest<PracticeParty[]>(`/practice/parties${suffix}`);
    },
    create: (kind: PartyKind, body: PartyWrite) =>
      apiRequest<PracticeParty>("/practice/parties", {
        method: "POST",
        body: JSON.stringify({ kind, ...body }),
      }),
    update: (id: number, body: Partial<PartyWrite> & { is_archived?: boolean }) =>
      apiRequest<PracticeParty>(`/practice/parties/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    statement: (id: number) =>
      apiRequest<SupplierStatement>(`/practice/parties/${id}/statement`),
    statementPdf: async (id: number): Promise<Blob> => {
      const token = getAuthToken();
      const profileId = getStoredProfileId();
      const res = await fetch(`${API_BASE}/practice/parties/${id}/statement/pdf`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(profileId != null ? { "X-Profile-Id": String(profileId) } : {}),
        },
        cache: "no-store",
      });
      if (!res.ok) {
        let detail = res.statusText;
        try {
          const j = await res.json();
          detail = j.detail || detail;
        } catch {
          /* ignore */
        }
        throw new Error(typeof detail === "string" ? detail : "Could not build statement PDF");
      }
      return res.blob();
    },
  },
  staff: {
    list: (includeArchived = false, search?: string, limit = 200) => {
      const q = new URLSearchParams();
      if (includeArchived) q.set("include_archived", "true");
      if (search?.trim()) q.set("q", search.trim());
      q.set("limit", String(limit));
      return apiRequest<PracticeStaff[]>(`/practice/staff?${q}`);
    },
    get: (id: number) => apiRequest<PracticeStaff>(`/practice/staff/${id}`),
    create: (body: StaffWrite) =>
      apiRequest<PracticeStaff>("/practice/staff", { method: "POST", body: JSON.stringify(body) }),
    update: (id: number, body: Partial<StaffWrite>) =>
      apiRequest<PracticeStaff>(`/practice/staff/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    statement: (id: number) => apiRequest<StaffStatement>(`/practice/staff/${id}/statement`),
    uploadPhoto: (id: number, file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return apiRequest<PracticeStaff>(`/practice/staff/${id}/photo`, { method: "POST", body: fd });
    },
    photoObjectUrl: async (id: number): Promise<string | null> => {
      const token = getAuthToken();
      const profileId = getStoredProfileId();
      const res = await fetch(`${API_BASE}/practice/staff/${id}/photo`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(profileId != null ? { "X-Profile-Id": String(profileId) } : {}),
        },
        cache: "no-store",
      });
      if (!res.ok) return null;
      return URL.createObjectURL(await res.blob());
    },
  },
  products: {
    list: (includeArchived = false, search?: string, limit = 200) => {
      const q = new URLSearchParams();
      if (includeArchived) q.set("include_archived", "true");
      if (search?.trim()) q.set("q", search.trim());
      q.set("limit", String(limit));
      return apiRequest<PracticeProduct[]>(`/practice/products?${q}`);
    },
    categories: () => apiRequest<string[]>("/practice/products/categories"),
    get: (id: number) => apiRequest<PracticeProduct>(`/practice/products/${id}`),
    create: (body: ProductWrite) =>
      apiRequest<PracticeProduct>("/practice/products", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    update: (id: number, body: Partial<ProductWrite>) =>
      apiRequest<PracticeProduct>(`/practice/products/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
  },
  wages: {
    list: (opts?: { projectId?: number; staffId?: number }) => {
      const q = new URLSearchParams();
      if (opts?.projectId) q.set("project_id", String(opts.projectId));
      if (opts?.staffId) q.set("staff_id", String(opts.staffId));
      const suffix = q.toString() ? `?${q}` : "";
      return apiRequest<PracticeWage[]>(`/practice/wages${suffix}`);
    },
    create: (body: {
      project_id: number;
      staff_id: number;
      amount?: number | string | null;
      days?: number | string | null;
      kind?: "wage" | "commission" | "absence";
      override_reason?: string | null;
      ledger_id?: number | null;
      occurred_on?: string | null;
      notes?: string | null;
      deductions?: { description: string; amount: number | string }[];
      additions?: { description: string; amount: number | string }[];
    }) => apiRequest<PracticeWage>("/practice/wages", { method: "POST", body: JSON.stringify(body) }),
    update: (
      id: number,
      body: {
        staff_id?: number;
        amount?: number | string | null;
        days?: number | string | null;
        kind?: "wage" | "commission" | "absence";
        override_reason?: string | null;
        ledger_id?: number | null;
        occurred_on?: string | null;
        notes?: string | null;
        deductions?: { description: string; amount: number | string }[];
        additions?: { description: string; amount: number | string }[];
      }
    ) =>
      apiRequest<PracticeWage>(`/practice/wages/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
  },
  projects: {
    list: (includeArchived = false, clientId?: number) => {
      const q = new URLSearchParams();
      if (includeArchived) q.set("include_archived", "true");
      if (clientId) q.set("client_id", String(clientId));
      const suffix = q.toString() ? `?${q}` : "";
      return apiRequest<PracticeProject[]>(`/practice/projects${suffix}`);
    },
    get: (id: number) => apiRequest<PracticeProjectDetail>(`/practice/projects/${id}`),
    create: (body: ProjectWrite) =>
      apiRequest<PracticeProjectDetail>("/practice/projects", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    update: (id: number, body: Partial<ProjectWrite> & { is_archived?: boolean }) =>
      apiRequest<PracticeProjectDetail>(`/practice/projects/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    addEntry: (
      id: number,
      body: {
        entry_type?: "note" | "task" | "payment" | "meeting";
        title: string;
        body?: string;
        amount?: number | string;
        document_id?: number | null;
        document_ids?: number[] | null;
        ledger_id?: number | null;
        occurred_on?: string | null;
        occurred_time?: string | null;
      }
    ) =>
      apiRequest<PracticeEntry>(`/practice/projects/${id}/entries`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    updateEntry: (
      id: number,
      entryId: number,
      body: {
        title?: string;
        body?: string | null;
        amount?: number | string | null;
        document_id?: number | null;
        document_ids?: number[] | null;
        ledger_id?: number | null;
        occurred_on?: string | null;
        occurred_time?: string | null;
      }
    ) =>
      apiRequest<PracticeEntry>(`/practice/projects/${id}/entries/${entryId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    deleteEntry: (id: number, entryId: number) =>
      apiRequest<void>(`/practice/projects/${id}/entries/${entryId}`, { method: "DELETE" }),
    statement: (id: number) => apiRequest<ProjectStatement>(`/practice/projects/${id}/statement`),
  },
  documents: {
    list: (kind?: DocumentKind, projectId?: number, partyId?: number) => {
      const q = new URLSearchParams();
      if (kind) q.set("kind", kind);
      if (projectId) q.set("project_id", String(projectId));
      if (partyId) q.set("party_id", String(partyId));
      const suffix = q.toString() ? `?${q}` : "";
      return apiRequest<PracticeDocument[]>(`/practice/documents${suffix}`);
    },
    prepare: (kind: DocumentKind, opts?: { partyId?: number; projectId?: number }) => {
      const q = new URLSearchParams({ kind });
      if (opts?.partyId) q.set("party_id", String(opts.partyId));
      if (opts?.projectId) q.set("project_id", String(opts.projectId));
      return apiRequest<DocumentPrepare>(`/practice/documents/prepare?${q}`);
    },
    get: (id: number) => apiRequest<PracticeDocument>(`/practice/documents/${id}`),
    preview: (id: number) => apiRequest<DocumentPreview>(`/practice/documents/${id}/preview`),
    batchPreview: (ids: number[]) =>
      apiRequest<DocumentPreview>("/practice/documents/batch-preview", {
        method: "POST",
        body: JSON.stringify({ ids }),
      }),
    create: (body: DocumentWrite) =>
      apiRequest<PracticeDocument>("/practice/documents", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    update: (id: number, body: Partial<DocumentWrite>) =>
      apiRequest<PracticeDocument>(`/practice/documents/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    pdfBlob: async (id: number): Promise<Blob> => {
      const token = getAuthToken();
      const profileId = getStoredProfileId();
      const res = await fetch(`${API_BASE}/practice/documents/${id}/pdf`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(profileId != null ? { "X-Profile-Id": String(profileId) } : {}),
        },
        cache: "no-store",
      });
      if (!res.ok) {
        let detail = res.statusText;
        try {
          const j = await res.json();
          detail = j.detail || detail;
        } catch {
          /* ignore */
        }
        throw new Error(typeof detail === "string" ? detail : "Could not build PDF");
      }
      const buf = await res.arrayBuffer();
      const bytes = new Uint8Array(buf);
      const magic = String.fromCharCode(bytes[0] || 0, bytes[1] || 0, bytes[2] || 0, bytes[3] || 0);
      if (bytes.length < 8 || magic !== "%PDF") {
        throw new Error("Could not build PDF");
      }
      return new Blob([bytes], { type: "application/pdf" });
    },
    batchPdfBlob: async (ids: number[]): Promise<Blob> => {
      const token = getAuthToken();
      const profileId = getStoredProfileId();
      const res = await fetch(`${API_BASE}/practice/documents/batch-pdf`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(profileId != null ? { "X-Profile-Id": String(profileId) } : {}),
        },
        body: JSON.stringify({ ids }),
        cache: "no-store",
      });
      if (!res.ok) {
        let detail = res.statusText;
        try {
          const j = await res.json();
          detail = j.detail || detail;
        } catch {
          /* ignore */
        }
        throw new Error(typeof detail === "string" ? detail : "Could not build PDF");
      }
      const buf = await res.arrayBuffer();
      const bytes = new Uint8Array(buf);
      const magic = String.fromCharCode(bytes[0] || 0, bytes[1] || 0, bytes[2] || 0, bytes[3] || 0);
      if (bytes.length < 8 || magic !== "%PDF") {
        throw new Error("Could not build PDF");
      }
      return new Blob([bytes], { type: "application/pdf" });
    },
    paymentReceived: (
      id: number,
      body?: {
        amount?: number | string | null;
        occurred_on?: string | null;
        method?: string | null;
        note?: string | null;
      }
    ) =>
      apiRequest<PracticeDocument>(`/practice/documents/${id}/payment-received`, {
        method: "POST",
        body: JSON.stringify(body || {}),
      }),
    invoiceFromQuote: (
      quoteId: number,
      body: { income_ledger_id: number; issued_on?: string | null; notes?: string | null }
    ) =>
      apiRequest<PracticeDocument>(`/practice/quotes/${quoteId}/invoice`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    duplicateQuote: (quoteId: number) =>
      apiRequest<PracticeDocument>(`/practice/quotes/${quoteId}/duplicate`, { method: "POST" }),
    uploadNoteImage: (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return apiRequest<{ path: string; filename: string }>("/practice/note-images", {
        method: "POST",
        body: fd,
      });
    },
    noteImageObjectUrl: async (path: string): Promise<string | null> => {
      const token = getAuthToken();
      const profileId = getStoredProfileId();
      const q = new URLSearchParams({ path });
      const res = await fetch(`${API_BASE}/practice/note-images?${q}`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(profileId != null ? { "X-Profile-Id": String(profileId) } : {}),
        },
        cache: "no-store",
      });
      if (!res.ok) return null;
      return URL.createObjectURL(await res.blob());
    },
  },
  branding: {
    get: () => apiRequest<PracticeBranding>("/practice/templates"),
    update: (kind: DocumentKind, body: Partial<PracticeTemplate>) =>
      apiRequest<PracticeTemplate>(`/practice/templates/${kind}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    uploadLogo: (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return apiRequest<PracticeBranding>("/practice/branding/logo", { method: "POST", body: fd });
    },
    deleteLogo: () => apiRequest<PracticeBranding>("/practice/branding/logo", { method: "DELETE" }),
    updateIssuer: (body: { use_profile_data: boolean; details?: PracticeIssuer }) =>
      apiRequest<PracticeBranding>("/practice/branding/issuer", {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    updateVat: (body: { vat_enabled: boolean; vat_rate?: number | string }) =>
      apiRequest<PracticeBranding>("/practice/branding/vat", {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    logoObjectUrl: async (): Promise<string | null> => {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE}/practice/branding/logo`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: "no-store",
      });
      if (!res.ok) return null;
      return URL.createObjectURL(await res.blob());
    },
  },
  travels: {
    list: (projectId?: number) =>
      apiRequest<PracticeTravel[]>(
        `/practice/travels${projectId ? `?project_id=${projectId}` : ""}`
      ),
    create: (body: {
      project_id: number;
      staff_id: number;
      ledger_id: number;
      km: number | string;
      price_per_litre: number | string;
      amount: number | string;
      occurred_on?: string | null;
      notes?: string | null;
    }) =>
      apiRequest<PracticeTravel>("/practice/travels", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    update: (
      travelId: number,
      body: {
        staff_id?: number;
        ledger_id?: number;
        km?: number | string;
        price_per_litre?: number | string;
        amount?: number | string;
        occurred_on?: string | null;
        notes?: string | null;
      }
    ) =>
      apiRequest<PracticeTravel>(`/practice/travels/${travelId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
  },
  expenses: {
    list: (projectId?: number) =>
      apiRequest<PracticeExpense[]>(
        `/practice/expenses${projectId ? `?project_id=${projectId}` : ""}`
      ),
    create: (body: {
      project_id: number;
      ledger_id: number;
      description: string;
      amount: number | string;
      incurred_on?: string | null;
      supplier_id?: number | null;
      vendor_name?: string | null;
      notes?: string | null;
    }) =>
      apiRequest<PracticeExpense>("/practice/expenses", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    update: (
      expenseId: number,
      body: {
        ledger_id?: number;
        description?: string;
        amount?: number | string;
        incurred_on?: string | null;
        supplier_id?: number | null;
        vendor_name?: string | null;
        notes?: string | null;
      }
    ) =>
      apiRequest<PracticeExpense>(`/practice/expenses/${expenseId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
  },
};
