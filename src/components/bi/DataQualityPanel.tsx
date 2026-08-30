import { ShieldCheck, TriangleAlert } from "lucide-react";

import type { DataQualityReport } from "@/lib/bi/dataQuality";
import { SectionCard } from "./StateBlocks";

export function DataQualityPanel({ report }: { report: DataQualityReport }) {
  const warnings = report.issues.filter((i) => i.severity === "warning");
  const infos = report.issues.filter((i) => i.severity === "info");

  return (
    <SectionCard
      title="Data quality"
      description={`Counted from ${report.dealCount} deals and ${report.workOrderCount} work orders currently loaded.`}
      action={
        <span className="rounded-md border border-border bg-background/60 px-2.5 py-1 text-xs">
          <span className="text-muted-foreground">Clean records </span>
          <span className="metric-figure font-semibold">{report.score}%</span>
        </span>
      }
    >
      {report.issues.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-success">
          <ShieldCheck className="size-4" aria-hidden />
          No data-quality issues detected in the loaded records.
        </p>
      ) : (
        <ul className="space-y-2">
          {[...warnings, ...infos].slice(0, 8).map((issue) => (
            <li key={`${issue.scope}-${issue.flag}`} className="flex items-start gap-2 text-sm">
              <TriangleAlert
                className={`mt-0.5 size-3.5 shrink-0 ${issue.severity === "warning" ? "text-warning" : "text-muted-foreground"}`}
                aria-hidden
              />
              <span className="text-foreground/85">{issue.message}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground/70">Methodology:</span> {report.methodology} Currently{" "}
        {report.scoreInputs.cleanRecords} of {report.scoreInputs.totalRecords} records are flag-free.
      </p>

      {report.caveats.length > 0 ? (
        <div className="mt-4 rounded-lg border border-border bg-background/50 p-3">
          <p className="text-[11px] font-medium tracking-[0.09em] text-muted-foreground uppercase">
            Applied to every figure shown
          </p>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {report.caveats.map((c) => (
              <li key={c}>• {c}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </SectionCard>
  );
}
