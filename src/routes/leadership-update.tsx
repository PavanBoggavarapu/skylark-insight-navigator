import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, FileText, Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell, PageHeader } from "@/components/bi/AppShell";
import { Narrative } from "@/components/bi/Narrative";
import { ErrorState, SectionCard, SetupRequired } from "@/components/bi/StateBlocks";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSnapshot } from "@/hooks/useSnapshot";
import { prepareLeadershipUpdate } from "@/lib/bi.functions";
import { formatCount, formatTimestamp } from "@/lib/format";

export const Route = createFileRoute("/leadership-update")({
  head: () => ({
    meta: [
      { title: "Leadership Update — Skylark BI Agent" },
      {
        name: "description",
        content:
          "Generate an executive-ready briefing on sales, delivery, risks and data quality from live Monday.com data.",
      },
      { property: "og:title", content: "Leadership Update — Skylark BI Agent" },
      {
        property: "og:description",
        content: "One-click executive briefing covering pipeline, execution, risks and caveats.",
      },
    ],
  }),
  component: LeadershipUpdatePage,
});

function LeadershipUpdatePage() {
  const { data: snapshot } = useSnapshot();
  const generate = useServerFn(prepareLeadershipUpdate);
  const [copied, setCopied] = useState(false);

  const mutation = useMutation({
    mutationFn: () => generate(),
    onError: () => toast.error("Couldn't generate the update. Please try again."),
  });

  const answer = mutation.data;

  const copy = async () => {
    if (!answer?.narrative) return;
    try {
      await navigator.clipboard.writeText(answer.narrative);
      setCopied(true);
      toast.success("Update copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Your browser blocked clipboard access.");
    }
  };

  return (
    <AppShell status={snapshot?.status ?? null} retrievedAt={snapshot?.source?.retrievedAt ?? null}>
      <PageHeader
        title="Leadership Update"
        subtitle="A founder-ready briefing: what happened, what it means, and what needs a decision — built from the same deterministic metrics shown across the app."
        action={
          <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="size-4" aria-hidden />
            )}
            {mutation.isPending ? "Generating" : answer ? "Regenerate" : "Generate update"}
          </Button>
        }
      />

      {snapshot && !snapshot.status.configured ? (
        <SetupRequired missing={snapshot.status.missingSecrets} />
      ) : mutation.isPending ? (
        <div className="panel space-y-3 p-6">
          <Skeleton className="h-5 w-52" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-9/12" />
          <Skeleton className="h-4 w-10/12" />
        </div>
      ) : mutation.isError ? (
        <ErrorState message="The briefing service is unreachable right now." onRetry={() => mutation.mutate()} />
      ) : answer?.kind === "error" ? (
        <ErrorState
          message={answer.errorMessage ?? "The update could not be prepared."}
          onRetry={() => mutation.mutate()}
          retryable={answer.retryable ?? true}
        />
      ) : answer ? (
        <div className="space-y-4">
          <SectionCard
            title="Executive briefing"
            description={
              answer.source
                ? `${formatCount(answer.source.recordsAnalyzed)} records · retrieved ${formatTimestamp(answer.source.retrievedAt)}`
                : undefined
            }
            action={
              <Button variant="outline" size="sm" onClick={copy}>
                {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
                Copy
              </Button>
            }
          >
            <Narrative markdown={answer.narrative} />
          </SectionCard>

          {answer.degraded ? (
            <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
              {answer.degraded}
            </p>
          ) : null}

          {answer.assumptions.length > 0 || answer.caveats.length > 0 ? (
            <SectionCard title="Assumptions and caveats" description="State these alongside the numbers.">
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                {[...answer.assumptions, ...answer.caveats].map((line) => (
                  <li key={line}>• {line}</li>
                ))}
              </ul>
            </SectionCard>
          ) : null}
        </div>
      ) : (
        <div className="panel flex flex-col items-center gap-2 px-6 py-14 text-center">
          <FileText className="size-6 text-muted-foreground" aria-hidden />
          <p className="text-sm font-semibold">No update generated yet</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Generating reads the Deals and Work Orders boards, computes the metrics on the server, and asks the AI to
            write the narrative around those exact figures.
          </p>
        </div>
      )}
    </AppShell>
  );
}
