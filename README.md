# Skylark Drones — Monday.com Business Intelligence Agent

A conversational Business Intelligence (BI) agent that connects **live** to two Monday.com boards (Deals and Work Orders), computes business metrics **deterministically** from the source data, and uses Google Gemini strictly for natural-language understanding and executive-level interpretation.

Built as a full-stack TypeScript application (TanStack Start / React 19) for the Skylark Drones Full Stack Developer technical assignment.

> **Hosted prototype:** https://skylark-insight-navigator.lovable.app

---

## 1. Project Overview

Founders and executives at Skylark Drones track their commercial pipeline and project portfolio in Monday.com. This application turns those two boards into a question-answering BI system: a founder asks a question in plain English ("How's our Energy pipeline looking?"), and the agent retrieves the live board data, normalizes it, calculates the metrics in code, and asks Gemini to write the executive narrative around those verified numbers.

The design principle throughout: **numbers come from deterministic code, not from the language model.** Gemini never computes a metric; it only interprets metrics that have already been computed.

## 2. Problem Statement

Executive questions about pipeline, revenue, sector performance, and work orders require a human to manually inspect two Monday.com boards, reconcile inconsistent labels, and synthesize a defensible answer. Raw board data is messy — inconsistent sector names, mixed commercial/operational status labels, missing probabilities and dates — so naive aggregation produces wrong numbers, and naive LLM aggregation produces *invented* numbers.

## 3. Solution

A three-layer architecture that separates concerns:

1. **Deterministic data layer** — Monday.com GraphQL retrieval, schema-discovering board mapper, normalization, and an analytics engine that computes all metrics in TypeScript.
2. **AI layer** — Gemini (via an AI gateway) performs intent extraction (question → structured query plan) and narrative generation (metrics → executive prose). It is never asked to do arithmetic on raw data.
3. **Presentation layer** — a React dashboard (Executive Overview, Pipeline, Work Orders, AI Analyst chat, Leadership Update, Data Sources) that renders the same deterministic metrics the agent uses.

## 4. Key Features

- **Conversational AI Analyst** — natural-language Q&A over live board data, with clarifying-question support when a question is ambiguous.
- **Executive Overview dashboard** — KPI cards (pipeline value, weighted pipeline, deal counts, work-order counts), sector breakdowns, and deals/work orders needing attention.
- **Pipeline view** — sales analytics: win rate, pipeline by sector and stage, sector performance table, at-risk deals.
- **Work Orders view** — operational portfolio view with explicit caveats where execution status cannot be determined from source labels.
- **Leadership Update** — one-click executive briefing synthesizing pipeline, operations, risks, opportunities, and data-quality caveats; copy-to-clipboard for distribution.
- **Data Sources & Diagnostics** — per-board transparency: items retrieved vs. mapped, column-to-field mapping, raw label distributions, sector normalization tallies, and reconciliation of skipped rows.
- **Data-quality reporting** — every answer carries caveats derived from actual gaps in the source data.

## 5. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│ Client (React 19, TanStack Router/Query, Tailwind v4)        │
│  routes: /  /pipeline  /work-orders  /ai-analyst             │
│          /leadership-update  /data-sources                   │
└──────────────────────────┬───────────────────────────────────┘
                           │ createServerFn (typed RPC)
┌──────────────────────────▼───────────────────────────────────┐
│ Server (TanStack Start server functions, edge runtime)       │
│                                                              │
│  src/lib/bi.functions.ts          ← thin RPC wrappers        │
│  src/lib/bi/agent.server.ts       ← orchestration            │
│  src/lib/bi/intent.ts             ← intent schema (Zod)      │
│  src/lib/gemini.server.ts         ← Gemini via AI gateway    │
│  src/lib/monday.server.ts         ← Monday GraphQL client    │
│  src/lib/bi/dataService.server.ts ← retrieval + 60s cache    │
│  src/lib/bi/mapper.ts             ← schema discovery/mapping │
│  src/lib/bi/normalize.ts          ← values, dates, sectors   │
│  src/lib/bi/analytics.ts          ← deterministic metrics    │
│  src/lib/bi/dataQuality.ts        ← data-quality scoring     │
└──────────────────────────┬───────────────────────────────────┘
                           │ GraphQL (read-only queries only)
                    ┌──────▼──────┐
                    │ Monday.com  │
                    └─────────────┘
```

The canonical data models (`src/lib/bi/types.ts`) are the contract: nothing outside the mapper touches a raw Monday payload, so board schema changes are absorbed in one place.

## 6. System Flow

```
User question
    ↓
Conversational Interface (/ai-analyst)
    ↓
Intent Detection — Gemini extracts a Zod-validated structured intent
    (boards, metrics, sector filter, time range, comparison, etc.)
    ↓
Monday.com Data Retrieval — paginated GraphQL reads of both boards
    (60-second server-side cache; timestamped snapshots)
    ↓
Data Normalization — currency parsing (incl. Lakh/Crore), date parsing,
    sector grouping, status classification, header/echo row removal
    ↓
Deterministic Business Analytics — totals, weighted pipeline, win rate,
    sector/stage breakdowns, delay flags, data-quality tallies
    ↓
Business Metrics (typed, auditable payload)
    ↓
AI Executive Interpretation — Gemini writes prose FROM the computed
    metrics only; system prompt forbids inventing numbers
    ↓
Founder-level Response — narrative + figures + assumptions + caveats
```

**Deterministic (code):** every number — counts, sums, weighted pipeline, win rates, sector aggregations, date-range filtering, delay determination, data-quality counts.
**Gemini (LLM):** understanding the question (intent extraction) and explaining the results (narrative). If the AI layer fails, the agent degrades gracefully and still returns the computed metrics.

## 7. Technology Stack

| Layer | Technology |
|---|---|
| Framework | TanStack Start v1 (SSR + typed server functions), React 19 |
| Language | TypeScript (strict, `exactOptionalPropertyTypes`) |
| Styling | Tailwind CSS v4, shadcn-style components, Lucide icons |
| Charts | Recharts |
| Data fetching | TanStack Query |
| Validation | Zod |
| AI | Google Gemini (`gemini-3.7-flash`) via the Lovable AI Gateway |
| Data source | Monday.com GraphQL API (`2024-10`) |
| Build | Vite 8, Nitro (Cloudflare Workers/edge target) |

## 8. Monday.com Integration

`src/lib/monday.server.ts` is a **read-only** GraphQL client — the codebase contains no mutation path.

- **Boards queried:** Deals board (`5030963052`) and Work Orders board (`5030962908`), supplied via environment variables.
- **Pagination:** cursor-based `items_page` pagination, 100 items per page, with a hard cap of 50 pages (5,000 items/board) as a safety stop.
- **Authentication:** API token sent as the `Authorization` header from server-side code only; the token never reaches the client bundle.
- **Error handling:** typed `MondayError` with user-safe messages for auth failures (401/403), rate limiting (429/503, with exponential-backoff retry up to 2 attempts), missing boards, and malformed responses.
- **Caching:** a 60-second in-memory cache (`dataService.server.ts`) prevents a multi-question session from hammering the API; every response carries its retrieval timestamp and a `fromCache` flag so stale data is never presented as live.

## 9. Data Resilience & Normalization

The mapper and normalizer (`mapper.ts`, `normalize.ts`) are built for messy real-world boards:

- **Schema discovery:** columns are mapped to canonical fields by title heuristics and scoring, preferring business-titled columns over generic defaults; unmapped columns are reported in diagnostics rather than silently ignored.
- **Currency parsing:** handles inconsistent formats including Indian numbering (Lakh/Crore) and free-text amounts; unparseable values become `null` plus a quality flag, never a guess.
- **Date parsing:** tolerant of multiple formats (including GMT strings); boards without usable date columns cause time-range filters to be skipped *with an explicit caveat* rather than returning empty results.
- **Probability:** normalized to 0–1 from numeric values or a qualitative ladder; the derivation basis (`numeric` / `qualitative` / `unreadable` / `missing`) is tracked per deal.
- **Header/echo rows:** template rows imported from spreadsheets (rows that repeat column titles) are detected and excluded from business records, and the skip count is reconciled in diagnostics.
- **Quality flags:** every record carries flags such as `missing_value`, `missing_probability`, `missing_close_date`, `missing_sector`, `unknown_status`, `duplicate_record`, which feed the data-quality report.
- **Source facts vs. interpretation:** each mapped field retains its raw value alongside the normalized value, so every business interpretation is traceable to source data.

## 10. Query Understanding

Questions are converted by Gemini into a structured, Zod-validated intent (`src/lib/bi/intent.ts`): which boards to query, which metrics to compute, sector/time-range filters, and whether a comparison or clarification is needed. Validation failures fall back to a safe default rather than crashing. The agent deliberately avoids inventing filters for plain count questions, and asks a clarifying question (with selectable options) when intent is genuinely ambiguous.

## 11. Business Intelligence Engine

`src/lib/bi/analytics.ts` computes, deterministically:

- **Pipeline:** total and weighted pipeline value, deal counts, breakdowns by sector and stage, open/won/lost segmentation.
- **Sales:** win rate, sector performance, deals needing attention.
- **Operations:** work-order status distribution, completion aggregates where source data supports them, delay flags (only when status or dates actually evidence a delay), unmapped-status counts.
- **Cross-board:** sector-level reconciliation of commercial pipeline vs. recorded work orders (see §12).

## 12. Cross-Board Analysis

Deals and Work Orders are queried and mapped **independently**, then combined on the normalized sector dimension for executive analysis.

**Sector normalization:** `Energy` is a business grouping defined as **Powerline + Renewables** (with synonyms such as Transmission/Wind normalized into the group). Raw source values are normalized to this taxonomy *before* any business-level filtering or aggregation.

**Representative results** (observed live from the supplied Monday.com dataset — retrieved dynamically, not hardcoded):

- Energy: **57 deals**, **₹10.05 Cr** Energy pipeline, **137 work orders**, **₹92.22 Cr** recorded work-order value.
- Overall: **180 deals**, **349 work-order board items** (347 business records after excluding 2 template/echo header rows — reconciled in diagnostics), **₹21.06 Cr** total pipeline.

## 13. AI/Gemini Usage

Gemini is used for exactly two responsibilities:

1. **Intent extraction** — question → structured query plan (JSON, schema-validated).
2. **Narrative generation** — computed metrics → executive prose.

The model receives an already-computed analytics payload and is instructed never to invent figures; source-status semantics caveats are injected into its context so the narrative distinguishes commercial labels from operational reality. Gateway failures (auth, rate limit, credits, malformed output) are mapped to typed errors, and the agent returns the deterministic metrics with a "narrative unavailable" note instead of failing the whole answer.

## 14. Data Quality & Governance

The agent communicates limitations instead of filling gaps:

- Missing probability → weighted pipeline is flagged as unreliable for the affected deals.
- Missing close dates → time-based forecasting is limited and caveated.
- Missing execution fields → delivery-progress analysis is reported as not determinable.
- Unmapped sectors/statuses → surfaced as caveats with their raw values and counts.

A `DataQualityReport` (score + per-flag tallies) accompanies analytics payloads and is visible in the Data Sources panel alongside full board diagnostics.

**Work-order status semantics:** the Work Orders board carries *commercial lifecycle* labels (Won, Dead, Open, On Hold) rather than execution statuses. The implementation therefore:

- does **not** interpret `Won` as Completed;
- does **not** interpret `Dead`/`Lost` as delivery failure;
- classifies operationally ambiguous labels as **Unknown/Unmapped**, while retaining their commercial meaning separately;
- reports delay only when status or date evidence supports it (`delayed`, `delayReason`, `delayDeterminable`);
- treats missing completion percentages as "operational progress cannot be reliably calculated."

Each work order carries `statusKind`, `statusConfidence`, and a plain-language `statusInterpretation` for auditability.

## 15. Leadership Updates

The `/leadership-update` route generates an executive briefing from the live snapshot: executive summary, sales/pipeline position, operational position, key risks, opportunities, recommended actions, and data-quality caveats. Recommendations are generated from the computed metrics and do not contradict source data; the briefing can be copied to the clipboard for distribution.

## 16. Error Handling

- Typed error classes (`MondayError`, `GeminiError`) with user-safe messages and retryability flags.
- Rate-limit retries with exponential backoff on Monday.com reads.
- Graceful AI degradation: metrics still render when narrative generation fails.
- Setup detection: missing configuration renders a guided setup screen instead of a crash.
- A global server error middleware renders a safe error page for unhandled failures.

## 17. Security

- All secrets are supplied via environment variables; **no API keys or tokens are hardcoded or committed**.
- The Monday.com token is read from `process.env` inside server handlers only and never serialized to the client.
- Monday.com access is **read-only** (queries only; no mutations exist in the codebase).
- Server functions are protected by CSRF middleware (`src/start.ts`).
- `.env` files must not be committed; share configuration via placeholders.

## 18. Environment Variables

| Variable | Purpose |
|---|---|
| `MONDAY_API_TOKEN` | Monday.com API token (server-side only) |
| `MONDAY_DEALS_BOARD_ID` | Deals board ID (`5030963052`) |
| `MONDAY_WORK_ORDERS_BOARD_ID` | Work Orders board ID (`5030962908`) |
| `LOVABLE_API_KEY` | AI gateway key used for Gemini access |

No real secret values are included in this repository.

## 19. Monday.com Board Configuration

| Board | Board ID | Role |
|---|---|---|
| Deals | `5030963052` | Commercial pipeline (180 records in the supplied dataset) |
| Work Orders | `5030962908` | Work-order portfolio (349 board items) |

Board IDs are configurable via environment variables; the configured IDs are authoritative for board roles. Column mapping is discovered dynamically from board schema, so reasonable column renames do not require code changes.

## 20. Local Development Setup

```bash
# 1. Clone the repository
git clone <repository-url>
cd <repository-name>

# 2. Install dependencies
npm install

# 3. Configure environment variables (see §18)
#    create a local .env with the four variables listed above

# 4. Start the development server
npm run dev

# 5. Production build
npm run build

# 6. Preview the production build locally
npm run preview
```

Additional scripts: `npm run lint`, `npm run format`.

## 21. Production Build & Deployment

This is **not** a purely static frontend: the Monday.com integration and Gemini calls run in server-side functions. Deployment therefore requires a runtime that executes the TanStack Start/Nitro server output (the build targets a Cloudflare Workers-compatible edge runtime). The environment variables in §18 must be configured in the hosting environment. The live deployment is available at https://skylark-insight-navigator.lovable.app.

## 22. Example Founder Queries

- "How many deals are currently in the Deals board?"
- "How is our pipeline looking?"
- "How's our Energy pipeline looking this quarter?"
- "Compare the Energy sales pipeline with Energy work orders."
- "What are the biggest risks in our pipeline?"
- "Which sectors have the strongest pipeline?"
- "How many work orders are active?"
- "Prepare a leadership update using the latest Deals and Work Orders data."

## 23. Example Business Insights

Representative output from the supplied dataset (all figures retrieved dynamically from Monday.com at query time):

- 180 deals on the Deals board; 349 items on the Work Orders board (347 business records after header-row reconciliation).
- ₹21.06 Cr total pipeline.
- Energy (normalized from Powerline + Renewables): 57 deals, ₹10.05 Cr pipeline, 137 work orders, ₹92.22 Cr recorded work-order value.
- Caveat example: work-order operational status is largely Unknown/Unmapped because the board carries commercial labels, so delivery-progress claims are withheld rather than inferred.

## 24. Design Decisions & Trade-offs

1. **Monday.com is the single source of truth** — no CSV/XLSX data is hardcoded anywhere.
2. **Deterministic calculations for all financial/business metrics** — the LLM never performs arithmetic on raw data.
3. **Gemini scoped to language tasks** — intent extraction and narrative only, keeping the system auditable.
4. **Missing data is surfaced, not fabricated** — quality flags and caveats travel with every answer.
5. **Source status semantics preserved** — ambiguous labels are classified Unknown/Unmapped instead of being force-mapped to operational buckets.
6. **Dynamic schema discovery over fixed mapping** — more resilient to board changes, at the cost of heuristic complexity (mitigated by the diagnostics panel).
7. **Short-TTL server cache** — reduces API load in multi-question sessions while keeping data demonstrably fresh.
8. **Scope prioritization** — under the assignment's time constraint, effort went into a reliable end-to-end workflow and data correctness rather than breadth of features.

## 25. Known Limitations

- Many source records lack probability values, limiting the reliability of weighted pipeline figures (surfaced as caveats).
- Missing/sparse close dates limit time-based forecasting; time filters are skipped with a caveat when a board lacks usable dates.
- The Work Orders board lacks execution-status and completion fields, so operational progress and delay analysis is limited to what status/date evidence supports.
- Column mapping relies on title heuristics; heavily renamed boards may need mapping adjustments (visible in diagnostics).
- Dependence on Monday.com API availability and rate limits.
- AI narrative depends on gateway availability/quota; the app degrades to metrics-only answers when unavailable.
- The in-memory cache is per-instance and not shared across serverless instances.

## 26. Future Improvements

- Stronger schema discovery (embedding-based column matching).
- Automated, historical data-quality scoring trends.
- Configurable business taxonomies (sector groups, status semantics) via admin UI instead of code.
- Richer historical trend analysis via scheduled snapshots.
- Shared/distributed caching and cache invalidation hooks.
- Observability: structured logging, tracing, and metric dashboards.
- Automated test coverage (unit tests for normalization/analytics, integration tests against a Monday sandbox).
- Authentication and role-based access control.
- More advanced leadership reporting (scheduled digests, PDF export).
- Anomaly detection for pipeline and operations outliers.

## 27. AI Tools Used

AI-assisted development was used throughout this project and is disclosed per the assignment guidelines:

- **Lovable** (AI full-stack development environment) — primary development platform; the Lovable AI Gateway provides Gemini access at runtime.
- **Google Gemini** — runtime intent extraction and narrative generation inside the application.

All AI-generated code was reviewed, type-checked, and validated against live Monday.com data during development.

## 28. Assignment Compliance Checklist

| Requirement | Implementation |
|---|---|
| Hosted prototype | Implemented — https://skylark-insight-navigator.lovable.app |
| GitHub repository | Implemented |
| Monday.com integration | Implemented (GraphQL, read-only, paginated) |
| Read-only access | Implemented — no mutation code paths exist |
| Dynamic board data | Implemented — no hardcoded business data |
| Data resilience | Implemented (normalization, quality flags, reconciliation) |
| Query understanding | Implemented (Gemini intent extraction, Zod-validated) |
| Business intelligence | Implemented (deterministic analytics engine) |
| Cross-board analysis | Implemented (sector-normalized Deals × Work Orders) |
| Conversational interface | Implemented (`/ai-analyst`) |
| Leadership updates | Implemented (`/leadership-update`) |
| Error handling | Implemented (typed errors, retries, graceful degradation) |
| Decision log | Key decisions documented in §24 of this README |

---

*Developed under the assignment's time constraint, with emphasis on engineering reasoning, data correctness, resilience, and explicit trade-offs.*
