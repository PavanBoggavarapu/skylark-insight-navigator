import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  Database,
  Gauge,
  HardHat,
  MessageSquareText,
  PanelsTopLeft,
  Radar,
} from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { ConnectionBadge } from "./ConnectionBadge";
import type { ConnectionStatus } from "@/lib/bi/types";

const NAV = [
  { to: "/", label: "Overview", icon: PanelsTopLeft },
  { to: "/ai-analyst", label: "AI Analyst", icon: MessageSquareText },
  { to: "/pipeline", label: "Pipeline", icon: Gauge },
  { to: "/work-orders", label: "Work Orders", icon: HardHat },
  { to: "/leadership-update", label: "Leadership Update", icon: Activity },
  { to: "/data-sources", label: "Data Sources", icon: Database },
] as const;

export function AppShell({
  children,
  status,
  retrievedAt,
}: {
  children: ReactNode;
  status?: ConnectionStatus | null;
  retrievedAt?: string | null;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-screen lg:flex">
      <aside className="border-b border-sidebar-border bg-sidebar/80 backdrop-blur lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:shrink-0 lg:border-r lg:border-b-0">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
            <Radar className="size-5" aria-hidden />
          </span>
          <div className="leading-tight">
            <p className="font-display text-sm font-semibold tracking-tight">Skylark BI Agent</p>
            <p className="text-[11px] text-muted-foreground">Executive intelligence</p>
          </div>
        </div>

        <nav aria-label="Primary" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_2px_0_0_0_var(--color-primary)]"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden px-5 pb-5 lg:block">
          <ConnectionBadge status={status} retrievedAt={retrievedAt} />
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6 lg:py-9">
          <div className="mb-5 lg:hidden">
            <ConnectionBadge status={status} retrievedAt={retrievedAt} />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle ? <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {action}
    </header>
  );
}
