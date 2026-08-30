/**
 * Board mapper: raw Monday board payload -> canonical Deal / WorkOrder.
 *
 * Design rules (post-audit):
 *  - Fields are resolved to a concrete Monday **column id**, chosen by
 *    matching the column *title* against ordered candidate keywords. The
 *    resolved column id, title and type are reported for every field.
 *  - Monday's built-in placeholder columns (`status`, `person`, `date4`,
 *    `text`, `subitems`) are excluded unless a field explicitly opts in.
 *    On these boards the built-in `status` column is empty apart from two
 *    demo rows, so binding "Deal Stage" to it produced "Unspecified" for
 *    every record.
 *  - Spreadsheet imports frequently carry a repeated header row; a row whose
 *    values echo their own column titles is dropped and counted.
 */

import type {
  BoardDiagnostics,
  BoardMeta,
  ColumnMappingRow,
  DataQualityFlag,
  Deal,
  RawValueTally,
  WorkOrder,
} from "./types";
import {
  classifyDealStatus,
  classifyWorkOrderStatus,
  isBlank,
  normalizeSector,
  normalizeStage,
  normalizeText,
  parseCompletion,
  parseDate,
  parseNumeric,
  parseProbabilityDetailed,
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
  pagesRetrieved: number;
}

/** Monday's default template columns — never carry the real business data. */
const GENERIC_COLUMN_IDS = new Set(["name", "person", "status", "date4", "text", "subitems"]);

type FieldSpec = { field: string; keywords: string[] };

const DEAL_FIELDS: FieldSpec[] = [
  { field: "status", keywords: ["deal status", "opportunity status", "status"] },
  { field: "stage", keywords: ["deal stage", "pipeline stage", "sales stage", "stage", "phase"] },
  { field: "value", keywords: ["masked deal value", "deal value", "deal size", "contract value", "value", "amount", "revenue", "price"] },
  { field: "probability", keywords: ["closure probability", "probability", "confidence", "win %", "win probability", "likelihood", "chance"] },
  { field: "expectedCloseDate", keywords: ["tentative close date", "expected close", "close date", "closing date", "expected closure", "target close"] },
  { field: "actualCloseDate", keywords: ["close date (a)", "actual close date", "closed date"] },
  { field: "company", keywords: ["client code", "customer code", "company", "account", "client", "customer", "organisation", "organization"] },
  { field: "sector", keywords: ["sector/service", "sector", "industry", "vertical", "domain", "segment"] },
  { field: "owner", keywords: ["owner code", "bd/kam personnel code", "sales owner", "account owner", "owner", "assigned", "rep", "salesperson"] },
  { field: "product", keywords: ["product deal", "product", "offering"] },
  { field: "createdDate", keywords: ["created date", "created", "creation", "opened", "date added"] },
];

const WORK_ORDER_FIELDS: FieldSpec[] = [
  { field: "status", keywords: ["execution status", "project status", "work order status", "wo status", "delivery status", "status", "state"] },
  { field: "billingStatus", keywords: ["invoice status", "billing status"] },
  { field: "value", keywords: [
    "amount in rupees (excl of gst) (masked)",
    "amount in rupees (excl of gst)",
    "order value",
    "project value",
    "amount in rupees",
    "value",
    "amount",
    "budget",
  ] },
  { field: "billedValue", keywords: ["billed value in rupees (excl of gst.) (masked)", "billed value"] },
  { field: "startDate", keywords: ["probable start date", "start date", "kickoff", "kick off", "commencement", "start"] },
  { field: "endDate", keywords: ["probable end date", "end date", "due date", "completion date", "delivery date", "deadline", "target date", "end"] },
  { field: "deliveryDate", keywords: ["data delivery date", "actual delivery date"] },
  { field: "client", keywords: ["customer name code", "client code", "client", "customer", "company", "account"] },
  { field: "sector", keywords: ["sector", "industry", "vertical", "domain", "segment"] },
  { field: "owner", keywords: ["bd/kam personnel code", "owner code", "project manager", "owner", "manager", "lead", "assigned", "pilot"] },
  { field: "completionPercentage", keywords: ["% complete", "percent complete", "completion", "progress", "done %"] },
  { field: "project", keywords: ["nature of work", "type of work", "project name", "project", "site"] },
];

function scoreMatch(title: string, keywords: string[]): number {
  const t = title.toLowerCase().trim();
  for (let i = 0; i < keywords.length; i++) {
    const k = keywords[i];
    if (!k) continue;
    if (t === k) return 10_000 - i * 10;
    if (t.startsWith(k) || t.endsWith(k)) return 5_000 - i * 10;
    if (t.includes(k)) return 1_000 - i * 10;
  }
  return 0;
}

/** Resolves canonical field -> columnId using title heuristics on real column metadata. */
export function buildFieldMapping(columns: RawColumn[], specs: FieldSpec[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const taken = new Set<string>();
  const usable = columns.filter((c) => !GENERIC_COLUMN_IDS.has(c.id));

  // Resolve the strongest matches first so a generic keyword ("status")
  // cannot steal a column that an exact title ("Execution Status") wants.
  const candidates = specs
    .map((spec) => {
      const scored = usable
        .map((col) => ({ col, score: scoreMatch(col.title, spec.keywords) }))
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score);
      return { spec, scored };
    })
    .sort((a, b) => (b.scored[0]?.score ?? 0) - (a.scored[0]?.score ?? 0));

  for (const { spec, scored } of candidates) {
    const pick = scored.find((s) => !taken.has(s.col.id));
    if (pick) {
      mapping[spec.field] = pick.col.id;
      taken.add(pick.col.id);
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

/** Drops repeated header rows: a row whose cells echo their own column titles. */
function dropHeaderRows(board: RawBoard): { items: RawItem[]; skipped: number } {
  const titleById = new Map(board.columns.map((c) => [c.id, c.title.trim().toLowerCase()]));
  const items = board.items.filter((item) => {
    let echoes = 0;
    for (const [colId, value] of Object.entries(item.values)) {
      if (isBlank(value)) continue;
      if (titleById.get(colId) === String(value).trim().toLowerCase()) echoes += 1;
      if (echoes >= 2) return false;
    }
    return true;
  });
  return { items, skipped: board.items.length - items.length };
}

function tally(
  rows: { raw: string | null; normalized: string | null; bucket: string }[],
): RawValueTally[] {
  const map = new Map<string, RawValueTally>();
  for (const r of rows) {
    const key = r.raw ?? "(blank)";
    const e = map.get(key) ?? { raw: key, normalized: r.normalized, bucket: r.bucket, count: 0 };
    e.count += 1;
    map.set(key, e);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

function mappingRows(
  board: RawBoard,
  mapping: Record<string, string>,
  items: RawItem[],
): ColumnMappingRow[] {
  return Object.entries(mapping).map(([field, columnId]) => {
    const col = board.columns.find((c) => c.id === columnId);
    return {
      field,
      columnId,
      columnTitle: col?.title ?? columnId,
      columnType: col?.type ?? "unknown",
      filled: items.filter((i) => !isBlank(i.values[columnId])).length,
    };
  });
}

function makeMeta(
  board: RawBoard,
  mapping: Record<string, string>,
  retrievedAt: string,
  diagnostics: BoardDiagnostics,
  itemCount: number,
): BoardMeta {
  const mapped = new Set(Object.values(mapping));
  return {
    boardId: board.id,
    boardName: board.name,
    itemCount,
    columnsSeen: board.columns,
    fieldMapping: Object.fromEntries(
      Object.entries(mapping).map(([field, colId]) => [
        field,
        board.columns.find((c) => c.id === colId)?.title ?? colId,
      ]),
    ),
    unmappedColumns: board.columns.filter((c) => !mapped.has(c.id)).map((c) => c.title),
    retrievedAt,
    diagnostics,
  };
}

export function mapDealsBoard(
  board: RawBoard,
  retrievedAt: string,
): { deals: Deal[]; meta: BoardMeta } {
  const mapping = buildFieldMapping(board.columns, DEAL_FIELDS);
  const { items, skipped } = dropHeaderRows(board);
  const seen = new Map<string, number>();

  const deals = items.map((item) => {
    const flags: DataQualityFlag[] = [];

    const sectorRaw = get(item, mapping, "sector");
    const stageRaw = get(item, mapping, "stage");
    const statusRaw = get(item, mapping, "status");
    const valueRaw = get(item, mapping, "value");
    const probRaw = get(item, mapping, "probability");
    const closeRaw = get(item, mapping, "expectedCloseDate");
    const createdRaw = get(item, mapping, "createdDate");

    const value = parseNumeric(valueRaw);
    const prob = parseProbabilityDetailed(probRaw);
    const expectedCloseDate = parseDate(closeRaw);
    const stage = normalizeStage(stageRaw);
    const status = normalizeStage(statusRaw);
    const statusBucket = classifyDealStatus(status);

    pushIf(flags, sectorRaw === null, "missing_sector");
    pushIf(flags, valueRaw === null, "missing_value");
    pushIf(flags, valueRaw !== null && value === null, "invalid_value");
    pushIf(flags, probRaw === null, "missing_probability");
    pushIf(flags, prob.basis === "unreadable", "invalid_probability");
    pushIf(flags, closeRaw === null, "missing_close_date");
    pushIf(flags, closeRaw !== null && expectedCloseDate === null, "invalid_date");
    pushIf(flags, stageRaw === null, "missing_stage");
    pushIf(flags, statusRaw === null, "missing_status");
    pushIf(flags, statusRaw !== null && statusBucket === "unknown", "unknown_status");
    pushIf(flags, get(item, mapping, "owner") === null, "missing_owner");

    const key = `${(normalizeText(item.name) ?? "").toLowerCase()}|${get(item, mapping, "company") ?? ""}|${value ?? ""}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
    if ((seen.get(key) ?? 0) > 1) flags.push("duplicate_record");

    const company = normalizeText(get(item, mapping, "company"));
    const name = normalizeText(item.name) ?? company ?? `Deal ${item.id}`;

    // Outcome drives win-rate and "open deals". It is taken from the explicit
    // deal-status field when present, and only falls back to the stage label.
    const outcome: Deal["outcome"] =
      statusBucket === "won" || statusBucket === "lost"
        ? statusBucket
        : statusBucket === "open" || statusBucket === "on_hold"
          ? "open"
          : stageOutcome(stage);

    const deal: Deal = {
      id: item.id,
      name,
      company,
      sector: normalizeSector(sectorRaw),
      sectorRaw,
      stage,
      stageRaw,
      status,
      statusRaw,
      statusBucket,
      outcome,
      value,
      probability: prob.value,
      probabilityBasis: prob.basis,
      expectedCloseDate,
      owner: normalizeText(get(item, mapping, "owner")),
      createdDate: parseDate(createdRaw),
      rawData: item.values,
      dataQualityFlags: flags,
    };
    return deal;
  });

  const diagnostics: BoardDiagnostics = {
    role: "deals",
    boardId: board.id,
    boardName: board.name,
    itemsRetrieved: deals.length,
    pagesRetrieved: board.pagesRetrieved,
    rowsSkipped: skipped,
    retrievedAt,
    mappings: mappingRows(board, mapping, items),
    statusValues: tally(
      deals.map((d) => ({ raw: d.statusRaw, normalized: d.status, bucket: d.statusBucket })),
    ),
    stageValues: tally(
      deals.map((d) => ({ raw: d.stageRaw, normalized: d.stage, bucket: d.outcome })),
    ),
    sectorValues: tally(
      deals.map((d) => ({ raw: d.sectorRaw, normalized: d.sector, bucket: d.sector ?? "unspecified" })),
    ),
    energyMatches: deals.filter((d) => d.sector === "Energy").length,
    validity: [
      validity(
        "deal value",
        deals.map((d) => ({ raw: !d.dataQualityFlags.includes("missing_value"), ok: d.value !== null })),
      ),
      validity(
        "closure probability",
        deals.map((d) => ({ raw: d.probabilityBasis !== "missing", ok: d.probability !== null })),
      ),
      validity(
        "expected close date",
        deals.map((d) => ({
          raw: !d.dataQualityFlags.includes("missing_close_date"),
          ok: d.expectedCloseDate !== null,
        })),
      ),
    ],
  };

  return { deals, meta: makeMeta(board, mapping, retrievedAt, diagnostics, deals.length) };
}

function stageOutcome(stage: string | null): Deal["outcome"] {
  if (!stage) return "unknown";
  const k = stage.toLowerCase();
  if (/(won|work order received|closed won|awarded)/.test(k)) return "won";
  if (/(lost|dead|not relevant|dropped|cancel)/.test(k)) return "lost";
  if (/(lead|qualified|demo|feasibility|proposal|commercial|negotiat|hold|pilot|new|open)/.test(k)) return "open";
  return "unknown";
}

function validity(
  field: string,
  rows: { raw: unknown; ok: boolean }[],
): { field: string; present: number; valid: number; invalid: number; missing: number } {
  const present = rows.filter((r) => Boolean(r.raw)).length;
  const valid = rows.filter((r) => r.ok).length;
  return { field, present, valid, invalid: Math.max(present - valid, 0), missing: rows.length - present };
}

export function mapWorkOrdersBoard(
  board: RawBoard,
  retrievedAt: string,
  today = new Date(),
): { workOrders: WorkOrder[]; meta: BoardMeta } {
  const mapping = buildFieldMapping(board.columns, WORK_ORDER_FIELDS);
  const { items, skipped } = dropHeaderRows(board);
  const rawPresence: { value: boolean; start: boolean; end: boolean }[] = [];
  const todayIso = today.toISOString().slice(0, 10);
  const seen = new Map<string, number>();

  const workOrders = items.map((item) => {
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
    const semantics = classifyWorkOrderStatusSemantics(status);
    const statusBucket = semantics.operational;

    // Delay rule: the execution status says delayed, OR the expected end date
    // has passed while execution is known to be neither completed nor
    // cancelled. A missing end date, or a status with no execution meaning,
    // never produces a delay verdict — it makes delay undeterminable.
    const overdue =
      endDate !== null &&
      endDate < todayIso &&
      statusBucket !== "completed" &&
      statusBucket !== "cancelled" &&
      statusBucket !== "unknown_unmapped";
    const delayed = statusBucket === "delayed" || overdue;
    const delayDeterminable = statusBucket === "delayed" || statusBucket !== "unknown_unmapped" || endDate !== null;
    const delayReason: WorkOrder["delayReason"] = statusBucket === "delayed" ? "status" : overdue ? "overdue" : null;

    pushIf(flags, sectorRaw === null, "missing_sector");
    pushIf(flags, statusRaw === null, "missing_status");
    pushIf(flags, statusRaw !== null && statusBucket === "unknown_unmapped", "unknown_status");
    pushIf(flags, valueRaw === null, "missing_value");
    pushIf(flags, valueRaw !== null && value === null, "invalid_value");
    pushIf(flags, (startRaw !== null && startDate === null) || (endRaw !== null && endDate === null), "invalid_date");
    pushIf(flags, completionRaw === null, "missing_completion");
    pushIf(flags, clientRaw === null, "missing_client");

    const key = `${(normalizeText(item.name) ?? "").toLowerCase()}|${clientRaw ?? ""}|${value ?? ""}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
    if ((seen.get(key) ?? 0) > 1) flags.push("duplicate_record");

    rawPresence.push({ value: valueRaw !== null, start: startRaw !== null, end: endRaw !== null });

    const client = normalizeText(clientRaw);
    const wo: WorkOrder = {
      id: item.id,
      project:
        normalizeText(item.name) ??
        normalizeText(get(item, mapping, "project")) ??
        client ??
        `Work order ${item.id}`,
      client,
      sector: normalizeSector(sectorRaw),
      sectorRaw,
      status,
      statusRaw,
      statusBucket,
      delayed,
      delayReason,
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

  const diagnostics: BoardDiagnostics = {
    role: "work_orders",
    boardId: board.id,
    boardName: board.name,
    itemsRetrieved: workOrders.length,
    pagesRetrieved: board.pagesRetrieved,
    rowsSkipped: skipped,
    retrievedAt,
    mappings: mappingRows(board, mapping, items),
    statusValues: tally(
      workOrders.map((w) => ({ raw: w.statusRaw, normalized: w.status, bucket: w.statusBucket })),
    ),
    stageValues: [],
    sectorValues: tally(
      workOrders.map((w) => ({ raw: w.sectorRaw, normalized: w.sector, bucket: w.sector ?? "unspecified" })),
    ),
    energyMatches: workOrders.filter((w) => w.sector === "Energy").length,
    validity: [
      validity(
        "order value",
        workOrders.map((w, i) => ({ raw: rawPresence[i]?.value ?? false, ok: w.value !== null })),
      ),
      validity(
        "start date",
        workOrders.map((w, i) => ({ raw: rawPresence[i]?.start ?? false, ok: w.startDate !== null })),
      ),
      validity(
        "end date",
        workOrders.map((w, i) => ({ raw: rawPresence[i]?.end ?? false, ok: w.endDate !== null })),
      ),
    ],
  };

  return {
    workOrders,
    meta: makeMeta(board, mapping, retrievedAt, diagnostics, workOrders.length),
  };
}

/**
 * Board role detection. The configured board IDs cannot be trusted to be in
 * the documented order (they were swapped in the live workspace), so the
 * role is inferred from the column schema itself.
 */
export function detectBoardRole(board: RawBoard): "deals" | "work_orders" {
  const titles = board.columns.map((c) => c.title.toLowerCase());
  const has = (needle: string) => titles.some((t) => t.includes(needle));
  let dealScore = 0;
  let woScore = 0;
  if (has("deal stage")) dealScore += 3;
  if (has("deal status")) dealScore += 3;
  if (has("deal value")) dealScore += 2;
  if (has("closure probability")) dealScore += 2;
  if (has("close date")) dealScore += 1;
  if (has("execution status")) woScore += 3;
  if (has("invoice") || has("billed")) woScore += 2;
  if (has("po/loi") || has("purchase order")) woScore += 2;
  if (has("nature of work")) woScore += 1;
  if (has("work order")) woScore += 1;
  return woScore > dealScore ? "work_orders" : "deals";
}
