import type { CrossBoardAnalysis, OperationsMetrics, PipelineMetrics, SalesMetrics } from "./analytics";
import type { DataQualityReport } from "./dataQuality";
import type { BiIntent } from "./intent";
import type { BoardMeta, ConnectionStatus, Deal, WorkOrder } from "./types";

export interface SourceMetadata {
  boards: { name: string; boardId: string; records: number }[];
  recordsAnalyzed: number;
  retrievedAt: string;
  fromCache: boolean;
}

export interface AnalyticsPayload {
  pipeline: PipelineMetrics | null;
  sales: SalesMetrics | null;
  operations: OperationsMetrics | null;
  crossBoard: CrossBoardAnalysis | null;
  quality: DataQualityReport;
  timeRangeLabel: string;
  filtersApplied: string[];
}

export interface AgentAnswer {
  kind: "answer" | "clarification" | "setup_required" | "error";
  /** Markdown-ish narrative produced by Gemini from deterministic numbers. */
  narrative: string;
  /** Present when the agent needs the user to choose a direction. */
  clarificationOptions?: string[];
  intent?: BiIntent;
  analytics?: AnalyticsPayload;
  source?: SourceMetadata;
  assumptions: string[];
  caveats: string[];
  /** Set when the narrative layer failed but numbers are still valid. */
  degraded?: string | null;
  errorMessage?: string;
  retryable?: boolean;
}

export interface OverviewSnapshot {
  status: ConnectionStatus;
  source: SourceMetadata | null;
  pipeline: PipelineMetrics | null;
  sales: SalesMetrics | null;
  operations: OperationsMetrics | null;
  crossBoard: CrossBoardAnalysis | null;
  quality: DataQualityReport | null;
  boards: { deals: BoardMeta | null; workOrders: BoardMeta | null };
  topDeals: Deal[];
  attentionDeals: Deal[];
  attentionWorkOrders: WorkOrder[];
  error?: { message: string; kind: string; retryable: boolean } | null;
}
