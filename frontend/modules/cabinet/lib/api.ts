import { apiRequest } from "@/lib/api";
import type { CabinetJob, CabinetJobLine, CabinetJobLineWrite, PricingResult } from "@/modules/cabinet/lib/types";

export const cabinetApi = {
  jobs: {
    list: (opts?: { partyId?: number; projectId?: number }) => {
      const q = new URLSearchParams();
      if (opts?.partyId) q.set("party_id", String(opts.partyId));
      if (opts?.projectId) q.set("project_id", String(opts.projectId));
      const suffix = q.toString() ? `?${q}` : "";
      return apiRequest<CabinetJob[]>(`/cabinet/jobs${suffix}`);
    },
    get: (id: number) => apiRequest<CabinetJob>(`/cabinet/jobs/${id}`),
    create: (partyId: number) =>
      apiRequest<CabinetJob>("/cabinet/jobs", {
        method: "POST",
        body: JSON.stringify({ party_id: partyId }),
      }),
    update: (
      id: number,
      body: {
        party_id?: number;
        job_reference?: string | null;
        project_id?: number | null;
        lines?: CabinetJobLineWrite[];
        arrange?: boolean;
      }
    ) =>
      apiRequest<CabinetJob>(`/cabinet/jobs/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    labourPreview: (lines: CabinetJobLineWrite[]) =>
      apiRequest<CabinetJobLine[]>("/cabinet/jobs/labour-preview", {
        method: "POST",
        body: JSON.stringify({ lines }),
      }),
    pricing: (
      lines: Array<
        CabinetJobLineWrite & { detail?: string | null; name?: string | null; family?: string | null; unit_price?: number | null }
      >
    ) =>
      apiRequest<PricingResult>("/cabinet/jobs/pricing", {
        method: "POST",
        body: JSON.stringify({ lines }),
      }),
    assign: (projectId: number, jobIds: number[]) =>
      apiRequest<CabinetJob[]>("/cabinet/jobs/assign", {
        method: "POST",
        body: JSON.stringify({ project_id: projectId, job_ids: jobIds }),
      }),
    duplicate: (id: number) =>
      apiRequest<CabinetJob>(`/cabinet/jobs/${id}/duplicate`, { method: "POST" }),
    remove: (id: number) => apiRequest<void>(`/cabinet/jobs/${id}`, { method: "DELETE" }),
  },
};
