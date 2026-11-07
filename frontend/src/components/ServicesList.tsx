"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createService, listServices, deleteService } from "@/lib/api";
import type { Service } from "@/lib/types";
import { useAuth } from "@/components/AuthProvider";
import { useCached } from "@/lib/queries";
import { Modal } from "@/components/present/ui";
import { Plus } from "lucide-react";

export function ServicesList() {
  const router = useRouter();
  const { user } = useAuth();
  const admin = Boolean(user?.isAdmin); // only admins create and delete services
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [creating, setCreating] = useState(false); // the create-service modal
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Cached: the list shows instantly from what was fetched before, and re-checks in the background.
  const { data, set: setServices } = useCached<Service[]>(["services"], listServices);
  const services = data ?? [];

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) {
      setError("Service name is required.");
      return;
    }
    setLoading(true);
    try {
      const service = await createService({
        name: name.trim(),
        date: date || undefined,
      });
      router.push(`/services/${service._id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create service");
      setLoading(false);
    }
  }

  const field =
    "mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none";

  return (
    <main className="mx-auto w-full max-w-8xl px-4 py-8 sm:px-20 sm:py-10">
      {admin && (
        <div className="mb-6 flex justify-between items-center">
          <h1 className="text-lg font-semibold">All Services</h1>
          <button
            onClick={() => {
              setName("");
              setDate("");
              setError("");
              setCreating(true);
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-semibold text-[#ffffff] hover:bg-orange-700"
          >
            <Plus size={16} /> Create a new service
          </button>
        </div>
      )}
      {error && !creating && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
        {services.length === 0 && (
          <li className="col-span-full rounded-xl border border-neutral-200 bg-white px-4 py-10 text-center text-sm text-neutral-400">
            No services yet.
            {admin ? " Use “Create a new service” to add one." : ""}
          </li>
        )}
        {services.map((s) => (
          <li key={s._id} className="group relative">
            {admin && (
              <button
                type="button"
                title="Delete this service and all its sessions"
                aria-label={`Delete ${s.name}`}
                onClick={async () => {
                  if (
                    !confirm(
                      `Delete "${s.name}" and ALL its sessions, transcripts, quotes, reels and videos? This cannot be undone.`,
                    )
                  )
                    return;
                  try {
                    await deleteService(s._id);
                    setServices((prev) => prev?.filter((x) => x._id !== s._id));
                  } catch (err) {
                    setError(
                      err instanceof Error ? err.message : "Failed to delete",
                    );
                  }
                }}
                className="absolute right-2 bottom-2 z-10 rounded-md px-1.5 py-0.5 text-xs text-neutral-300 opacity-0 hover:bg-red-50 hover:text-red-600 focus:opacity-100 group-hover:opacity-100"
              >
                Delete
              </button>
            )}
            <button
              onClick={() => router.push(`/services/${s._id}`)}
              className="flex cursor-pointer h-full w-full flex-col items-start gap-1 rounded-xl bg-white p-6 text-left hover:border-neutral-300"
            >
              <div className="flex w-full items-center justify-between mb-3">
                <span className="text-sm text-neutral-500">
                  {s.date
                    ? new Date(s.date).toLocaleDateString(undefined, {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        timeZone: "UTC",
                      })
                    : `Created ${new Date(s.createdAt).toLocaleDateString()}`}
                </span>
                <span className="mt-1 inline-flex rounded-full bg-orange-50 px-2.5 py-0.5 text-xs font-semibold text-orange-700">
                  {s.sessionCount ?? 0}{" "}
                  {s.sessionCount === 1 ? "session" : "sessions"}
                </span>
              </div>
              <span className="text-md font-medium text-neutral-900">
                {s.name}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {creating && (
        <Modal
          title="Create a new service"
          guard
          onClose={() => !loading && setCreating(false)}
        >
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700">
                Service name *
              </label>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Sunday Service - Sept 7"
                className={field}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700">
                Service date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={field}
              />
              <p className="mt-1 text-xs text-neutral-400">
                Shows on the team&apos;s calendars once they&apos;re rostered.
              </p>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreating(false)}
                disabled={loading}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !name.trim()}
                className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-[#ffffff] hover:bg-orange-700 disabled:opacity-50"
              >
                {loading ? "Creating…" : "Create service"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </main>
  );
}
