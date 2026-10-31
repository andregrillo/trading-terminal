import { captureScaleView, restoreScaleView } from './scale-view.js';

export function savedTimeView(pane) {
  const range = pane.chart.timeScale().getVisibleLogicalRange(), n = pane.shown.length;
  if (!range || !n || !Number.isFinite(range.from) || !Number.isFinite(range.to) || range.to <= range.from) return null;
  const index = Math.max(0, Math.min(n - 1, Math.floor(range.to)));
  return { width: range.to - range.from, anchor: pane.shown[index].time, offset: range.to - index,
    rightOffset: range.to - (n - 1), follow: range.from <= n - 1 && range.to >= n - 1 };
}

export function restoredTimeView(pane, saved) {
  if (!saved || !Number.isFinite(saved.width) || saved.width <= 0 || !Number.isFinite(saved.offset) || !Number.isFinite(saved.anchor) || !Number.isFinite(saved.rightOffset)) return null;
  const n = pane.shown.length; if (!n) return null;
  const anchor = pane.logicalOf(saved.anchor);
  if (!Number.isFinite(anchor)) return null;
  const to = saved.follow ? n - 1 + saved.rightOffset : anchor + saved.offset;
  return { from: to - saved.width, to };
}

const content = view => JSON.stringify(view && { ...view, updatedAt: undefined });
const scaleState = view => ({ options: { autoScale: view.options.autoScale, mode: view.options.mode, scaleMargins: view.options.scaleMargins }, range: view.range });

// Keep normal chart views in saved configuration and a synchronous browser cache.
// The cache also covers a reload before the server's debounced save has finished.
export class ChartViewport {
  constructor(pane) {
    this.pane = pane; this.slot = pane.app.panes.length; this.abort = new AbortController();
    this.rangeChanged = () => { if (performance.now() < (this.userUntil || 0)) { this.dirty = true; this.schedule(); } };
    pane.chart.timeScale().subscribeVisibleLogicalRangeChange(this.rangeChanged);
    const on = (target, name, handler, options = {}) => target.addEventListener(name, handler, { ...options, signal: this.abort.signal });
    on(pane.chartEl, 'pointerdown', event => {
      if (event.button !== 0 || pane.app.tool !== 'cursor') return;
      this.gesture = true; this.dirty = true; this.userUntil = performance.now() + 1500;
    }, { capture: true });
    on(window, 'pointerup', () => { if (this.gesture) { this.gesture = false; this.userUntil = performance.now() + 1500; this.schedule(); } }, { capture: true });
    on(window, 'pointercancel', () => { this.gesture = false; });
    on(pane.chartEl, 'wheel', () => { this.dirty = true; this.userUntil = performance.now() + 1500; this.schedule(); }, { capture: true, passive: true });
    on(pane.chartEl, 'dblclick', () => { this.dirty = true; this.schedule(); }, { capture: true });
    on(window, 'pagehide', () => this.save());
    on(document, 'visibilitychange', () => { if (document.hidden) this.save(); });
  }
  get scope() { return this.pane.app.mobileUI?.enabled ? 'phone' : 'desktop'; }
  get key() { const { symbol, tf, type } = this.pane.cfg; return JSON.stringify([this.scope, symbol, tf, type]); }
  get cacheKey() { return `trade-terminal:chart-views:v1:${this.slot}`; }
  cache() { try { return JSON.parse(localStorage.getItem(this.cacheKey)) || {}; } catch { return {}; } }
  latest() {
    const server = this.pane.cfg.chartViews?.[this.key], cached = this.cache()[this.key];
    return (cached?.updatedAt || 0) > (server?.updatedAt || 0) ? cached : server;
  }
  schedule() { clearTimeout(this.timer); this.timer = setTimeout(() => this.save(), 200); }
  snapshot() {
    const p = this.pane, time = savedTimeView(p); if (!time) return null;
    const indicators = Object.fromEntries([...p.captureIndicatorScaleViews()].map(([root, view]) => [root, scaleState(view)]));
    const stretch = { price: p.chart.panes()[0].getStretchFactor() };
    for (const group of p.indicatorPaneGroups || []) stretch[group.root] = p.chart.panes()[group.index]?.getStretchFactor();
    return { time, price: { ...scaleState(captureScaleView(p.main.priceScale())), symbol: p.cfg.symbol, tf: p.cfg.tf }, indicators, stretch };
  }
  save() {
    clearTimeout(this.timer);
    const p = this.pane;
    if (!this.dirty || !this.ready || this.loadedKey !== this.key || p.replay || p.paneFocus || this.restoring) return false;
    const view = this.snapshot(); if (!view) return false;
    this.dirty = false;
    if (content(view) === content(this.latest())) return false;
    view.updatedAt = Date.now();
    p.cfg.chartViews = this.trim({ ...p.cfg.chartViews, [this.key]: view });
    try { localStorage.setItem(this.cacheKey, JSON.stringify(this.trim({ ...this.cache(), [this.key]: view }))); } catch { /* Server storage still works if the browser cache is unavailable. */ }
    p.app.persist(); return true;
  }
  trim(views) { return Object.fromEntries(Object.entries(views).sort((a, b) => (b[1]?.updatedAt || 0) - (a[1]?.updatedAt || 0)).slice(0, 40)); }
  beforeLoad() { this.save(); this.ready = false; clearTimeout(this.timer); }
  loaded() { this.ready = true; this.loadedKey = this.key; this.restore(); }
  restore() {
    const p = this.pane, view = this.latest();
    if (!this.ready || !p.shown.length || p.paneFocus || p.replay) return;
    this.loadedKey = this.key;
    const time = restoredTimeView(p, view?.time); if (!time) return;
    this.restoring = true;
    try {
      for (const [index, api] of p.chart.panes().entries()) {
        const key = index === 0 ? 'price' : p.indicatorPaneGroups[index - 1]?.root, value = view.stretch?.[key];
        if (Number.isFinite(value) && value > 0) api.setStretchFactor(value);
      }
      const scale = p.main.priceScale(), price = view.price;
      const priceMatches = price?.symbol === p.cfg.symbol && price?.tf === p.cfg.tf;
      // Older views can contain a manual range inherited from the previous asset.
      if (price?.options?.mode === scale.options().mode && (price.options.autoScale || priceMatches)) {
        restoreScaleView(scale, { options: { ...scale.options(), autoScale: price.options.autoScale, ...(price.options.scaleMargins ? { scaleMargins: price.options.scaleMargins } : {}) }, range: price.range });
      }
      const indicators = new Map(Object.entries(view.indicators || {}));
      p.restoreIndicatorScaleViews(indicators);
      p.chart.timeScale().setVisibleLogicalRange(time);
      p.legends.scheduleLayout();
    } finally { this.restoring = false; }
    if ((p.cfg.chartViews?.[this.key]?.updatedAt || 0) < view.updatedAt) {
      p.cfg.chartViews = this.trim({ ...p.cfg.chartViews, [this.key]: view });
      p.app.persist();
    }
  }
  destroy() {
    this.save(); clearTimeout(this.timer); this.abort.abort();
    this.pane.chart.timeScale().unsubscribeVisibleLogicalRangeChange(this.rangeChanged);
  }
}
