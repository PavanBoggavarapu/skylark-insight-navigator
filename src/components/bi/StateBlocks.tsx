import { AlertTriangle, Inbox, KeyRound, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function ErrorState({
  message,
  onRetry,
  retryable = true,
}: {
  message: string;
  onRetry?: () => void;
  retryable?: boolean;
}) {
  return (
    <div className="panel flex flex-col items-start gap-3 border-destructive/35 bg-destructive/5 p-5">
      <div className="flex items-center gap-2 text-destructive">
        <AlertTriangle className="size-4" aria-hidden />
        <p className="text-sm font-semibold">Something went wrong</p>
      </div>
      <p className="text-sm text-muted-foreground">{message}</p>
      {retryable && onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="size-3.5" aria-hidden />
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="panel flex flex-col items-center gap-2 px-6 py-12 text-center">
      <Inbox className="size-6 text-muted-foreground" aria-hidden />
      <p className="text-sm font-semibold">{title}</p>
      <p className="max-w-md text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

/**
 * Shown whenever Monday.com credentials are absent. We deliberately do NOT
 * fall back to sample data — an unconfigured app must look unconfigured.
 */
export function SetupRequired({ missing }: { missing: string[] }) {
  return (
    <div className="panel border-warning/35 bg-warning/5 p-6">
      <div className="flex items-center gap-2 text-warning">
        <KeyRound className="size-4" aria-hidden />
        <h2 className="text-sm font-semibold">Monday.com connection required</h2>
      </div>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
        This application reads every figure live from your Monday.com boards. No sample or cached business
        data is bundled, so nothing can be displayed until read-only API access is configured on the server.
      </p>
      <div className="mt-4 rounded-lg border border-border bg-background/60 p-4">
        <p className="text-[11px] font-medium tracking-[0.09em] text-muted-foreground uppercase">
          Missing server secrets
        </p>
        <ul className="mt-2 space-y-1.5 font-mono text-xs">
          {(missing.length
            ? missing
            : ["MONDAY_API_TOKEN", "MONDAY_DEALS_BOARD_ID", "MONDAY_WORK_ORDERS_BOARD_ID"]
          ).map((key) => (
            <li key={key} className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-warning" aria-hidden />
              {key}
            </li>
          ))}
        </ul>
      </div>
      <ol className="mt-4 space-y-1.5 text-sm text-muted-foreground">
        <li>1. Create a personal API token in Monday.com (Admin → API). Read access is sufficient.</li>
        <li>2. Copy the numeric board IDs for the Deals and Work Orders boards from their board URLs.</li>
        <li>3. Store all three as server-side secrets, then reload this page.</li>
      </ol>
      <p className="mt-4 text-xs text-muted-foreground">
        Secrets stay on the server. The token is never sent to the browser and the integration is read-only —
        the app issues no Monday.com mutations.
      </p>
    </div>
  );
}

export function PanelSkeleton({ rows = 4, title }: { rows?: number; title?: string }) {
  return (
    <div className="panel p-5">
      {title ? <Skeleton className="mb-4 h-4 w-40" /> : null}
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    </div>
  );
}

export function SectionCard({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="panel p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-sm font-semibold tracking-tight">{title}</h2>
          {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
