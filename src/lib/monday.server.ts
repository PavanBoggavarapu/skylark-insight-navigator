/**
 * Server-only Monday.com GraphQL client.
 *
 * READ ONLY: this module issues board/item queries exclusively. There is no
 * mutation code path anywhere in the application.
 *
 * The API token never leaves the server — it is read from process.env inside
 * the request handler and is never returned to the client in any shape.
 */

import type { RawBoard, RawColumn, RawItem } from "./bi/mapper";

const MONDAY_API = "https://api.monday.com/v2";
const API_VERSION = "2024-10";
const PAGE_SIZE = 100;
const MAX_PAGES = 50; // hard stop: 5000 items per board

export class MondayError extends Error {
  constructor(
    message: string,
    readonly kind:
      | "not_configured"
      | "auth"
      | "not_found"
      | "rate_limited"
      | "network"
      | "malformed"
      | "unknown",
    readonly userMessage: string,
  ) {
    super(message);
    this.name = "MondayError";
  }
}

export interface MondayConfig {
  token: string;
  dealsBoardId: string;
  workOrdersBoardId: string;
}

export function readMondayConfig():
  | { ok: true; config: MondayConfig }
  | { ok: false; missing: string[] } {
  const token = process.env["MONDAY_API_TOKEN"];
  const dealsBoardId = process.env["MONDAY_DEALS_BOARD_ID"];
  const workOrdersBoardId = process.env["MONDAY_WORK_ORDERS_BOARD_ID"];

  const missing: string[] = [];
  if (!token) missing.push("MONDAY_API_TOKEN");
  if (!dealsBoardId) missing.push("MONDAY_DEALS_BOARD_ID");
  if (!workOrdersBoardId) missing.push("MONDAY_WORK_ORDERS_BOARD_ID");
  if (missing.length > 0) return { ok: false, missing };

  return { ok: true, config: { token: token!, dealsBoardId: dealsBoardId!, workOrdersBoardId: workOrdersBoardId! } };
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string; extensions?: { code?: string } }[];
  error_message?: string;
  status_code?: number;
}

async function mondayRequest<T>(
  config: MondayConfig,
  query: string,
  variables: Record<string, unknown>,
  attempt = 0,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(MONDAY_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: config.token,
        "API-Version": API_VERSION,
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch (e) {
    throw new MondayError(
      `Network failure calling Monday.com: ${(e as Error).message}`,
      "network",
      "I couldn't reach Monday.com right now. Please try again in a moment.",
    );
  }

  if (res.status === 401 || res.status === 403) {
    throw new MondayError(
      `Monday.com rejected the API token (HTTP ${res.status}).`,
      "auth",
      "The Monday.com API token was rejected. Please check the token in the app configuration.",
    );
  }
  if (res.status === 429 || res.status === 503) {
    if (attempt < 2) {
      const wait = 800 * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, wait));
      return mondayRequest<T>(config, query, variables, attempt + 1);
    }
    throw new MondayError(
      `Monday.com rate limit hit (HTTP ${res.status}).`,
      "rate_limited",
      "Monday.com is rate limiting requests right now. Please retry shortly.",
    );
  }
  if (!res.ok) {
    throw new MondayError(
      `Monday.com returned HTTP ${res.status}.`,
      "unknown",
      "Monday.com returned an unexpected response. Please try again in a moment.",
    );
  }

  let json: GraphQLResponse<T>;
  try {
    json = (await res.json()) as GraphQLResponse<T>;
  } catch {
    throw new MondayError(
      "Monday.com returned a non-JSON body.",
      "malformed",
      "Monday.com returned data I couldn't read. Please try again in a moment.",
    );
  }

  if (json.error_message || (json.errors && json.errors.length > 0)) {
    const message = json.error_message ?? json.errors!.map((e) => e.message).join("; ");
    const lower = message.toLowerCase();
    if (lower.includes("unauthor") || lower.includes("authentication")) {
      throw new MondayError(message, "auth", "The Monday.com API token was rejected. Please check the configuration.");
    }
    if (lower.includes("complexity") || lower.includes("rate")) {
      throw new MondayError(message, "rate_limited", "Monday.com is throttling requests. Please retry shortly.");
    }
    throw new MondayError(message, "unknown", "Monday.com reported an error while reading the board.");
  }

  if (!json.data) {
    throw new MondayError(
      "Monday.com response contained no data field.",
      "malformed",
      "Monday.com returned an empty response. Please try again in a moment.",
    );
  }
  return json.data;
}

interface BoardPageResponse {
  boards: {
    id: string;
    name: string;
    columns: { id: string; title: string; type: string }[] | null;
    items_page: {
      cursor: string | null;
      items: {
        id: string;
        name: string;
        column_values: { id: string; text: string | null }[] | null;
      }[];
    } | null;
  }[] | null;
}

const BOARD_QUERY = `
  query BoardItems($boardId: [ID!], $limit: Int!, $cursor: String) {
    boards(ids: $boardId) {
      id
      name
      columns { id title type }
      items_page(limit: $limit, cursor: $cursor) {
        cursor
        items {
          id
          name
          column_values { id text }
        }
      }
    }
  }
`;

/**
 * Reads every item on a board, following cursor pagination.
 * Handles empty boards, missing columns and malformed rows defensively.
 */
export async function getBoardItems(config: MondayConfig, boardId: string): Promise<RawBoard> {
  let cursor: string | null = null;
  let boardName = `Board ${boardId}`;
  let columns: RawColumn[] = [];
  const items: RawItem[] = [];
  let pagesRetrieved = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const data: BoardPageResponse = await mondayRequest<BoardPageResponse>(config, BOARD_QUERY, {
      boardId: [boardId],
      limit: PAGE_SIZE,
      cursor,
    });

    pagesRetrieved = page + 1;
    const board = data.boards?.[0];
    if (!board) {
      throw new MondayError(
        `Board ${boardId} was not found or the token has no access to it.`,
        "not_found",
        `I couldn't find Monday.com board ${boardId}. Please check the board ID and that the token can access it.`,
      );
    }

    if (page === 0) {
      boardName = board.name ?? boardName;
      columns = (board.columns ?? []).map((c) => ({
        id: c.id,
        title: c.title ?? c.id,
        type: c.type ?? "unknown",
      }));
    }

    const page_ = board.items_page;
    for (const raw of page_?.items ?? []) {
      if (!raw || typeof raw.id !== "string") continue;
      const values: Record<string, string | null> = {};
      for (const cv of raw.column_values ?? []) {
        if (!cv || typeof cv.id !== "string") continue;
        values[cv.id] = cv.text ?? null;
      }
      items.push({ id: raw.id, name: raw.name ?? `Item ${raw.id}`, values });
    }

    cursor = page_?.cursor ?? null;
    if (!cursor) break;
  }

  return { id: boardId, name: boardName, columns, items, pagesRetrieved };
}
