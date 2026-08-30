import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatCompactAmount, formatCount } from "@/lib/format";

const SERIES = ["var(--color-chart-1)", "var(--color-chart-2)", "var(--color-chart-3)", "var(--color-chart-4)", "var(--color-chart-5)"];

interface Datum {
  key: string;
  value: number;
  count: number;
}

function TooltipBox({
  active,
  payload,
  mode,
}: {
  active?: boolean;
  payload?: { payload: Datum }[];
  mode: "value" | "count";
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold">{d.key}</p>
      <p className="mt-0.5 text-muted-foreground">
        {mode === "value" ? `Value ${formatCompactAmount(d.value)}` : `${formatCount(d.count)} records`}
      </p>
      {mode === "value" ? (
        <p className="text-muted-foreground">{formatCount(d.count)} records</p>
      ) : null}
    </div>
  );
}

export function HorizontalBars({
  data,
  mode = "value",
  emptyMessage = "No data available for this breakdown.",
}: {
  data: Datum[];
  mode?: "value" | "count";
  emptyMessage?: string;
}) {
  const rows = data.filter((d) => (mode === "value" ? d.value > 0 : d.count > 0)).slice(0, 8);
  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(160, rows.length * 38)}>
      <BarChart data={rows} layout="vertical" margin={{ left: 4, right: 12, top: 4, bottom: 4 }}>
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="key"
          width={116}
          tickLine={false}
          axisLine={false}
          tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }}
        />
        <Tooltip cursor={{ fill: "var(--color-accent)", opacity: 0.35 }} content={<TooltipBox mode={mode} />} />
        <Bar dataKey={mode === "value" ? "value" : "count"} radius={[0, 5, 5, 0]} maxBarSize={20}>
          {rows.map((row, i) => (
            <Cell key={row.key} fill={SERIES[i % SERIES.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function StatusDonut({ data }: { data: Datum[] }) {
  const rows = data.filter((d) => d.count > 0).slice(0, 6);
  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No work-order statuses to chart.</p>;
  }
  return (
    <div className="flex flex-wrap items-center gap-4">
      <ResponsiveContainer width={168} height={168}>
        <PieChart>
          <Pie data={rows} dataKey="count" nameKey="key" innerRadius={48} outerRadius={78} paddingAngle={2} strokeWidth={0}>
            {rows.map((row, i) => (
              <Cell key={row.key} fill={SERIES[i % SERIES.length]} />
            ))}
          </Pie>
          <Tooltip content={<TooltipBox mode="count" />} />
        </PieChart>
      </ResponsiveContainer>
      <ul className="min-w-40 flex-1 space-y-1.5">
        {rows.map((row, i) => (
          <li key={row.key} className="flex items-center justify-between gap-3 text-xs">
            <span className="flex items-center gap-2 text-muted-foreground">
              <span className="size-2 rounded-full" style={{ background: SERIES[i % SERIES.length] }} aria-hidden />
              {row.key}
            </span>
            <span className="metric-figure font-medium">{formatCount(row.count)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
