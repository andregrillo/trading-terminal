import { esc } from './api.js';
import { BY_ID } from '../lib/indicators.js';

// Crosshair coordinates are local to their native pane, including expanded panes.
export function levelTarget(pane, point) {
  if (!point.point || point.logical == null || pane.app.tool !== 'cursor') return null;
  const index = point.paneIndex ?? 0, row = pane.chart.panes()[index];
  if (!row || point.point.x < 0 || point.point.x > pane.chart.timeScale().width() || point.point.y < 0 || point.point.y >= row.getHeight()) return null;
  const focus = pane.paneFocus;
  const root = focus && focus !== 'price' ? focus : index ? pane.indicatorPaneGroups.find(group => group.index === index)?.root : null;
  const group = root && pane.indicatorPaneGroups.find(group => group.root === root);
  const series = root ? group?.indicators.map(uid => pane.indSeries.get(uid)?.[0]).find(Boolean) : pane.main;
  if (!series) return null;
  let value = series.coordinateToPrice(point.point.y);
  if (!Number.isFinite(value)) return null;
  const step = series.options().priceFormat?.minMove;
  if (Number.isFinite(step) && step > 0) value = Math.round(value / step) * step;
  value = Number(value.toPrecision(12));
  const ind = root && pane.cfg.indicators.find(ind => ind.uid === root);
  const def = ind && BY_ID[ind.id];
  const output = def?.outputs.find(out => !out.hidden && out.legend !== false && Array.isArray(pane.indResults[ind.uid]?.[out.key]));
  return { index, root: root || null, value, text: series.priceFormatter().format(value), time: pane.timeOfLogical(point.logical), x: point.point.x, y: point.point.y,
    symbol: pane.cfg.symbol, tf: pane.cfg.tf, indicator: ind ? structuredClone(ind) : null, output: output?.key };
}

export function levelAlertPreset(target) {
  if (target.root && (!target.indicator || !target.output || String(target.indicator.params?.source || '').startsWith('ind:'))) return null;
  return { symbol: target.symbol, tf: target.indicator?.tf || target.tf, rules: [{
    left: target.root ? { kind: 'ind', id: target.indicator.id, params: { ...target.indicator.params }, output: target.output } : { kind: 'price', field: 'close' },
    op: 'crosses', right: { kind: 'value', v: target.value },
  }] };
}

export class LevelActions {
  constructor(pane) {
    this.pane = pane; this.app = pane.app; this.abort = new AbortController();
    this.button = document.createElement('button'); this.button.className = 'level-plus hidden'; this.button.textContent = '+';
    this.button.setAttribute('aria-label', 'Actions at crosshair level'); this.button.setAttribute('aria-haspopup', 'menu'); this.button.setAttribute('aria-expanded', 'false');
    pane.el.appendChild(this.button);
    this.guide = document.createElement('div'); this.guide.className = 'level-guide hidden'; this.guide.setAttribute('aria-hidden', 'true'); pane.el.appendChild(this.guide);
    this.vertical = document.createElement('div'); this.vertical.className = 'level-guide-vertical hidden'; this.vertical.setAttribute('aria-hidden', 'true'); pane.el.appendChild(this.vertical);
    this.menu = document.createElement('div'); this.menu.className = 'level-menu hidden'; this.menu.setAttribute('role', 'menu'); document.body.appendChild(this.menu);
    const on = (target, name, handler, options = {}) => target.addEventListener(name, handler, { signal: this.abort.signal, ...options });
    on(this.button, 'pointerenter', () => { clearTimeout(this.hideTimer); this.guides(true); });
    on(this.button, 'pointerleave', () => { if (!this.opened) this.guides(false); this.hideLater(); });
    on(this.button, 'pointerdown', event => { event.preventDefault(); event.stopPropagation(); });
    on(this.button, 'keydown', event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); event.stopPropagation(); this.button.click(); } });
    on(this.button, 'click', event => { event.stopPropagation(); this.opened ? this.close() : this.open(); });
    on(this.menu, 'pointerdown', event => event.stopPropagation());
    on(document, 'pointerdown', event => { if (!this.menu.contains(event.target) && !this.button.contains(event.target)) this.close(); }, { capture: true });
    on(document, 'keydown', event => {
      if (!this.opened) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); this.close(true); return; }
      if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
        event.preventDefault(); const buttons = [...this.menu.querySelectorAll('[role=menuitem]:not(:disabled)')], i = buttons.indexOf(document.activeElement);
        buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (i + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length]?.focus();
      }
      if (this.menu.contains(event.target)) event.stopImmediatePropagation();
    }, { capture: true });
    on(window, 'resize', () => this.hide());
    on(pane.chartEl, 'pointerleave', () => this.hideLater());
    on(this.menu, 'focusout', event => { if (event.relatedTarget && !this.menu.contains(event.relatedTarget) && event.relatedTarget !== this.button) this.close(); });
  }
  update(point) {
    if (this.opened) return;
    const target = levelTarget(this.pane, point);
    if (!target || !document.querySelector('#modal').classList.contains('hidden')) return this.hideLater();
    const rowElement = this.pane.chart.panes()[target.index]?.getHTMLElement();
    const lastElement = this.pane.chart.panes().at(-1)?.getHTMLElement();
    // Pane rows can be temporarily detached while indicators or phone focus rebuild.
    if (!rowElement || !lastElement) return this.hide();
    clearTimeout(this.hideTimer); this.target = target;
    const parent = this.pane.el.getBoundingClientRect(), row = rowElement.getBoundingClientRect();
    const chart = this.pane.chartEl.getBoundingClientRect();
    this.button.style.left = `${chart.left - parent.left + this.pane.chart.timeScale().width() - 24}px`;
    this.button.style.top = `${row.top - parent.top + Math.max(12, Math.min(row.height - 12, target.y)) - 12}px`;
    Object.assign(this.guide.style, { left: `${chart.left - parent.left}px`, top: `${row.top - parent.top + target.y}px`, width: `${this.pane.chart.timeScale().width()}px` });
    const last = lastElement.getBoundingClientRect();
    Object.assign(this.vertical.style, { left: `${chart.left - parent.left + target.x}px`, top: `${chart.top - parent.top}px`, height: `${last.bottom - chart.top}px` });
    this.button.title = `Actions at ${target.text}`; this.button.classList.remove('hidden');
  }
  hideLater() { clearTimeout(this.hideTimer); this.hideTimer = setTimeout(() => { if (!this.opened && !this.button.matches(':hover') && document.activeElement !== this.button) this.button.classList.add('hidden'); }, 160); }
  hide() { this.close(); this.button.classList.add('hidden'); }
  valid(target) { return target && target.symbol === this.pane.cfg.symbol && target.tf === this.pane.cfg.tf && (!target.root || this.pane.cfg.indicators.some(ind => ind.uid === target.root)); }
  open() {
    const target = this.target; if (!this.valid(target)) return this.hide();
    this.app.setActive(this.pane); clearTimeout(this.hideTimer); this.opened = true; this.button.setAttribute('aria-expanded', 'true');
    this.guides(true);
    const lines = (this.pane.cfg.indicatorLines || []).filter(line => line.root === target.root);
    this.menu.innerHTML = `<div class="level-menu-title">${esc(target.text)}</div><button role="menuitem" data-level="line">Draw horizontal line</button><button role="menuitem" data-level="alert">Add alert at this level</button>${target.root && lines.length ? '<button role="menuitem" data-level="edit">Edit horizontal lines…</button>' : ''}`;
    this.menu.classList.remove('hidden');
    const button = this.button.getBoundingClientRect();
    this.menu.style.left = `${Math.max(8, Math.min(button.right - this.menu.offsetWidth, innerWidth - this.menu.offsetWidth - 8))}px`;
    this.menu.style.top = `${Math.max(8, Math.min(button.top, innerHeight - this.menu.offsetHeight - 8))}px`;
    this.menu.querySelectorAll('[data-level]').forEach(button => button.onclick = () => {
      this.close(); if (!this.valid(target)) return this.app.toast('The chart changed. Choose a level again.');
      if (button.dataset.level === 'line') this.addLine(target);
      if (button.dataset.level === 'edit') this.editLines(target, lines[0]);
      if (button.dataset.level === 'alert') {
        const preset = levelAlertPreset(target);
        if (preset) this.app.panels.openAlertDialog(preset);
        else this.app.toast('Alerts on indicators using another indicator as their source are not available yet.');
      }
    });
    this.menu.querySelector('[role=menuitem]').focus();
  }
  guides(visible) { this.guide.classList.toggle('hidden', !visible); this.vertical.classList.toggle('hidden', !visible); }
  close(focus = false) { this.opened = false; this.menu.classList.add('hidden'); this.guides(false); this.button.setAttribute('aria-expanded', 'false'); if (focus) this.button.focus(); }
  redraw() { const range = this.pane.chart.timeScale().getVisibleLogicalRange(); this.pane.render(false); if (range) this.pane.chart.timeScale().setVisibleLogicalRange(range); this.app.persist(); }
  addLine(target) {
    const id = `level-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    if (!target.root) {
      const item = { id, type: 'hline', points: [{ time: target.time, price: target.value }] };
      this.pane.drawings.items.push(item); this.pane.drawingEditor.select(item); this.app.saveDrawings(target.symbol, this.pane.drawings.items); this.pane.drawings.update();
    } else {
      (this.pane.cfg.indicatorLines ||= []).push({ id, root: target.root, value: target.value, color: '#2962ff', lineWidth: 1, lineStyle: 'Solid' });
      this.redraw();
    }
  }
  renderLines() {
    for (const line of this.pane.cfg.indicatorLines || []) {
      if (!Number.isFinite(line.value)) continue;
      const group = this.pane.indicatorPaneGroups.find(group => group.root === line.root);
      const series = group?.indicators.map(uid => this.pane.indSeries.get(uid)?.[0]).find(Boolean);
      series?.createPriceLine({ price: line.value, color: /^#[\da-f]{6}$/i.test(line.color) ? line.color : '#2962ff', lineWidth: [1,2,3,4].includes(line.lineWidth) ? line.lineWidth : 1,
        lineStyle: { Solid: 0, Dotted: 1, Dashed: 2 }[line.lineStyle] ?? 0, axisLabelVisible: true, title: '' });
    }
  }
  editLines(target, selected) {
    const lines = (this.pane.cfg.indicatorLines || []).filter(line => line.root === target.root); if (!lines.length) return;
    const card = this.app.modal('Horizontal line', `<div class="form-grid"><label class="field">Line<select data-line-select>${lines.map(line => `<option value="${esc(line.id)}" ${line.id === selected.id ? 'selected' : ''}>${esc(line.value)}</option>`).join('')}</select></label><label class="field">Level<input data-line-value type="number" step="any" value="${selected.value}"></label><label class="field">Colour<input data-line-color type="color" value="${esc(selected.color)}"></label><label class="field">Thickness<select data-line-width>${[1,2,3,4].map(width => `<option ${width === selected.lineWidth ? 'selected' : ''}>${width}</option>`).join('')}</select></label><label class="field">Style<select data-line-style>${['Solid','Dashed','Dotted'].map(style => `<option ${style === selected.lineStyle ? 'selected' : ''}>${style}</option>`).join('')}</select></label></div>`, { foot: '<button class="btn" data-line-delete>Delete</button><button class="btn primary" data-line-save>Apply</button>' });
    card.querySelector('[data-line-select]').onchange = event => this.editLines(target, lines.find(line => line.id === event.target.value));
    card.querySelector('[data-line-delete]').onclick = () => { this.pane.cfg.indicatorLines = this.pane.cfg.indicatorLines.filter(line => line.id !== selected.id); this.app.closeModal(); this.redraw(); };
    card.querySelector('[data-line-save]').onclick = () => {
      const value = Number(card.querySelector('[data-line-value]').value); if (!Number.isFinite(value) || !card.querySelector('[data-line-value]').value.trim()) return this.app.toast('Enter a valid level.', 'err');
      Object.assign(selected, { value, color: card.querySelector('[data-line-color]').value, lineWidth: Number(card.querySelector('[data-line-width]').value), lineStyle: card.querySelector('[data-line-style]').value });
      this.app.closeModal(); this.redraw();
    };
  }
  destroy() { clearTimeout(this.hideTimer); this.abort.abort(); this.button.remove(); this.guide.remove(); this.vertical.remove(); this.menu.remove(); }
}
