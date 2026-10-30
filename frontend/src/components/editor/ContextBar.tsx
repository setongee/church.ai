'use client';

import {
  AlignCenter,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignHorizontalJustifyStart,
  AlignLeft,
  AlignRight,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  ArrowDownToLine,
  ArrowUpToLine,
  Bold,
  Copy,
  FlipHorizontal,
  FlipVertical,
  Highlighter,
  Italic,
  Lock,
  LockOpen,
  Minus,
  Plus,
  Strikethrough,
  Trash2,
  Underline,
} from 'lucide-react';
import { getFontEntry } from '@/lib/fonts';
import type { Brand } from '@/lib/types';
import { DataBinding } from './DataBinding';
import type { DesignCanvas } from './useDesignCanvas';
import { FontPicker } from './FontPicker';
import { ColorInput, IconButton, Popover, cx } from './ui';

function Divider() {
  return <span className="mx-1 h-5 w-px shrink-0 bg-neutral-200" />;
}

export function ContextBar({ ed, brand }: { ed: DesignCanvas; brand: Brand | null }) {
  const sel = ed.selection;

  if (!sel) return null;

  const t = sel.text;
  const entry = t ? getFontEntry(t.fontFamily) : undefined;
  const weights = entry?.weights.length ? entry.weights : [400, 700];
  const boldWeight = weights.includes(700) ? 700 : Math.max(...weights);
  const isBold = t ? t.fontWeight >= 600 : false;

  return (
    <div className="flex h-12 items-center gap-0.5 overflow-x-auto px-3 [scrollbar-width:thin]">
      <DataBinding ed={ed} brand={brand} />
      {t && (
        <>
          <FontPicker value={t.fontFamily} onChange={(f) => ed.updateText({ fontFamily: f })} />
          <div className="mx-1 flex h-8 shrink-0 items-center rounded-lg border border-neutral-200">
            <IconButton title="Smaller" onClick={() => ed.updateText({ fontSize: Math.max(8, t.fontSize - 2) })} className="h-7">
              <Minus size={14} />
            </IconButton>
            <input
              type="number"
              value={t.fontSize}
              min={8}
              max={600}
              onChange={(e) => ed.updateText({ fontSize: Math.max(8, Number(e.target.value) || 8) })}
              className="h-7 w-12 bg-transparent text-center text-sm tabular-nums outline-none"
              aria-label="Font size"
            />
            <IconButton title="Larger" onClick={() => ed.updateText({ fontSize: t.fontSize + 2 })} className="h-7">
              <Plus size={14} />
            </IconButton>
          </div>
          <select
            value={weights.includes(t.fontWeight) ? t.fontWeight : weights.reduce((a, b) => (Math.abs(b - t.fontWeight) < Math.abs(a - t.fontWeight) ? b : a))}
            onChange={(e) => ed.updateText({ fontWeight: Number(e.target.value) })}
            className="h-8 w-[5.5rem] shrink-0 rounded-lg border border-neutral-200 bg-white px-1.5 text-xs"
            aria-label="Font weight"
          >
            {weights.map((w) => (
              <option key={w} value={w}>
                {{ 100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' }[w] ?? w}
              </option>
            ))}
          </select>
          <Divider />
          <IconButton title="Bold" active={isBold} onClick={() => ed.updateText({ fontWeight: isBold ? 400 : boldWeight })}>
            <Bold size={16} />
          </IconButton>
          <IconButton title="Italic" active={t.italic} onClick={() => ed.updateText({ fontStyle: t.italic ? 'normal' : 'italic' })}>
            <Italic size={16} />
          </IconButton>
          <IconButton title="Underline" active={t.underline} onClick={() => ed.updateText({ underline: !t.underline })}>
            <Underline size={16} />
          </IconButton>
          <IconButton title="Strikethrough" active={t.linethrough} onClick={() => ed.updateText({ linethrough: !t.linethrough })}>
            <Strikethrough size={16} />
          </IconButton>
          <Divider />
          <ColorInput title="Text colour" value={t.fill} onChange={(c) => ed.updateText({ fill: c || '#ffffff' })} />
          <ColorInput
            title={t.hasRange ? 'Highlight selected text' : 'Highlight text'}
            value={t.textBackgroundColor}
            allowNone
            onChange={(c) => ed.updateText({ textBackgroundColor: c })}
          >
            <Highlighter size={15} className="text-neutral-600" />
          </ColorInput>
          <Divider />
          {(['left', 'center', 'right'] as const).map((a) => (
            <IconButton key={a} title={`Align ${a}`} active={t.textAlign === a} onClick={() => ed.updateText({ textAlign: a })}>
              {a === 'left' ? <AlignLeft size={16} /> : a === 'center' ? <AlignCenter size={16} /> : <AlignRight size={16} />}
            </IconButton>
          ))}
          <Divider />
        </>
      )}

      {sel.kind === 'shape' && (
        <>
          <ColorInput title="Fill" value={sel.fill} allowNone onChange={(c) => ed.updateObject({ fill: c || 'transparent' }, false)} onCommit={ed.commit}>
            <span className="text-xs font-medium text-neutral-600">Fill</span>
          </ColorInput>
          <ColorInput title="Outline" value={sel.stroke} allowNone onChange={(c) => ed.updateObject({ stroke: c || null }, false)} onCommit={ed.commit}>
            <span className="text-xs font-medium text-neutral-600">Outline</span>
          </ColorInput>
          <label className="flex shrink-0 items-center gap-1.5 text-xs text-neutral-500">
            <span className="hidden sm:inline">Width</span>
            <input type="range" min={0} max={40} value={sel.strokeWidth} onChange={(e) => ed.updateObject({ strokeWidth: Number(e.target.value) }, false)} onPointerUp={ed.commit} className="w-16 accent-neutral-900" />
          </label>
          <Divider />
        </>
      )}

      {(sel.kind === 'image' || sel.kind === 'shape' || sel.kind === 'text') && (
        <label className="flex shrink-0 items-center gap-1.5 text-xs text-neutral-500">
          <span>Opacity</span>
          <input
            type="range"
            min={0.05}
            max={1}
            step={0.05}
            value={sel.opacity}
            onChange={(e) => ed.updateObject({ opacity: Number(e.target.value) }, false)}
            onPointerUp={ed.commit}
            className="w-16 accent-neutral-900"
            aria-label="Opacity"
          />
        </label>
      )}

      {sel.kind === 'image' && (
        <>
          <IconButton title="Flip horizontally" onClick={() => ed.flip('x')}>
            <FlipHorizontal size={16} />
          </IconButton>
          <IconButton title="Flip vertically" onClick={() => ed.flip('y')}>
            <FlipVertical size={16} />
          </IconButton>
        </>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-0.5 pl-2">
        <Popover
          align="right"
          className="w-44"
          trigger={(_, toggle) => (
            <IconButton title="Align to canvas" onClick={toggle}>
              <AlignHorizontalJustifyCenter size={16} />
            </IconButton>
          )}
        >
          {(close) => (
            <div className="grid grid-cols-3 gap-1">
              {(
                [
                  ['left', AlignHorizontalJustifyStart],
                  ['center', AlignHorizontalJustifyCenter],
                  ['right', AlignHorizontalJustifyEnd],
                  ['top', AlignVerticalJustifyStart],
                  ['middle', AlignVerticalJustifyCenter],
                  ['bottom', AlignVerticalJustifyEnd],
                ] as const
              ).map(([dir, Icon]) => (
                <IconButton
                  key={dir}
                  title={`Align ${dir}`}
                  className="h-9"
                  onClick={() => {
                    ed.align(dir);
                    close();
                  }}
                >
                  <Icon size={17} />
                </IconButton>
              ))}
            </div>
          )}
        </Popover>
        <IconButton title="Bring to front" onClick={() => ed.moveLayer('front')}>
          <ArrowUpToLine size={16} />
        </IconButton>
        <IconButton title="Send to back" onClick={() => ed.moveLayer('back')}>
          <ArrowDownToLine size={16} />
        </IconButton>
        <IconButton title="Duplicate (Ctrl/Cmd+D)" onClick={ed.duplicate}>
          <Copy size={16} />
        </IconButton>
        <IconButton title={sel.locked ? 'Unlock' : 'Lock'} active={sel.locked} onClick={() => ed.setLocked(!sel.locked)}>
          {sel.locked ? <Lock size={16} /> : <LockOpen size={16} />}
        </IconButton>
        <IconButton title="Delete" onClick={ed.deleteSelected} className={cx('hover:bg-red-50 hover:text-red-600')}>
          <Trash2 size={16} />
        </IconButton>
      </div>
    </div>
  );
}
