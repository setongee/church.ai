"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createService, listServices } from "@/lib/api";
import type { Service } from "@/lib/types";

export default function ServicesPage() {
  const router = useRouter();
  const [services, setServices] = useState<Service[]>([]);
  const [name, setName] = useState("");
  const [portraitTemplate, setPortraitTemplate] = useState<File | null>(null);
  const [landscapeTemplate, setLandscapeTemplate] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    listServices()
      .then(setServices)
      .catch(() => setServices([]));
  }, []);

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
        portraitTemplate,
        landscapeTemplate,
      });
      router.push(`/services/${service._id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create service");
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto w-6xl px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
        Services
      </h1>
      <p className="mt-1 text-sm text-neutral-500">
        A service groups the sessions (prayer, message, fresh fire, etc.) for
        one gathering, plus the default image templates used for quote graphics.
      </p>

      <form onSubmit={handleCreate} className="mt-8 rounded-lg bg-white p-6">
        <h2 className="text-base font-medium text-neutral-900">
          Create a new service
        </h2>
        <div className="mt-4">
          <label className="block text-sm font-medium text-neutral-700">
            Service name *
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Sunday Service - Sept 7"
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
          />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-neutral-700">
              Portrait template (1080 &times; 1350)
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setPortraitTemplate(e.target.files?.[0] ?? null)}
              className="mt-1 w-full text-sm text-neutral-600"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700">
              Landscape template (16:9)
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) =>
                setLandscapeTemplate(e.target.files?.[0] ?? null)
              }
              className="mt-1 w-full text-sm text-neutral-600"
            />
          </div>
        </div>
        <p className="mt-2 text-xs text-neutral-400">
          Optional - these become the default background for every quote image
          in this service. You can add or change them later, and override the
          image per quote too.
        </p>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="mt-5 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {loading ? "Creating..." : "Create service"}
        </button>
      </form>

      <section className="mt-10">
        <h2 className="text-base font-medium text-neutral-900">All services</h2>
        <ul className="mt-4 grid gap-4 sm:grid-cols-4">
          {services.length === 0 && (
            <li className="col-span-2 rounded-xl border border-neutral-200 bg-white px-4 py-6 text-center text-sm text-neutral-400">
              No services yet.
            </li>
          )}
          {services.map((s) => (
            <li key={s._id}>
              <button
                onClick={() => router.push(`/services/${s._id}`)}
                className="flex h-full w-full flex-col items-start gap-1 rounded-lg bg-white p-4 text-left hover:border-neutral-300"
              >
                <span className="text-sm font-medium text-neutral-900">
                  {s.name}
                </span>
                <span className="text-xs text-neutral-400">
                  Created {new Date(s.createdAt).toLocaleDateString()}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
