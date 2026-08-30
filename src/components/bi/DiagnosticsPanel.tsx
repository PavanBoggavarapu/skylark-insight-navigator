import { useState } from "react";
import { Bug, Table2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { BoardDiagnostics } from "@/lib/bi/types";
import { formatCount, formatTimestamp } from "@/lib/format";
import { SectionCard } from "./StateBlocks";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background/50 px-2.5 py-2">
      <p className="text-[10px] tracking-[0.09em] text-muted-foreground uppercase">{label}</p>
      <p className="metric-figure mt-0.5 text-sm font-semibold">{value}</p>
    </div>
  );
}

/**
 * Read-only diagnostics for one board: how it was retrieved, which Monday
 * column id backs each application field, and the raw label distributions
 * behind every status/stage metric. No credentials are ever included.
 */
export function DiagnosticsPanel({ diagnostics }: { diagnostics: BoardDiagnostics }) {
  const [debug, setDebug] = useState(false);
  const d = diagnostics;

  return (
    <SectionCard
      title={`${d.role === "deals" ? "Deals" : "Work Orders"} board diagnostics`}
      description={`${d.boardName} · board ${d.boardId}`}
      action={
        <Button variant="outline" size="sm" onClick={() => setDebug((v) => !v)}>
          <Bug className="size-3.5" aria-hidden />
          {debug ? "Hide debug mode" : "Debug mode"}
        </Button>
      }
    >
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Items retrieved" value={formatCount(d.itemsRetrieved)} />
        <Stat label="API pages" value={formatCount(d.pagesRetrieved)} />
        <Stat label="Header rows skipped" value={formatCount(d.rowsSkipped)} />
        <Stat label="Columns mapped" value={formatCount(d.mappings.length)} />
        <Stat label="Retrieved" value={formatTimestamp(d.retrievedAt)} />
      </div>

      <div className="mt-4">
        <p className="text-[11px] font-medium tracking-[0.09em] text-muted-foreground uppercase">
          Column id → title → type → application field
        </p>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr className="border-b border-border">
                <th className="py-1.5 pr-3 text-left font-medium">Column ID</th>
                <th className="py-1.5 pr-3 text-left font-medium">Title</th>
                <th className="py-1.5 pr-3 text-left font-medium">Type</th>
                <th className="py-1.5 pr-3 text-left font-medium">Field</th>
                <th className="py-1.5 text-right font-medium">Filled</th>
              </tr>
            </thead>
            <tbody>
              {d.mappings.map((m) => (
                <tr key={m.columnId} className="border-b border-border/50 last:border-0">
                  <td className="py-1.5 pr-3 font-mono text-[11px] text-muted-foreground">{m.columnId}</td>
                  <td className="py-1.5 pr-3">{m.columnTitle}</td>
                  <td className="py-1.5 pr-3 text-muted-foreground">{m.columnType}</td>
                  <td className="py-1.5 pr-3 font-mono text-[11px] text-primary">{m.field}</td>
                  <td className="metric-figure py-1.5 text-right">{formatCount(m.filled)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ValueList title="Status values (raw → bucket)" rows={d.statusValues} />
        {d.stageValues.length > 0 ? <ValueList title="Stage values (raw → outcome)" rows={d.stageValues} /> : null}
        <ValueList
          title={`Sector values (raw → normalized) · Energy matches: ${formatCount(d.energyMatches)}`}
          rows={d.sectorValues}
        />
      </div>

      <div className="mt-4">
        <p className="text-[11px] font-medium tracking-[0.09em] text-muted-foreground uppercase">Field validity</p>
        <ul className="mt-2 grid gap-1.5 sm:grid-cols-3">
          {d.validity.map((v) => (
            <li key={v.field} className="rounded-md border border-border bg-background/50 px-2.5 py-2 text-xs">
              <p className="font-medium">{v.field}</p>
              <p className="mt-0.5 text-muted-foreground">
                {formatCount(v.valid)} valid · {formatCount(v.invalid)} unreadable · {formatCount(v.missing)} missing
              </p>
            </li>
          ))}
        </ul>
      </div>

      {debug ? (
        <div className="mt-4 rounded-lg border border-dashed border-border bg-background/60 p-3">
          <p className="flex items-center gap-2 text-[11px] font-medium tracking-[0.09em] text-muted-foreground uppercase">
            <Table2 className="size-3.5" aria-hidden />
            Debug: normalized categories
          </p>
          <pre className="mt-2 max-h-72 overflow-auto font-mono text-[11px] leading-relaxed text-muted-foreground">
{JSON.stringify(
  {
    board: { id: d.boardId, name: d.boardName, role: d.role, pages: d.pagesRetrieved },
    statusBuckets: bucketTotals(d.statusValues),
    stageBuckets: bucketTotals(d.stageValues),
    rawStatus: d.statusValues,
    rawStage: d.stageValues,
    rawSectors: d.sectorValues.map((s) => ({ raw: s.raw, count: s.count })),
    normalizedSectors: bucketTotals(d.sectorValues),
    energyMatches: d.energyMatches,
  },
  null,
  2,
)}
          </pre>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Diagnostics are derived from board metadata and record values only — the Monday.com API token is never
            sent to the browser.
          </p>
        </div>
      ) : null}
    </SectionCard>
  );
}

function bucketTotals(rows: { bucket: string; count: number }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[r.bucket] = (out[r.bucket] ?? 0) + r.count;
  return out;
}

function ValueList({ title, rows }: { title: string; rows: { raw: string; normalized: string | null; bucket: string; count: number }[] }) {
  return (
    <div>
      <p className="text-[11px] font-medium tracking-[0.09em] text-muted-foreground uppercase">{title}</p>
      <ul className="mt-2 space-y-1">
        {rows.map((r) => (
          <li
            key={r.raw}
            className="flex items-center justify-between gap-2 rounded-md border border-border bg-background/50 px-2.5 py-1.5 text-xs"
          >
            <span className="truncate">
              {r.raw}
              {r.normalized && r.normalized !== r.raw ? (
                <span className="text-muted-foreground"> → {r.normalized}</span>
              ) : null}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <Badge variant="outline" className="font-mono text-[10px]">
                {r.bucket}
              </Badge>
              <span className="metric-figure">{formatCount(r.count)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
