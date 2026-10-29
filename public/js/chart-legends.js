// HTML headers follow the chart engine's actual pane rows, including separator drags.
export class ChartLegends {
  constructor(pane) {
    this.pane = pane;
    this.elements = new Map([[0, pane.legendEl]]);
    this.rows = [];
    this.frame = null;
    this.abort = new AbortController();
    this.observer = new ResizeObserver(() => this.scheduleLayout());
    this.bind(pane.legendEl, 0);
  }

  bind(el, index) {
    el.dataset.legendPane = index;
    el.setAttribute('aria-label', index === 0 ? 'Chart and overlay indicator headers' : 'Indicator headers');
    el.addEventListener('click', (event) => this.pane.onLegendClick(event), { signal: this.abort.signal });
  }

  render(content) {
    for (const [index, el] of this.elements) {
      if (!content.has(index)) { el.remove(); this.elements.delete(index); }
    }
    for (const [index, html] of content) {
      let el = this.elements.get(index);
      if (!el) {
        el = document.createElement('div');
        el.className = 'legend indicator-legend';
        this.bind(el, index);
        this.pane.el.appendChild(el);
        this.elements.set(index, el);
      }
      if (el.innerHTML !== html) el.innerHTML = html;
      el.classList.toggle('hidden', index > 0 && !!this.pane.cfg.indicatorHeadersCollapsed);
    }
    const rows = this.pane.chart.panes().map((pane) => pane.getHTMLElement());
    if (rows.length !== this.rows.length || rows.some((row, i) => row !== this.rows[i])) {
      this.observer.disconnect();
      this.observer.observe(this.pane.chartEl);
      for (const row of rows) if (row) this.observer.observe(row);
      this.rows = rows;
    }
    this.layout();
    this.scheduleLayout();
  }

  scheduleLayout() {
    if (this.frame !== null) return;
    this.frame = requestAnimationFrame(() => { this.frame = null; this.layout(); });
  }

  layout() {
    const parent = this.pane.el.getBoundingClientRect();
    const chart = this.pane.chartEl.getBoundingClientRect();
    for (const [index, el] of this.elements) {
      const pane = this.pane.chart.panes()[index], row = pane?.getHTMLElement();
      if (!row) continue;
      el.style.top = `${row.getBoundingClientRect().top - parent.top + 6}px`;
      el.style.left = `${chart.left - parent.left + 8}px`;
      el.style.maxWidth = `${Math.max(0, this.pane.chart.timeScale().width() - 16)}px`;
      el.style.maxHeight = `${Math.max(0, pane.getHeight() - 12)}px`;
    }
  }

  destroy() {
    this.observer.disconnect();
    this.abort.abort();
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    for (const el of this.elements.values()) el.remove();
    this.elements.clear();
  }
}
