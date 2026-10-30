"use client";

import { useMemo } from "react";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { CACHE_KEY, CACHE_MAX_AGE, getQueryClient } from "@/lib/cache";

// Wraps the app in the query cache, saved to localStorage so a refresh starts from what was already fetched.
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const client = getQueryClient();
  const persister = useMemo(() => {
    try {
      return typeof window === "undefined" ? undefined : createSyncStoragePersister({ storage: window.localStorage, key: CACHE_KEY, throttleTime: 1500 });
    } catch {
      return undefined;
    }
  }, []);
  if (!persister) return <PersistQueryClientProvider client={client} persistOptions={{ persister: createSyncStoragePersister({ storage: undefined }), maxAge: 0 }}>{children}</PersistQueryClientProvider>;
  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{
        persister,
        maxAge: CACHE_MAX_AGE,
        buster: "v1", // bump to throw away every browser's saved cache after a data-shape change
        dehydrateOptions: { shouldDehydrateQuery: (q) => q.state.status === "success" && q.meta?.persist !== false },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
