import { createFileRoute } from "@tanstack/react-router";
import { BriefcaseBusiness, Gauge, Scale, Trophy } from "lucide-react";

import { AppShell, PageHeader } from "@/components/bi/AppShell";
import { HorizontalBars } from "@/components/bi/Charts";
import { KpiCard, KpiGrid } from "@/components/bi/KpiCard";
import { EmptyState, ErrorState, PanelSkeleton, SectionCard, SetupRequired } from "@/components/bi/StateBlocks";
import { Badge } from "@/components/ui/badge";
import { useSnapshot } from "@/hooks/useSnapshot";
import { formatCompactAmount, formatCount, formatDate, formatPercent } from "@/lib/format";

export const Route = createFileRoute("/pipeline")({
  head: () => ({
    meta: [
      { title: "Sales Pipeline — Skylark BI Agent" },
      {
        name: "description",
        content:
          "Pipeline value by sector, stage and owner, win rates and the deals that need attention, computed from live Monday.com deals.",
      },
      { property: "og:title", content: "Sales Pipeline — Skylark BI Agent" },
      {
        property: "og:description",
        content: "Weighted pipeline, win rate and top opportunities from live Monday.com deal records.",
      },
    ],
  }),
  component: PipelinePage,
});

function PipelinePage() {
  const { data, isPending, error, refetch } = useSnapshot();
  const pipeline = data?.pipeline;
  const sales = data?.sales;

  return (
    <AppShell status={data?.status ?? null} retrievedAt={data?.source?.retrievedAt ?? null}>
      <PageHeader
        title="Sales Pipeline"
        subtitle="Weighted pipeline is the sum of deal value × probability, counting only deals that record both."
      />

      {data && !data.status.configured ? (
        <SetupRequired missing={data.status.missingSecrets} />
      ) : error || data?.error ? (
        <ErrorState
          message={data?.error?.message ?? "I couldn't load pipeline data."}
          onRetry={() => refetch()}
          retryable={data?.error?.retryable ?? true}
        />
      ) : isPending ? (
        <div className="space-y-4">
          <PanelSkeleton rows={3} />
          <PanelSkeleton rows={6} title />
        </div>
      ) : !pipeline || pipeline.dealCount === 0 ? (
        <EmptyState
          title="No deals found"
          description="The Deals board returned no records. Add deals in Monday.com and refresh this page."
        />
      ) : (
        <div className="space-y-5">
          <KpiGrid>
            <KpiCard
              label="Total pipeline"
              value={formatCompactAmount(pipeline.totalPipeline)}
              sublabel={`${formatCount(pipeline.dealCount)} deals`}
              icon={Gauge}
            />
            <KpiCard
              label="Weighted pipeline"
              value={formatCompactAmount(pipeline.weightedPipeline)}
              sublabel={`${formatCount(pipeline.dealsExcludedFromWeighted)} deals excluded (no probability)`}
              icon={Scale}
            />
            <KpiCard
              label="Average deal size"
              value={formatCompactAmount(pipeline.averageDealSize)}
              sublabel={`${formatCount(pipeline.dealsWithoutValue)} deals have no value`}
              icon={BriefcaseBusiness}
            />
            <KpiCard
              label="Win rate"
              value={formatPercent(sales?.winRate)}
              sublabel={sales ? `Across ${formatCount(sales.decidedCount)} decided deals` : undefined}
              icon={Trophy}
              tone="success"
            />
            <KpiCard
              label="Open value"
              value={formatCompactAmount(sales?.open.value)}
              sublabel={sales ? `${formatCount(sales.open.count)} open deals` : undefined}
              icon={Gauge}
            />
          </KpiGrid>

          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title="By sector" description="Total deal value per sector.">
              <HorizontalBars data={pipeline.bySector} />
            </SectionCard>
            <SectionCard title="By stage" description="Value distribution across the funnel.">
              <HorizontalBars data={pipeline.byStage} />
            </SectionCard>
          </div>

          <SectionCard title="By owner" description="Pipeline ownership concentration.">
            <HorizontalBars data={pipeline.byOwner} emptyMessage="No deal owners are recorded on the board." />
          </SectionCard>

          {sales && sales.sectorPerformance.length > 0 ? (
            <SectionCard title="Sector performance" description="Won, lost and open deals per sector.">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-[11px] tracking-[0.08em] text-muted-foreground uppercase">
                      <th className="py-2 pr-3 font-medium">Sector</th>
                      <th className="py-2 pr-3 text-right font-medium">Won</th>
                      <th className="py-2 pr-3 text-right font-medium">Lost</th>
                      <th className="py-2 pr-3 text-right font-medium">Open</th>
                      <th className="py-2 pr-3 text-right font-medium">Won value</th>
                      <th className="py-2 text-right font-medium">Win rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {sales.sectorPerformance.map((row) => (
                      <tr key={row.sector}>
                        <td className="py-2 pr-3">{row.sector}</td>
                        <td className="metric-figure py-2 pr-3 text-right">{formatCount(row.won)}</td>
                        <td className="metric-figure py-2 pr-3 text-right">{formatCount(row.lost)}</td>
                        <td className="metric-figure py-2 pr-3 text-right">{formatCount(row.open)}</td>
                        <td className="metric-figure py-2 pr-3 text-right">{formatCompactAmount(row.wonValue)}</td>
                        <td className="metric-figure py-2 text-right">{formatPercent(row.winRate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title="Top opportunities" description="Largest open deals by value.">
              {pipeline.topOpportunities.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No open deals with a value.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {pipeline.topOpportunities.map((deal) => (
                    <li key={deal.id} className="flex items-start justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{deal.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[deal.company, deal.sector, deal.stage].filter(Boolean).join(" · ") || "No details recorded"}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="metric-figure text-sm font-semibold">{formatCompactAmount(deal.value)}</p>
                        <p className="text-xs text-muted-foreground">
                          {deal.probability === null ? "No probability" : formatPercent(deal.probability)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard title="Deals needing attention" description="Past expected close date or missing key fields.">
              {pipeline.atRisk.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No open deals are flagged for attention.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {pipeline.atRisk.map((deal) => (
                    <li key={deal.id} className="flex items-start justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{deal.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Close {formatDate(deal.expectedCloseDate)} · {formatCompactAmount(deal.value)}
                        </p>
                      </div>
                      {deal.dataQualityFlags.length > 0 ? (
                        <Badge variant="outline" className="shrink-0 border-warning/40 text-warning">
                          {deal.dataQualityFlags.length} flag{deal.dataQualityFlags.length === 1 ? "" : "s"}
                        </Badge>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>
        </div>
      )}
    </AppShell>
  );
}
