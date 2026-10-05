"use client";

import { useEffect, useState } from "react";
import { Boxes, ClipboardList, FolderOpen, Package, Users } from "lucide-react";
import { HubTile } from "@/components/hub-tile";
import { cabinetApi } from "@/modules/cabinet/lib/api";
import { practiceApi } from "@/modules/practice/lib/api";
import type { PracticeStatus } from "@/modules/practice/lib/types";

export function CabinetHubPage() {
  const [stats, setStats] = useState<PracticeStatus | null>(null);
  const [jobCount, setJobCount] = useState<number | null>(null);

  useEffect(() => {
    practiceApi.status().then(setStats).catch(() => setStats(null));
    cabinetApi.jobs
      .list()
      .then((rows) => setJobCount(rows.length))
      .catch(() => setJobCount(null));
  }, []);

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-[hsl(var(--neon-cyan))]">
          Module · Cabinet Flow
        </p>
        <h1 className="page-title">Cabinet Flow</h1>
        <p className="page-subtitle max-w-2xl">
          Production for the company and its projects. Clients and projects are the same records as
          Work Flow. Money, quotes, and invoices stay on the Work Flow desk.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <HubTile
          compact
          href="/cabinet/clients"
          title="Clients"
          description="Same client cards. Open one for the job library."
          icon={Users}
          accent="cyan"
          badge={stats ? stats.client_count : "…"}
        />
        <HubTile
          compact
          href="/cabinet/jobcards"
          title="Jobcards"
          description="Every jobcard on the system, in jobcard number order."
          icon={ClipboardList}
          accent="cyan"
          badge={jobCount == null ? "…" : jobCount}
        />
        <HubTile
          compact
          href="/cabinet/projects"
          title="Projects"
          description="Same project folders. A folder shows only the jobs assigned to it."
          icon={FolderOpen}
          accent="cyan"
          badge={stats ? stats.open_project_count : "…"}
        />
        <HubTile
          compact
          href="/cabinet/cabinets"
          title="Cabinets"
          description="Default cabinets for the system and for quoting."
          icon={Boxes}
          accent="lime"
          badge="Soon"
        />
        <HubTile
          compact
          href="/cabinet/products"
          title="Products"
          description="Same catalogue as Work Flow. Timber, area, length, counted items, and labour."
          icon={Package}
          accent="lime"
          badge={stats ? stats.product_count ?? "…" : "…"}
        />
      </div>
    </div>
  );
}
