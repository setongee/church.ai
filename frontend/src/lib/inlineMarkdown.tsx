import type { ReactNode } from 'react';

// Renders a small, safe subset of markdown emphasis (**bold**, *italic*) as React nodes, for text
// that comes from an LLM instructed to lightly mark up its own output - not a general markdown
// parser (no links, headings, lists, etc).
export function renderInlineMarkdown(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}
