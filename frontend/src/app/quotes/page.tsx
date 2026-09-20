'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { listServices } from '@/lib/api';
import type { Service } from '@/lib/types';

export default function QuotesIndexPage() {
  const router = useRouter();
  const [services, setServices] = useState<Service[]>([]);

  useEffect(() => {
    listServices().then(setServices).catch(() => setServices([]));
  }, []);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Quotes</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Pick a service to see every quote generated across its sessions.
      </p>

      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        {services.length === 0 && (
          <li className="col-span-2 rounded-xl border border-neutral-200 bg-white px-4 py-6 text-center text-sm text-neutral-400">
            No services yet.
          </li>
        )}
        {services.map((s) => (
          <li key={s._id}>
            <button
              onClick={() => router.push(`/quotes/${s._id}`)}
              className="flex w-full flex-col items-start gap-1 rounded-xl border border-neutral-200 bg-white p-4 text-left shadow-sm hover:border-neutral-300"
            >
              <span className="text-sm font-medium text-neutral-900">{s.name}</span>
              <span className="text-xs text-neutral-400">
                Created {new Date(s.createdAt).toLocaleDateString()}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
