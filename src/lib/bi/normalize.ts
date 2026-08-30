/**
 * Normalization layer for messy business data.
 *
 * Rules:
 *  - Never invent a value. Unparseable input becomes `null`.
 *  - Always keep the raw string available for traceability.
 *  - No currency conversion is ever performed (we cannot know the rate);
 *    we only strip currency symbols and thousands separators.
 */

const NULLISH_TOKENS = new Set([
  "",
  "-",
  "--",
  "—",
  "n/a",
  "na",
  "n.a.",
  "none",
  "null",
  "nil",
  "unknown",
  "unspecified",
  "tbd",
  "to be decided",
  "not available",
  "not applicable",
  "?",
]);

export function isBlank(input: unknown): boolean {
  if (input === null || input === undefined) return true;
  if (typeof input === "number") return Number.isNaN(input);
  const s = String(input).trim().toLowerCase();
  return NULLISH_TOKENS.has(s);
}

export function normalizeText(input: unknown): string | null {
  if (isBlank(input)) return null;
  return String(input).trim().replace(/\s+/g, " ");
}

/* ------------------------------------------------------------------ */
/* Numbers                                                             */
/* ------------------------------------------------------------------ */

const MULTIPLIERS: Record<string, number> = {
  k: 1_000,
  thousand: 1_000,
  m: 1_000_000,
  mn: 1_000_000,
  million: 1_000_000,
  b: 1_000_000_000,
  bn: 1_000_000_000,
  billion: 1_000_000_000,
  // Indian numbering — commonly present in Skylark-style datasets.
  l: 100_000,
  lac: 100_000,
  lakh: 100_000,
  lakhs: 100_000,
  cr: 10_000_000,
  crore: 10_000_000,
  crores: 10_000_000,
};

/**
 * Parses "50000", "50,000", "$50,000", "₹50,000", "50K", "1.2 Cr", "(500)".
 * Returns null when nothing numeric can be read.
 */
export function parseNumeric(input: unknown): number | null {
  if (isBlank(input)) return null;
  if (typeof input === "number") return Number.isFinite(input) ? input : null;

  let s = String(input).trim().toLowerCase();

  // Accounting negatives: (1,200) === -1200
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  }

  // Strip currency symbols / codes and spaces.
  s = s
    .replace(/[₹$€£¥]/g, "")
    .replace(/\b(inr|usd|eur|gbp|rs\.?|aed|sgd)\b/g, "")
    .trim();

  const match = s.match(/^([0-9][0-9,\s]*(?:\.[0-9]+)?)\s*([a-z]+)?$/);
  if (!match) return null;

  const numericPart = (match[1] ?? "").replace(/[,\s]/g, "");
  const n = Number(numericPart);
  if (!Number.isFinite(n)) return null;

  const suffix = match[2];
  const multiplier = suffix ? MULTIPLIERS[suffix] : 1;
  if (suffix && multiplier === undefined) return null;

  const result = n * (multiplier ?? 1);
  return negative ? -result : result;
}

/* ------------------------------------------------------------------ */
/* Probability                                                         */
/* ------------------------------------------------------------------ */

/**
 * Accepts 0.75, "75%", "75", 75 and returns 0..1.
 * Ambiguity rule: a bare number > 1 is treated as a percentage.
 * Out-of-range values return null rather than being clamped silently.
 */
export function parseProbability(input: unknown): number | null {
  if (isBlank(input)) return null;
  const raw = String(input).trim();
  const isPercent = raw.includes("%");
  const n = parseNumeric(raw.replace("%", ""));
  if (n === null) return null;

  let p: number;
  if (isPercent) p = n / 100;
  else if (n > 1) p = n / 100;
  else p = n;

  if (p < 0 || p > 1) return null;
  return p;
}

/**
 * Documented qualitative probability ladder. Some Monday boards store
 * closure probability as a word rather than a number; these are the only
 * accepted words and the mapping is fixed and auditable.
 */
export const QUALITATIVE_PROBABILITY: Record<string, number> = {
  "very high": 0.9,
  high: 0.75,
  medium: 0.5,
  moderate: 0.5,
  mid: 0.5,
  low: 0.25,
  "very low": 0.1,
};

export type ProbabilityBasis = "numeric" | "qualitative" | "unreadable" | "missing";

/**
 * Returns the probability (0..1) plus how it was derived, so the UI can
 * disclose that a weighted figure rests on a qualitative ladder.
 */
export function parseProbabilityDetailed(input: unknown): {
  value: number | null;
  basis: ProbabilityBasis;
} {
  if (isBlank(input)) return { value: null, basis: "missing" };
  const raw = String(input).trim().toLowerCase();
  const qualitative = QUALITATIVE_PROBABILITY[raw];
  if (qualitative !== undefined) return { value: qualitative, basis: "qualitative" };
  const numeric = parseProbability(raw);
  if (numeric !== null) return { value: numeric, basis: "numeric" };
  return { value: null, basis: "unreadable" };
}

/** Completion percentage normalized to 0..100. */
export function parseCompletion(input: unknown): number | null {
  const p = parseProbability(input);
  return p === null ? null : Math.round(p * 1000) / 10;
}

/* ------------------------------------------------------------------ */
/* Dates                                                               */
/* ------------------------------------------------------------------ */

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function expandYear(y: number): number {
  if (y >= 100) return y;
  // Two-digit years: 70-99 => 1900s, 00-69 => 2000s.
  return y >= 70 ? 1900 + y : 2000 + y;
}

/**
 * Parses inconsistent date formats into ISO `yyyy-mm-dd`.
 * Supported: 2026-01-15, 15/01/2026, 01/15/2026 (disambiguated when possible),
 * Jan 15, 2026, 15-Jan-26, 15.01.2026, ISO timestamps.
 * Returns null when the value cannot be read — never a guessed date.
 */
export function parseDate(input: unknown): string | null {
  if (isBlank(input)) return null;
  const s = String(input).trim();

  // ISO first (optionally with time).
  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (isoMatch) return iso(+(isoMatch[1] ?? 0), +(isoMatch[2] ?? 0), +(isoMatch[3] ?? 0));

  // 15-Jan-26 / 15 Jan 2026 / Jan 15, 2026 / January 15 2026
  const dMonY = s.match(/^(\d{1,2})[\s\-/.]*([A-Za-z]{3,9})[\s\-/.,]*(\d{2,4})$/);
  if (dMonY) {
    const m = MONTHS[(dMonY[2] ?? "").toLowerCase()];
    if (!m) return null;
    return iso(expandYear(+(dMonY[3] ?? 0)), m, +(dMonY[1] ?? 0));
  }
  const monDY = s.match(/^([A-Za-z]{3,9})[\s\-/.]*(\d{1,2})(?:st|nd|rd|th)?[\s\-/.,]+(\d{2,4})$/);
  if (monDY) {
    const m = MONTHS[(monDY[1] ?? "").toLowerCase()];
    if (!m) return null;
    return iso(expandYear(+(monDY[3] ?? 0)), m, +(monDY[2] ?? 0));
  }

  // Numeric separators: dd/mm/yyyy or mm/dd/yyyy
  const numeric = s.match(/^(\d{1,4})[/\-.](\d{1,2})[/\-.](\d{1,4})$/);
  if (numeric) {
    const a = +(numeric[1] ?? 0);
    const b = +(numeric[2] ?? 0);
    const c = +(numeric[3] ?? 0);
    if ((numeric[1] ?? "").length === 4) return iso(a, b, c); // yyyy/mm/dd
    // Day-first is the assignment's documented default (15/01/2026).
    // Fall back to month-first only when day-first is impossible.
    if (a > 12 && b <= 12) return iso(expandYear(c), b, a);
    if (b > 12 && a <= 12) return iso(expandYear(c), a, b);
    return iso(expandYear(c), b, a);
  }

  // JS Date#toString() form, as exported by spreadsheets into Monday text
  // columns: "Thu Jul 31 2025 00:00:00 GMT+0000 (Coordinated Universal Time)".
  if (/^[A-Za-z]{3}\s+[A-Za-z]{3}\s+\d{1,2}\s+\d{4}/.test(s)) {
    const t = Date.parse(s);
    if (Number.isFinite(t)) {
      const dt = new Date(t);
      return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
    }
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* Sector / stage / status text normalization                          */
/* ------------------------------------------------------------------ */

const SECTOR_SYNONYMS: Record<string, string> = {
  energy: "Energy",
  power: "Energy",
  utilities: "Energy",
  utility: "Energy",
  solar: "Energy",
  // Skylark business grouping: Powerline and Renewables roll up into Energy.
  powerline: "Energy",
  powerlines: "Energy",
  powerline: "Energy",
  transmission: "Energy",
  transmissionline: "Energy",
  renewable: "Energy",
  renewables: "Energy",
  renewableenergy: "Energy",
  wind: "Energy",
  oilgas: "Oil & Gas",
  oilandgas: "Oil & Gas",
  infrastructure: "Infrastructure",
  infra: "Infrastructure",
  construction: "Construction",
  mining: "Mining",
  minerals: "Mining",
  agriculture: "Agriculture",
  agri: "Agriculture",
  telecom: "Telecom",
  telecommunications: "Telecom",
  railways: "Railways",
  rail: "Railways",
  logistics: "Logistics",
  government: "Government",
  govt: "Government",
  publicsector: "Government",
  realestate: "Real Estate",
  urbanplanning: "Urban Planning",
  water: "Water",
  environment: "Environment",
};

function canonicalKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/\bsector\b/g, "")
    .replace(/\bindustry\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => (w.length <= 2 ? w.toUpperCase() : (w[0] ?? "").toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ");
}

/** "  ENERGY ", "energy", "Energy Sector" -> "Energy". Unknown values are title-cased, not dropped. */
export function normalizeSector(input: unknown): string | null {
  const text = normalizeText(input);
  if (text === null) return null;
  const key = canonicalKey(text);
  if (!key) return null;
  if (SECTOR_SYNONYMS[key]) return SECTOR_SYNONYMS[key];
  return titleCase(text.replace(/\s*\b(sector|industry)\b\s*/gi, " ").trim() || text);
}

const WON = ["won", "closed won", "closedwon", "win", "signed", "awarded", "converted"];
const LOST = ["lost", "closed lost", "closedlost", "dropped", "cancelled", "canceled", "rejected", "no bid", "churned"];

/** Buckets a deal stage into won / lost / open. Unknown labels are `unknown`, never silently "open". */
export function classifyDealStage(stage: string | null): "won" | "lost" | "open" | "unknown" {
  if (!stage) return "unknown";
  const k = stage.toLowerCase().trim();
  if (WON.some((w) => k === w || k.includes(w))) return "won";
  if (LOST.some((l) => k === l || k.includes(l))) return "lost";
  const openish = [
    "lead", "prospect", "qualified", "qualification", "discovery", "demo", "pilot",
    "proposal", "quote", "negotiation", "contract", "new", "open", "in progress", "review",
  ];
  if (openish.some((o) => k.includes(o))) return "open";
  return "unknown";
}

/**
 * Normalizes a stage / status label: trims whitespace, collapses inner
 * spaces, strips ordering prefixes such as "A. " or "3) " used to force
 * sort order on Monday boards, and only re-cases labels that are entirely
 * upper- or lower-case (so "Sales Qualified Leads" survives untouched).
 * A valid label is NEVER replaced by "Unspecified".
 */
export function normalizeStage(input: unknown): string | null {
  const t = normalizeText(input);
  if (t === null) return null;
  const stripped = t.replace(/^[A-Za-z0-9]{1,2}\s*[.)-]\s+/, "").trim();
  const label = stripped.length > 0 ? stripped : t;
  const isUniformCase = label === label.toUpperCase() || label === label.toLowerCase();
  return isUniformCase ? titleCase(label) : label;
}

export type DealStatusBucket = "open" | "won" | "lost" | "on_hold" | "unknown";

/**
 * Buckets an explicit *deal status* label (a dedicated business field,
 * distinct from the pipeline stage). Mapping discovered from live data:
 * Open -> open, Won -> won, Dead -> lost, On Hold -> on_hold.
 */
export function classifyDealStatus(status: string | null): DealStatusBucket {
  if (!status) return "unknown";
  const k = status.toLowerCase().trim();
  if (/(won|closed won|signed|awarded|converted|order received)/.test(k)) return "won";
  if (/(dead|lost|dropped|cancel|rejected|no bid|churn|not relevant)/.test(k)) return "lost";
  if (/(hold|paused|parked|stalled|freeze|frozen)/.test(k)) return "on_hold";
  if (/(open|active|live|in progress|ongoing|new|pipeline|working)/.test(k)) return "open";
  return "unknown";
}

export type WorkOrderStatusBucket =
  | "active"
  | "completed"
  | "not_started"
  | "delayed"
  | "on_hold"
  | "cancelled"
  | "unknown";

/** Buckets a work-order status label. Unknown labels are reported as a data-quality issue. */
export function classifyWorkOrderStatus(status: string | null): WorkOrderStatusBucket {
  if (!status) return "unknown";
  const k = status.toLowerCase().trim();
  // Order matters: "Partial Completed" and "Not Started" must not fall into
  // the generic "complete"/"started" branches.
  if (/(delay|overdue|behind|slipped|at risk)/.test(k)) return "delayed";
  // "Pause / struck" is a hold, not a cancellation — check holds first.
  if (/(pause|hold|blocked|waiting|stalled|pending|struck|stuck)/.test(k)) return "on_hold";
  if (/(cancel|abandon|terminated|dropped|dead)/.test(k)) return "cancelled";
  if (/^(partial|partially)/.test(k)) return "active";
  if (/(complete|done|closed|delivered|finished)/.test(k)) return "completed";
  if (/^not started$/.test(k) || /(yet to start|not yet started)/.test(k)) return "not_started";
  if (
    /(active|in progress|ongoing|executed|execution|working|executing|started|survey|processing|planned|scheduled|new|open)/.test(
      k,
    )
  ) {
    return "active";
  }
  return "unknown";
}
