/**
 * Canonical internal data models.
 *
 * Nothing outside the mapper layer should ever touch a raw Monday.com
 * GraphQL payload. If the Monday board schema changes, only the mapper
 * changes — analytics, data quality and the UI stay untouched.
 */

export type DataQualityFlag =
  | "missing_sector"
  | "missing_value"
  | "invalid_value"
  | "missing_probability"
  | "invalid_probability"
  | "missing_close_date"
  | "invalid_date"
  | "missing_stage"
  | "missing_owner"
  | "missing_status"
  | "unknown_status"
  | "missing_client"
  | "missing_completion"
  | "duplicate_record";

/** A value that was parsed out of messy source data, with traceability. */
export interface Parsed<T> {
  value: T | null;
  raw: string | null;
}

export interface Deal {
  id: string;
  name: string;
  company: string | null;
  sector: string | null;
  sectorRaw: string | null;
  stage: string | null;
  stageRaw: string | null;
  /** Explicit business deal-status field, distinct from the pipeline stage. */
  status: string | null;
  statusRaw: string | null;
  statusBucket: "open" | "won" | "lost" | "on_hold" | "unknown";
  /** Stage bucket derived deterministically from the stage label. */
  outcome: "won" | "lost" | "open" | "unknown";
  value: number | null;
  /** Normalized 0..1 */
  probability: number | null;
  /** How the probability was derived: numeric, qualitative ladder, etc. */
  probabilityBasis: "numeric" | "qualitative" | "unreadable" | "missing";
  expectedCloseDate: string | null; // ISO yyyy-mm-dd
  owner: string | null;
  createdDate: string | null; // ISO yyyy-mm-dd
  rawData: Record<string, string | null>;
  dataQualityFlags: DataQualityFlag[];
}

export interface WorkOrder {
  id: string;
  project: string;
  client: string | null;
  sector: string | null;
  sectorRaw: string | null;
  status: string | null;
  statusRaw: string | null;
  /** Status bucket derived deterministically from the status label. */
  statusBucket: "active" | "completed" | "not_started" | "delayed" | "on_hold" | "cancelled" | "unknown";
  /** Deterministic delay verdict, see `isWorkOrderDelayed`. */
  delayed: boolean;
  delayReason: "status" | "overdue" | null;
  value: number | null;
  startDate: string | null;
  endDate: string | null;
  owner: string | null;
  /** Normalized 0..100 */
  completionPercentage: number | null;
  rawData: Record<string, string | null>;
  dataQualityFlags: DataQualityFlag[];
}

export interface BoardMeta {
  boardId: string;
  boardName: string;
  itemCount: number;
  columnsSeen: { id: string; title: string; type: string }[];
  /** Which canonical field each board column was mapped to. */
  fieldMapping: Record<string, string>;
  unmappedColumns: string[];
  retrievedAt: string; // ISO timestamp
  /** Diagnostics: how the board was actually read and what it contained. */
  diagnostics: BoardDiagnostics;
}

export interface ColumnMappingRow {
  field: string;
  columnId: string;
  columnTitle: string;
  columnType: string;
  filled: number;
}

export interface RawValueTally {
  raw: string;
  normalized: string | null;
  bucket: string;
  count: number;
}

export interface BoardDiagnostics {
  role: "deals" | "work_orders";
  boardId: string;
  boardName: string;
  itemsRetrieved: number;
  pagesRetrieved: number;
  rowsSkipped: number;
  retrievedAt: string;
  mappings: ColumnMappingRow[];
  /** Raw status label distribution with the bucket each label resolved to. */
  statusValues: RawValueTally[];
  /** Raw stage label distribution (deals boards only). */
  stageValues: RawValueTally[];
  validity: { field: string; present: number; valid: number; invalid: number; missing: number }[];
}

export interface DataSet {
  deals: Deal[];
  workOrders: WorkOrder[];
  dealsBoard: BoardMeta | null;
  workOrdersBoard: BoardMeta | null;
  retrievedAt: string;
  /** True when this payload came from the short-lived server cache. */
  fromCache: boolean;
}

export interface ConnectionStatus {
  configured: boolean;
  missingSecrets: string[];
  aiConfigured: boolean;
  /** Only populated once a live call has been attempted. */
  reachable?: boolean;
  error?: string | null;
}
