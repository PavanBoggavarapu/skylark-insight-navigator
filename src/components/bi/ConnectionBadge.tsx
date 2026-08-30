import { AlertTriangle, PlugZap, Wifi } from "lucide-react";

import { relativeTime } from "@/lib/format";
import type { ConnectionStatus } from "@/lib/bi/types";

export function ConnectionBadge({
  status,
  retrievedAt,
}: {
  status?: ConnectionStatus | null;
  retrievedAt?: string | null;
}) {
  if (!status) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted-foreground">
        <span className="size-2 rounded-full bg-muted-foreground/50" />
        Checking Monday.com…
      </div>
    );
  }

  if (!status.configured) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
        <PlugZap className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>
          <span className="font-semibold">Monday.com connection required</span>
          <span className="mt-0.5 block text-warning/80">Setup needed before live data can be read.</span>
        </span>
      </div>
    );
  }

  if (status.reachable === false) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>
          <span className="font-semibold">Monday.com unreachable</span>
          <span className="mt-0.5 block opacity-80">Showing no data until the connection recovers.</span>
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 rounded-lg border border-success/35 bg-success/10 px-3 py-2 text-xs">
      <span className="mt-1 size-2 shrink-0 rounded-full bg-success live-dot" aria-hidden />
      <span>
        <span className="font-semibold text-success">Monday.com connected</span>
        <span className="mt-0.5 flex items-center gap-1 text-muted-foreground">
          <Wifi className="size-3" aria-hidden />
          {retrievedAt ? `Retrieved ${relativeTime(retrievedAt)}` : "Live read-only access"}
        </span>
      </span>
    </div>
  );
}
