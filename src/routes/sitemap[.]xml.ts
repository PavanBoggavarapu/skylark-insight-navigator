import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

const BASE_URL = "https://skylark-insight-navigator.lovable.app";

const PATHS = [
  "/",
  "/ai-analyst",
  "/pipeline",
  "/work-orders",
  "/leadership-update",
  "/data-sources",
];

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const urls = PATHS.map(
          (p) =>
            [
              "  <url>",
              `    <loc>${BASE_URL}${p}</loc>`,
              "    <changefreq>weekly</changefreq>",
              `    <priority>${p === "/" ? "1.0" : "0.8"}</priority>`,
              "  </url>",
            ].join("\n"),
        );

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
