import { createFileRoute } from "@tanstack/react-router";
import { loadDataSet } from "@/lib/bi/dataService.server";
export const Route = createFileRoute("/api/public/diag")({
  server: { handlers: { GET: async () => {
    const d = await loadDataSet({ forceRefresh: true });
    const t = (xs: (string|null)[]) => { const o: Record<string, number> = {}; for (const x of xs) { const k = x ?? "(blank)"; o[k] = (o[k] ?? 0) + 1; } return Object.entries(o).sort((a,b)=>b[1]-a[1]); };
    const wo = d.workOrders;
    return Response.json({
      woMappings: d.workOrdersBoard?.diagnostics?.mappings,
      rawStatus: t(wo.map((w) => w.statusRaw)),
      normStatus: t(wo.map((w) => w.status)),
      bucket: t(wo.map((w) => w.statusBucket)),
      sampleRawKeys: Object.keys(wo[0]?.rawData ?? {}).length,
      sample: wo.slice(0, 2).map((w) => w.rawData),
    });
  } } },
});
