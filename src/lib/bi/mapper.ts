/**
 * Board mapper: raw Monday board payload -> canonical Deal / WorkOrder.
 *
 * The board schema is discovered at runtime by matching column *titles*
 * against candidate keyword lists. We never assume a column exists, and we
 * report which columns were mapped (and which were not) so the Data Sources
 * page can show the real schema that was found.
 */

import type { BoardMeta, DataQualityFlag, Deal, WorkOrder } from "./types";
import {
  classifyDealStage,
  classifyWorkOrderStatus,
  isBlank,
  normalizeSector,
  normalizeStage,
  normalizeText,
  parseCompletion,
  parseDate,
  parseNumeric,
  parseProbability,
} from "./normalize";

export interface RawColumn {
  id: string;
  title: string;
  type: string;
}

export interface RawItem {
  id: string;
  name: string;
  /** columnId -> display text */
  values: Record<string, string | null>;
}

export interface RawBoard {
  id: string;
  name: string;
  columns: RawColumn[];
  items: RawItem[];
}

/** Ordered candidate keywords; earlier entries win. */
type FieldSpec = { field: string; keywords: string[]; types?: string[] };

const DEAL_FIELDS: FieldSpec[] = [
  { field: "company", keywords: ["company", "account", "client", "customer", "organisation", "organization"] },
  { field: "sector", keywords: ["sector", "industry", "vertical", "domain", "segment"] },
  { field: "stage", keywords: ["stage", "deal status", "pipeline stage", "status", "phase"] },
  { field: "value", keywords: ["deal value", "value", "amount", "revenue", "deal size", "contract value", "price"] },
  { field: "probability", keywords: ["probability", "confidence", "win %", "win probability", "likelihood", "chance"] },
  { field: "expectedCloseDate", keywords: ["expected close", "close date", "closing date", "expected closure", "target close", "close"] },
  { field: "owner", keywords: ["owner", "sales owner", "account owner", "assigned", "rep", "salesperson", "person"] },
  { field: "createdDate", keywords: ["created", "create date", "creation", "opened", "start date", "date added"] },
];

const WORK_ORDER_FIELDS: FieldSpec[] = [
  { field: "client", keywords: ["client", "customer", "company", "account"] },
  { field: "sector", keywords: ["sector", "industry", "vertical", "domain", "segment"] },
  { field: "status", keywords: ["status", "state", "project status", "execution status", "stage"] },
  { field: "value", keywords: ["value", "amount", "order value", "project value", "revenue", "budget", "cost"] },
  { field: "startDate", keywords: ["start date", "start", "kickoff", "kick off", "commencement", "begin"] },
  { field: "endDate", keywords: ["end date", "end", "due date", "completion date", "delivery date", "deadline", "finish", "target date"] },
  { field: "owner", keywords: ["owner", "project manager", "manager", "lead", "assigned", "person", "pilot"] },
  { field: "completionPercentage", keywords: ["completion", "progress", "% complete", "percent complete", "done %"] },
  { field: "project", keywords: ["project", "project name", "site", "work order"] },
];

function scoreMatch(title: string, keywords: string[]): number {
  const t = title.toLowerCase().trim();
  for (let i = 0; i < keywords.length; i++) {
    const k = keywords[i];
    if (!k) continue;
    if (t === k) return 1000 - i;
    if (t.startsWith(k) || t.endsWith(k)) return 500 - i;
    if (t.includes(k)) return 100 - i;
  }
  return 0;
}

/** Resolves canonical field -> columnId using title heuristics. */
export function buildFieldMapping(columns: RawColumn[], specs: FieldSpec[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const taken = new Set<string>();

  for (const spec of specs) {
    let best: { id: string; score: number } | null = null;
    for (const col of columns) {
      if (taken.has(col.id)) continue;
      const score = scoreMatch(col.title, spec.keywords);
      if (score > 0 && (!best || score > best.score)) best = { id: col.id, score };
    }
    if (best) {
      mapping[spec.field] = best.id;
      taken.add(best.id);
    }
  }
  return mapping;
}

function get(item: RawItem, mapping: Record<string, string>, field: string): string | null {
  const colId = mapping[field];
  if (!colId) return null;
  const v = item.values[colId];
  return isBlank(v) ? null : String(v).trim();
}

function pushIf(flags: DataQualityFlag[], cond: boolean, flag: DataQualityFlag) {
  if (cond) flags.push(flag);
}

function makeMeta(board: RawBoard, mapping: Record<string, string>, retrievedAt: string): BoardMeta {
  const mapped = new Set(Object.values(mapping));
  return {
    boardId: board.id,
    boardName: board.name,
    itemCount: board.items.length,
    columnsSeen: board.columns,
    fieldMapping: Object.fromEntries(
      Object.entries(mapping).map(([field, colId]) => [
        field,
        board.columns.find((c) => c.id === colId)?.title ?? colId,
      ]),
    ),
    unmappedColumns: board.columns.filter((c) => !mapped.has(c.id)).map((c) => c.title),
    retrievedAt,
  };
}

export function mapDealsBoard(
  board: RawBoard,
  retrievedAt: string,
): { deals: Deal[]; meta: BoardMeta } {
  const mapping = buildFieldMapping(board.columns, DEAL_FIELDS);
  const seen = new Map<string, number>();

  const deals = board.items.map((item) => {
    const flags: DataQualityFlag[] = [];

    const sectorRaw = get(item, mapping, "sector");
    const stageRaw = get(item, mapping, "stage");
    const valueRaw = get(item, mapping, "value");
    const probRaw = get(item, mapping, "probability");
    const closeRaw = get(item, mapping, "expectedCloseDate");
    const createdRaw = get(item, mapping, "createdDate");

    const value = parseNumeric(valueRaw);
    const probability = parseProbability(probRaw);
    const expectedCloseDate = parseDate(closeRaw);
    const stage = normalizeStage(stageRaw);

    pushIf(flags, sectorRaw === null, "missing_sector");
    pushIf(flags, valueRaw === null, "missing_value");
    pushIf(flags, valueRaw !== null && value === null, "invalid_value");
    pushIf(flags, probRaw === null, "missing_probability");
    pushIf(flags, probRaw !== null && probability === null, "invalid_probability");
    pushIf(flags, closeRaw === null, "missing_close_date");
    pushIf(flags, closeRaw !== null && expectedCloseDate === null, "invalid_date");
    pushIf(flags, stageRaw === null, "missing_stage");
    pushIf(flags, get(item, mapping, "owner") === null, "missing_owner");

    const key = `${(normalizeText(item.name) ?? "").toLowerCase()}|${value ?? ""}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
    if ((seen.get(key) ?? 0) > 1) flags.push("duplicate_record");

    const deal: Deal = {
      id: item.id,
      name: normalizeText(item.name) ?? `Deal ${item.id}`,
      company: normalizeText(get(item, mapping, "company")),
      sector: normalizeSector(sectorRaw),
      sectorRaw,
      stage,
      stageRaw,
      outcome: classifyDealStage(stage),
      value,
      probability,
      expectedCloseDate,
      owner: normalizeText(get(item, mapping, "owner")),
      createdDate: parseDate(createdRaw),
      rawData: item.values,
      dataQualityFlags: flags,
    };
    return deal;
  });

  return { deals, meta: makeMeta(board, mapping, retrievedAt) };
}

export function mapWorkOrdersBoard(
  board: RawBoard,
  retrievedAt: string,
): { workOrders: WorkOrder[]; meta: BoardMeta } {
  const mapping = buildFieldMapping(board.columns, WORK_ORDER_FIELDS);
  const seen = new Map<string, number>();

  const workOrders = board.items.map((item) => {
    const flags: DataQualityFlag[] = [];

    const sectorRaw = get(item, mapping, "sector");
    const statusRaw = get(item, mapping, "status");
    const valueRaw = get(item, mapping, "value");
    const startRaw = get(item, mapping, "startDate");
    const endRaw = get(item, mapping, "endDate");
    const completionRaw = get(item, mapping, "completionPercentage");
    const clientRaw = get(item, mapping, "client");

    const value = parseNumeric(valueRaw);
    const startDate = parseDate(startRaw);
    const endDate = parseDate(endRaw);
    const completionPercentage = parseCompletion(completionRaw);
    const status = normalizeStage(statusRaw);
    const statusBucket = classifyWorkOrderStatus(status);

    pushIf(flags, sectorRaw === null, "missing_sector");
    pushIf(flags, statusRaw === null, "missing_status");
    pushIf(flags, statusRaw !== null && statusBucket === "unknown", "unknown_status");
    pushIf(flags, valueRaw === null, "missing_value");
    pushIf(flags, valueRaw !== null && value === null, "invalid_value");
    pushIf(flags, (startRaw !== null && startDate === null) || (endRaw !== null && endDate === null), "invalid_date");
    pushIf(flags, completionRaw === null, "missing_completion");
    pushIf(flags, clientRaw === null, "missing_client");

    const key = `${(normalizeText(item.name) ?? "").toLowerCase()}|${value ?? ""}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
    if ((seen.get(key) ?? 0) > 1) flags.push("duplicate_record");

    const wo: WorkOrder = {
      id: item.id,
      project: normalizeText(get(item, mapping, "project")) ?? normalizeText(item.name) ?? `Work order ${item.id}`,
      client: normalizeText(clientRaw),
      sector: normalizeSector(sectorRaw),
      sectorRaw,
      status,
      statusRaw,
      statusBucket,
      value,
      startDate,
      endDate,
      owner: normalizeText(get(item, mapping, "owner")),
      completionPercentage,
      rawData: item.values,
      dataQualityFlags: flags,
    };
    return wo;
  });

  return { workOrders, meta: makeMeta(board, mapping, retrievedAt) };
}
