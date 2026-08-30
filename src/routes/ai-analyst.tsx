import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, SendHorizontal, Sparkles, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { AppShell, PageHeader } from "@/components/bi/AppShell";
import { Narrative } from "@/components/bi/Narrative";
import { ErrorState, SetupRequired } from "@/components/bi/StateBlocks";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useSnapshot } from "@/hooks/useSnapshot";
import { askQuestion } from "@/lib/bi.functions";
import type { AgentAnswer } from "@/lib/bi/agentTypes";
import { formatCount, formatTimestamp } from "@/lib/format";

export const Route = createFileRoute("/ai-analyst")({
  head: () => ({
    meta: [
      { title: "AI Analyst — Skylark BI Agent" },
      {
        name: "description",
        content:
          "Ask business questions in plain English. Metrics are computed deterministically from Monday.com and explained by AI.",
      },
      { property: "og:title", content: "AI Analyst — Skylark BI Agent" },
      {
        property: "og:description",
        content: "Natural-language business questions answered from live Monday.com sales and delivery data.",
      },
    ],
  }),
  component: AiAnalystPage,
});

const SUGGESTIONS = [
  "What's our total pipeline value this quarter?",
  "Which sector is performing best?",
  "How many work orders are delayed?",
  "Show me deals that need attention",
  "What's our win rate by sector?",
];

interface Turn {
  id: string;
  role: "user" | "assistant";
  content: string;
  answer?: AgentAnswer;
}

function AnswerBlock({ answer }: { answer: AgentAnswer }) {
  if (answer.kind === "error") {
    return <ErrorState message={answer.errorMessage ?? "That question could not be answered."} retryable={false} />;
  }

  return (
    <div className="space-y-3">
      {answer.narrative ? <Narrative markdown={answer.narrative} /> : null}

      {answer.kind === "clarification" && answer.clarificationOptions?.length ? (
        <ul className="space-y-1 text-sm text-muted-foreground">
          {answer.clarificationOptions.map((o) => (
            <li key={o}>• {o}</li>
          ))}
        </ul>
      ) : null}

      {answer.degraded ? (
        <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
          {answer.degraded}
        </p>
      ) : null}

      {answer.assumptions.length > 0 || answer.caveats.length > 0 ? (
        <div className="rounded-lg border border-border bg-background/50 p-3 text-xs text-muted-foreground">
          {answer.assumptions.length > 0 ? (
            <p>
              <span className="font-medium text-foreground/80">Assumptions:</span>{" "}
              {answer.assumptions.join(" ")}
            </p>
          ) : null}
          {answer.caveats.length > 0 ? (
            <p className={answer.assumptions.length ? "mt-1.5" : ""}>
              <span className="font-medium text-foreground/80">Caveats:</span> {answer.caveats.join(" ")}
            </p>
          ) : null}
        </div>
      ) : null}

      {answer.source ? (
        <p className="text-[11px] text-muted-foreground">
          Source: {answer.source.boards.map((b) => b.name).join(", ") || "Monday.com"} ·{" "}
          {formatCount(answer.source.recordsAnalyzed)} records · retrieved{" "}
          {formatTimestamp(answer.source.retrievedAt)}
          {answer.analytics?.timeRangeLabel ? ` · ${answer.analytics.timeRangeLabel}` : ""}
        </p>
      ) : null}
    </div>
  );
}

function AiAnalystPage() {
  const { data: snapshot } = useSnapshot();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const ask = useServerFn(askQuestion);

  const mutation = useMutation({
    mutationFn: (question: string) =>
      ask({
        data: {
          question,
          history: turns
            .slice(-6)
            .map((t) => ({ role: t.role, content: t.content.slice(0, 4000) })),
        },
      }),
    onSuccess: (answer) => {
      setTurns((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: answer.narrative || answer.errorMessage || "",
          answer,
        },
      ]);
    },
    onError: () => {
      setTurns((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "",
          answer: {
            kind: "error",
            narrative: "",
            errorMessage: "The analyst service is unreachable right now. Please try again.",
            assumptions: [],
            caveats: [],
            retryable: true,
          },
        },
      ]);
    },
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, mutation.isPending]);

  const submit = (question: string) => {
    const q = question.trim();
    if (!q || mutation.isPending) return;
    setTurns((prev) => [...prev, { id: crypto.randomUUID(), role: "user", content: q }]);
    setInput("");
    mutation.mutate(q);
  };

  const configured = snapshot?.status.configured ?? true;

  return (
    <AppShell status={snapshot?.status ?? null} retrievedAt={snapshot?.source?.retrievedAt ?? null}>
      <PageHeader
        title="AI Analyst"
        subtitle="Ask anything about the sales pipeline or project delivery. Numbers are computed on the server from live records; the AI only explains them."
      />

      {!configured ? (
        <SetupRequired missing={snapshot?.status.missingSecrets ?? []} />
      ) : (
        <div className="space-y-4">
          <div className="panel min-h-[340px] p-4 sm:p-5">
            {turns.length === 0 ? (
              <div className="py-8 text-center">
                <span className="inline-flex size-10 items-center justify-center rounded-xl bg-primary/12 text-primary ring-1 ring-primary/25">
                  <Sparkles className="size-5" aria-hidden />
                </span>
                <p className="mt-3 text-sm font-medium">Ask a business question</p>
                <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                  Every answer states the metric definition, the assumptions applied and the data-quality caveats
                  behind it.
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => submit(s)}
                      className="rounded-full border border-border bg-background/60 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <ul className="space-y-5">
                {turns.map((turn) => (
                  <li key={turn.id} className="flex gap-3">
                    <span
                      className={
                        turn.role === "user"
                          ? "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground"
                          : "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/25"
                      }
                    >
                      {turn.role === "user" ? (
                        <User className="size-3.5" aria-hidden />
                      ) : (
                        <Sparkles className="size-3.5" aria-hidden />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      {turn.role === "user" ? (
                        <p className="text-sm font-medium">{turn.content}</p>
                      ) : turn.answer ? (
                        <AnswerBlock answer={turn.answer} />
                      ) : null}
                    </div>
                  </li>
                ))}
                {mutation.isPending ? (
                  <li className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Reading the boards and computing the numbers…
                  </li>
                ) : null}
              </ul>
            )}
            <div ref={endRef} />
          </div>

          <form
            className="panel flex items-end gap-2 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              submit(input);
            }}
          >
            <label htmlFor="analyst-question" className="sr-only">
              Your question
            </label>
            <Textarea
              id="analyst-question"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit(input);
                }
              }}
              rows={2}
              maxLength={1000}
              placeholder="e.g. Which sector has the strongest weighted pipeline this quarter?"
              className="min-h-11 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
            />
            <Button type="submit" size="sm" disabled={!input.trim() || mutation.isPending}>
              {mutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <SendHorizontal className="size-4" aria-hidden />
              )}
              <span className="sr-only sm:not-sr-only">Ask</span>
            </Button>
          </form>
        </div>
      )}
    </AppShell>
  );
}
