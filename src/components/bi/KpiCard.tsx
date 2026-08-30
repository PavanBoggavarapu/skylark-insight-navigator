import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export function KpiCard({
  label,
  value,
  sublabel,
  icon: Icon,
  tone = "default",
  loading,
}: {
  label: string;
  value: ReactNode;
  sublabel?: ReactNode;
  icon?: LucideIcon;
  tone?: "default" | "warning" | "success" | "destructive";
  loading?: boolean;
}) {
  const toneRing = {
    default: "text-primary bg-primary/12 ring-primary/25",
    warning: "text-warning bg-warning/12 ring-warning/25",
    success: "text-success bg-success/12 ring-success/25",
    destructive: "text-destructive bg-destructive/12 ring-destructive/25",
  }[tone];

  return (
    <div className="panel p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-medium tracking-[0.09em] text-muted-foreground uppercase">{label}</p>
        {Icon ? (
          <span className={cn("flex size-8 items-center justify-center rounded-lg ring-1", toneRing)}>
            <Icon className="size-4" aria-hidden />
          </span>
        ) : null}
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-8 w-24" />
      ) : (
        <p className="metric-figure mt-2.5 text-2xl font-semibold sm:text-[1.75rem]">{value}</p>
      )}
      {sublabel ? <p className="mt-1.5 text-xs text-muted-foreground">{sublabel}</p> : null}
    </div>
  );
}

export function KpiGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{children}</div>;
}
