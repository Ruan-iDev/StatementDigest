"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronRight, GripVertical, MoreHorizontal, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cabinetApi } from "@/modules/cabinet/lib/api";
import {
  changedSources,
  duplicateBlock,
  groupLines,
  keysToRemap,
  moveBlock,
  newGroupKey,
  pathHas,
  pathOf,
  newLineId,
  placeLabour,
  renderRows,
  toggleCollapsed,
} from "@/modules/cabinet/lib/line-layout";
import type { CabinetJob, CabinetJobLine, CabinetJobLineWrite } from "@/modules/cabinet/lib/types";
import { useJobPricing } from "@/modules/cabinet/lib/use-job-pricing";
import { AddProductDialog, type AddedProduct } from "@/modules/cabinet/pages/add-product-dialog";
import { OptimizationSheet } from "@/modules/cabinet/pages/optimization-sheet";
import { PricingSheet } from "@/modules/cabinet/pages/pricing-sheet";
import { measureForPrice } from "@/modules/practice/lib/price-basis";
import { practiceApi } from "@/modules/practice/lib/api";
import { cn } from "@/lib/utils";
import type { PracticeParty } from "@/modules/practice/lib/types";

function num(value: string | number | null | undefined): number {
  if (value == null || value === "") return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dimensions(line: CabinetJobLine): string {
  const length = line.length_mm == null || line.length_mm === "" ? null : num(line.length_mm);
  const width = line.width_mm == null || line.width_mm === "" ? null : num(line.width_mm);
  if (length && width) return `${length} × ${width} mm`;
  if (length) return `${length} mm`;
  return "—";
}

function partLines(lines: CabinetJobLine[]): CabinetJobLine[] {
  return lines.filter((line) => line.source_product_id == null);
}

function sizeOrNull(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  return num(value);
}

function toPartWrite(line: CabinetJobLine): CabinetJobLineWrite | null {
  if (line.source_product_id != null || !line.product_id) return null;
  return {
    product_id: line.product_id,
    quantity: num(line.quantity),
    length_mm: sizeOrNull(line.length_mm),
    width_mm: sizeOrNull(line.width_mm),
  };
}

function toSaveWrite(line: CabinetJobLine): CabinetJobLineWrite | null {
  if (!line.product_id) return null;
  const path = pathOf(line);
  return {
    product_id: line.product_id,
    quantity: num(line.quantity),
    length_mm: sizeOrNull(line.length_mm),
    width_mm: sizeOrNull(line.width_mm),
    source_product_id: line.source_product_id ?? null,
    bundle_path: path.length ? path : null,
  };
}

function intersects(rect: { left: number; top: number; right: number; bottom: number }, box: DOMRect): boolean {
  return rect.left < box.right && rect.right > box.left && rect.top < box.bottom && rect.bottom > box.top;
}

export function CabinetJobcardPage() {
  const router = useRouter();
  const params = useSearchParams();
  const id = Number(params.get("id"));
  const validId = Number.isFinite(id) && id > 0;
  const [job, setJob] = useState<CabinetJob | null>(null);
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<CabinetJobLine[]>([]);
  const [clients, setClients] = useState<PracticeParty[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [printNote, setPrintNote] = useState<string | null>(null);
  const [stage, setStage] = useState<"products" | "pricing" | "optimization">("products");
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveClientId, setMoveClientId] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [naming, setNaming] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [dropBefore, setDropBefore] = useState<number | "end" | null>(null);
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const labourSeq = useRef(0);
  const linesRef = useRef(lines);
  const dropRef = useRef<number | "end" | null>(null);
  const dragRef = useRef<{ kind: "line" | "group"; id: number | string } | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const dismissedLabour = useRef(new Set<string>());
  const quietSources = useRef(new Set<number>());
  const mounted = useRef(true);
  const pricing = useJobPricing(lines);
  const sheetRows = (pricing.result?.rows ?? []).filter((row) => row.unit_label === "sheets");
  linesRef.current = lines;

  useEffect(() => {
    if (stage === "optimization" && !pricing.loading && sheetRows.length === 0) {
      setStage("pricing");
    }
  }, [stage, pricing.loading, sheetRows.length]);

  function setDrop(value: number | "end" | null) {
    dropRef.current = value;
    setDropBefore(value);
  }

  function clearSelection() {
    setSelectedIds(new Set());
    setSelectedGroups(new Set());
    setNaming(false);
    setNameError(null);
  }

  function lineIsChosen(line: CabinetJobLine): boolean {
    return selectedIds.has(line.id) || pathOf(line).some((node) => selectedGroups.has(node.key));
  }

  function chosenLines(source = lines): CabinetJobLine[] {
    return source.filter(
      (line) => selectedIds.has(line.id) || pathOf(line).some((node) => selectedGroups.has(node.key)),
    );
  }

  async function applyLabour(full: CabinetJobLine[], addFor: Set<number>): Promise<CabinetJobLine[] | null> {
    const seq = ++labourSeq.current;
    try {
      const parts = partLines(full);
      const labour = parts.length
        ? await cabinetApi.jobs.labourPreview(
            parts.flatMap((line) => {
              const write = toPartWrite(line);
              return write ? [write] : [];
            }),
          )
        : [];
      if (seq !== labourSeq.current || !mounted.current) return null;
      const next = placeLabour(full, labour, addFor);
      setLines(next);
      return next;
    } catch (e: unknown) {
      if (seq !== labourSeq.current) return null;
      setError(e instanceof Error ? e.message : "Could not work out the cutting labour");
      return null;
    }
  }

  function sourcesWithoutLabour(full: CabinetJobLine[]): Set<number> {
    const quiet = new Set<number>();
    for (const line of full) {
      if (line.source_product_id != null || line.product_id == null) continue;
      if (!full.some((item) => item.source_product_id === line.product_id)) quiet.add(line.product_id);
    }
    return quiet;
  }

  function forgiveDismissed(sourceIds: Set<number>) {
    for (const source of sourceIds) quietSources.current.delete(source);
    for (const key of [...dismissedLabour.current]) {
      const source = Number(key.split(":")[0]);
      if (sourceIds.has(source)) dismissedLabour.current.delete(key);
    }
  }

  function missingLabourSources(full: CabinetJobLine[]): Set<number> {
    const addFor = new Set<number>();
    const sources = new Set<number>();
    for (const line of full) {
      if (line.source_product_id == null && line.product_id != null) sources.add(line.product_id);
    }
    for (const source of sources) {
      const hasSlot = full.some((line) => line.source_product_id === source);
      const dismissed = [...dismissedLabour.current].some((key) => key.startsWith(`${source}:`));
      if (!hasSlot && !dismissed && !quietSources.current.has(source)) addFor.add(source);
    }
    return addFor;
  }

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!validId) return;
    let cancelled = false;
    cabinetApi.jobs
      .get(id)
      .then((row) => {
        if (cancelled) return;
        setJob(row);
        setReference(row.job_reference || "");
        setLines(row.lines);
        setMoveClientId(String(row.party_id));
        clearSelection();
        dismissedLabour.current = new Set();
        quietSources.current = sourcesWithoutLabour(row.lines);
        if (partLines(row.lines).length) void applyLabour(row.lines, new Set());
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not open jobcard");
      });
    practiceApi.parties
      .list("client", false, undefined, 200)
      .then((rows) => {
        if (!cancelled) setClients(rows);
      })
      .catch(() => {
        if (!cancelled) setClients([]);
      });
    return () => {
      cancelled = true;
    };
    // applyLabour reads stable setters and the labour sequence ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, validId]);

  function leave() {
    if (!job) {
      router.push("/cabinet/clients");
      return;
    }
    router.push(`/cabinet/clients/file?id=${job.party_id}`);
  }

  async function saveLines(body: { party_id?: number; andClose?: boolean }) {
    if (!job) return;
    setBusy(true);
    try {
      setError(null);
      const placed = await applyLabour(lines, missingLabourSources(lines));
      if (!placed) return;
      const saved = await cabinetApi.jobs.update(job.id, {
        party_id: body.party_id,
        job_reference: reference.trim() || null,
        lines: placed.flatMap((line) => {
          const write = toSaveWrite(line);
          return write ? [write] : [];
        }),
        arrange: true,
      });
      setJob(saved);
      setReference(saved.job_reference || "");
      setLines(saved.lines);
      dismissedLabour.current = new Set();
      quietSources.current = sourcesWithoutLabour(saved.lines);
      clearSelection();
      setMoveOpen(false);
      if (body.andClose) router.push(`/cabinet/clients/file?id=${saved.party_id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not save jobcard");
    } finally {
      setBusy(false);
    }
  }

  function addProduct(pick: AddedProduct) {
    const family = pick.product.family || "quantitative";
    const unit = num(pick.product.retail_price);
    const vatOn = Boolean(job?.vat_enabled);
    const rate = num(job?.vat_rate);
    const measure = measureForPrice(family, pick.product.price_basis, pick.quantity, pick.lengthMm, pick.widthMm);
    if (measure == null) return;
    const ex = Math.round(measure * unit * 100) / 100;
    const vat = vatOn ? Math.round(ex * (rate / 100) * 100) / 100 : 0;
    const next: CabinetJobLine = {
      id: newLineId(),
      product_id: pick.product.id,
      sort_order: lines.length,
      quantity: pick.quantity,
      name: pick.product.name,
      family,
      group_name: pick.product.category || null,
      length_mm: pick.lengthMm,
      width_mm: pick.widthMm,
      unit_price: unit,
      vat_rate: vatOn ? rate : 0,
      line_ex_vat: ex,
      vat_amount: vat,
      line_total: Math.round((ex + vat) * 100) / 100,
    };
    const full = [...lines, next];
    const changed = changedSources(lines, full);
    forgiveDismissed(changed);
    setLines(full);
    void applyLabour(full, changed);
  }

  function removeLines(targets: CabinetJobLine[]) {
    if (!targets.length) return;
    const ids = new Set(targets.map((line) => line.id));
    for (const line of targets) {
      if (line.source_product_id != null && line.product_id != null) {
        dismissedLabour.current.add(`${line.source_product_id}:${line.product_id}`);
      }
    }
    const remaining = lines.filter((line) => !ids.has(line.id));
    const changed = changedSources(lines, remaining);
    forgiveDismissed(changed);
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const lineId of ids) next.delete(lineId);
      return next;
    });
    setSelectedGroups(new Set());
    setNaming(false);
    setLines(remaining);
    if (changed.size) void applyLabour(remaining, changed);
  }

  function deleteLine(line: CabinetJobLine) {
    if (!window.confirm(`Are you sure you want to delete ${line.name}?`)) return;
    removeLines([line]);
  }

  function deleteGroup(key: string, name: string) {
    const members = lines.filter((line) => pathHas(line, key));
    if (!members.length) return;
    if (!window.confirm(`Are you sure you want to delete ${name}?`)) return;
    removeLines(members);
  }

  function deleteSelected() {
    const targets = chosenLines();
    if (!targets.length) return;
    const question =
      targets.length === 1
        ? `Are you sure you want to delete ${targets[0].name}?`
        : `Are you sure you want to delete ${targets.length} selected items?`;
    if (!window.confirm(question)) return;
    removeLines(targets);
  }

  function duplicateSelected() {
    const targets = chosenLines();
    if (!targets.length) return;
    const ids = new Set(targets.map((line) => line.id));
    const previous = new Set(lines.map((line) => line.id));
    const next = duplicateBlock(lines, ids, keysToRemap(lines, ids, selectedGroups));
    const changed = changedSources(lines, next);
    forgiveDismissed(changed);
    setSelectedIds(new Set(next.filter((line) => !previous.has(line.id)).map((line) => line.id)));
    setSelectedGroups(new Set());
    setLines(next);
    if (changed.size) void applyLabour(next, changed);
  }

  function createGroup() {
    const name = groupName.trim();
    if (!name) {
      setNameError("Enter a group name.");
      return;
    }
    const targets = chosenLines();
    if (!targets.length) return;
    const node = { key: newGroupKey(), name: name.slice(0, 120), collapsed: false };
    setLines(groupLines(lines, targets.map((line) => line.id), node));
    setSelectedIds(new Set());
    setSelectedGroups(new Set([node.key]));
    setNaming(false);
    setGroupName("");
    setNameError(null);
  }

  function toggleLine(line: CabinetJobLine) {
    const owning = pathOf(line).filter((node) => selectedGroups.has(node.key));
    if (owning.length) {
      const nextGroups = new Set(selectedGroups);
      const nextIds = new Set(selectedIds);
      for (const node of owning) {
        nextGroups.delete(node.key);
        for (const item of lines) {
          if (item.id !== line.id && pathHas(item, node.key)) nextIds.add(item.id);
        }
      }
      nextIds.delete(line.id);
      setSelectedGroups(nextGroups);
      setSelectedIds(nextIds);
      return;
    }
    const nextIds = new Set(selectedIds);
    if (nextIds.has(line.id)) nextIds.delete(line.id);
    else nextIds.add(line.id);
    setSelectedIds(nextIds);
  }

  function toggleGroup(key: string) {
    const next = new Set(selectedGroups);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelectedGroups(next);
  }

  function startDrag(event: React.PointerEvent<HTMLElement>, kind: "line" | "group", dragId: number | string) {
    if (busy) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { kind, id: dragId };
    setDrop(null);
  }

  function onDragMove(event: React.PointerEvent<HTMLElement>) {
    if (!dragRef.current || !listRef.current) return;
    const hit = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
    if (!hit) return;
    if (hit.closest("[data-drop-end]")) {
      setDrop("end");
      return;
    }
    const row = hit.closest("[data-drop-id]") as HTMLElement | null;
    if (!row || !listRef.current.contains(row)) return;
    const dropId = Number(row.dataset.dropId);
    if (!Number.isFinite(dropId)) return;
    const rect = row.getBoundingClientRect();
    const after = event.clientY > rect.top + rect.height / 2;
    if (!after) {
      setDrop(dropId);
      return;
    }
    const rows = [...listRef.current.querySelectorAll<HTMLElement>("[data-drop-id]")].filter(
      (item) => item.getClientRects().length > 0,
    );
    const index = rows.indexOf(row);
    const next = rows.slice(index + 1).find((item) => Number(item.dataset.dropId) !== dropId);
    setDrop(next ? Number(next.dataset.dropId) : "end");
  }

  function onDragEnd() {
    const drag = dragRef.current;
    dragRef.current = null;
    const before = dropRef.current;
    setDrop(null);
    if (!drag || before == null || busy) return;
    const current = linesRef.current;
    const blockIds =
      drag.kind === "line"
        ? [Number(drag.id)]
        : current.filter((line) => pathHas(line, String(drag.id))).map((line) => line.id);
    if (!blockIds.length) return;
    setLines(moveBlock(current, blockIds, before === "end" ? null : before));
  }

  function onSheetPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const startTarget = event.target as HTMLElement;
    if (startTarget.closest("[data-select-ignore], button, input, textarea, select, a, label")) return;
    const sheet = event.currentTarget;
    const startX = event.clientX;
    const startY = event.clientY;
    let moved = false;
    sheet.setPointerCapture(event.pointerId);
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true;
      const rect = {
        left: Math.min(startX, ev.clientX),
        top: Math.min(startY, ev.clientY),
        right: Math.max(startX, ev.clientX),
        bottom: Math.max(startY, ev.clientY),
      };
      setMarquee({ x: rect.left, y: rect.top, w: rect.right - rect.left, h: rect.bottom - rect.top });
      const root = listRef.current;
      if (!root) return;
      const lineIds = new Set<number>();
      const groupKeys = new Set<string>();
      root.querySelectorAll<HTMLElement>("[data-line-id]").forEach((el) => {
        const lineId = Number(el.dataset.lineId);
        if (Number.isFinite(lineId) && intersects(rect, el.getBoundingClientRect())) lineIds.add(lineId);
      });
      root.querySelectorAll<HTMLElement>("[data-group-key]").forEach((el) => {
        const key = el.dataset.groupKey;
        if (key && intersects(rect, el.getBoundingClientRect())) groupKeys.add(key);
      });
      setSelectedIds(lineIds);
      setSelectedGroups(groupKeys);
    };
    const onUp = () => {
      sheet.removeEventListener("pointermove", onMove);
      sheet.removeEventListener("pointerup", onUp);
      setMarquee(null);
      if (!moved) {
        const hit = startTarget.closest("[data-line-id], [data-group-key]");
        if (!hit) clearSelection();
      }
    };
    sheet.addEventListener("pointermove", onMove);
    sheet.addEventListener("pointerup", onUp);
  }

  if (!validId) {
    return <p className="text-sm text-muted-foreground">Open a jobcard from a client.</p>;
  }
  if (!job) {
    return <p className="text-sm text-muted-foreground">{error || "Opening jobcard…"}</p>;
  }

  const chosen = chosenLines();
  const rows = renderRows(lines);
  let dropPainted = false;
  function dropMark(dropId: number, hidden: boolean): string {
    if (hidden || dropBefore !== dropId || dropPainted) return "";
    dropPainted = true;
    return "shadow-[inset_0_2px_0_0_hsl(var(--primary))]";
  }

  return (
    <div className="-m-4 flex min-h-[calc(100vh-4rem)] md:-m-6">
      <aside className="flex w-64 shrink-0 flex-col gap-4 border-r border-border bg-card/60 p-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Jobcard</p>
          <p className="text-2xl font-semibold tracking-tight">{job.number}</p>
        </div>

        <div className="space-y-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium leading-snug">{job.client_name}</p>
            <button
              type="button"
              className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Change client"
              onClick={() => {
                setMoveClientId(String(job.party_id));
                setMoveOpen((open) => !open);
              }}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </div>
          {moveOpen && (
            <div className="space-y-2 rounded-lg border border-border bg-background p-2">
              <Label className="text-xs">Move to client</Label>
              <Select value={moveClientId} onChange={(e) => setMoveClientId(e.target.value)}>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </Select>
              <Button
                type="button"
                size="sm"
                className="w-full"
                disabled={busy}
                onClick={() => void saveLines({ party_id: Number(moveClientId) })}
              >
                Save
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Job reference</Label>
          <Input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Your reference"
            autoComplete="off"
          />
        </div>

        <div className="flex flex-col gap-1">
          <button
            type="button"
            className={cn(
              "rounded-md px-3 py-2 text-left text-sm",
              stage === "products" ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-accent/50",
            )}
            onClick={() => setStage("products")}
          >
            Products
          </button>
          <button
            type="button"
            className={cn(
              "rounded-md px-3 py-2 text-left text-sm",
              stage === "pricing" ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-accent/50",
            )}
            onClick={() => setStage("pricing")}
          >
            Pricing
          </button>
          {sheetRows.length > 0 && (
            <button
              type="button"
              className={cn(
                "rounded-md px-3 py-2 text-left text-sm",
                stage === "optimization"
                  ? "bg-accent font-medium text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50",
              )}
              onClick={() => setStage("optimization")}
            >
              Optimization
            </button>
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="mt-auto flex flex-col gap-2">
          <Button type="button" disabled={busy} onClick={() => void saveLines({})}>
            Save
          </Button>
          <Button type="button" variant="outline" disabled={busy} onClick={() => void saveLines({ andClose: true })}>
            Save and Close
          </Button>
          <Button type="button" variant="ghost" onClick={leave}>
            Close
          </Button>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <style>{`
          tr.jobcard-collapsed { display: none; }
          @media print {
            body * { visibility: hidden; }
            .jobcard-sheet, .jobcard-sheet * { visibility: visible; }
            .jobcard-sheet { position: absolute; left: 0; top: 0; width: 100%; background: white; color: black; }
            .no-print { display: none !important; }
            tr.jobcard-collapsed { display: table-row !important; visibility: visible !important; }
            tr.jobcard-collapsed * { visibility: visible !important; }
          }
        `}</style>
        <div className="no-print flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
          {stage === "products" && (
            <Button type="button" size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="mr-1 h-4 w-4" />
              Add
            </Button>
          )}
          <div className="relative z-30">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="bg-card text-foreground"
              onClick={() => {
                setPrintOpen((open) => !open);
                setPrintNote(null);
              }}
            >
              Print
            </Button>
            {printOpen && (
              <div className="absolute left-0 z-30 mt-1 w-56 rounded-lg border border-border bg-card p-1 text-card-foreground shadow-lg">
                <button
                  type="button"
                  className="block w-full rounded-md px-3 py-2 text-left text-sm text-card-foreground hover:bg-accent"
                  onClick={() =>
                    setPrintNote(
                      "Quote uses the Work Flow default quote template. It follows the optimizer, which only nests products ticked Cut and Edge.",
                    )
                  }
                >
                  Quote
                </button>
                <button
                  type="button"
                  className="block w-full rounded-md px-3 py-2 text-left text-sm text-card-foreground hover:bg-accent"
                  onClick={() => {
                    setPrintOpen(false);
                    setPrintNote(null);
                    window.print();
                  }}
                >
                  Jobcard
                </button>
                <button
                  type="button"
                  disabled
                  className="block w-full rounded-md px-3 py-2 text-left text-sm text-muted-foreground"
                >
                  Cutting list · Coming soon
                </button>
              </div>
            )}
          </div>
          {stage === "products" && chosen.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">{chosen.length} selected</span>
              <Button type="button" size="sm" variant="outline" className="bg-card text-foreground" onClick={duplicateSelected}>
                Duplicate selected
              </Button>
              <Button type="button" size="sm" variant="outline" className="bg-card text-foreground" onClick={deleteSelected}>
                Delete selected
              </Button>
              {naming ? (
                <form
                  className="flex flex-wrap items-center gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    createGroup();
                  }}
                >
                  <Input
                    value={groupName}
                    onChange={(event) => {
                      setGroupName(event.target.value);
                      setNameError(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        setNaming(false);
                        setGroupName("");
                        setNameError(null);
                      }
                    }}
                    placeholder="Group name"
                    maxLength={120}
                    autoFocus
                    className="h-8 w-40"
                  />
                  <Button type="submit" size="sm">
                    Create
                  </Button>
                  {nameError && <span className="text-xs text-destructive">{nameError}</span>}
                </form>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="bg-card text-foreground"
                  onClick={() => {
                    setNaming(true);
                    setNameError(null);
                  }}
                >
                  Group selected
                </Button>
              )}
            </div>
          )}
          {printNote && <p className="max-w-md text-xs text-muted-foreground">{printNote}</p>}
        </div>

        {stage === "pricing" ? (
          <PricingSheet
            result={pricing.result}
            error={pricing.error}
            number={job.number}
            clientName={job.client_name}
            reference={reference}
          />
        ) : stage === "optimization" ? (
          <OptimizationSheet
            lines={lines}
            rows={sheetRows}
            error={pricing.error}
            number={job.number}
            clientName={job.client_name}
            reference={reference}
          />
        ) : (
        <div
          ref={listRef}
          className="jobcard-sheet relative flex-1 select-none overflow-auto p-4"
          onPointerDown={onSheetPointerDown}
        >
          <div className="mb-4 hidden print:block">
            <p className="text-lg font-semibold">{job.number}</p>
            <p>{job.client_name}</p>
            {reference ? <p>{reference}</p> : null}
          </div>
          {lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">No products on this jobcard yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="no-print w-8 py-2" />
                  <th className="no-print w-8 py-2" />
                  <th className="py-2 pr-3 font-semibold">Qty</th>
                  <th className="py-2 pr-3 font-semibold">Name</th>
                  <th className="py-2 pr-3 font-semibold">Dimensions</th>
                  <th className="no-print w-8 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  if (row.kind === "group") {
                    return (
                      <tr
                        key={`group-${row.key}-${row.anchorId}`}
                        data-group-key={row.key}
                        data-drop-id={row.anchorId}
                        className={cn(
                          "border-b border-border/70",
                          row.hidden && "jobcard-collapsed",
                          !row.hidden && selectedGroups.has(row.key) && "bg-accent/60",
                          dropMark(row.anchorId, row.hidden),
                        )}
                      >
                        <td className="no-print py-1.5">
                          <input
                            type="checkbox"
                            data-select-ignore
                            className="h-3.5 w-3.5"
                            checked={selectedGroups.has(row.key)}
                            aria-label={`Select ${row.name}`}
                            onPointerDown={(event) => event.stopPropagation()}
                            onChange={() => toggleGroup(row.key)}
                          />
                        </td>
                        <td className="no-print py-1.5">
                          <button
                            type="button"
                            data-select-ignore
                            className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:text-foreground active:cursor-grabbing"
                            aria-label={`Drag ${row.name}`}
                            onPointerDown={(event) => startDrag(event, "group", row.key)}
                            onPointerMove={onDragMove}
                            onPointerUp={onDragEnd}
                            onPointerCancel={onDragEnd}
                          >
                            <GripVertical className="h-3.5 w-3.5" />
                          </button>
                        </td>
                        <td colSpan={3} className="py-1.5 pr-3">
                          <div className="flex items-center gap-1" style={{ paddingLeft: `${row.depth * 1.25}rem` }}>
                            <button
                              type="button"
                              data-select-ignore
                              className="no-print rounded p-0.5 text-muted-foreground hover:text-foreground"
                              aria-label={row.collapsed ? `Expand ${row.name}` : `Collapse ${row.name}`}
                              aria-expanded={!row.collapsed}
                              onPointerDown={(event) => event.stopPropagation()}
                              onClick={() => setLines(toggleCollapsed(lines, row.key))}
                            >
                              {row.collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </button>
                            <span className="font-medium">{row.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {row.count} {row.count === 1 ? "item" : "items"}
                            </span>
                          </div>
                        </td>
                        <td className="no-print py-1.5 text-right">
                          <button
                            type="button"
                            data-select-ignore
                            className="rounded p-1 text-muted-foreground hover:text-foreground"
                            aria-label={`Remove ${row.name}`}
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={() => deleteGroup(row.key, row.name)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  }
                  const line = row.line;
                  const chosenLine = lineIsChosen(line);
                  return (
                    <tr
                      key={line.id}
                      data-line-id={line.id}
                      data-drop-id={line.id}
                      className={cn(
                        "border-b border-border/70",
                        row.hidden && "jobcard-collapsed",
                        !row.hidden && chosenLine && "bg-accent/60",
                        dropMark(line.id, row.hidden),
                      )}
                    >
                      <td className="no-print py-2">
                        <input
                          type="checkbox"
                          data-select-ignore
                          className="h-3.5 w-3.5"
                          checked={chosenLine}
                          aria-label={`Select ${line.name}`}
                          onPointerDown={(event) => event.stopPropagation()}
                          onChange={() => toggleLine(line)}
                        />
                      </td>
                      <td className="no-print py-2">
                        <button
                          type="button"
                          data-select-ignore
                          className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:text-foreground active:cursor-grabbing"
                          aria-label={`Drag ${line.name}`}
                          onPointerDown={(event) => startDrag(event, "line", line.id)}
                          onPointerMove={onDragMove}
                          onPointerUp={onDragEnd}
                          onPointerCancel={onDragEnd}
                        >
                          <GripVertical className="h-3.5 w-3.5" />
                        </button>
                      </td>
                      <td
                        className="py-2 pr-3 tabular-nums"
                        style={{ paddingLeft: `${row.depth * 1.25 + (line.source_product_id ? 0.75 : 0)}rem` }}
                      >
                        {num(line.quantity)}
                      </td>
                      <td className="py-2 pr-3">
                        <div className="font-medium">{line.name}</div>
                        {line.detail ? (
                          <div className="text-xs text-muted-foreground">{line.detail}</div>
                        ) : line.group_name ? (
                          <div className="text-xs text-muted-foreground">{line.group_name}</div>
                        ) : null}
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground">{dimensions(line)}</td>
                      <td className="no-print py-2 text-right">
                        <button
                          type="button"
                          data-select-ignore
                          className="rounded p-1 text-muted-foreground hover:text-foreground"
                          aria-label={`Remove ${line.name}`}
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={() => deleteLine(line)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {lines.length > 0 && (
            <div
              data-drop-end
              className={cn("no-print mt-1 h-8 rounded-md", dropBefore === "end" && "bg-primary/15")}
            />
          )}
        </div>
        )}
      </section>

      {marquee && (
        <div
          className="pointer-events-none fixed z-40 border border-primary bg-primary/15"
          style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }}
        />
      )}
      <AddProductDialog open={addOpen} onClose={() => setAddOpen(false)} onAdd={addProduct} />
    </div>
  );
}
