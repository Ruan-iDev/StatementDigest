import type { BundleNode, CabinetJobLine } from "@/modules/cabinet/lib/types";

export type GroupRow = {
  kind: "group";
  key: string;
  name: string;
  collapsed: boolean;
  depth: number;
  count: number;
  anchorId: number;
  hidden: boolean;
};

export type LineRow = {
  kind: "line";
  line: CabinetJobLine;
  depth: number;
  hidden: boolean;
};

export type SheetRow = GroupRow | LineRow;

let lineSeq = 0;
let groupSeq = 0;

function num(value: string | number | null | undefined): number {
  if (value == null || value === "") return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function newLineId(): number {
  lineSeq += 1;
  return -Date.now() - lineSeq;
}

export function newGroupKey(): string {
  groupSeq += 1;
  return `g${Date.now().toString(36)}${groupSeq.toString(36)}`;
}

export function pathOf(line: CabinetJobLine): BundleNode[] {
  if (!Array.isArray(line.bundle_path)) return [];
  const seen = new Set<string>();
  const path: BundleNode[] = [];
  for (const node of line.bundle_path) {
    if (!node || typeof node.key !== "string" || typeof node.name !== "string") continue;
    const key = node.key.trim();
    const name = node.name.trim();
    if (!key || !name || seen.has(key)) continue;
    seen.add(key);
    path.push({ key, name, collapsed: Boolean(node.collapsed) });
  }
  return path;
}

export function pathHas(line: CabinetJobLine, key: string): boolean {
  return pathOf(line).some((node) => node.key === key);
}

export function renderRows(lines: CabinetJobLine[]): SheetRow[] {
  const rows: SheetRow[] = [];
  let open: string[] = [];
  lines.forEach((line, index) => {
    const path = pathOf(line);
    let shared = 0;
    while (shared < open.length && shared < path.length && open[shared] === path[shared].key) {
      shared += 1;
    }
    open = open.slice(0, shared);
    for (let depth = shared; depth < path.length; depth += 1) {
      const node = path[depth];
      open.push(node.key);
      let count = 0;
      for (let cursor = index; cursor < lines.length; cursor += 1) {
        if (pathOf(lines[cursor])[depth]?.key !== node.key) break;
        count += 1;
      }
      rows.push({
        kind: "group",
        key: node.key,
        name: node.name,
        collapsed: Boolean(node.collapsed),
        depth,
        count,
        anchorId: line.id,
        hidden: path.slice(0, depth).some((item) => item.collapsed),
      });
    }
    rows.push({
      kind: "line",
      line,
      depth: path.length,
      hidden: path.some((item) => item.collapsed),
    });
  });
  return rows;
}

function partTotals(lines: CabinetJobLine[]): Map<number, number> {
  const totals = new Map<number, number>();
  for (const line of lines) {
    if (line.source_product_id != null || line.product_id == null) continue;
    const qty = Math.round(num(line.quantity) * 1000);
    totals.set(line.product_id, (totals.get(line.product_id) || 0) + qty);
  }
  return totals;
}

export function changedSources(before: CabinetJobLine[], after: CabinetJobLine[]): Set<number> {
  const left = partTotals(before);
  const right = partTotals(after);
  const changed = new Set<number>();
  for (const id of new Set<number>([...left.keys(), ...right.keys()])) {
    if ((left.get(id) || 0) !== (right.get(id) || 0)) changed.add(id);
  }
  return changed;
}

function slotKey(source: number, product: number): string {
  return `${source}:${product}`;
}

export function placeLabour(
  full: CabinetJobLine[],
  fresh: CabinetJobLine[],
  addFor: Set<number>,
): CabinetJobLine[] {
  const freshByKey = new Map<string, CabinetJobLine>();
  for (const line of fresh) {
    if (line.source_product_id == null || line.product_id == null) continue;
    freshByKey.set(slotKey(line.source_product_id, line.product_id), line);
  }
  const used = new Set<string>();
  const kept: CabinetJobLine[] = [];
  for (const line of full) {
    if (line.source_product_id == null || line.product_id == null) {
      kept.push(line);
      continue;
    }
    const key = slotKey(line.source_product_id, line.product_id);
    const match = freshByKey.get(key);
    if (!match || used.has(key)) continue;
    used.add(key);
    kept.push({
      ...line,
      quantity: match.quantity,
      name: match.name,
      family: match.family,
      group_name: match.group_name ?? line.group_name,
      detail: match.detail,
      unit_price: match.unit_price,
      vat_rate: match.vat_rate,
      line_ex_vat: match.line_ex_vat,
      vat_amount: match.vat_amount,
      line_total: match.line_total,
    });
  }

  const ids = new Set(kept.map((line) => line.id));
  const pending: CabinetJobLine[] = [];
  for (const line of fresh) {
    if (line.source_product_id == null || line.product_id == null) continue;
    const key = slotKey(line.source_product_id, line.product_id);
    if (used.has(key) || !addFor.has(line.source_product_id)) continue;
    let id = line.id;
    if (ids.has(id)) id = newLineId();
    ids.add(id);
    pending.push({ ...line, id });
  }

  const bySource = new Map<number, CabinetJobLine[]>();
  for (const line of pending) {
    if (line.source_product_id == null) continue;
    const list = bySource.get(line.source_product_id) || [];
    list.push(line);
    bySource.set(line.source_product_id, list);
  }
  const lastPart = new Map<number, number>();
  kept.forEach((line, index) => {
    if (line.source_product_id == null && line.product_id != null) lastPart.set(line.product_id, index);
  });
  const extras = new Map<number, CabinetJobLine[]>();
  const orphans: CabinetJobLine[] = [];
  for (const [source, labourLines] of bySource) {
    const at = lastPart.get(source);
    const hostPath = at == null ? [] : pathOf(kept[at]);
    const withPath = labourLines.map((line) => ({
      ...line,
      bundle_path: hostPath.length ? hostPath : null,
    }));
    if (at == null) orphans.push(...withPath);
    else extras.set(at, withPath);
  }
  const out: CabinetJobLine[] = [];
  kept.forEach((line, index) => {
    out.push(line);
    const extra = extras.get(index);
    if (extra) out.push(...extra);
  });
  out.push(...orphans);
  return out.map((line, index) => ({ ...line, sort_order: index }));
}

export function moveBlock(
  lines: CabinetJobLine[],
  blockIds: number[],
  beforeId: number | null,
): CabinetJobLine[] {
  const blockSet = new Set(blockIds);
  if (beforeId != null && blockSet.has(beforeId)) return lines;
  const block = lines.filter((line) => blockSet.has(line.id));
  if (!block.length) return lines;
  const rest = lines.filter((line) => !blockSet.has(line.id));
  const index = beforeId == null ? rest.length : rest.findIndex((line) => line.id === beforeId);
  if (index < 0) return lines;
  const out = [...rest.slice(0, index), ...block, ...rest.slice(index)];
  return out.map((line, index) => ({ ...line, sort_order: index }));
}

export function groupLines(lines: CabinetJobLine[], ids: number[], node: BundleNode): CabinetJobLine[] {
  const chosen = new Set(ids);
  const block = lines
    .filter((line) => chosen.has(line.id))
    .map((line) => ({ ...line, bundle_path: [node, ...pathOf(line)] }));
  const first = lines.findIndex((line) => chosen.has(line.id));
  if (first < 0 || !block.length) return lines;
  let insertAt = 0;
  for (let index = 0; index < first; index += 1) {
    if (!chosen.has(lines[index].id)) insertAt += 1;
  }
  const rest = lines.filter((line) => !chosen.has(line.id));
  const out = [...rest.slice(0, insertAt), ...block, ...rest.slice(insertAt)];
  return out.map((line, index) => ({ ...line, sort_order: index }));
}

export function keysToRemap(
  lines: CabinetJobLine[],
  ids: Set<number>,
  selectedGroups: Set<string>,
): Set<string> {
  const remap = new Set(selectedGroups);
  const counts = new Map<string, { total: number; chosen: number }>();
  for (const line of lines) {
    const chosen = ids.has(line.id);
    for (const node of pathOf(line)) {
      const row = counts.get(node.key) || { total: 0, chosen: 0 };
      row.total += 1;
      if (chosen) row.chosen += 1;
      counts.set(node.key, row);
    }
  }
  for (const [key, row] of counts) {
    if (row.chosen > 0 && row.chosen === row.total) remap.add(key);
  }
  return remap;
}

export function duplicateBlock(lines: CabinetJobLine[], ids: Set<number>, remap: Set<string>): CabinetJobLine[] {
  const keyMap = new Map<string, string>();
  for (const key of remap) keyMap.set(key, newGroupKey());
  const copies = lines
    .filter((line) => ids.has(line.id))
    .map((line) => {
      const path = pathOf(line).map((node) => {
        const mapped = keyMap.get(node.key);
        return mapped ? { ...node, key: mapped } : { ...node };
      });
      const copy: CabinetJobLine = {
        ...line,
        id: newLineId(),
        bundle_path: path.length ? path : null,
      };
      if (line.source_product_id != null) {
        copy.source_product_id = null;
        copy.detail = null;
      }
      return copy;
    });
  let last = -1;
  lines.forEach((line, index) => {
    if (ids.has(line.id)) last = index;
  });
  const out = [...lines.slice(0, last + 1), ...copies, ...lines.slice(last + 1)];
  return out.map((line, index) => ({ ...line, sort_order: index }));
}

export function toggleCollapsed(lines: CabinetJobLine[], key: string): CabinetJobLine[] {
  const collapsed = !lines.some((line) => pathOf(line).some((node) => node.key === key && node.collapsed));
  return lines.map((line) => {
    const path = pathOf(line);
    if (!path.some((node) => node.key === key)) return line;
    return {
      ...line,
      bundle_path: path.map((node) => (node.key === key ? { ...node, collapsed } : node)),
    };
  });
}
