import { createFileRoute } from "@tanstack/react-router";
import { loadDataSet } from "@/lib/bi/dataService.server";
import { getBoardItems, readMondayConfig } from "@/lib/monday.server";

export const Route = createFileRoute("/api/public/diag")({
  server: {
    handlers: {
      GET: async () => {
        const cfg = readMondayConfig();
        if (!cfg.ok) return Response.json({ error: "not_configured", missing: cfg.missing }, { status: 400 });

        const [rawDeals, rawWo] = await Promise.all([
          getBoardItems(cfg.config, cfg.config.dealsBoardId),
          getBoardItems(cfg.config, cfg.config.workOrdersBoardId),
        ]);
        const d = await loadDataSet({ forceRefresh: true });

        return Response.json({
          raw: {
            deals: { id: rawDeals.id, name: rawDeals.name, items: rawDeals.items.length, pages: rawDeals.pagesRetrieved },
            workOrders: { id: rawWo.id, name: rawWo.name, items: rawWo.items.length, pages: rawWo.pagesRetrieved },
          },
          droppedSamples: (() => {
            const titleById = new Map(rawWo.columns.map((c) => [c.id, c.title.trim().toLowerCase()]));
            return rawWo.items.filter((item) => {
              let e = 0;
              for (const [cid, v] of Object.entries(item.values)) {
                if (!v || String(v).trim() === "") continue;
                if (titleById.get(cid) === String(v).trim().toLowerCase()) e += 1;
              }
              return e >= 2;
            }).map((i) => ({ id: i.id, name: i.name, values: i.values }));
          })(),
          mapped: {
            deals: d.deals.length,
            workOrders: d.workOrders.length,
            combined: d.deals.length + d.workOrders.length,
            dealsSkipped: d.dealsBoard?.diagnostics.rowsSkipped,
            woSkipped: d.workOrdersBoard?.diagnostics.rowsSkipped,
          },
        });
      },
    },
  },
});
