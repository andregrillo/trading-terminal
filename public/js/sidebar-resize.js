export function sidebarBounds(available) { return { min: 240, max: Math.max(240, Math.min(720, available - 320)) }; }
export function sidebarWidth(value, available) {
  const { min, max } = sidebarBounds(available), preferred = Number(value);
  return Math.round(Math.max(min, Math.min(max, Number.isFinite(preferred) && preferred > 0 ? preferred : 300)));
}

export class SidebarResize {
  constructor(app, side) {
    this.app = app; this.side = side;
    this.handle = document.createElement('div'); this.handle.className = 'sidebar-resize';
    this.handle.setAttribute('role', 'separator'); this.handle.setAttribute('aria-label', 'Resize watchlist column');
    this.handle.setAttribute('aria-orientation', 'vertical'); this.handle.tabIndex = 0;
    this.handle.title = 'Drag to resize the watchlist. Double-click to reset.';
    side.prepend(this.handle);
    this.handle.addEventListener('pointerdown', event => {
      if (!this.enabled || event.button !== 0 || event.isPrimary === false) return;
      event.preventDefault(); event.stopPropagation();
      this.gesture = { id: event.pointerId, x: event.clientX, width: side.getBoundingClientRect().width };
      this.handle.setPointerCapture(event.pointerId); document.body.classList.add('sidebar-resizing');
    });
    window.addEventListener('pointermove', event => {
      if (this.gesture?.id !== event.pointerId) return;
      event.preventDefault(); event.stopImmediatePropagation(); this.dragWidth = this.gesture.width + this.gesture.x - event.clientX; this.apply();
    }, { capture: true, passive: false });
    window.addEventListener('pointerup', event => {
      if (this.gesture?.id !== event.pointerId) return;
      event.preventDefault(); event.stopImmediatePropagation(); this.finish(true);
    }, { capture: true, passive: false });
    this.handle.addEventListener('pointercancel', () => this.finish(false));
    window.addEventListener('blur', () => this.finish(false));
    window.addEventListener('keydown', event => {
      if (event.key === 'Escape' && this.gesture) { event.preventDefault(); event.stopImmediatePropagation(); this.finish(false); }
    }, true);
    this.handle.addEventListener('dblclick', event => {
      if (!this.enabled) return; event.preventDefault(); this.app.settings.sidebarWidth = 300; this.apply(); this.app.persist(); this.saveChartViews();
    });
    this.handle.addEventListener('keydown', event => {
      if (!this.enabled || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation(); const { min, max } = sidebarBounds(this.available);
      const next = event.key === 'Home' ? min : event.key === 'End' ? max : this.width + (event.key === 'ArrowLeft' ? 1 : -1) * (event.shiftKey ? 50 : 20);
      this.app.settings.sidebarWidth = sidebarWidth(next, this.available); this.apply(); this.app.persist(); this.saveChartViews();
    });
    this.observer = new ResizeObserver(() => this.apply()); this.observer.observe(document.querySelector('.main'));
    this.apply();
  }
  get enabled() { return !this.app.mobileUI?.enabled && innerWidth > 900 && !this.side.classList.contains('mobile-open'); }
  get available() { return document.querySelector('.main').clientWidth - document.querySelector('#drawbar').getBoundingClientRect().width; }
  apply() {
    this.width = sidebarWidth(this.dragWidth ?? this.app.settings.sidebarWidth, this.available);
    this.side.style.setProperty('--sidebar-width', `${this.width}px`);
    const { min, max } = sidebarBounds(this.available);
    this.handle.setAttribute('aria-valuemin', String(min)); this.handle.setAttribute('aria-valuemax', String(max)); this.handle.setAttribute('aria-valuenow', String(this.width));
  }
  finish(save) {
    if (!this.gesture) return;
    const id = this.gesture.id; this.gesture = null;
    if (this.handle.hasPointerCapture(id)) this.handle.releasePointerCapture(id);
    document.body.classList.remove('sidebar-resizing');
    if (save) this.app.settings.sidebarWidth = this.width;
    delete this.dragWidth; this.apply(); if (save) { this.app.persist(); this.saveChartViews(); }
  }
  saveChartViews() {
    if (!this.app.panes?.length) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!this.enabled) return;
      for (const pane of this.app.panes) if (pane.viewport) { pane.viewport.dirty = true; pane.viewport.save(); }
    }));
  }
}
