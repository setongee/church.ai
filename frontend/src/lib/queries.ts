"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient, type QueryKey, type UseQueryOptions } from "@tanstack/react-query";

// A drop-in for the `useState` + `useEffect(fetch)` pattern, backed by the cache: `data` is undefined only the very
// first time (nothing cached yet); `set` edits the cached copy (optimistic updates), and `reload` re-fetches now.
export function useCached<T>(key: QueryKey, fetcher: () => Promise<T>, opts?: { staleTime?: number; enabled?: boolean; refetchInterval?: UseQueryOptions<T>["refetchInterval"] }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: key, queryFn: fetcher, ...opts });
  const k = JSON.stringify(key);
  const set = useCallback((u: T | undefined | ((prev: T | undefined) => T | undefined)) => qc.setQueryData<T>(JSON.parse(k), u as never), [qc, k]);
  return { data: q.data, set, reload: q.refetch, error: q.error as Error | null, loading: q.isPending, fetching: q.isFetching };
}
