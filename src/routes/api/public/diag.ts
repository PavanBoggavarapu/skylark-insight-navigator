import { createFileRoute } from "@tanstack/react-router";

/** Temporary verification endpoint (removed after the audit). No secrets returned. */
export const Route = createFileRoute("/api/public/diag")({
  server: {
    handlers: {
      GET: async () => {
        const { loadDataSet } = await import("@/lib/bi/dataService.server");
        const { computePipelineMetrics, computeSalesMetrics, computeOperationsMetrics } = await import(
          "@/lib/bi/analytics"
        );
        const { analyzeDataQuality } = await import("@/lib/bi/dataQuality");
        const ds = await loadDataSet({ forceRefresh: true });
        const p = computePipelineMetrics(ds.deals);
        const s = computeSalesMetrics(ds.deals);
        const o = computeOperationsMetrics(ds.workOrders);
        return Response.json({
          deals: ds.deals.length,
          workOrders: ds.workOrders.length,
          dealsBoard: ds.dealsBoard?.diagnostics,
          woBoard: ds.workOrdersBoard?.diagnostics,
          pipeline: {
            total: p.totalPipeline,
            weighted: p.weightedPipeline,
            weightedFrom: p.weightedFromDeals,
            excluded: p.dealsExcludedFromWeighted,
            byStage: p.byStage.map((b) => [b.key, b.count, b.value]),
            bySector: p.bySector.map((b) => [b.key, b.count, b.value]),
          },
          sales: { won: s.won, lost: s.lost, open: s.open, unknown: s.unknown, winRate: s.winRate },
          ops: {
            total: o.total,
            active: o.active,
            notStarted: o.notStarted,
            completed: o.completed,
            delayed: o.delayed,
            onHold: o.onHold,
            cancelled: o.cancelled,
            unknown: o.unknownStatus,
          },
          quality: analyzeDataQuality(ds.deals, ds.workOrders).score,
        });
      },
    },
  },
});
