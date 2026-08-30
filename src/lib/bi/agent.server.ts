/**
 * Gemini orchestration.
 *
 * Flow: question -> structured intent (Gemini, schema-validated) ->
 * deterministic analytics (application code) -> narrative (Gemini).
 *
 * The model is never asked to compute anything. It receives a JSON payload of
 * already-computed figures and is instructed to quote them verbatim.
 */

import { generateJson, generateText, GeminiError, isAiConfigured } from "../gemini.server";
import { MondayError } from "../monday.server";
import {
  computeCrossBoardAnalysis,
  computeOperationsMetrics,
  computePipelineMetrics,
  computeSalesMetrics,
  filterDeals,
  filterWorkOrders,
} from "./analytics";
import { analyzeDataQuality } from "./dataQuality";
import { loadDataSet } from "./dataService.server";
import { intentJsonSchema, requiredDatasets, validateIntent, type BiIntent } from "./intent";
import { resolveTimeRange } from "./timeRange";
import type { AgentAnswer, AnalyticsPayload, SourceMetadata } from "./agentTypes";
import type { DataSet } from "./types";

const INTENT_SYSTEM = `You are the query-understanding component of a business intelligence system for Skylark Drones.
You convert a founder's natural-language question into a STRUCTURED QUERY. You never answer the question and you never produce numbers.

Available data:
- "deals": sales pipeline records (company, sector, stage, value, probability, expected close date, owner)
- "work_orders": project execution records (project, client, sector, status, value, start/end dates, owner, completion %)

Rules:
- Choose exactly one intent from the allowed list.
- Pick only the metrics that genuinely answer the question.
- Only use intent "clarification_needed" when the question is genuinely ambiguous AND no reasonable default exists (e.g. "how are we doing?"). If a sensible default exists, use it and record it in "assumptions" instead of asking.
- Time range: name the period only. Never compute dates. Use "all_time" when no period is mentioned.
- Sector/stage/owner filters must be copied from the user's words, not invented.
- Use "unsupported" only for questions that have nothing to do with this sales/operations data.`;

const NARRATIVE_SYSTEM = `You are the executive analyst of "Skylark BI Agent", writing for the founder of Skylark Drones.

CRITICAL RULES
- The JSON payload you receive is the ONLY source of truth. Every number you write must appear in that payload verbatim.
- NEVER calculate, estimate, extrapolate or infer a number that is not in the payload. If a figure is absent, say it is not available.
- Never state a trend over time unless the payload contains the comparison.
- Clearly separate fact from interpretation.

STYLE
- Founder-level: insight first, data second. No tables of raw records.
- Short markdown sections with "## " headings. Bold key figures.
- Format money as plain grouped numbers (e.g. 24,50,000) with no currency symbol, because the source currency is not declared in the board data.
- 150-260 words unless the request is a leadership update.
- Always include the data-quality caveats supplied in the payload when they affect a figure you quote.
- End with 2-4 numbered, specific recommended actions.
- If the payload shows zero records, say so plainly and do not speculate.`;

const LEADERSHIP_SYSTEM = `${NARRATIVE_SYSTEM}

This request is a LEADERSHIP UPDATE. Use exactly these sections in this order:
## Executive Summary
## Sales & Pipeline
## Operations
## Key Risks
## Data Quality
## Recommended Actions
Keep it readable in under two minutes (350-450 words).`;

export interface AskOptions {
  question: string;
  history?: { role: "user" | "assistant"; content: string }[];
  forceLeadershipUpdate?: boolean;
}

function sourceMeta(data: DataSet): SourceMetadata {
  const boards: SourceMetadata["boards"] = [];
  if (data.dealsBoard) {
    boards.push({ name: data.dealsBoard.boardName, boardId: data.dealsBoard.boardId, records: data.deals.length });
  }
  if (data.workOrdersBoard) {
    boards.push({
      name: data.workOrdersBoard.boardName,
      boardId: data.workOrdersBoard.boardId,
      records: data.workOrders.length,
    });
  }
  return {
    boards,
    recordsAnalyzed: data.deals.length + data.workOrders.length,
    retrievedAt: data.retrievedAt,
    fromCache: data.fromCache,
  };
}

/** Runs the deterministic analytics an intent requires. No model involvement. */
export function computeForIntent(intent: BiIntent, data: DataSet): AnalyticsPayload {
  const range = resolveTimeRange(intent.timeRange);
  const need = requiredDatasets(intent);

  const filteredDeals = need.deals
    ? filterDeals(data.deals, {
        sectors: intent.sectors.length ? intent.sectors.map(canonical) : null,
        stages: intent.stages.length ? intent.stages : null,
        owners: intent.owners.length ? intent.owners : null,
        outcome: intent.outcome,
        range,
      })
    : [];

  const filteredWorkOrders = need.workOrders
    ? filterWorkOrders(data.workOrders, {
        sectors: intent.sectors.length ? intent.sectors.map(canonical) : null,
        owners: intent.owners.length ? intent.owners : null,
        range,
      })
    : [];

  const filters: string[] = [];
  if (intent.sectors.length) filters.push(`Sector: ${intent.sectors.join(", ")}`);
  if (intent.stages.length) filters.push(`Stage: ${intent.stages.join(", ")}`);
  if (intent.owners.length) filters.push(`Owner: ${intent.owners.join(", ")}`);
  if (intent.outcome) filters.push(`Outcome: ${intent.outcome}`);
  if (range.from || range.to) filters.push(`Period: ${range.label}`);

  return {
    pipeline: need.deals ? computePipelineMetrics(filteredDeals) : null,
    sales: need.deals ? computeSalesMetrics(filteredDeals) : null,
    operations: need.workOrders ? computeOperationsMetrics(filteredWorkOrders) : null,
    crossBoard:
      need.deals && need.workOrders ? computeCrossBoardAnalysis(filteredDeals, filteredWorkOrders) : null,
    quality: analyzeDataQuality(filteredDeals, filteredWorkOrders),
    timeRangeLabel: range.label,
    filtersApplied: filters,
  };
}

/** Sector strings from the model are normalized the same way board data is. */
function canonical(s: string): string {
  // Reuses the sector normalizer so "energy sector" from the user matches "Energy".
  // Imported lazily to keep this module's import graph small.

  return normalizeSectorSafe(s);
}

import { normalizeSector } from "./normalize";
function normalizeSectorSafe(s: string): string {
  return normalizeSector(s) ?? s;
}

/** Trims analytics down to what the narrative model actually needs. */
function payloadForModel(analytics: AnalyticsPayload) {
  const p = analytics.pipeline;
  const o = analytics.operations;
  return {
    period: analytics.timeRangeLabel,
    filters: analytics.filtersApplied,
    pipeline: p
      ? {
          dealCount: p.dealCount,
          totalPipeline: p.totalPipeline,
          weightedPipeline: p.weightedPipeline,
          weightedPipelineBasedOnDeals: p.weightedFromDeals,
          dealsExcludedFromWeighted: p.dealsExcludedFromWeighted,
          averageDealSize: p.averageDealSize,
          bySector: p.bySector.slice(0, 8),
          byStage: p.byStage.slice(0, 8),
          byOwner: p.byOwner.slice(0, 6),
          topOpportunities: p.topOpportunities.slice(0, 5).map((d) => ({
            name: d.name,
            company: d.company,
            sector: d.sector,
            stage: d.stage,
            value: d.value,
            probability: d.probability,
            expectedCloseDate: d.expectedCloseDate,
          })),
          dealsNeedingAttention: p.atRisk.slice(0, 5).map((d) => ({
            name: d.name,
            value: d.value,
            probability: d.probability,
            expectedCloseDate: d.expectedCloseDate,
            issues: d.dataQualityFlags,
          })),
        }
      : null,
    sales: analytics.sales,
    operations: o
      ? {
          total: o.total,
          active: o.active,
          completed: o.completed,
          delayed: o.delayed,
          onHold: o.onHold,
          unknownStatus: o.unknownStatus,
          averageCompletion: o.averageCompletion,
          completionSampleSize: o.completionSampleSize,
          totalValue: o.totalValue,
          bySector: o.bySector.slice(0, 8),
          byStatus: o.byStatus.slice(0, 8),
          needsAttention: o.needsAttention.slice(0, 5).map((w) => ({
            project: w.project,
            client: w.client,
            status: w.status,
            endDate: w.endDate,
            completionPercentage: w.completionPercentage,
            value: w.value,
          })),
        }
      : null,
    crossBoard: analytics.crossBoard,
    dataQuality: {
      score: analytics.quality.score,
      issues: analytics.quality.issues,
      caveats: analytics.quality.caveats,
    },
  };
}

async function extractIntent(options: AskOptions): Promise<{ intent: BiIntent; degraded: string | null }> {
  if (options.forceLeadershipUpdate) {
    return {
      degraded: null,
      intent: validateIntent({
        intent: "leadership_update",
        datasets: ["deals", "work_orders"],
        metrics: ["total_pipeline", "weighted_pipeline", "win_rate", "work_order_counts", "data_quality"],
        timeRange: { type: "all_time" },
      }).intent,
    };
  }

  if (!isAiConfigured()) {
    return {
      degraded: "AI query understanding is unavailable, so a general pipeline view is shown.",
      intent: validateIntent({
        intent: "pipeline_analysis",
        datasets: ["deals", "work_orders"],
        metrics: ["total_pipeline", "weighted_pipeline", "deal_count"],
        timeRange: { type: "all_time" },
      }).intent,
    };
  }

  const historyText = (options.history ?? [])
    .slice(-4)
    .map((m) => `${m.role === "user" ? "User" : "Analyst"}: ${m.content.slice(0, 400)}`)
    .join("\n");

  const raw = await generateJson(
    [
      { role: "system", content: INTENT_SYSTEM },
      {
        role: "user",
        content: `${historyText ? `Recent conversation:\n${historyText}\n\n` : ""}Question: ${options.question}`,
      },
    ],
    intentJsonSchema,
    "bi_intent",
  );

  const validated = validateIntent(raw);
  return {
    intent: validated.intent,
    degraded: validated.valid ? null : "The question was interpreted approximately.",
  };
}

export async function askAgent(options: AskOptions): Promise<AgentAnswer> {
  const question = options.question.trim();
  if (!question) {
    return {
      kind: "error",
      narrative: "",
      errorMessage: "Please enter a question.",
      assumptions: [],
      caveats: [],
      retryable: false,
    };
  }
  if (question.length > 1000) {
    return {
      kind: "error",
      narrative: "",
      errorMessage: "That question is too long. Please shorten it to under 1000 characters.",
      assumptions: [],
      caveats: [],
      retryable: false,
    };
  }

  let intent: BiIntent;
  let degraded: string | null = null;
  try {
    const extracted = await extractIntent(options);
    intent = extracted.intent;
    degraded = extracted.degraded;
  } catch (e) {
    if (e instanceof GeminiError) {
      degraded = e.userMessage;
      intent = validateIntent({
        intent: "pipeline_analysis",
        datasets: ["deals", "work_orders"],
        metrics: ["total_pipeline", "weighted_pipeline", "deal_count"],
        timeRange: { type: "all_time" },
      }).intent;
    } else {
      console.error("[agent] intent extraction failed", e);
      return {
        kind: "error",
        narrative: "",
        errorMessage: "I couldn't interpret that question right now. Please try again in a moment.",
        assumptions: [],
        caveats: [],
        retryable: true,
      };
    }
  }

  if (intent.intent === "clarification_needed") {
    return {
      kind: "clarification",
      narrative:
        intent.clarificationQuestion ??
        "I can give you an overall business view, a sales pipeline analysis, or a project-execution view. Which would you like?",
      clarificationOptions:
        intent.clarificationOptions.length > 0
          ? intent.clarificationOptions
          : ["Overall business view", "Sales pipeline analysis", "Project execution view"],
      intent,
      assumptions: intent.assumptions,
      caveats: [],
    };
  }

  if (intent.intent === "unsupported") {
    return {
      kind: "answer",
      narrative:
        "I can only answer questions about the Skylark sales pipeline and work-order execution data held in Monday.com. Try asking about pipeline, deals, sectors, or project delivery.",
      intent,
      assumptions: [],
      caveats: [],
    };
  }

  // ---- Deterministic stage -------------------------------------------------
  let data: DataSet;
  const need = requiredDatasets(intent);
  try {
    data = await loadDataSet({ deals: need.deals, workOrders: need.workOrders });
  } catch (e) {
    if (e instanceof MondayError) {
      console.error(`[agent] monday failure (${e.kind})`, e.message);
      return {
        kind: e.kind === "not_configured" ? "setup_required" : "error",
        narrative: "",
        errorMessage: e.userMessage,
        assumptions: [],
        caveats: [],
        retryable: e.kind !== "not_configured" && e.kind !== "auth",
      };
    }
    console.error("[agent] unexpected data load failure", e);
    return {
      kind: "error",
      narrative: "",
      errorMessage: "I couldn't retrieve the latest Monday.com data right now. Please try again in a moment.",
      assumptions: [],
      caveats: [],
      retryable: true,
    };
  }

  const analytics = computeForIntent(intent, data);
  const source = sourceMeta(data);

  if (source.recordsAnalyzed === 0) {
    return {
      kind: "answer",
      narrative:
        "## No records found\n\nThe connected Monday.com boards returned no items, so there is nothing to analyse yet. Once deals and work orders exist on the boards, this view will populate automatically.",
      intent,
      analytics,
      source,
      assumptions: intent.assumptions,
      caveats: [],
    };
  }

  // ---- Narrative stage -----------------------------------------------------
  const system = intent.intent === "leadership_update" ? LEADERSHIP_SYSTEM : NARRATIVE_SYSTEM;
  let narrative: string;
  try {
    narrative = await generateText([
      { role: "system", content: system },
      {
        role: "user",
        content: `Founder's question: ${question}

Interpreted as: ${JSON.stringify({ intent: intent.intent, sectors: intent.sectors, period: analytics.timeRangeLabel })}

Computed figures (the only permitted source of numbers):
${JSON.stringify(payloadForModel(analytics))}`,
      },
    ]);
  } catch (e) {
    const message = e instanceof GeminiError ? e.userMessage : "The AI explanation service is unavailable.";
    console.error("[agent] narrative generation failed", e);
    narrative = fallbackNarrative(analytics);
    degraded = message;
  }

  return {
    kind: "answer",
    narrative,
    intent,
    analytics,
    source,
    assumptions: intent.assumptions,
    caveats: analytics.quality.caveats,
    degraded,
  };
}

/** Deterministic prose used when Gemini is unavailable — numbers only, no insight claims. */
function fallbackNarrative(a: AnalyticsPayload): string {
  const lines: string[] = ["## Calculated figures", ""];
  if (a.pipeline) {
    lines.push(
      `- Deals analysed: **${a.pipeline.dealCount}**`,
      `- Total pipeline: **${a.pipeline.totalPipeline.toLocaleString("en-IN")}**`,
      `- Weighted pipeline: **${a.pipeline.weightedPipeline.toLocaleString("en-IN")}** (from ${a.pipeline.weightedFromDeals} deals)`,
    );
    if (a.pipeline.averageDealSize !== null) {
      lines.push(`- Average deal size: **${a.pipeline.averageDealSize.toLocaleString("en-IN")}**`);
    }
  }
  if (a.operations) {
    lines.push(
      `- Work orders: **${a.operations.total}** (${a.operations.active} active, ${a.operations.completed} completed, ${a.operations.delayed} delayed)`,
    );
  }
  if (a.quality.caveats.length) {
    lines.push("", "## Data quality", ...a.quality.caveats.map((c) => `- ${c}`));
  }
  lines.push("", "_Narrative analysis is temporarily unavailable; these figures are calculated directly from the live Monday.com data._");
  return lines.join("\n");
}
