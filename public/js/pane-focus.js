// Temporary pane expansion shared by desktop and phone. Saved chart layouts stay unchanged.
import { captureScaleView, restoreScaleView } from './scale-view.js';

export function paneFocusIndex(pane, groups = pane.indicatorPaneGroups || []) {
  if (!pane.paneFocus) return null;
  if (pane.paneFocus === 'price') return 0;
  return groups.find(group => group.root === pane.paneFocus)?.index ?? null;
}

export class PaneFocus {
  constructor(shell) { this.shell = shell; this.lastTap = null; this.gesture = null; this.touches = new Set(); this.restoreButtons = new Map(); }
  point(event) {
    if ((this.shell.enabled && this.shell.view !== 'chart') || this.shell.app.tool !== 'cursor') return null;
    const pane = this.shell.app.panes?.find(pane => pane.chartEl.contains(event.target)) || this.shell.app.active;
    if (!pane || !pane.chartEl.contains(event.target) || event.target.tagName !== 'CANVAS') return null;
    const rect = pane.chartEl.getBoundingClientRect(), x = event.clientX - rect.left;
    if (x < 0 || x > pane.chart.timeScale().width()) return null;
    const apis = pane.chart.panes();
    for (let i = 0; i < apis.length; i++) {
      const row = apis[i].getHTMLElement()?.getBoundingClientRect();
      if (!row || event.clientY < row.top + 5 || event.clientY > row.bottom - 5) continue;
      if (i === 0 && (!pane.paneFocus || pane.paneFocus === 'price') && pane.drawings.hitTestDetailed(x, event.clientY - row.top, { tolerance: event.pointerType === 'touch' ? 13 : 7 })) return null;
      const key = pane.paneFocus || (i === 0 ? 'price' : pane.indicatorPaneGroups[i - 1]?.root);
      return key ? { pane, key, x: event.clientX, y: event.clientY } : null;
    }
    return null;
  }
  bind(signal) {
    const on = (target, name, fn, options = {}) => target.addEventListener(name, fn, { signal, ...options });
    on(window, 'pointerdown', event => {
      if (event.pointerType === 'mouse') { this.lastTouchToggle = -Infinity; return; }
      if (event.isPrimary !== false) this.touches.clear();
      this.touches.add(event.pointerId);
      if (event.isPrimary === false || this.touches.size > 1) { this.gesture = null; this.lastTap = null; return; }
      const point = event.button === 0 ? this.point(event) : null;
      this.gesture = point ? { ...point, id: event.pointerId, at: performance.now(), moved: false } : null;
      if (!point) this.lastTap = null;
    }, { capture: true });
    on(window, 'pointermove', event => {
      const g = this.gesture;
      if (g?.id === event.pointerId && Math.hypot(event.clientX - g.x, event.clientY - g.y) > 8) { g.moved = true; this.lastTap = null; }
    }, { capture: true });
    on(window, 'pointerup', event => {
      this.touches.delete(event.pointerId);
      const g = this.gesture; this.gesture = null;
      if (!g || g.id !== event.pointerId || g.moved || performance.now() - g.at > 350) return;
      const point = this.point(event); if (!point || point.pane !== g.pane || point.key !== g.key) return;
      const now = performance.now(), previous = this.lastTap;
      if (previous && previous.pane === g.pane && previous.key === g.key && now - previous.at < 380 && Math.hypot(g.x - previous.x, g.y - previous.y) < 24) {
        this.lastTap = null; event.preventDefault();
        this.lastTouchToggle = now;
        requestAnimationFrame(() => this.toggle(g.pane, g.key));
      } else this.lastTap = { ...g, at: now };
    }, { capture: true, passive: false });
    on(window, 'pointercancel', event => { this.touches.delete(event.pointerId); this.gesture = null; this.lastTap = null; }, { capture: true });
    on(document, 'dblclick', event => {
      const point = this.point(event); if (!point) return;
      event.preventDefault(); event.stopImmediatePropagation();
      // Touch pointers already use the tap recognizer above. Mouse uses a native double-click.
      if (event.sourceCapabilities?.firesTouchEvents || performance.now() - (this.lastTouchToggle ?? -Infinity) < 500) return;
      requestAnimationFrame(() => this.toggle(point.pane, point.key));
    }, { capture: true });
    on(document, 'keydown', event => {
      if (event.key !== 'Escape' || !this.shell.app.active?.paneFocus || !document.querySelector('#modal').classList.contains('hidden')) return;
      event.preventDefault(); event.stopImmediatePropagation(); this.restore();
    }, { capture: true });
  }
  toggle(pane, key) {
    if (pane.paneFocus) return this.restore(pane);
    if (!pane.bars.length) return;
    pane.viewport?.save();
    pane.drawingEditor.cancel(); pane.drawingEditor.select(null);
    const priceView = captureScaleView(pane.main.priceScale());
    pane.paneFocusSnapshot = {
      mainStretch: pane.chart.panes()[0].getStretchFactor(),
      stretch: new Map((pane.indicatorPaneGroups || []).map(group => [group.root, pane.chart.panes()[group.index]?.getStretchFactor()])),
      mainVisible: pane.main.options().visible, volumeVisible: pane.volume?.options().visible,
      priceOptions: priceView.options, priceRange: priceView.range,
    };
    pane.paneFocus = key;
    this.render(pane);
  }
  render(pane) {
    const range = pane.chart.timeScale().getVisibleLogicalRange();
    pane.render(false);
    if (range) pane.chart.timeScale().setVisibleLogicalRange(range);
    this.shell.sync();
  }
  restore(pane = this.shell.app.active) {
    if (!pane?.paneFocusSnapshot) return;
    const saved = pane.paneFocusSnapshot;
    pane.paneFocus = null;
    this.render(pane);
    restoreScaleView(pane.main.priceScale(), { options: saved.priceOptions, range: saved.priceRange });
    delete pane.paneFocusSnapshot;
    this.shell.sync();
  }
  restoreAll() { for (const pane of this.shell.app.panes) this.restore(pane); this.lastTap = null; this.gesture = null; this.touches.clear(); }
  sync() {
    for (const [pane, button] of this.restoreButtons) {
      if (!this.shell.app.panes.includes(pane) || !pane.paneFocus) { button.remove(); this.restoreButtons.delete(pane); delete pane.el.dataset.paneFocus; }
    }
    for (const pane of this.shell.app.panes) {
      if (!pane.paneFocus) continue;
      pane.el.dataset.paneFocus = pane.paneFocus === 'price' ? 'price' : 'indicator';
      if (this.restoreButtons.has(pane)) continue;
      const button = document.createElement('button'); button.className = 'pane-restore';
      button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3H3v6M15 3h6v6M3 15v6h6M21 15v6h-6M7 7l10 10M17 7L7 17"/></svg>';
      button.title = 'Restore all panes'; button.setAttribute('aria-label', 'Restore all panes');
      button.onclick = () => this.restore(pane); pane.el.appendChild(button); this.restoreButtons.set(pane, button);
    }
  }
}
