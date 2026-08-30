/**
 * Deterministic analytics engine.
 *
 * This is the single source of numerical truth in the application.
 * The LLM never computes any of these values — it only explains them.
 */

import type { Deal, WorkOrder } from "./types";
import { isUnbounded, isWithin, type ResolvedRange } from "./timeRange";

export interface Breakdown {
  key: string;
  count: number;
  value: number;
  weightedValue: number;
  share: number; // 0..1 of total value
}

export interface PipelineMetrics {
  dealCount: number;
  totalPipeline: number;
  weightedPipeline: number;
  weightedFromDeals: number;
  dealsExcludedFromWeighted: number;
  dealsWithoutValue: number;
  averageDealSize: number | null;
  bySector: Breakdown[];
  byStage: Breakdown[];
  byOwner: Breakdown[];
  topOpportunities: Deal[];
  atRisk: Deal[];
}

export interface SalesMetrics {
  won: { count: number; value: number };
  lost: { count: number; value: number };
  open: { count: number; value: number };
  unknown: { count: number; value: number };
  winRate: number | null; // 0..1 over decided deals
  decidedCount: number;
  averageDealSize: number | null;
  sectorPerformance: {
    sector: string;
    won: number;
    lost: number;
    open: number;
    wonValue: number;
    winRate: number | null;
  }[];
}

export interface OperationsMetrics {
  total: number;
  active: number;
  completed: number;
  delayed: number;
  onHold: number;
  cancelled: number;
  unknownStatus: number;
  averageCompletion: number | null;
  completionSampleSize: number;
  totalValue: number;
  bySector: Breakdown[];
  byStatus: { key: string; count: number; value: number }[];
  needsAttention: WorkOrder[];
}

export interface CrossBoardRow {
  sector: string;
  pipelineValue: number;
  pipelineCount: number;
  workOrderValue: number;
  workOrderCount: number;
  activeWorkOrders: number;
  delayedWorkOrders: number;
  executionRatio: number | null; // workOrderValue / pipelineValue
}

export interface CrossBoardAnalysis {
  supported: boolean;
  reason?: string;
  rows: CrossBoardRow[];
  highPipelineLowExecution: string[];
  salesConcentration: number | null; // top sector share of pipeline
  operationsConcentration: number | null;
  bottleneckSectors: string[];
}

const UNSPECIFIED = "Unspecified";

function sum(values: (number | null)[]): number {
  return values.reduce<number>((acc, v) => acc + (v ?? 0), 0);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/* ------------------------------------------------------------------ */
/* Filtering                                                           */
/* ------------------------------------------------------------------ */

export interface DealFilter {
  sectors?: string[] | null;
  stages?: string[] | null;
  owners?: string[] | null;
  outcome?: "won" | "lost" | "open" | null;
  range?: ResolvedRange | null;
  minValue?: number | null;
}

function matchesList(value: string | null, list: string[] | null | undefined): boolean {
  if (!list || list.length === 0) return true;
  if (!value) return false;
  return list.some((l) => l.toLowerCase() === value.toLowerCase());
}

export function filterDeals(deals: Deal[], filter: DealFilter = {}): Deal[] {
  const range = filter.range;
  return deals.filter((d) => {
    if (!matchesList(d.sector, filter.sectors)) return false;
    if (!matchesList(d.stage, filter.stages)) return false;
    if (!matchesList(d.owner, filter.owners)) return false;
    if (filter.outcome && d.outcome !== filter.outcome) return false;
    if (filter.minValue != null && (d.value ?? 0) < filter.minValue) return false;
    if (range && !isUnbounded(range) && !isWithin(d.expectedCloseDate, range)) return false;
    return true;
  });
}

export interface WorkOrderFilter {
  sectors?: string[] | null;
  statuses?: string[] | null;
  owners?: string[] | null;
  range?: ResolvedRange | null;
}

export function filterWorkOrders(workOrders: WorkOrder[], filter: WorkOrderFilter = {}): WorkOrder[] {
  const range = filter.range;
  return workOrders.filter((w) => {
    if (!matchesList(w.sector, filter.sectors)) return false;
    if (!matchesList(w.status, filter.statuses)) return false;
    if (!matchesList(w.owner, filter.owners)) return false;
    if (range && !isUnbounded(range)) {
      // A work order is in range if it overlaps the window at all.
      const start = w.startDate;
      const end = w.endDate;
      if (!start && !end) return false;
      const afterFrom = !range.from || (end ?? start)! >= range.from;
      const beforeTo = !range.to || (start ?? end)! <= range.to;
      if (!afterFrom || !beforeTo) return false;
    }
    return true;
  });
}

/* ------------------------------------------------------------------ */
/* Pipeline                                                            */
/* ------------------------------------------------------------------ */

function groupDeals(
  deals: Deal[],
  keyOf: (d: Deal) => string | null,
  totalValue: number,
): Breakdown[] {
  const map = new Map<string, Breakdown>();
  for (const d of deals) {
    const key = keyOf(d) ?? UNSPECIFIED;
    const entry = map.get(key) ?? { key, count: 0, value: 0, weightedValue: 0, share: 0 };
    entry.count += 1;
    entry.value += d.value ?? 0;
    if (d.value !== null && d.probability !== null) entry.weightedValue += d.value * d.probability;
    map.set(key, entry);
  }
  return [...map.values()]
    .map((e) => ({
      ...e,
      value: round2(e.value),
      weightedValue: round2(e.weightedValue),
      share: totalValue > 0 ? round2(e.value / totalValue) : 0,
    }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Weighted pipeline = Σ(value × probability) over deals where BOTH are
 * present and valid. Deals with a missing probability are excluded and
 * counted, never defaulted to an assumed probability.
 */
export function computePipelineMetrics(deals: Deal[]): PipelineMetrics {
  const open = deals;
  const totalPipeline = round2(sum(open.map((d) => d.value)));
  const weightedDeals = open.filter((d) => d.value !== null && d.probability !== null);
  const weightedPipeline = round2(sum(weightedDeals.map((d) => d.value! * d.probability!)));
  const withValue = open.filter((d) => d.value !== null);

  return {
    dealCount: open.length,
    totalPipeline,
    weightedPipeline,
    weightedFromDeals: weightedDeals.length,
    dealsExcludedFromWeighted: open.length - weightedDeals.length,
    dealsWithoutValue: open.length - withValue.length,
    averageDealSize: withValue.length ? round2(totalPipeline / withValue.length) : null,
    bySector: groupDeals(open, (d) => d.sector, totalPipeline),
    byStage: groupDeals(open, (d) => d.stage, totalPipeline),
    byOwner: groupDeals(open, (d) => d.owner, totalPipeline),
    topOpportunities: [...open]
      .filter((d) => d.value !== null)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
      .slice(0, 10),
    atRisk: [...open]
      .filter((d) => d.outcome === "open" || d.outcome === "unknown")
      .filter(
        (d) =>
          (d.value !== null && d.probability !== null && d.probability < 0.4 && d.value > 0) ||
          d.probability === null ||
          d.expectedCloseDate === null,
      )
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
      .slice(0, 10),
  };
}

/* ------------------------------------------------------------------ */
/* Sales                                                               */
/* ------------------------------------------------------------------ */

export function computeSalesMetrics(deals: Deal[]): SalesMetrics {
  const bucket = (o: Deal["outcome"]) => {
    const rows = deals.filter((d) => d.outcome === o);
    return { count: rows.length, value: round2(sum(rows.map((d) => d.value))) };
  };
  const won = bucket("won");
  const lost = bucket("lost");
  const open = bucket("open");
  const unknown = bucket("unknown");
  const decided = won.count + lost.count;

  const sectors = new Map<string, { won: number; lost: number; open: number; wonValue: number }>();
  for (const d of deals) {
    const key = d.sector ?? UNSPECIFIED;
    const e = sectors.get(key) ?? { won: 0, lost: 0, open: 0, wonValue: 0 };
    if (d.outcome === "won") {
      e.won += 1;
      e.wonValue += d.value ?? 0;
    } else if (d.outcome === "lost") e.lost += 1;
    else e.open += 1;
    sectors.set(key, e);
  }

  const withValue = deals.filter((d) => d.value !== null);

  return {
    won,
    lost,
    open,
    unknown,
    decidedCount: decided,
    winRate: decided > 0 ? round2(won.count / decided) : null,
    averageDealSize: withValue.length
      ? round2(sum(withValue.map((d) => d.value)) / withValue.length)
      : null,
    sectorPerformance: [...sectors.entries()]
      .map(([sector, e]) => ({
        sector,
        ...e,
        wonValue: round2(e.wonValue),
        winRate: e.won + e.lost > 0 ? round2(e.won / (e.won + e.lost)) : null,
      }))
      .sort((a, b) => b.wonValue - a.wonValue),
  };
}

/* ------------------------------------------------------------------ */
/* Operations                                                          */
/* ------------------------------------------------------------------ */

export function computeOperationsMetrics(workOrders: WorkOrder[], today = new Date()): OperationsMetrics {
  const todayIso = today.toISOString().slice(0, 10);
  const count = (b: WorkOrder["statusBucket"]) => workOrders.filter((w) => w.statusBucket === b).length;

  // Overdue = past end date and not completed/cancelled, even if the board
  // status does not say "delayed".
  const overdue = workOrders.filter(
    (w) =>
      w.endDate !== null &&
      w.endDate < todayIso &&
      w.statusBucket !== "completed" &&
      w.statusBucket !== "cancelled",
  );
  const delayedSet = new Set([
    ...workOrders.filter((w) => w.statusBucket === "delayed").map((w) => w.id),
    ...overdue.map((w) => w.id),
  ]);

  const withCompletion = workOrders.filter((w) => w.completionPercentage !== null);
  const totalValue = round2(sum(workOrders.map((w) => w.value)));

  const sectorMap = new Map<string, Breakdown>();
  for (const w of workOrders) {
    const key = w.sector ?? UNSPECIFIED;
    const e = sectorMap.get(key) ?? { key, count: 0, value: 0, weightedValue: 0, share: 0 };
    e.count += 1;
    e.value += w.value ?? 0;
    sectorMap.set(key, e);
  }

  const statusMap = new Map<string, { key: string; count: number; value: number }>();
  for (const w of workOrders) {
    const key = w.status ?? "Unknown";
    const e = statusMap.get(key) ?? { key, count: 0, value: 0 };
    e.count += 1;
    e.value += w.value ?? 0;
    statusMap.set(key, e);
  }

  return {
    total: workOrders.length,
    active: count("active"),
    completed: count("completed"),
    delayed: delayedSet.size,
    onHold: count("on_hold"),
    cancelled: count("cancelled"),
    unknownStatus: count("unknown"),
    averageCompletion: withCompletion.length
      ? round2(sum(withCompletion.map((w) => w.completionPercentage)) / withCompletion.length)
      : null,
    completionSampleSize: withCompletion.length,
    totalValue,
    bySector: [...sectorMap.values()]
      .map((e) => ({ ...e, value: round2(e.value), share: totalValue > 0 ? round2(e.value / totalValue) : 0 }))
      .sort((a, b) => b.value - a.value),
    byStatus: [...statusMap.values()]
      .map((e) => ({ ...e, value: round2(e.value) }))
      .sort((a, b) => b.count - a.count),
    needsAttention: workOrders
      .filter((w) => delayedSet.has(w.id) || w.statusBucket === "on_hold" || w.statusBucket === "unknown")
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
      .slice(0, 10),
  };
}

/* ------------------------------------------------------------------ */
/* Cross-board                                                         */
/* ------------------------------------------------------------------ */

export function computeCrossBoardAnalysis(deals: Deal[], workOrders: WorkOrder[]): CrossBoardAnalysis {
  const dealSectors = new Set(deals.map((d) => d.sector).filter(Boolean) as string[]);
  const woSectors = new Set(workOrders.map((w) => w.sector).filter(Boolean) as string[]);
  const shared = [...dealSectors].filter((s) => woSectors.has(s));

  if (deals.length === 0 || workOrders.length === 0) {
    return {
      supported: false,
      reason: "Cross-board analysis needs records on both the deals board and the work orders board.",
      rows: [],
      highPipelineLowExecution: [],
      salesConcentration: null,
      operationsConcentration: null,
      bottleneckSectors: [],
    };
  }
  if (shared.length === 0) {
    return {
      supported: false,
      reason:
        "The two boards do not share any recognisable sector values, so sector-level comparison would be misleading.",
      rows: [],
      highPipelineLowExecution: [],
      salesConcentration: null,
      operationsConcentration: null,
      bottleneckSectors: [],
    };
  }

  const sectors = new Set([...dealSectors, ...woSectors]);
  const rows: CrossBoardRow[] = [...sectors].map((sector) => {
    const d = deals.filter((x) => x.sector === sector);
    const w = workOrders.filter((x) => x.sector === sector);
    const pipelineValue = round2(sum(d.map((x) => x.value)));
    const workOrderValue = round2(sum(w.map((x) => x.value)));
    return {
      sector,
      pipelineValue,
      pipelineCount: d.length,
      workOrderValue,
      workOrderCount: w.length,
      activeWorkOrders: w.filter((x) => x.statusBucket === "active").length,
      delayedWorkOrders: w.filter((x) => x.statusBucket === "delayed").length,
      executionRatio: pipelineValue > 0 ? round2(workOrderValue / pipelineValue) : null,
    };
  });
  rows.sort((a, b) => b.pipelineValue - a.pipelineValue);

  const totalPipeline = sum(rows.map((r) => r.pipelineValue));
  const totalWo = sum(rows.map((r) => r.workOrderValue));

  return {
    supported: true,
    rows,
    highPipelineLowExecution: rows
      .filter((r) => r.pipelineValue > 0 && (r.workOrderCount === 0 || (r.executionRatio ?? 0) < 0.25))
      .slice(0, 5)
      .map((r) => r.sector),
    salesConcentration: totalPipeline > 0 ? round2((rows[0]?.pipelineValue ?? 0) / totalPipeline) : null,
    operationsConcentration:
      totalWo > 0
        ? round2(Math.max(...rows.map((r) => r.workOrderValue)) / totalWo)
        : null,
    bottleneckSectors: rows
      .filter((r) => r.delayedWorkOrders > 0 && r.pipelineValue > 0)
      .sort((a, b) => b.delayedWorkOrders - a.delayedWorkOrders)
      .slice(0, 3)
      .map((r) => r.sector),
  };
}
