/**
 * Server API layer (typed RPC).
 *
 * Thin wrappers only — every secret read and every network call happens
 * inside a handler, never at module scope, so nothing leaks to the client
 * bundle.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { AgentAnswer, OverviewSnapshot } from "./bi/agentTypes";
import type { ConnectionStatus } from "./bi/types";

export const getConnectionStatus = createServerFn({ method: "GET" }).handler(
  async (): Promise<ConnectionStatus> => {
    const { readMondayConfig } = await import("./monday.server");
    const { isAiConfigured } = await import("./gemini.server");
    const cfg = readMondayConfig();
    return {
      configured: cfg.ok,
      missingSecrets: cfg.ok ? [] : cfg.missing,
      aiConfigured: isAiConfigured(),
    };
  },
);

const snapshotInput = z.object({ forceRefresh: z.boolean().default(false) });

export const getSnapshot = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => snapshotInput.parse(input ?? {}))
  .handler(async ({ data }): Promise<OverviewSnapshot> => {
    const { readMondayConfig, MondayError } = await import("./monday.server");
    const { isAiConfigured } = await import("./gemini.server");
    const { loadDataSet } = await import("./bi/dataService.server");
    const {
      computePipelineMetrics,
      computeSalesMetrics,
      computeOperationsMetrics,
      computeCrossBoardAnalysis,
    } = await import("./bi/analytics");
    const { analyzeDataQuality } = await import("./bi/dataQuality");

    const cfg = readMondayConfig();
    const status: ConnectionStatus = {
      configured: cfg.ok,
      missingSecrets: cfg.ok ? [] : cfg.missing,
      aiConfigured: isAiConfigured(),
    };

    const empty: OverviewSnapshot = {
      status,
      source: null,
      pipeline: null,
      sales: null,
      operations: null,
      crossBoard: null,
      quality: null,
      boards: { deals: null, workOrders: null },
      topDeals: [],
      attentionDeals: [],
      attentionWorkOrders: [],
    };

    if (!cfg.ok) {
      return {
        ...empty,
        error: {
          message: "Monday.com is not connected yet.",
          kind: "not_configured",
          retryable: false,
        },
      };
    }

    try {
      const dataSet = await loadDataSet({ forceRefresh: data.forceRefresh });
      const pipeline = computePipelineMetrics(dataSet.deals);
      const operations = computeOperationsMetrics(dataSet.workOrders);

      return {
        status: { ...status, reachable: true, error: null },
        source: {
          boards: [
            ...(dataSet.dealsBoard
              ? [
                  {
                    name: dataSet.dealsBoard.boardName,
                    boardId: dataSet.dealsBoard.boardId,
                    records: dataSet.deals.length,
                  },
                ]
              : []),
            ...(dataSet.workOrdersBoard
              ? [
                  {
                    name: dataSet.workOrdersBoard.boardName,
                    boardId: dataSet.workOrdersBoard.boardId,
                    records: dataSet.workOrders.length,
                  },
                ]
              : []),
          ],
          recordsAnalyzed: dataSet.deals.length + dataSet.workOrders.length,
          retrievedAt: dataSet.retrievedAt,
          fromCache: dataSet.fromCache,
        },
        pipeline,
        sales: computeSalesMetrics(dataSet.deals),
        operations,
        crossBoard: computeCrossBoardAnalysis(dataSet.deals, dataSet.workOrders),
        quality: analyzeDataQuality(dataSet.deals, dataSet.workOrders),
        boards: { deals: dataSet.dealsBoard, workOrders: dataSet.workOrdersBoard },
        topDeals: pipeline.topOpportunities,
        attentionDeals: pipeline.atRisk,
        attentionWorkOrders: operations.needsAttention,
        error: null,
      };
    } catch (e) {
      const isMonday = e instanceof MondayError;
      console.error("[getSnapshot] failed", e);
      return {
        ...empty,
        status: { ...status, reachable: false },
        error: {
          message: isMonday
            ? e.userMessage
            : "I couldn't retrieve the latest Monday.com data right now. Please try again in a moment.",
          kind: isMonday ? e.kind : "unknown",
          retryable: isMonday ? e.kind !== "auth" && e.kind !== "not_configured" : true,
        },
      };
    }
  });

const askInput = z.object({
  question: z.string().min(1).max(1000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .max(10)
    .default([]),
});

export const askQuestion = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => askInput.parse(input))
  .handler(async ({ data }): Promise<AgentAnswer> => {
    const { askAgent } = await import("./bi/agent.server");
    try {
      return await askAgent({ question: data.question, history: data.history });
    } catch (e) {
      console.error("[askQuestion] unhandled failure", e);
      return {
        kind: "error",
        narrative: "",
        errorMessage: "Something went wrong while analysing that question. Please try again.",
        assumptions: [],
        caveats: [],
        retryable: true,
      };
    }
  });

export const prepareLeadershipUpdate = createServerFn({ method: "POST" }).handler(
  async (): Promise<AgentAnswer> => {
    const { askAgent } = await import("./bi/agent.server");
    try {
      return await askAgent({
        question: "Prepare a leadership update covering sales, operations, risks and data quality.",
        forceLeadershipUpdate: true,
      });
    } catch (e) {
      console.error("[prepareLeadershipUpdate] unhandled failure", e);
      return {
        kind: "error",
        narrative: "",
        errorMessage: "I couldn't prepare the leadership update right now. Please try again.",
        assumptions: [],
        caveats: [],
        retryable: true,
      };
    }
  },
);
