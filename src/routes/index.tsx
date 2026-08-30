import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  BriefcaseBusiness,
  Gauge,
  HardHat,
  RefreshCw,
  Scale,
  TriangleAlert,
} from "lucide-react";

import { AppShell, PageHeader } from "@/components/bi/AppShell";
import { HorizontalBars, StatusDonut } from "@/components/bi/Charts";
import { DataQualityPanel } from "@/components/bi/DataQualityPanel";
import { KpiCard, KpiGrid } from "@/components/bi/KpiCard";
import { EmptyState, ErrorState, PanelSkeleton, SectionCard, SetupRequired } from "@/components/bi/StateBlocks";
import { Button } from "@/components/ui/button";
import { useSnapshot } from "@/hooks/useSnapshot";
import { formatCompactAmount, formatCount, formatPercent, formatTimestamp } from "@/lib/format";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Executive Overview — Skylark BI Agent" },
      {
        name: "description",
        content:
          "Live pipeline, weighted pipeline and project-execution KPIs for Skylark Drones, calculated from Monday.com boards.",
      },
      { property: "og:title", content: "Executive Overview — Skylark BI Agent" },
      {
        property: "og:description",
        content: "Live sales pipeline and delivery KPIs for founders, read directly from Monday.com.",
      },
    ],
  }),
  component: OverviewPage,
});

function OverviewPage() {
  const { data, isPending, isFetching, error, refetch } = useSnapshot();
  const queryClient = useQueryClient();

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["bi", "snapshot"] });
    refetch();
  };

  const pipeline = data?.pipeline;
  const operations = data?.operations;
  const sales = data?.sales;

  return (
    <AppShell status={data?.status ?? null} retrievedAt={data?.source?.retrievedAt ?? null}>
      <PageHeader
        title="Executive Overview"
        subtitle="AI-powered business intelligence for founders and executives. Every figure below is calculated in the server from live Monday.com records."
        action={
          <Button variant="outline" size="sm" onClick={refresh} disabled={isFetching}>
            <RefreshCw className={isFetching ? "size-3.5 animate-spin" : "size-3.5"} aria-hidden />
            {isFetching ? "Refreshing" : "Refresh"}
          </Button>
        }
      />

      {data && !data.status.configured ? (
        <SetupRequired missing={data.status.missingSecrets} />
      ) : error ? (
        <ErrorState message="I couldn't reach the analysis service. Please try again." onRetry={refresh} />
      ) : data?.error ? (
        <ErrorState message={data.error.message} onRetry={refresh} retryable={data.error.retryable} />
      ) : (
        <div className="space-y-5">
          <KpiGrid>
            <KpiCard
              label="Total pipeline"
              value={formatCompactAmount(pipeline?.totalPipeline)}
              sublabel="Sum of open + closed deal values"
              icon={Gauge}
              loading={isPending}
            />
            <KpiCard
              label="Weighted pipeline"
              value={formatCompactAmount(pipeline?.weightedPipeline)}
              sublabel={
                pipeline
                  ? `From ${formatCount(pipeline.weightedFromDeals)} deals with probability`
                  : "Value × probability"
              }
              icon={Scale}
              loading={isPending}
            />
            <KpiCard
              label="Open deals"
              value={formatCount(sales?.open.count)}
              sublabel={sales ? `${formatCount(sales.won.count)} won · ${formatCount(sales.lost.count)} lost` : undefined}
              icon={BriefcaseBusiness}
              loading={isPending}
            />
            <KpiCard
              label="Active work orders"
              value={formatCount(operations?.active)}
              sublabel={operations ? `${formatCount(operations.total)} total on the board` : undefined}
              icon={HardHat}
              tone="success"
              loading={isPending}
            />
            <KpiCard
              label="Delayed projects"
              value={formatCount(operations?.delayed)}
              sublabel="Status delayed or past end date"
              icon={TriangleAlert}
              tone={operations && operations.delayed > 0 ? "warning" : "default"}
              loading={isPending}
            />
          </KpiGrid>

          {isPending ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <PanelSkeleton title rows={5} />
              <PanelSkeleton title rows={5} />
            </div>
          ) : data && data.source?.recordsAnalyzed === 0 ? (
            <EmptyState
              title="Connected, but both boards are empty"
              description="Monday.com responded successfully and returned no items. Add deals and work orders to the boards and refresh."
            />
          ) : (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                <SectionCard title="Pipeline by sector" description="Total deal value grouped by normalized sector.">
                  <HorizontalBars data={pipeline?.bySector ?? []} />
                </SectionCard>
                <SectionCard title="Pipeline by stage" description="Where value currently sits in the funnel.">
                  <HorizontalBars data={pipeline?.byStage ?? []} />
                </SectionCard>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <SectionCard title="Work orders by status" description="Execution mix across the delivery board.">
                  <StatusDonut
                    data={(operations?.byStatus ?? []).map((s) => ({ key: s.key, value: s.value, count: s.count }))}
                  />
                </SectionCard>
                <SectionCard
                  title="Sales vs execution"
                  description="Sector concentration across both boards."
                  action={
                    <Link
                      to="/pipeline"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      Pipeline detail <ArrowRight className="size-3" aria-hidden />
                    </Link>
                  }
                >
                  {data?.crossBoard?.supported ? (
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                        <span>
                          Top sector share of pipeline:{" "}
                          <span className="metric-figure font-semibold text-foreground">
                            {formatPercent(data.crossBoard.salesConcentration)}
                          </span>
                        </span>
                        <span>
                          Top sector share of delivery:{" "}
                          <span className="metric-figure font-semibold text-foreground">
                            {formatPercent(data.crossBoard.operationsConcentration)}
                          </span>
                        </span>
                      </div>
                      <ul className="divide-y divide-border text-sm">
                        {data.crossBoard.rows.slice(0, 5).map((row) => (
                          <li key={row.sector} className="flex items-center justify-between gap-3 py-2">
                            <span className="truncate">{row.sector}</span>
                            <span className="metric-figure shrink-0 text-xs text-muted-foreground">
                              pipeline {formatCompactAmount(row.pipelineValue)} · delivery{" "}
                              {formatCompactAmount(row.workOrderValue)}
                            </span>
                          </li>
                        ))}
                      </ul>
                      {data.crossBoard.highPipelineLowExecution.length > 0 ? (
                        <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
                          Strong pipeline with little delivery activity:{" "}
                          {data.crossBoard.highPipelineLowExecution.join(", ")}.
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      {data?.crossBoard?.reason ?? "Cross-board comparison is not supported by the current data."}
                    </p>
                  )}
                </SectionCard>
              </div>

              {data?.quality ? <DataQualityPanel report={data.quality} /> : null}

              {data?.source ? (
                <p className="text-xs text-muted-foreground">
                  {formatCount(data.source.recordsAnalyzed)} records analysed across{" "}
                  {data.source.boards.length} Monday.com board{data.source.boards.length === 1 ? "" : "s"} · retrieved{" "}
                  {formatTimestamp(data.source.retrievedAt)}
                  {data.source.fromCache ? " (server cache, under 60s old)" : ""} · amounts shown as recorded in
                  Monday.com, without currency conversion.
                </p>
              ) : null}
            </>
          )}
        </div>
      )}
    </AppShell>
  );
}
