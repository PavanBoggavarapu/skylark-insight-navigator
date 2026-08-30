import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getSnapshot } from "@/lib/bi.functions";
import type { OverviewSnapshot } from "@/lib/bi/agentTypes";

/**
 * Single shared read of the live Monday.com snapshot.
 * Cached briefly on the client too, so page switches don't re-fetch.
 */
export function useSnapshot(): UseQueryResult<OverviewSnapshot> {
  const fetchSnapshot = useServerFn(getSnapshot);
  return useQuery({
    queryKey: ["bi", "snapshot"],
    queryFn: () => fetchSnapshot({ data: { forceRefresh: false } }),
    staleTime: 60_000,
    retry: 1,
  });
}
