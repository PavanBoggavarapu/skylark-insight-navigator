import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Database, RefreshCw, ShieldCheck } from "lucide-react";

import { AppShell, PageHeader } from "@/components/bi/AppShell";
import { DataQualityPanel } from "@/components/bi/DataQualityPanel";
import { DiagnosticsPanel } from "@/components/bi/DiagnosticsPanel";
import { ErrorState, PanelSkeleton, SectionCard, SetupRequired } from "@/components/bi/StateBlocks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSnapshot } from "@/hooks/useSnapshot";
import type { BoardMeta } from "@/lib/bi/types";
import { formatCount, formatTimestamp } from "@/lib/format";

export const Route = createFileRoute("/data-sources")({
  head: () => ({
    meta: [
      { title: "Data Sources — Skylark BI Agent" },
      {
        name: "description",
        content:
          "See exactly which Monday.com boards and columns feed each metric, plus the data-quality issues affecting them.",
      },
      { property: "og:title", content: "Data Sources — Skylark BI Agent" },
      {
        property: "og:description",
        content: "Board-to-metric transparency: mapped columns, unmapped columns and record counts.",
      },
    ],
  }),
  component: DataSourcesPage,
});

function BoardCard({ label, board }: { label: string; board: BoardMeta | null }) {
  if (!board) {
    return (
      <SectionCard title={label} description="Not loaded.">
        <p className="py-4 text-sm text-muted-foreground">
          This board has not been read yet, or the configured board ID returned no schema.
        </p>
      </SectionCard>
    );
  }

  const mapped = Object.entries(board.fieldMapping);

  return (
    <SectionCard
      title={label}
      description={`${board.boardName} · board ${board.boardId} · ${formatCount(board.itemCount)} items`}
      action={
        <Badge variant="outline" className="border-success/40 text-success">
          Read-only
        </Badge>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="text-[11px] font-medium tracking-[0.09em] text-muted-foreground uppercase">
            Column → canonical field
          </p>
          {mapped.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No columns could be mapped automatically.</p>
          ) : (
            <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {mapped.map(([column, field]) => (
                <li
                  key={column}
                  className="flex items-center justify-between gap-2 rounded-md border border-border bg-background/50 px-2.5 py-1.5 text-xs"
                >
                  <span className="truncate text-muted-foreground">{column}</span>
                  <span className="shrink-0 font-mono text-[11px] text-primary">{field}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {board.unmappedColumns.length > 0 ? (
          <div>
            <p className="text-[11px] font-medium tracking-[0.09em] text-muted-foreground uppercase">
              Unmapped columns (ignored in metrics)
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {board.unmappedColumns.map((c) => (
                <span key={c} className="rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                  {c}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <p className="text-xs text-muted-foreground">Schema read {formatTimestamp(board.retrievedAt)}.</p>
      </div>
    </SectionCard>
  );
}

function DataSourcesPage() {
  const { data, isPending, isFetching, error, refetch } = useSnapshot();
  const queryClient = useQueryClient();

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["bi", "snapshot"] });
    refetch();
  };

  return (
    <AppShell status={data?.status ?? null} retrievedAt={data?.source?.retrievedAt ?? null}>
      <PageHeader
        title="Data Sources"
        subtitle="Full transparency on where every number comes from. Column mapping is discovered from board schemas, so renamed columns are picked up automatically."
        action={
          <Button variant="outline" size="sm" onClick={refresh} disabled={isFetching}>
            <RefreshCw className={isFetching ? "size-3.5 animate-spin" : "size-3.5"} aria-hidden />
            Refresh
          </Button>
        }
      />

      {data && !data.status.configured ? (
        <SetupRequired missing={data.status.missingSecrets} />
      ) : error || data?.error ? (
        <ErrorState
          message={data?.error?.message ?? "I couldn't read the board schemas."}
          onRetry={refresh}
          retryable={data?.error?.retryable ?? true}
        />
      ) : isPending ? (
        <div className="space-y-4">
          <PanelSkeleton rows={5} title />
          <PanelSkeleton rows={5} title />
        </div>
      ) : (
        <div className="space-y-5">
          <div className="panel flex flex-wrap items-center gap-x-6 gap-y-2 p-4 text-sm">
            <span className="flex items-center gap-2">
              <Database className="size-4 text-primary" aria-hidden />
              {formatCount(data?.source?.recordsAnalyzed)} records loaded
            </span>
            <span className="text-muted-foreground">Retrieved {formatTimestamp(data?.source?.retrievedAt)}</span>
            <span className="text-muted-foreground">
              {data?.source?.fromCache ? "Served from the 60-second server cache" : "Fetched live"}
            </span>
            <span className="text-muted-foreground">
              AI narration {data?.status.aiConfigured ? "available" : "unavailable"}
            </span>
          </div>

          <BoardCard label="Deals board" board={data?.boards.deals ?? null} />
          <BoardCard label="Work Orders board" board={data?.boards.workOrders ?? null} />

          {data?.boards.deals ? <DiagnosticsPanel diagnostics={data.boards.deals.diagnostics} /> : null}
          {data?.boards.workOrders ? (
            <DiagnosticsPanel diagnostics={data.boards.workOrders.diagnostics} />
          ) : null}

          {data?.quality ? <DataQualityPanel report={data.quality} /> : null}

          <div className="panel flex items-start gap-3 p-4">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
            <p className="text-xs text-muted-foreground">
              The Monday.com API token lives only in server-side secrets and is never exposed to the browser. All
              GraphQL operations are queries — the app never writes to your boards. Metrics are computed in server code
              from the returned records; the AI layer receives only those computed figures, never raw credentials.
            </p>
          </div>
        </div>
      )}
    </AppShell>
  );
}
