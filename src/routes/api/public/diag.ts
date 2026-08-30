import { createFileRoute } from "@tanstack/react-router";

import { loadDataSet } from "@/lib/bi/dataService.server";

export const Route = createFileRoute("/api/public/diag")({
  server: {
    handlers: {
      GET: async () => {
        const data = await loadDataSet();
        const tally = (rows: { sector: string | null; sectorRaw: string | null }[]) => {
          const raw: Record<string, number> = {};
          const norm: Record<string, number> = {};
          for (const r of rows) {
            raw[String(r.sectorRaw)] = (raw[String(r.sectorRaw)] ?? 0) + 1;
            norm[String(r.sector)] = (norm[String(r.sector)] ?? 0) + 1;
          }
          return { raw, norm, total: rows.length };
        };
        return Response.json({
          deals: tally(data.deals),
          workOrders: tally(data.workOrders),
        });
      },
    },
  },
});
