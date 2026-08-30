import { createFileRoute } from "@tanstack/react-router";

import { loadDataSet } from "@/lib/bi/dataService.server";

export const Route = createFileRoute("/api/public/diag")({
  server: {
    handlers: {
      GET: async () => {
        const data = await loadDataSet({ forceRefresh: true });
        const tally = <T extends Record<string, unknown>>(rows: T[], key: keyof T) => {
          const out: Record<string, number> = {};
          for (const r of rows) out[String(r[key])] = (out[String(r[key])] ?? 0) + 1;
          return out;
        };
        return Response.json({
          dealsBoard: { id: data.dealsBoard?.boardId, name: data.dealsBoard?.boardName, total: data.deals.length },
          woBoard: { id: data.workOrdersBoard?.boardId, name: data.workOrdersBoard?.boardName, total: data.workOrders.length },
          dealSectors: tally(data.deals, "sector"),
          dealStages: tally(data.deals, "stage"),
          dealOutcomes: tally(data.deals, "outcome"),
          dealsWithValue: data.deals.filter((d) => d.value != null).length,
          woSectors: tally(data.workOrders, "sector"),
          woStatuses: tally(data.workOrders, "status"),
          woWithValue: data.workOrders.filter((w) => w.value != null).length,
        });
      },
    },
  },
});
