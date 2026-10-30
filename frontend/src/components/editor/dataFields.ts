import type { Brand, Design, Minister, Session } from '@/lib/types';
import type { TemplateContent } from './templates/engine';

// What an element can be tied to. A bound element follows the data: change the preacher, title or
// photo and it updates, instead of the design having to be rebuilt.
export const TEXT_FIELDS: { key: string; label: string }[] = [
  { key: 'quote', label: 'Quote text' },
  { key: 'author', label: 'Preacher name' },
  { key: 'title', label: 'Message title' },
  { key: 'part', label: 'Series part' },
  { key: 'service', label: 'Service / session name' },
  { key: 'org', label: 'Church name' },
  { key: 'tagline', label: 'Church tagline' },
  { key: 'handle', label: 'Social handle' },
  { key: 'address', label: 'Address' },
  { key: 'website', label: 'Website' },
  { key: 'phone', label: 'Phone' },
  ...[1, 2, 3, 4, 5].map((n) => ({ key: `point:${n - 1}`, label: `Point ${n}` })),
];

export const IMAGE_FIELDS: { key: string; label: string }[] = [
  { key: 'preacher', label: "Preacher's photo" },
  { key: 'pastor', label: "Senior pastor's photo" },
  { key: 'logo', label: 'Church logo' },
];

export function slotLabel(slot: string | undefined): string {
  if (!slot) return '';
  return [...TEXT_FIELDS, ...IMAGE_FIELDS].find((f) => f.key === slot)?.label ?? slot;
}

export type Person = { name: string; title: string; imageUrl: string };

// The senior pastor plus every minister added in Brand.
export function allPeople(brand: Brand | null): Person[] {
  if (!brand) return [];
  const out: Person[] = [];
  if (brand.pastorName) out.push({ name: brand.pastorName, title: brand.pastorTitle, imageUrl: brand.pastorImageUrl });
  (brand.ministers ?? []).forEach((m: Minister) => out.push({ name: m.name, title: m.title, imageUrl: m.imageUrl }));
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/\b(pastor|pst|rev|reverend|apostle|prophet|bishop|dr|mr|mrs|minister|evangelist)\b\.?/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

// Finds the minister a name refers to ("Pst. Ada Obi" matches "Ada Obi").
export function findPerson(brand: Brand | null, name: string): Person | undefined {
  const n = norm(name);
  if (!n) return undefined;
  const people = allPeople(brand);
  return people.find((p) => norm(p.name) === n) ?? people.find((p) => norm(p.name).includes(n) || n.includes(norm(p.name)));
}

// The data a design can be bound to, from its session and the brand.
export function buildContent(design: Design, session: Session | null, brand: Brand | null): TemplateContent {
  const author = session?.preacher || brand?.pastorName || '';
  return {
    quote: (design.text || '').trim(),
    author,
    title: session?.summary?.topics?.[0] ?? '',
    part: '',
    service: session?.title ?? '',
    points: (session?.summary?.keyPoints ?? []).slice(0, 5),
    preacherImageUrl: findPerson(brand, author)?.imageUrl || '',
    brand,
    useBrand: true,
  };
}
