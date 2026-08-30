import { createFileRoute } from "@tanstack/react-router";

/** Temporary read-only diagnostics: board schema + raw value samples. No secrets returned. */
export const Route = createFileRoute("/api/public/_diag")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { readMondayConfig, getBoardItems } = await import("@/lib/monday.server");
        const cfg = readMondayConfig();
        if (!cfg.ok) return Response.json({ ok: false, missing: cfg.missing }, { status: 400 });
        const which = new URL(request.url).searchParams.get("board") ?? "deals";
        const boardId = which === "wo" ? cfg.config.workOrdersBoardId : cfg.config.dealsBoardId;
        const board = await getBoardItems(cfg.config, boardId);
        const perColumn = board.columns.map((c) => {
          const vals = board.items.map((i) => i.values[c.id]).filter((v) => v != null && String(v).trim() !== "");
          const uniq = Array.from(new Set(vals.map((v) => String(v)))).slice(0, 15);
          return { id: c.id, title: c.title, type: c.type, filled: vals.length, uniqueSample: uniq };
        });
        return Response.json({
          boardId: board.id,
          boardName: board.name,
          items: board.items.length,
          perColumn,
        });
      },
    },
  },
});
