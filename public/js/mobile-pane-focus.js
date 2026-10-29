// Phone-only presentation state. It never changes chart configuration or saved layouts.
export function phoneFocusIndex(pane, groups = pane.indicatorPaneGroups || []) {
  if (!pane.app.mobileUI?.enabled || !pane.mobilePaneFocus) return null;
  if (pane.mobilePaneFocus === 'price') return 0;
  return groups.find(group => group.root === pane.mobilePaneFocus)?.index ?? null;
}

export class MobilePaneFocus {
  constructor(shell) { this.shell = shell; this.lastTap = null; this.gesture = null; this.touches = new Set(); }
  point(event) {
    if (!this.shell.enabled || this.shell.view !== 'chart' || this.shell.app.tool !== 'cursor') return null;
    const pane = this.shell.app.active;
    if (!pane || !pane.chartEl.contains(event.target) || event.target.tagName !== 'CANVAS') return null;
    const rect = pane.chartEl.getBoundingClientRect(), x = event.clientX - rect.left;
    if (x < 0 || x > pane.chart.timeScale().width()) return null;
    const apis = pane.chart.panes();
    for (let i = 0; i < apis.length; i++) {
      const row = apis[i].getHTMLElement()?.getBoundingClientRect();
      if (!row || event.clientY < row.top + 5 || event.clientY > row.bottom - 5) continue;
      if (i === 0 && (!pane.mobilePaneFocus || pane.mobilePaneFocus === 'price') && pane.drawings.hitTestDetailed(x, event.clientY - row.top, { tolerance: event.pointerType === 'touch' ? 13 : 7 })) return null;
      const key = pane.mobilePaneFocus || (i === 0 ? 'price' : pane.indicatorPaneGroups[i - 1]?.root);
      return key ? { pane, key, x: event.clientX, y: event.clientY } : null;
    }
    return null;
  }
  bind(signal) {
    const on = (target, name, fn, options = {}) => target.addEventListener(name, fn, { signal, ...options });
    on(window, 'pointerdown', event => {
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
        requestAnimationFrame(() => { if (this.shell.enabled) this.toggle(g.pane, g.key); });
      } else this.lastTap = { ...g, at: now };
    }, { capture: true, passive: false });
    on(window, 'pointercancel', event => { this.touches.delete(event.pointerId); this.gesture = null; this.lastTap = null; }, { capture: true });
    on(document, 'dblclick', event => { if (this.point(event)) { event.preventDefault(); event.stopImmediatePropagation(); } }, { capture: true });
  }
  toggle(pane, key) {
    if (pane.mobilePaneFocus) return this.restore(pane);
    if (!this.shell.enabled || !pane.bars.length) return;
    pane.drawingEditor.cancel(); pane.drawingEditor.select(null);
    pane.mobilePaneSnapshot = {
      mainStretch: pane.chart.panes()[0].getStretchFactor(),
      stretch: new Map((pane.indicatorPaneGroups || []).map(group => [group.root, pane.chart.panes()[group.index]?.getStretchFactor()])),
      mainVisible: pane.main.options().visible, volumeVisible: pane.volume?.options().visible,
      priceOptions: structuredClone(pane.main.priceScale().options()), priceRange: pane.main.priceScale().getVisibleRange(),
    };
    pane.mobilePaneFocus = key;
    this.render(pane);
  }
  render(pane) {
    const range = pane.chart.timeScale().getVisibleLogicalRange();
    pane.render(false);
    if (range) pane.chart.timeScale().setVisibleLogicalRange(range);
    this.shell.sync();
  }
  restore(pane = this.shell.app.active) {
    if (!pane?.mobilePaneSnapshot) return;
    const saved = pane.mobilePaneSnapshot;
    pane.mobilePaneFocus = null;
    this.render(pane);
    pane.main.priceScale().applyOptions(saved.priceOptions);
    if (!saved.priceOptions.autoScale && saved.priceRange) pane.main.priceScale().setVisibleRange(saved.priceRange);
    delete pane.mobilePaneSnapshot;
    this.shell.sync();
  }
  restoreAll() { for (const pane of this.shell.app.panes) this.restore(pane); this.lastTap = null; this.gesture = null; this.touches.clear(); }
}
