import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import type { Brand, MessageNotes } from '@/lib/types';
import { FORMATS, renderNotes, type NotesFormat } from './layout';

const safe = (s: string) => s.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 50) || 'message-notes';

export const notesFileName = (notes: MessageNotes, format: NotesFormat, ext: 'pdf' | 'zip') =>
  `${safe(notes.title)}-notes-${format === 'book' ? 'book' : format === 'slides' ? 'slides' : 'pages'}.${ext}`;

// Pages become PDF pages at their natural proportions. The book is true A4; the other formats keep
// their own shape. Text on the pages is drawn as artwork, and the "listen" button stays clickable.
export async function buildPdf(notes: MessageNotes, brand: Brand | null, themeId: string, format: NotesFormat, onProgress?: (done: number, total: number) => void): Promise<Blob> {
  const { pages, size } = await renderNotes(notes, brand, themeId, format);
  try {
    const k = format === 'book' ? 595.28 / size.w : 0.5;
    const w = size.w * k;
    const h = size.h * k;
    const doc = new jsPDF({ orientation: w > h ? 'landscape' : 'portrait', unit: 'pt', format: [w, h], compress: true });
    doc.setProperties({ title: `${notes.title} - Message Notes`, author: notes.preacher, subject: 'Message notes' });
    // Render at about 2x the page's point size for a crisp print.
    const multiplier = format === 'book' ? 1.7 : 1;
    pages.forEach((p, i) => {
      if (i > 0) doc.addPage([w, h], w > h ? 'landscape' : 'portrait');
      doc.addImage(p.toDataURL({ format: 'jpeg', quality: 0.93, multiplier }), 'JPEG', 0, 0, w, h, undefined, 'FAST');
      p.links.forEach((l) => doc.link(l.x * k, l.y * k, l.w * k, l.h * k, { url: l.url }));
      onProgress?.(i + 1, pages.length);
    });
    return doc.output('blob');
  } finally {
    await Promise.all(pages.map((p) => p.dispose()));
  }
}

// Each page as a numbered PNG in a ZIP (e.g. for EasyWorship or sharing as images).
export async function buildImagesZip(notes: MessageNotes, brand: Brand | null, themeId: string, format: NotesFormat, onProgress?: (done: number, total: number) => void): Promise<Blob> {
  const { pages } = await renderNotes(notes, brand, themeId, format);
  try {
    const zip = new JSZip();
    const multiplier = format === 'book' ? 1.7 : 1;
    pages.forEach((p, i) => {
      const data = p.toDataURL({ format: 'png', multiplier }).split(',')[1];
      zip.file(`${String(i + 1).padStart(2, '0')}.png`, data, { base64: true });
      onProgress?.(i + 1, pages.length);
    });
    return await zip.generateAsync({ type: 'blob' });
  } finally {
    await Promise.all(pages.map((p) => p.dispose()));
  }
}

export { FORMATS };
