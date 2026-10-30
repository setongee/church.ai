'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Download, ExternalLink, Camera, MessageCircle, Share2, Sparkles, X } from 'lucide-react';
import { assetUrl, generateDesignCaption, patchDesign, publishDesignToInstagram } from '@/lib/api';
import type { Design } from '@/lib/types';
import { dataUrlToBlob, type DesignCanvas } from './useDesignCanvas';
import { Spinner, cx } from './ui';

function isMobileDevice() {
  return typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent);
}

function isPublicUrl(url: string) {
  return /^https?:\/\//.test(url) && !/\/\/(localhost|127\.|0\.0\.0\.0|192\.168\.|10\.)/.test(url);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function ShareDialog({
  ed,
  design,
  onDesignChange,
  onClose,
}: {
  ed: DesignCanvas;
  design: Design;
  onDesignChange: (d: Design) => void;
  onClose: () => void;
}) {
  const [caption, setCaption] = useState(design.caption ?? '');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [preview, setPreview] = useState('');

  const ratio = ed.size.w / ed.size.h;
  const igKind = ratio > 1.91 ? 'unsupported' : ratio < 0.8 ? 'story' : 'feed';

  // Fresh preview each time the dialog opens, so what's shown is exactly what gets shared.
  useEffect(() => {
    let alive = true;
    ed.renderDataUrl('jpeg', { quality: 0.8, maxSide: 720 })
      .then((u) => alive && setPreview(u))
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stable listener: the editor's own Escape handler re-renders mid-dispatch, and a listener
  // that gets swapped during dispatch never sees the event.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCloseRef.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setNotice(null);
    try {
      await fn();
    } catch (err) {
      setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Something went wrong' });
    } finally {
      setBusy('');
    }
  }

  async function saveCaption() {
    if (caption === (design.caption ?? '')) return;
    try {
      onDesignChange(await patchDesign(design._id, { caption }));
    } catch {
      // surfaced on the next explicit action
    }
  }

  async function pngBlob() {
    return dataUrlToBlob(await ed.renderDataUrl('png'));
  }

  const slug = (design.title || 'design').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'design';

  const download = (format: 'png' | 'jpeg') =>
    run('download', async () => {
      const blob = format === 'png' ? await pngBlob() : dataUrlToBlob(await ed.renderDataUrl('jpeg', { quality: 0.95 }));
      triggerDownload(blob, `${slug}.${format === 'png' ? 'png' : 'jpg'}`);
      setNotice({ tone: 'ok', text: 'Downloaded.' });
    });

  async function copyImage(): Promise<boolean> {
    try {
      const blob = await pngBlob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      return true;
    } catch {
      return false;
    }
  }

  const copy = () =>
    run('copy', async () => {
      if (!(await copyImage())) throw new Error("Your browser blocked copying the image. Use Download instead.");
      setNotice({ tone: 'ok', text: 'Image copied — paste it anywhere.' });
    });

  async function nativeShare(): Promise<boolean> {
    const file = new File([await pngBlob()], `${slug}.png`, { type: 'image/png' });
    if (!navigator.canShare?.({ files: [file] })) return false;
    try {
      await navigator.share({ files: [file], text: caption || design.text });
      return true;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return true;
      throw err;
    }
  }

  const share = () =>
    run('share', async () => {
      if (!(await nativeShare())) throw new Error("Sharing files isn't supported in this browser. Use download or copy.");
    });

  const whatsapp = () =>
    run('whatsapp', async () => {
      // On phones the native share sheet is the only way to send the actual picture to WhatsApp.
      if (isMobileDevice() && (await nativeShare())) return;
      let link = '';
      try {
        const updated = await ed.exportToServer();
        onDesignChange(updated);
        if (updated.exportedImageUrl && isPublicUrl(assetUrl(updated.exportedImageUrl))) link = assetUrl(updated.exportedImageUrl);
      } catch {
        // sharing text only is still useful
      }
      const copied = await copyImage();
      const text = [caption || design.text, link].filter(Boolean).join('\n\n');
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
      setNotice({
        tone: 'ok',
        text: copied ? 'WhatsApp opened. Your image is on the clipboard — paste it into the chat.' : 'WhatsApp opened with your caption. Download the image and attach it.',
      });
    });

  const instagram = () =>
    run('instagram', async () => {
      if (caption !== (design.caption ?? '')) onDesignChange(await patchDesign(design._id, { caption }));
      await ed.exportToServer(true);
      onDesignChange(await publishDesignToInstagram(design._id));
      setNotice({ tone: 'ok', text: igKind === 'story' ? 'Posted to your Instagram story.' : 'Posted to Instagram.' });
    });

  const instagramManual = () =>
    run('instagram-manual', async () => {
      if (isMobileDevice() && (await nativeShare())) return;
      const blob = await pngBlob();
      triggerDownload(blob, `${slug}.png`);
      if (caption) await navigator.clipboard.writeText(caption).catch(() => {});
      window.open('https://www.instagram.com/', '_blank', 'noopener,noreferrer');
      setNotice({ tone: 'ok', text: 'Image downloaded and caption copied. Upload it from Instagram.' });
    });

  const writeCaption = () =>
    run('caption', async () => {
      const updated = await generateDesignCaption(design._id);
      setCaption(updated.caption ?? '');
      onDesignChange(updated);
    });

  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const posted = Boolean(design.instagramMediaId);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Share design" className="flex max-h-[94dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-neutral-900">Share your design</h2>
            <p className="text-xs text-neutral-500">
              {ed.size.w}×{ed.size.h}px · post to Instagram, send to WhatsApp, or save it.
            </p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100">
            <X size={18} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto p-5 md:grid-cols-[minmax(0,15rem)_1fr]">
          <div className="mx-auto w-full max-w-[15rem] md:max-w-none">
            <div className="flex aspect-square items-center justify-center rounded-xl bg-neutral-100 p-2 md:aspect-auto md:min-h-60">
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="Design preview" className="max-h-72 w-auto rounded-md object-contain shadow" />
              ) : (
                <Spinner className="text-neutral-400" />
              )}
            </div>
            {posted && (
              <a href={design.instagramPermalink || '#'} target="_blank" rel="noreferrer" className="mt-3 flex items-center justify-center gap-1.5 rounded-lg bg-green-50 px-3 py-2 text-xs font-medium text-green-700">
                <Check size={14} /> Posted to Instagram {design.instagramPermalink && <ExternalLink size={12} />}
              </a>
            )}
          </div>

          <div className="min-w-0 space-y-5">
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Caption</label>
                <button type="button" onClick={writeCaption} disabled={Boolean(busy)} className="flex items-center gap-1 text-xs font-medium text-neutral-900 hover:underline disabled:opacity-50">
                  {busy === 'caption' ? <Spinner className="h-3 w-3" /> : <Sparkles size={12} />} Write with AI
                </button>
              </div>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                onBlur={saveCaption}
                rows={4}
                placeholder="Add a caption for Instagram or WhatsApp…"
                className="w-full resize-y rounded-xl border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:border-neutral-500"
              />
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" disabled={Boolean(busy)} onClick={whatsapp} className="flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3 text-sm font-semibold text-white hover:brightness-95 disabled:opacity-60">
                {busy === 'whatsapp' ? <Spinner /> : <MessageCircle size={17} />} WhatsApp
              </button>
              <button
                type="button"
                disabled={Boolean(busy) || igKind === 'unsupported'}
                onClick={instagram}
                className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-600 via-pink-600 to-orange-500 px-4 py-3 text-sm font-semibold text-white hover:brightness-95 disabled:opacity-60"
              >
                {busy === 'instagram' ? <Spinner /> : <Camera size={17} />}
                {igKind === 'story' ? 'Post as Story' : posted ? 'Post again' : 'Post to Instagram'}
              </button>
            </div>
            {igKind === 'unsupported' && <p className="text-xs text-amber-700">Instagram doesn&apos;t accept images wider than 1.91:1. Change the size to post directly.</p>}
            {igKind === 'story' && <p className="text-xs text-neutral-500">This size is taller than 4:5, so it will be posted as an Instagram Story (no caption).</p>}

            <button type="button" disabled={Boolean(busy)} onClick={instagramManual} className="text-xs font-medium text-neutral-500 underline-offset-2 hover:text-neutral-800 hover:underline">
              Instagram not connected? Download + copy caption and upload manually
            </button>

            <div className="grid grid-cols-2 gap-2 border-t border-neutral-100 pt-4 sm:grid-cols-4">
              {[
                { key: 'png', label: 'PNG', icon: <Download size={15} />, onClick: () => download('png') },
                { key: 'jpg', label: 'JPG', icon: <Download size={15} />, onClick: () => download('jpeg') },
                { key: 'copy', label: busy === 'copy' ? 'Copying' : 'Copy image', icon: <Copy size={15} />, onClick: copy },
                ...(canNativeShare ? [{ key: 'share', label: 'More…', icon: <Share2 size={15} />, onClick: share }] : []),
              ].map((b) => (
                <button key={b.key} type="button" disabled={Boolean(busy)} onClick={b.onClick} className="flex items-center justify-center gap-1.5 rounded-lg border border-neutral-200 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-60">
                  {b.icon} {b.label}
                </button>
              ))}
            </div>

            {notice && (
              <p className={cx('rounded-lg px-3 py-2 text-xs leading-snug', notice.tone === 'ok' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700')} role="status">
                {notice.text}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
