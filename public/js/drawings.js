import { drawingGeometry, hitGeometry } from '../lib/drawing-model.js';
// Drawing tools, rendered as a Lightweight Charts series primitive. Points are stored as
// { time (UTC seconds), price } so drawings stay put when you change timeframe.

export const TOOLS = [
  { id: "measure", label: "Ruler / measurement", points: 2,
    icon: '<path d="M3 16L16 3l5 5L8 21zM6 13l2 2M9 10l3 3M12 7l2 2M15 4l3 3"/>' },
  { id: "cursor", label: "Cursor", icon: '<path d="M5 3l14 7-6 2-2 6z"/>' },
  {
    id: "trend",
    label: "Trend line",
    points: 2,
    icon: '<path d="M4 19L20 5"/><circle cx="4" cy="19" r="1.6"/><circle cx="20" cy="5" r="1.6"/>',
  },
  {
    id: "ray",
    label: "Ray",
    points: 2,
    icon: '<path d="M4 19L21 4"/><circle cx="4" cy="19" r="1.6"/><circle cx="11" cy="13" r="1.6"/>',
  },
  {
    id: "extended",
    label: "Extended line",
    points: 2,
    icon: '<path d="M2 21L22 3"/><circle cx="8" cy="16" r="1.6"/><circle cx="16" cy="9" r="1.6"/>',
  },
  {
    id: "hline",
    label: "Horizontal line",
    points: 1,
    icon: '<path d="M3 12h18"/><circle cx="12" cy="12" r="1.6"/>',
  },
  {
    id: "hray",
    label: "Horizontal ray",
    points: 1,
    icon: '<path d="M8 12h13"/><circle cx="8" cy="12" r="1.6"/>',
  },
  {
    id: "vline",
    label: "Vertical line",
    points: 1,
    icon: '<path d="M12 3v18"/><circle cx="12" cy="12" r="1.6"/>',
  },
  {
    id: "channel",
    label: "Parallel channel",
    points: 3,
    icon: '<path d="M3 15L15 5M9 21l12-10"/>',
  },
  {
    id: "rect",
    label: "Rectangle",
    points: 2,
    icon: '<rect x="4" y="6" width="16" height="12" rx="1"/>',
  },
  {
    id: "fib",
    label: "Fib retracement",
    points: 2,
    icon: '<path d="M3 5h18M3 10h18M3 14h18M3 19h18" stroke-dasharray="2 2"/>',
  },
  {
    id: "long",
    label: "Long position",
    points: 2,
    icon: '<rect x="4" y="5" width="16" height="7" fill="currentColor" fill-opacity=".25"/><rect x="4" y="12" width="16" height="7"/>',
  },
  {
    id: "short",
    label: "Short position",
    points: 2,
    icon: '<rect x="4" y="5" width="16" height="7"/><rect x="4" y="12" width="16" height="7" fill="currentColor" fill-opacity=".25"/>',
  },
  {
    id: "text",
    label: "Text note",
    points: 1,
    icon: '<path d="M5 6h14M12 6v13"/>',
  },
];
export const TOOL_BY_ID = Object.fromEntries(TOOLS.map((t) => [t.id, t]));
export { FIB_LEVELS } from '../lib/drawing-model.js';

export class DrawingLayer {
  constructor(pane) {
    this.pane = pane; this.items = []; this.temp = null; this.selected = null;
    this._view = { zOrder: () => 'top', renderer: () => ({ draw: (target) => target.useMediaCoordinateSpace(({ context, mediaSize }) => this.draw(context, mediaSize)) }) };
  }
  attached({ series, requestUpdate }) { this.series = series; this.requestUpdate = requestUpdate; }
  detached() { this.series = null; }
  updateAllViews() {}
  paneViews() { return [this._view]; }
  update() { this.requestUpdate?.(); this.pane.drawingEditor?.refreshToolbar(); }
  x(time) { return this.pane.timeToX(time); }
  y(price) { return this.series?.priceToCoordinate(price) ?? null; }
  get size() { return { width: this.pane.chart.timeScale().width(), height: this.pane.chart.panes()[0].getHeight() }; }
  get projection() {
    return {
      x: (time) => this.x(time), y: (price) => this.y(price),
      logicalOf: (time) => this.pane.logicalOf(time), formatPrice: (price) => this.pane.formatPrice(price),
      fromScreen: (x, y) => {
        const logical = this.pane.chart.timeScale().coordinateToLogical(x), price = this.series?.coordinateToPrice(y);
        const time = logical == null ? null : this.pane.timeOfLogical(logical);
        return Number.isFinite(time) && Number.isFinite(price) ? { time, price } : null;
      },
    };
  }
  geometry(item) { return drawingGeometry(item, this.projection, this.size); }
  setItems(items, { selectedId = null } = {}) {
    this.items = items || []; this.selected = this.items.find((d) => d.id === selectedId) || null;
    this.update();
  }
  hitTestDetailed(x, y, { tolerance = 7, handles = true } = {}) {
    const locked = (d) => d.locked || this.pane.app.settings.lockDrawings;
    if (handles && this.selected && !locked(this.selected)) {
      const control = this.geometry(this.selected)?.handles.find((h) => Math.hypot(x - h.x, y - h.y) <= tolerance + 2);
      if (control) return { item: this.selected, handle: control };
    }
    for (const item of [...this.items].reverse()) if (hitGeometry(this.geometry(item), x, y, tolerance)) return { item, handle: null };
    return null;
  }
  hitTest(x, y) { return this.hitTestDetailed(x, y, { handles: false })?.item || null; }
  draw(ctx, size) {
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, size.width, size.height); ctx.clip();
    for (const item of [...this.items, ...(this.temp ? [this.temp] : [])]) {
      try { this.drawOne(ctx, size, item, item === this.selected || item === this.temp); } catch { /* A drawing may be outside the current price scale. */ }
    }
    ctx.restore();
  }
  drawOne(ctx, size, item, active) {
    const g = drawingGeometry(item, this.projection, size);
    if (!g) return;
    const s = g.style, alpha = Math.max(0, Math.min(100, s.opacity)) / 100;
    ctx.save();
    for (const shape of g.polygons) {
      if (!shape.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))) continue;
      ctx.globalAlpha = alpha * shape.opacity / 100; ctx.fillStyle = shape.color;
      ctx.beginPath(); shape.points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.fill();
    }
    for (const line of g.segments) {
      if (![line.from.x, line.from.y, line.to.x, line.to.y].every(Number.isFinite)) continue;
      ctx.globalAlpha = alpha * (line.opacity ?? 100) / 100;
      ctx.strokeStyle = line.color || s.color; ctx.lineWidth = s.lineWidth;
      const dash = line.lineStyle || s.lineStyle;
      ctx.setLineDash(dash === 'Dashed' ? [7, 5] : dash === 'Dotted' ? [2, 4] : []);
      ctx.beginPath(); ctx.moveTo(line.from.x, line.from.y); ctx.lineTo(line.to.x, line.to.y); ctx.stroke();
    }
    ctx.setLineDash([]); ctx.font = `${item.bold ? '600 ' : ''}${s.fontSize}px -apple-system, Segoe UI, Roboto, sans-serif`;
    for (const label of g.labels) {
      if (![label.x, label.y].every(Number.isFinite)) continue;
      ctx.textAlign = label.align; ctx.textBaseline = 'middle';
      if (label.background) {
        const width = ctx.measureText(label.text).width + 10, height = s.fontSize + 6;
        const left = label.align === 'center' ? label.x - width / 2 : label.align === 'right' ? label.x - width : label.x;
        ctx.globalAlpha = alpha * (label.backgroundOpacity ?? 90) / 100; ctx.fillStyle = label.background;
        ctx.fillRect(left, label.y - height / 2, width, height);
      }
      ctx.globalAlpha = alpha; ctx.fillStyle = label.color || s.textColor;
      ctx.fillText(label.text, label.x + (label.background && label.align === 'left' ? 5 : 0), label.y);
    }
    if (active) {
      ctx.globalAlpha = 1; ctx.lineWidth = 1.5; ctx.fillStyle = '#ffffff'; ctx.strokeStyle = s.color;
      if (!item.locked && !this.pane.app.settings.lockDrawings) {
        for (const h of g.handles) if (Number.isFinite(h.x) && Number.isFinite(h.y)) {
          ctx.beginPath(); ctx.arc(h.x, h.y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
      } else if (g.handles.length) {
        const h = g.handles[0]; ctx.font = '10px sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#787b86'; ctx.fillText('Locked', h.x + 7, h.y - 10);
      }
    }
    ctx.restore();
  }
}
