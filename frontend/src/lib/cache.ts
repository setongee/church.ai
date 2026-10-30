import { QueryClient, isServer } from "@tanstack/react-query";

// Page data is cached (and kept across refreshes) with React Query. Cached data shows instantly; it's re-checked in the
// background once it's older than `staleTime`, and again after anything is changed through the API.
export const CACHE_KEY = "fafc-query-cache";
export const CACHE_MAX_AGE = 24 * 60 * 60 * 1000;

const make = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000, // data younger than a minute is used as-is
        gcTime: CACHE_MAX_AGE, // and kept for a day (so it survives a refresh)
        retry: 1,
        refetchOnWindowFocus: true, // coming back to the tab re-checks anything that's gone stale
      },
    },
  });

let browserClient: QueryClient | undefined;
export const getQueryClient = () => (isServer ? make() : (browserClient ??= make()));

// Called after any successful change (create / edit / delete): everything cached is now suspect, so it's marked stale
// and whatever is on screen is re-fetched right away. Nothing is fetched for pages you aren't looking at.
export function afterMutation() {
  if (!isServer && browserClient) void browserClient.invalidateQueries();
}

// Sign-out, or a different person signing in: nothing cached may carry over.
export function clearCache() {
  browserClient?.clear();
  try {
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem("auth-user");
    localStorage.removeItem("rq-user");
  } catch {}
}
