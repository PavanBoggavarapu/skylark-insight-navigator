/**
 * Structured intent model.
 *
 * Gemini produces a *proposal*; this module is the validation boundary.
 * Nothing from the model is executed — it is parsed into a closed set of
 * enums, and anything unrecognised is rejected or dropped.
 */

import { z } from "zod";

export const INTENTS = [
  "pipeline_analysis",
  "deal_analysis",
  "sector_analysis",
  "sector_comparison",
  "operations_analysis",
  "cross_board_analysis",
  "leadership_update",
  "data_quality",
  "clarification_needed",
  "unsupported",
] as const;

export const METRICS = [
  "total_pipeline",
  "weighted_pipeline",
  "deal_count",
  "average_deal_size",
  "pipeline_by_sector",
  "pipeline_by_stage",
  "pipeline_by_owner",
  "top_opportunities",
  "deals_needing_attention",
  "win_rate",
  "won_lost_open",
  "sector_performance",
  "work_order_counts",
  "work_orders_by_status",
  "work_orders_by_sector",
  "average_completion",
  "delayed_work_orders",
  "cross_board_sectors",
  "data_quality",
] as const;

export const TIME_RANGE_TYPES = [
  "all_time",
  "today",
  "this_week",
  "this_month",
  "last_month",
  "this_quarter",
  "last_quarter",
  "next_quarter",
  "this_year",
  "last_year",
  "quarter",
  "custom",
] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const timeRangeSchema = z.object({
  type: z.enum(TIME_RANGE_TYPES).default("all_time"),
  quarter: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).nullable().optional(),
  year: z.number().int().min(2000).max(2100).nullable().optional(),
  from: isoDate.nullable().optional(),
  to: isoDate.nullable().optional(),
});

export const intentSchema = z.object({
  intent: z.enum(INTENTS),
  datasets: z.array(z.enum(["deals", "work_orders"])).default([]),
  sectors: z.array(z.string().max(64)).max(10).default([]),
  stages: z.array(z.string().max(64)).max(10).default([]),
  owners: z.array(z.string().max(64)).max(10).default([]),
  outcome: z.enum(["won", "lost", "open"]).nullable().default(null),
  timeRange: timeRangeSchema.default({ type: "all_time" }),
  metrics: z.array(z.enum(METRICS)).max(12).default([]),
  clarificationQuestion: z.string().max(400).nullable().default(null),
  clarificationOptions: z.array(z.string().max(120)).max(4).default([]),
  assumptions: z.array(z.string().max(200)).max(5).default([]),
});

export type BiIntent = z.infer<typeof intentSchema>;

/** JSON schema handed to Gemini for structured output. */
export const intentJsonSchema = {
  type: "object",
  properties: {
    intent: { type: "string", enum: [...INTENTS] },
    datasets: { type: "array", items: { type: "string", enum: ["deals", "work_orders"] } },
    sectors: { type: "array", items: { type: "string" } },
    stages: { type: "array", items: { type: "string" } },
    owners: { type: "array", items: { type: "string" } },
    outcome: { type: "string", enum: ["won", "lost", "open", "any"] },
    timeRange: {
      type: "object",
      properties: {
        type: { type: "string", enum: [...TIME_RANGE_TYPES] },
        quarter: { type: "number" },
        year: { type: "number" },
        from: { type: "string" },
        to: { type: "string" },
      },
      required: ["type"],
      additionalProperties: false,
    },
    metrics: { type: "array", items: { type: "string", enum: [...METRICS] } },
    clarificationQuestion: { type: "string" },
    clarificationOptions: { type: "array", items: { type: "string" } },
    assumptions: { type: "array", items: { type: "string" } },
  },
  required: ["intent", "datasets", "metrics", "timeRange"],
  additionalProperties: false,
} as const;

/**
 * Validates a model-produced object into a safe intent.
 * Returns a conservative fallback rather than throwing, so a malformed
 * Gemini response degrades into a usable answer instead of an error page.
 */
export function validateIntent(raw: unknown): { intent: BiIntent; valid: boolean; issue?: string } {
  const cleaned = coerce(raw);
  const parsed = intentSchema.safeParse(cleaned);
  if (parsed.success) return { intent: parsed.data, valid: true };
  return {
    valid: false,
    issue: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    intent: intentSchema.parse({
      intent: "pipeline_analysis",
      datasets: ["deals"],
      metrics: ["total_pipeline", "weighted_pipeline", "deal_count"],
      timeRange: { type: "all_time" },
      assumptions: ["The question could not be parsed precisely, so an overall pipeline view is shown."],
    }),
  };
}

/** Drops unknown enum members instead of failing the whole payload. */
function coerce(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) return raw;
  const o = { ...(raw as Record<string, unknown>) };

  if (Array.isArray(o.metrics)) {
    o.metrics = (o.metrics as unknown[]).filter(
      (m): m is string => typeof m === "string" && (METRICS as readonly string[]).includes(m),
    );
  }
  if (Array.isArray(o.datasets)) {
    o.datasets = (o.datasets as unknown[]).filter(
      (d): d is string => d === "deals" || d === "work_orders",
    );
  }
  if (o.outcome === "any" || o.outcome === "" || o.outcome === undefined) o.outcome = null;
  if (typeof o.intent === "string" && !(INTENTS as readonly string[]).includes(o.intent)) {
    o.intent = "unsupported";
  }
  const tr = o.timeRange as Record<string, unknown> | undefined;
  if (tr) {
    if (typeof tr.type === "string" && !(TIME_RANGE_TYPES as readonly string[]).includes(tr.type)) {
      tr.type = "all_time";
    }
    for (const k of ["quarter", "year", "from", "to"]) {
      if (tr[k] === "" || tr[k] === "null") tr[k] = null;
    }
  }
  for (const k of ["sectors", "stages", "owners", "clarificationOptions", "assumptions"]) {
    if (!Array.isArray(o[k])) o[k] = [];
  }
  return o;
}

/** Which datasets the server will actually fetch for this intent. */
export function requiredDatasets(intent: BiIntent): { deals: boolean; workOrders: boolean } {
  const byIntent: Record<string, { deals: boolean; workOrders: boolean }> = {
    pipeline_analysis: { deals: true, workOrders: false },
    deal_analysis: { deals: true, workOrders: false },
    sector_analysis: { deals: true, workOrders: true },
    sector_comparison: { deals: true, workOrders: true },
    operations_analysis: { deals: false, workOrders: true },
    cross_board_analysis: { deals: true, workOrders: true },
    leadership_update: { deals: true, workOrders: true },
    data_quality: { deals: true, workOrders: true },
    clarification_needed: { deals: false, workOrders: false },
    unsupported: { deals: false, workOrders: false },
  };
  const base = byIntent[intent.intent] ?? { deals: true, workOrders: false };
  return {
    deals: base.deals || intent.datasets.includes("deals"),
    workOrders: base.workOrders || intent.datasets.includes("work_orders"),
  };
}
