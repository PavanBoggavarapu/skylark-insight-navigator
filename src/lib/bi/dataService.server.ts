/**
 * Data service: Monday.com -> mapper -> canonical dataset, with a short
 * in-memory cache so that a multi-question session doesn't hammer the API.
 *
 * The cache TTL is deliberately short and every response carries the
 * retrieval timestamp, so the UI can never present stale data as live.
 */

import { getBoardItems, readMondayConfig, MondayError } from "../monday.server";
import { mapDealsBoard, mapWorkOrdersBoard } from "./mapper";
import type { DataSet } from "./types";

const CACHE_TTL_MS = 60_000;

let cache: { at: number; data: DataSet } | null = null;

export function invalidateDataCache() {
  cache = null;
}

export interface LoadOptions {
  deals?: boolean;
  workOrders?: boolean;
  forceRefresh?: boolean;
}

export async function loadDataSet(options: LoadOptions = {}): Promise<DataSet> {
  const wantDeals = options.deals !== false;
  const wantWorkOrders = options.workOrders !== false;

  if (!options.forceRefresh && cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return { ...cache.data, fromCache: true };
  }

  const cfg = readMondayConfig();
  if (!cfg.ok) {
    throw new MondayError(
      `Missing configuration: ${cfg.missing.join(", ")}`,
      "not_configured",
      "Monday.com is not connected yet. Add the API token and board IDs to start reading live data.",
    );
  }

  const retrievedAt = new Date().toISOString();

  const [dealsBoard, woBoard] = await Promise.all([
    wantDeals ? getBoardItems(cfg.config, cfg.config.dealsBoardId) : Promise.resolve(null),
    wantWorkOrders ? getBoardItems(cfg.config, cfg.config.workOrdersBoardId) : Promise.resolve(null),
  ]);

  const dealsResult = dealsBoard ? mapDealsBoard(dealsBoard, retrievedAt) : null;
  const woResult = woBoard ? mapWorkOrdersBoard(woBoard, retrievedAt) : null;

  const data: DataSet = {
    deals: dealsResult?.deals ?? [],
    workOrders: woResult?.workOrders ?? [],
    dealsBoard: dealsResult?.meta ?? null,
    workOrdersBoard: woResult?.meta ?? null,
    retrievedAt,
    fromCache: false,
  };

  // Only cache complete snapshots so a partial load can't poison later reads.
  if (wantDeals && wantWorkOrders) cache = { at: Date.now(), data };

  return data;
}
