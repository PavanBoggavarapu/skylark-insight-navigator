/**
 * Server-only Gemini client (via the Lovable AI Gateway).
 *
 * Responsibilities: language understanding and explanation ONLY.
 * The model never sees a request to compute a metric — it receives an
 * already-computed, deterministic analytics payload and writes prose.
 */

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3.7-flash";

export class GeminiError extends Error {
  constructor(
    message: string,
    readonly kind: "not_configured" | "auth" | "rate_limited" | "credits" | "network" | "malformed" | "unknown",
    readonly userMessage: string,
  ) {
    super(message);
    this.name = "GeminiError";
  }
}

export function isAiConfigured(): boolean {
  return Boolean(process.env["LOVABLE_API_KEY"]);
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

async function callGemini(
  messages: ChatMessage[],
  options: { jsonSchema?: unknown; schemaName?: string; maxTokens?: number } = {},
): Promise<string> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) {
    throw new GeminiError(
      "LOVABLE_API_KEY is not configured.",
      "not_configured",
      "The AI service is not configured yet, so I can only show the calculated metrics.",
    );
  }

  const body: Record<string, unknown> = { model: MODEL, messages };
  if (options.jsonSchema) {
    body.response_format = {
      type: "json_schema",
      json_schema: {
        name: options.schemaName ?? "structured_output",
        strict: false,
        schema: options.jsonSchema,
      },
    };
  }

  let res: Response;
  try {
    res = await fetch(GATEWAY, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new GeminiError(
      `Network failure calling the AI gateway: ${(e as Error).message}`,
      "network",
      "I couldn't reach the AI service. The figures below are still accurate.",
    );
  }

  if (res.status === 429) {
    throw new GeminiError("AI rate limited (429).", "rate_limited", "The AI service is busy. Please retry in a moment.");
  }
  if (res.status === 402 || res.status === 403) {
    throw new GeminiError(
      `AI gateway denied the request (${res.status}).`,
      "credits",
      "The AI workspace has no available credits, so narrative analysis is paused. The calculated metrics below are still accurate.",
    );
  }
  if (res.status === 401) {
    throw new GeminiError("AI gateway rejected the key (401).", "auth", "The AI service credentials are invalid.");
  }
  if (!res.ok) {
    throw new GeminiError(`AI gateway HTTP ${res.status}.`, "unknown", "The AI service returned an unexpected response.");
  }

  let json: { choices?: { message?: { content?: string } }[] };
  try {
    json = (await res.json()) as typeof json;
  } catch {
    throw new GeminiError("AI gateway returned non-JSON.", "malformed", "The AI service returned an unreadable response.");
  }

  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim() === "") {
    throw new GeminiError("AI gateway returned empty content.", "malformed", "The AI service returned an empty response.");
  }
  return content;
}

/** Calls Gemini expecting JSON, tolerating code fences and stray prose. */
export async function generateJson(
  messages: ChatMessage[],
  jsonSchema: unknown,
  schemaName: string,
): Promise<unknown> {
  const content = await callGemini(messages, { jsonSchema, schemaName });
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        /* fall through */
      }
    }
    throw new GeminiError(
      "Model output was not valid JSON.",
      "malformed",
      "I had trouble interpreting that question precisely.",
    );
  }
}

export async function generateText(messages: ChatMessage[]): Promise<string> {
  return callGemini(messages);
}
