/**
 * Data-quality engine. Every number here is counted from the actual
 * normalized records — nothing is estimated or fabricated.
 */

import type { DataQualityFlag, Deal, WorkOrder } from "./types";

export interface QualityIssue {
  flag: DataQualityFlag;
  scope: "deals" | "work_orders";
  count: number;
  message: string;
  severity: "warning" | "info";
}

export interface DataQualityReport {
  dealCount: number;
  workOrderCount: number;
  issues: QualityIssue[];
  /** Human-readable caveats to attach to any number shown to a founder. */
  caveats: string[];
  score: number; // 0..100, share of records with no flags
}

const DEAL_MESSAGES: Partial<Record<DataQualityFlag, (n: number) => string>> = {
  missing_probability: (n) => `${n} deal${n === 1 ? " is" : "s are"} missing probability values.`,
  invalid_probability: (n) => `${n} deal${n === 1 ? " has" : "s have"} a probability value that could not be read.`,
  missing_close_date: (n) => `${n} deal${n === 1 ? " does" : "s do"} not have an expected close date.`,
  invalid_date: (n) => `${n} deal${n === 1 ? " has" : "s have"} an unreadable date value.`,
  missing_sector: (n) => `${n} deal${n === 1 ? " has" : "s have"} no sector recorded.`,
  missing_value: (n) => `${n} deal${n === 1 ? " has" : "s have"} no deal value.`,
  invalid_value: (n) => `${n} deal value${n === 1 ? "" : "s"} could not be parsed as a number.`,
  missing_stage: (n) => `${n} deal${n === 1 ? " has" : "s have"} no pipeline stage.`,
  missing_owner: (n) => `${n} deal${n === 1 ? " has" : "s have"} no owner assigned.`,
  duplicate_record: (n) => `${n} deal${n === 1 ? " looks like a duplicate" : "s look like duplicates"} of another record.`,
};

const WO_MESSAGES: Partial<Record<DataQualityFlag, (n: number) => string>> = {
  missing_status: (n) => `${n} work order${n === 1 ? " has" : "s have"} no status.`,
  unknown_status: (n) => `${n} work order${n === 1 ? " uses an" : "s use"} unrecognised status value${n === 1 ? "" : "s"}.`,
  missing_sector: (n) => `${n} work order${n === 1 ? " has" : "s have"} no sector recorded.`,
  missing_value: (n) => `${n} work order${n === 1 ? " has" : "s have"} no value.`,
  invalid_value: (n) => `${n} work order value${n === 1 ? "" : "s"} could not be parsed as a number.`,
  invalid_date: (n) => `${n} work order${n === 1 ? " has" : "s have"} an unreadable date value.`,
  missing_completion: (n) => `${n} work order${n === 1 ? " has" : "s have"} no completion percentage.`,
  missing_client: (n) => `${n} work order${n === 1 ? " has" : "s have"} no client recorded.`,
  duplicate_record: (n) => `${n} work order${n === 1 ? " looks like a duplicate" : "s look like duplicates"}.`,
};

const LOW_SIGNAL: DataQualityFlag[] = ["missing_owner", "missing_client"];

function tally(records: { dataQualityFlags: DataQualityFlag[] }[]): Map<DataQualityFlag, number> {
  const counts = new Map<DataQualityFlag, number>();
  for (const r of records) {
    for (const f of r.dataQualityFlags) counts.set(f, (counts.get(f) ?? 0) + 1);
  }
  return counts;
}

export function analyzeDataQuality(deals: Deal[], workOrders: WorkOrder[]): DataQualityReport {
  const issues: QualityIssue[] = [];

  for (const [flag, count] of tally(deals)) {
    const msg = DEAL_MESSAGES[flag];
    if (!msg || count === 0) continue;
    issues.push({
      flag,
      scope: "deals",
      count,
      message: msg(count),
      severity: LOW_SIGNAL.includes(flag) ? "info" : "warning",
    });
  }
  for (const [flag, count] of tally(workOrders)) {
    const msg = WO_MESSAGES[flag];
    if (!msg || count === 0) continue;
    issues.push({
      flag,
      scope: "work_orders",
      count,
      message: msg(count),
      severity: LOW_SIGNAL.includes(flag) ? "info" : "warning",
    });
  }

  issues.sort((a, b) => b.count - a.count);

  const caveats: string[] = [];
  const missingProb = deals.filter((d) => d.probability === null).length;
  if (missingProb > 0) {
    caveats.push(
      `Weighted pipeline excludes ${missingProb} deal${missingProb === 1 ? "" : "s"} without a valid probability value.`,
    );
  }
  const missingValue = deals.filter((d) => d.value === null).length;
  if (missingValue > 0) {
    caveats.push(
      `${missingValue} deal${missingValue === 1 ? " is" : "s are"} excluded from value totals because no amount is recorded.`,
    );
  }
  const missingClose = deals.filter((d) => d.expectedCloseDate === null).length;
  if (missingClose > 0) {
    caveats.push(
      `Time-based filters skip ${missingClose} deal${missingClose === 1 ? "" : "s"} with no expected close date.`,
    );
  }

  const total = deals.length + workOrders.length;
  const clean =
    deals.filter((d) => d.dataQualityFlags.length === 0).length +
    workOrders.filter((w) => w.dataQualityFlags.length === 0).length;

  return {
    dealCount: deals.length,
    workOrderCount: workOrders.length,
    issues,
    caveats,
    score: total === 0 ? 100 : Math.round((clean / total) * 100),
  };
}
