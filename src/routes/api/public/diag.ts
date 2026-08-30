import { createFileRoute } from "@tanstack/react-router";
import { loadDataSet } from "@/lib/bi/dataService.server";
export const Route = createFileRoute("/api/public/diag")({
  server: { handlers: { GET: async () => {
    const d = await loadDataSet({ forceRefresh: true });
    const yrs = (xs: (string|null)[]) => { const o: Record<string, number> = {}; for (const x of xs) o[x ? x.slice(0,4) : "null"] = (o[x ? x.slice(0,4) : "null"] ?? 0) + 1; return o; };
    return Response.json({
      dealCloseYears: yrs(d.deals.map((x) => x.expectedCloseDate)),
      woStartYears: yrs(d.workOrders.map((x) => x.startDate)),
      woEndYears: yrs(d.workOrders.map((x) => x.endDate)),
      energyDeals: d.deals.filter((x) => x.sector === "Energy").length,
      energyWO: d.workOrders.filter((x) => x.sector === "Energy").length,
      energyPipeline: d.deals.filter((x) => x.sector === "Energy").reduce((a, x) => a + (x.value ?? 0), 0),
    });
  } } },
});
