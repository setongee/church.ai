import type { Canvas, FabricObject } from 'fabric';
import { SAFE_MARGIN_RATIO } from './constants';

export interface SnapConfig {
  snapEnabled: () => boolean;
  gridVisible: () => boolean;
  scale: () => number;
  size: () => { w: number; h: number };
}

const GUIDE_COLOR = '#f43f5e';
const GRID_COLOR = 'rgba(34, 211, 238, 0.9)';

function isStructural(o: FabricObject) {
  const role = (o as FabricObject & { role?: string }).role;
  return Boolean(role);
}

// Smart guides: while dragging, the moving box's left/center/right (and top/middle/bottom) snap
// to the canvas edges, centre, safe margins and to the same lines of every other layer. The
// guide lines (plus the optional safe-area/thirds grid) are painted in `after:render` rather
// than being canvas objects, so they never end up in saved state, history or exports.
export function attachSnapping(canvas: Canvas, cfg: SnapConfig) {
  let vLines: number[] = [];
  let hLines: number[] = [];
  let suppressed = false;
  // The line each axis snapped to last event: stays preferred a little beyond the threshold so the
  // object doesn't flip between snapped/free (or between two nearby lines) as the pointer jitters.
  let stickyX: number | null = null;
  let stickyY: number | null = null;

  const clear = () => {
    stickyX = null;
    stickyY = null;
    if (vLines.length || hLines.length) {
      vLines = [];
      hLines = [];
      canvas.requestRenderAll();
    }
  };

  const onMoving = (e: { target?: FabricObject }) => {
    const target = e.target;
    if (!target || !cfg.snapEnabled()) return;
    // Fabric moves left/top first and only refreshes the cached corner coordinates later, so
    // without this the bounding box below is one event stale and the snap oscillates (flicker).
    target.setCoords();
    const { w, h } = cfg.size();
    const threshold = 8 / cfg.scale();
    const mx = w * SAFE_MARGIN_RATIO;
    const my = h * SAFE_MARGIN_RATIO;
    const xs = [0, w / 2, w, mx, w - mx];
    const ys = [0, h / 2, h, my, h - my];

    const moving = new Set<FabricObject>([target, ...canvas.getActiveObjects()]);
    for (const o of canvas.getObjects()) {
      if (moving.has(o) || !o.visible || isStructural(o)) continue;
      const r = o.getBoundingRect();
      xs.push(r.left, r.left + r.width / 2, r.left + r.width);
      ys.push(r.top, r.top + r.height / 2, r.top + r.height);
    }

    const r = target.getBoundingRect();
    const mineX = [r.left, r.left + r.width / 2, r.left + r.width];
    const mineY = [r.top, r.top + r.height / 2, r.top + r.height];

    const best = (mine: number[], targets: number[], sticky: number | null) => {
      let delta = 0;
      let line: number | null = null;
      let min = Infinity;
      for (const m of mine) {
        for (const t of targets) {
          const d = t - m;
          // Hold the previous line with extra reach; anything else must be within the threshold.
          const reach = sticky !== null && Math.abs(t - sticky) < 0.5 ? threshold * 1.8 : threshold;
          const score = Math.abs(d) - (sticky !== null && Math.abs(t - sticky) < 0.5 ? threshold * 0.6 : 0);
          if (Math.abs(d) <= reach && score < min) {
            min = score;
            delta = d;
            line = t;
          }
        }
      }
      return line === null ? { delta: 0, line: null } : { delta, line };
    };

    const bx = best(mineX, xs, stickyX);
    const by = best(mineY, ys, stickyY);
    stickyX = bx.line;
    stickyY = by.line;
    if (bx.line !== null || by.line !== null) {
      target.set({ left: (target.left ?? 0) + bx.delta, top: (target.top ?? 0) + by.delta });
      target.setCoords();
    }
    vLines = bx.line !== null ? [bx.line] : [];
    hLines = by.line !== null ? [by.line] : [];
  };

  const onAfterRender = ({ ctx }: { ctx: CanvasRenderingContext2D }) => {
    // Interactive canvases also fire this for the top (selection) layer; draw once, on the main one.
    if (suppressed || ctx !== canvas.getContext()) return;
    const { w, h } = cfg.size();
    const s = cfg.scale();
    ctx.save();
    // after:render fires with the transform already reset; re-apply the zoom so the overlay is
    // positioned in design coordinates.
    const v = canvas.viewportTransform;
    ctx.transform(v[0], v[1], v[2], v[3], v[4], v[5]);
    if (cfg.gridVisible()) {
      const mx = w * SAFE_MARGIN_RATIO;
      const my = h * SAFE_MARGIN_RATIO;
      ctx.strokeStyle = GRID_COLOR;
      ctx.lineWidth = 1.5 / s;
      ctx.setLineDash([10 / s, 8 / s]);
      ctx.strokeRect(mx, my, w - mx * 2, h - my * 2);
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = 1 / s;
      ctx.beginPath();
      for (const f of [1 / 3, 2 / 3]) {
        ctx.moveTo(w * f, 0);
        ctx.lineTo(w * f, h);
        ctx.moveTo(0, h * f);
        ctx.lineTo(w, h * f);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (vLines.length || hLines.length) {
      ctx.strokeStyle = GUIDE_COLOR;
      ctx.lineWidth = 1.5 / s;
      ctx.beginPath();
      vLines.forEach((x) => {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      });
      hLines.forEach((y) => {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      });
      ctx.stroke();
    }
    ctx.restore();
  };

  canvas.on('object:moving', onMoving);
  canvas.on('after:render', onAfterRender);
  canvas.on('mouse:up', clear);
  canvas.on('object:modified', clear);

  return {
    clear,
    // Hide every overlay for the duration of an export render.
    setSuppressed(value: boolean) {
      suppressed = value;
      if (value) {
        vLines = [];
        hLines = [];
      }
    },
    dispose() {
      canvas.off('object:moving', onMoving);
      canvas.off('after:render', onAfterRender);
      canvas.off('mouse:up', clear);
      canvas.off('object:modified', clear);
    },
  };
}

export type SnapController = ReturnType<typeof attachSnapping>;
