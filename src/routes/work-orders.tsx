import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, HardHat, PauseCircle, Percent, TriangleAlert } from "lucide-react";

import { AppShell, PageHeader } from "@/components/bi/AppShell";
import { HorizontalBars, StatusDonut } from "@/components/bi/Charts";
import { KpiCard, KpiGrid } from "@/components/bi/KpiCard";
import { EmptyState, ErrorState, PanelSkeleton, SectionCard, SetupRequired } from "@/components/bi/StateBlocks";
import { Progress } from "@/components/ui/progress";
import { useSnapshot } from "@/hooks/useSnapshot";
import { formatCompactAmount, formatCompletion, formatCount, formatDate } from "@/lib/format";

export const Route = createFileRoute("/work-orders")({
  head: () => ({
    meta: [
      { title: "Work Orders — Skylark BI Agent" },
      {
        name: "description",
        content:
          "Project execution health: active, delayed and completed work orders with completion rates from live Monday.com data.",
      },
      { property: "og:title", content: "Work Orders — Skylark BI Agent" },
      {
        property: "og:description",
        content: "Delivery status, delays and completion rates across Skylark drone projects.",
      },
    ],
  }),
  component: WorkOrdersPage,
});

function WorkOrdersPage() {
  const { data, isPending, error, refetch } = useSnapshot();
  const ops = data?.operations;

  return (
    <AppShell status={data?.status ?? null} retrievedAt={data?.source?.retrievedAt ?? null}>
      <PageHeader
        title="Work Orders"
        subtitle="Execution health across delivery projects. A project counts as delayed when its status says so or its end date has passed while still open."
      />

      {data && !data.status.configured ? (
        <SetupRequired missing={data.status.missingSecrets} />
      ) : error || data?.error ? (
        <ErrorState
          message={data?.error?.message ?? "I couldn't load work-order data."}
          onRetry={() => refetch()}
          retryable={data?.error?.retryable ?? true}
        />
      ) : isPending ? (
        <div className="space-y-4">
          <PanelSkeleton rows={3} />
          <PanelSkeleton rows={6} title />
        </div>
      ) : !ops || ops.total === 0 ? (
        <EmptyState
          title="No work orders found"
          description="The Work Orders board returned no records. Add projects in Monday.com and refresh this page."
        />
      ) : (
        <div className="space-y-5">
          <KpiGrid>
            <KpiCard label="Total work orders" value={formatCount(ops.total)} icon={HardHat} />
            <KpiCard label="Active" value={formatCount(ops.active)} icon={HardHat} tone="success" />
            <KpiCard
              label="Delayed"
              value={formatCount(ops.delayed)}
              icon={TriangleAlert}
              tone={ops.delayed > 0 ? "warning" : "default"}
            />
            <KpiCard label="Completed" value={formatCount(ops.completed)} icon={CheckCircle2} />
            <KpiCard
              label="Avg. completion"
              value={formatCompletion(ops.averageCompletion)}
              sublabel={`From ${formatCount(ops.completionSampleSize)} projects reporting progress`}
              icon={Percent}
            />
          </KpiGrid>

          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title="Status mix" description="Work orders grouped by normalized status.">
              <StatusDonut data={ops.byStatus.map((s) => ({ key: s.key, value: s.value, count: s.count }))} />
            </SectionCard>
            <SectionCard title="By sector" description="Project value delivered per sector.">
              <HorizontalBars data={ops.bySector} />
            </SectionCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="panel p-5 lg:col-span-1">
              <h2 className="font-display text-sm font-semibold tracking-tight">Portfolio value</h2>
              <p className="metric-figure mt-2 text-2xl font-semibold">{formatCompactAmount(ops.totalValue)}</p>
              <p className="mt-1 text-xs text-muted-foreground">Sum of work-order values as recorded.</p>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="flex items-center gap-2 text-muted-foreground">
                    <PauseCircle className="size-3.5" aria-hidden /> On hold
                  </dt>
                  <dd className="metric-figure">{formatCount(ops.onHold)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Cancelled</dt>
                  <dd className="metric-figure">{formatCount(ops.cancelled)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Unrecognised status</dt>
                  <dd className="metric-figure">{formatCount(ops.unknownStatus)}</dd>
                </div>
              </dl>
            </div>

            <SectionCard
              title="Projects needing attention"
              description="Delayed, overdue or stalled delivery work."
            >
              {ops.needsAttention.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No work orders are currently flagged for attention.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {ops.needsAttention.map((wo) => (
                    <li key={wo.id} className="py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{wo.project}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {[wo.client, wo.sector, wo.status].filter(Boolean).join(" · ") || "No details recorded"}
                          </p>
                        </div>
                        <p className="metric-figure shrink-0 text-xs text-muted-foreground">
                          Ends {formatDate(wo.endDate)}
                        </p>
                      </div>
                      {wo.completionPercentage !== null ? (
                        <div className="mt-2 flex items-center gap-2">
                          <Progress value={wo.completionPercentage} className="h-1.5" />
                          <span className="metric-figure w-10 shrink-0 text-right text-xs text-muted-foreground">
                            {formatCompletion(wo.completionPercentage)}
                          </span>
                        </div>
                      ) : (
                        <p className="mt-1.5 text-xs text-muted-foreground">No completion percentage recorded.</p>
                      )}
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
