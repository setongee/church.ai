'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Services' },
  { href: '/quotes', label: 'Quotes' },
];

export function NavBar() {
  const pathname = usePathname();

  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
        <span className="text-sm font-semibold text-neutral-900">Live Transcription</span>
        <nav className="flex gap-4">
          {LINKS.map((link) => {
            const active =
              link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm font-medium ${
                  active ? 'text-neutral-900' : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
