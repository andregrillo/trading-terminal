// Drawing state is plain data. Keep snapshots independent of objects being dragged.
export const copyDrawings = (items) => structuredClone(items || []);

export class DrawingHistory {
  constructor(limit = 100) { this.limit = limit; this.past = []; this.future = []; }
  record(before, after) {
    if (JSON.stringify(before) === JSON.stringify(after)) return false;
    this.past.push({ before: copyDrawings(before), after: copyDrawings(after) });
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
    return true;
  }
  undo() { const edit = this.past.pop(); if (!edit) return null; this.future.push(edit); return copyDrawings(edit.before); }
  redo() { const edit = this.future.pop(); if (!edit) return null; this.past.push(edit); return copyDrawings(edit.after); }
}

export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618];
export const FILL_TOOLS = ['rect', 'channel', 'measure', 'long', 'short', 'text'];
export function drawingStyle(d) {
  const directional = d.points?.[1]?.price >= d.points?.[0]?.price ? '#089981' : '#f23645';
  const color = d.color || (d.type === 'fib' || ['long', 'short'].includes(d.type) ? '#787b86' : d.type === 'measure' ? directional : '#2962ff');
  return {
    color, lineWidth: d.lineWidth ?? 1.5, lineStyle: d.lineStyle || 'Solid', opacity: d.opacity ?? 100,
    fillEnabled: d.fillEnabled !== false, fillColor: d.fillColor || color,
    fillOpacity: d.fillOpacity ?? ({ channel: 8, rect: 12, measure: 15, long: 18, short: 18, text: 100 }[d.type] || 12),
    targetColor: d.targetColor || '#089981', stopColor: d.stopColor || '#f23645',
    fontSize: d.fontSize || (d.type === 'text' ? 13 : 11), textColor: d.textColor || (d.type === 'text' ? '#ffffff' : color),
    extendLeft: d.extendLeft ?? d.type === 'extended',
    extendRight: d.extendRight ?? ['ray', 'extended'].includes(d.type),
  };
}

export function lineEnds(a, b, left, right) {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (!length) return [a, b];
  const dx = (b.x - a.x) / length * 1e5, dy = (b.y - a.y) / length * 1e5;
  return [left ? { x: a.x - dx, y: a.y - dy } : a, right ? { x: b.x + dx, y: b.y + dy } : b];
}

export function drawingGeometry(d, view, size) {
  const p = d.points.map((point) => ({ x: view.x(point.time), y: view.y(point.price), ...point }));
  if (!p.length || p.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return null;
  const [a, b, c] = p, style = drawingStyle(d);
  const segments = [], polygons = [], labels = [];
  let handles = p.map((point, index) => ({ x: point.x, y: point.y, id: `point-${index}`, kind: 'point', index }));
  const segment = (from, to, more = {}) => segments.push({ from, to, ...more });
  const polygon = (points, color = style.fillColor, opacity = style.fillOpacity) => { if (style.fillEnabled) polygons.push({ points, color, opacity }); };
  const label = (text, x, y, more = {}) => labels.push({ text, x, y, align: 'left', ...more });
  const price = view.formatPrice || ((value) => String(value));
  const box = (left, top, right, bottom) => [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }];
  if (['trend', 'ray', 'extended'].includes(d.type) && b) {
    segment(...lineEnds(a, b, style.extendLeft, style.extendRight));
  } else if (d.type === 'hline' || d.type === 'hray') {
    segment({ x: d.type === 'hline' ? 0 : a.x, y: a.y }, { x: size.width, y: a.y });
    if (d.showLabels !== false) label(price(a.price), size.width - 4, a.y - 10, { align: 'right' });
    if (d.type === 'hline') handles[0].x = Math.max(12, Math.min(size.width - 12, a.x));
  } else if (d.type === 'vline') {
    segment({ x: a.x, y: 0 }, { x: a.x, y: size.height });
    handles[0].y = Math.max(12, Math.min(size.height - 12, a.y));
  } else if (d.type === 'channel' && b) {
    segment(...lineEnds(a, b, style.extendLeft, style.extendRight));
    if (c) {
      const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1;
      const distance = (dx * (c.y - a.y) - dy * (c.x - a.x)) / length;
      const off = { x: -dy / length * distance, y: dx / length * distance };
      const aa = { x: a.x + off.x, y: a.y + off.y }, bb = { x: b.x + off.x, y: b.y + off.y };
      const first = lineEnds(a, b, style.extendLeft, style.extendRight), second = lineEnds(aa, bb, style.extendLeft, style.extendRight);
      segment(...second); polygon([first[0], first[1], second[1], second[0]]);
    }
  } else if (d.type === 'rect' && b) {
    const left = style.extendLeft ? 0 : Math.min(a.x, b.x), right = style.extendRight ? size.width : Math.max(a.x, b.x);
    const corners = box(left, Math.min(a.y, b.y), right, Math.max(a.y, b.y));
    polygon(corners); corners.forEach((point, i) => segment(point, corners[(i + 1) % 4]));
    handles = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([xi, yi]) => ({ id: `corner-${xi}${yi}`, kind: 'corner', xi, yi, x: p[xi].x, y: p[yi].y }));
  } else if (d.type === 'fib' && b) {
    const left = style.extendLeft ? 0 : Math.min(a.x, b.x), right = style.extendRight ? size.width : Math.max(a.x, b.x);
    for (const level of d.fibLevels || FIB_LEVELS) {
      const value = b.price + (a.price - b.price) * level, y = view.y(value);
      if (!Number.isFinite(y)) continue;
      segment({ x: left, y }, { x: right, y }, { opacity: level === 0.5 || level === 0.618 ? 100 : 70 });
      if (d.showLabels !== false) label(`${level} (${price(value)})`, left + 2, y - 8);
    }
    segment(a, b, { lineStyle: 'Dashed' });
  } else if (d.type === 'measure' && b) {
    polygon(box(a.x, a.y, b.x, b.y));
    segment({ x: (a.x + b.x) / 2, y: a.y }, { x: (a.x + b.x) / 2, y: b.y });
    const count = Math.round((view.logicalOf?.(b.time) ?? 0) - (view.logicalOf?.(a.time) ?? 0));
    const diff = b.price - a.price, percent = a.price ? diff / a.price * 100 : 0;
    if (d.showLabels !== false) label(`${diff >= 0 ? '+' : ''}${price(diff)} (${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%)  ${count} bars`, (a.x + b.x) / 2, b.y + (diff >= 0 ? -14 : 14), { align: 'center', background: style.color, color: '#ffffff' });
  } else if (['long', 'short'].includes(d.type) && b) {
    const dir = d.type === 'long' ? 1 : -1, risk = Math.abs(a.price - b.price) || Math.abs(a.price) * 0.01 || 1;
    const stop = a.price - dir * risk, target = a.price + dir * risk * (d.rr || 2);
    const ys = view.y(stop), yt = view.y(target), left = Math.min(a.x, b.x), right = left + Math.max(Math.abs(b.x - a.x), 40);
    polygon(box(left, a.y, right, yt), style.targetColor); polygon(box(left, a.y, right, ys), style.stopColor);
    segment({ x: left, y: a.y }, { x: right, y: a.y });
    segment({ x: left, y: yt }, { x: right, y: yt }, { color: style.targetColor });
    segment({ x: left, y: ys }, { x: right, y: ys }, { color: style.stopColor });
    handles = [handles[0], { id: 'stop', kind: 'stop', x: right, y: ys }, { id: 'target', kind: 'target', x: right, y: yt }, { id: 'width', kind: 'width', x: right, y: a.y }];
    if (d.showLabels !== false) {
      label(`Target ${price(target)}`, (left + right) / 2, yt + (dir > 0 ? 10 : -10), { align: 'center', background: style.targetColor, color: '#ffffff' });
      label(`Stop ${price(stop)}`, (left + right) / 2, ys + (dir > 0 ? -10 : 10), { align: 'center', background: style.stopColor, color: '#ffffff' });
      label(`Entry ${price(a.price)}  R:R ${(d.rr || 2).toFixed(2)}`, left + 4, a.y - 10);
    }
  } else if (d.type === 'text') {
    String(d.text || 'Note').split('\n').forEach((text, i) => label(text || ' ', a.x, a.y + i * (style.fontSize + 6), { background: style.fillEnabled ? style.fillColor : null, backgroundOpacity: style.fillOpacity, color: style.textColor }));
  }
  if (d.text && d.type !== 'text') label(d.text, b ? (a.x + b.x) / 2 : a.x + 8, b ? (a.y + b.y) / 2 : a.y - 16, { align: 'center', color: style.textColor });
  const finite = (point) => Number.isFinite(point.x) && Number.isFinite(point.y);
  return { segments: segments.filter((line) => finite(line.from) && finite(line.to)), polygons: polygons.filter((shape) => shape.points.every(finite)), labels: labels.filter(finite), handles: handles.filter(finite), style };
}

export function segmentDistance(x, y, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / length)) : 0;
  return Math.hypot(x - a.x - t * dx, y - a.y - t * dy);
}
function insidePolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
export function hitGeometry(geometry, x, y, tolerance = 7) {
  if (!geometry) return false;
  if (geometry.segments.some((line) => segmentDistance(x, y, line.from, line.to) <= tolerance)) return true;
  if (geometry.polygons.some((shape) => insidePolygon(x, y, shape.points))) return true;
  return geometry.labels.some((label) => {
    const width = label.text.length * geometry.style.fontSize * 0.62 + 12;
    const left = label.align === 'center' ? label.x - width / 2 : label.align === 'right' ? label.x - width : label.x;
    return x >= left - tolerance && x <= left + width + tolerance && Math.abs(y - label.y) < geometry.style.fontSize / 2 + tolerance;
  });
}

export function draggedDrawing(original, handle, dx, dy, view, size, { shift = false } = {}) {
  const d = structuredClone(original), geometry = drawingGeometry(original, view, size);
  if (!geometry || !Number.isFinite(dx) || !Number.isFinite(dy)) return d;
  if (shift && !handle) { if (Math.abs(dx) >= Math.abs(dy)) dy = 0; else dx = 0; }
  const convert = (point, x, y) => {
    const next = view.fromScreen(x, y);
    return next && Number.isFinite(next.time) && Number.isFinite(next.price) ? { ...point, ...next } : { ...point };
  };
  if (!handle) {
    d.points = original.points.map((point) => {
      const next = convert(point, view.x(point.time) + dx, view.y(point.price) + dy);
      if (d.type === 'hline') next.time = point.time;
      if (d.type === 'vline') next.price = point.price;
      return next;
    });
    return d;
  }
  const control = geometry.handles.find((h) => h.id === handle.id);
  if (!control) return d;
  let x = control.x + dx, y = control.y + dy;
  if (shift && control.kind === 'point' && ['trend', 'ray', 'extended'].includes(d.type)) {
    const other = original.points[1 - control.index], ox = view.x(other.time), oy = view.y(other.price);
    const length = Math.hypot(x - ox, y - oy), angle = Math.round(Math.atan2(y - oy, x - ox) / (Math.PI / 4)) * Math.PI / 4;
    x = ox + Math.cos(angle) * length; y = oy + Math.sin(angle) * length;
  }
  if (control.kind === 'corner') {
    if (shift) {
      const ox = view.x(original.points[1 - control.xi].time), oy = view.y(original.points[1 - control.yi].price);
      const length = Math.max(Math.abs(x - ox), Math.abs(y - oy));
      x = ox + Math.sign(x - ox || 1) * length; y = oy + Math.sign(y - oy || 1) * length;
    }
    const next = view.fromScreen(x, y);
    if (next && Number.isFinite(next.time) && Number.isFinite(next.price)) { d.points[control.xi].time = next.time; d.points[control.yi].price = next.price; }
  } else if (control.kind === 'point') {
    const point = d.points[control.index], next = convert(point, x, y);
    if (d.type === 'hline') next.time = point.time;
    if (d.type === 'vline') next.price = point.price;
    d.points[control.index] = next;
  } else {
    const next = view.fromScreen(x, y);
    if (!next || !Number.isFinite(next.time) || !Number.isFinite(next.price)) return d;
    d.points[1].time = next.time;
    const entry = d.points[0].price, dir = d.type === 'long' ? 1 : -1;
    if (control.kind === 'stop') {
      const risk = Math.max(dir * (entry - next.price), Math.max(Math.abs(entry) * 1e-8, 1e-8));
      d.points[1].price = entry - dir * risk;
    } else if (control.kind === 'target') {
      const risk = Math.abs(entry - d.points[1].price) || Math.abs(entry) * 0.01 || 1;
      d.rr = Math.max(0.01, Math.min(1000, dir * (next.price - entry) / risk));
    }
  }
  return d;
}
