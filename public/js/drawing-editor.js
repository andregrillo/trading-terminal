import { esc } from './api.js';
import { TOOL_BY_ID } from './drawings.js';
import { draggedDrawing, drawingStyle, FIB_LEVELS, FILL_TOOLS } from '../lib/drawing-model.js';

const replace = (item, data) => { for (const key of Object.keys(item)) delete item[key]; Object.assign(item, structuredClone(data)); };
const dateValue = (time) => new Date(time * 1000).toISOString().slice(0, 23);
const uid = () => `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;

export class DrawingEditor {
  constructor(pane) {
    this.pane = pane; this.app = pane.app; this.layer = pane.drawings; this.abort = new AbortController();
    this.toolbar = document.createElement('div'); this.toolbar.className = 'drawing-toolbar hidden';
    this.toolbar.setAttribute('role', 'toolbar'); this.toolbar.setAttribute('aria-label', 'Selected drawing'); pane.el.appendChild(this.toolbar);
    this.toolbar.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.toolbar.addEventListener('click', (e) => {
      const action = e.target.closest('[data-drawing-action]')?.dataset.drawingAction;
      if (action === 'settings') this.openSettings();
      if (action === 'lock') this.toggleLock();
      if (action === 'duplicate') this.duplicate();
      if (action === 'delete') { this.cancel(); pane.deleteSelectedDrawing(); }
      if (action === 'close') this.select(null);
    });
    pane.chartEl.style.touchAction = 'none';
    const on = (target, event, callback, options = {}) => target.addEventListener(event, callback, { signal: this.abort.signal, ...options });
    on(pane.chartEl, 'pointerdown', (e) => this.down(e), { capture: true, passive: false });
    on(window, 'pointermove', (e) => this.move(e), { capture: true, passive: false });
    on(window, 'pointerup', (e) => this.up(e), { capture: true, passive: false });
    on(window, 'pointercancel', () => this.cancel(), { capture: true });
    on(window, 'blur', () => this.cancel());
    for (const name of ['mousedown', 'mousemove', 'mouseup', 'touchstart', 'touchmove', 'touchend']) {
      on(pane.chartEl, name, (e) => {
        if (name === 'touchstart' && e.touches.length > 1) { this.cancel(); return; }
        if (this.gesture?.editable || performance.now() < (this.suppressUntil || 0)) { e.preventDefault(); e.stopImmediatePropagation(); }
      }, { capture: true, passive: false });
    }
    on(pane.chartEl, 'dblclick', (e) => {
      const p = this.position(e);
      if (this.app.tool === 'cursor' && p && this.layer.hitTest(p.x, p.y)) { e.preventDefault(); e.stopImmediatePropagation(); }
    }, { capture: true });
    on(pane.chartEl, 'contextmenu', (e) => {
      const p = this.position(e), hit = p && this.layer.hitTest(p.x, p.y);
      if (this.app.tool === 'cursor' && hit) { e.preventDefault(); this.select(hit); this.openSettings(hit); }
    });
    this.rangeChanged = () => this.refreshToolbar();
    pane.chart.timeScale().subscribeVisibleLogicalRangeChange(this.rangeChanged);
  }
  position(e) {
    if (this.app.mobileUI?.enabled && this.pane.mobilePaneFocus && this.pane.mobilePaneFocus !== 'price') return null;
    const rect = this.pane.chartEl.getBoundingClientRect(), x = e.clientX - rect.left, y = e.clientY - rect.top;
    const size = this.layer.size;
    return x >= 0 && x <= size.width && y >= 0 && y <= size.height ? { x, y } : null;
  }
  locked(item) { return !!(item.locked || this.app.settings.lockDrawings); }
  select(item) { this.app.setActive(this.pane); this.layer.selected = item; this.layer.update(); this.app.refreshDrawingControls?.(); }
  down(e) {
    if (this.gesture && e.pointerId !== this.gesture.pointerId) { this.cancel(); return; }
    if (this.app.tool !== 'cursor' || e.button !== 0 || e.isPrimary === false) return;
    const p = this.position(e); if (!p) return;
    this.app.setActive(this.pane);
    const hit = this.layer.hitTestDetailed(p.x, p.y, { tolerance: e.pointerType === 'touch' ? 13 : 7 });
    const editable = !!hit && !this.locked(hit.item);
    this.gesture = { pointerId: e.pointerId, start: p, hit, editable, moved: false, original: hit && structuredClone(hit.item) };
    if (editable) {
      this.select(hit.item);
      this.gesture.options = structuredClone({ handleScroll: this.pane.chart.options().handleScroll, handleScale: this.pane.chart.options().handleScale });
      this.gesture.autoScale = this.pane.main.priceScale().options().autoScale;
      this.pane.main.priceScale().applyOptions({ autoScale: false });
      this.pane.chart.applyOptions({ handleScroll: false, handleScale: false });
      e.preventDefault(); e.stopImmediatePropagation();
    }
  }
  move(e) {
    const g = this.gesture;
    if (!g) {
      if (this.app.tool !== 'cursor' || e.pointerType === 'touch') return;
      const p = this.position(e), hit = p && this.layer.hitTestDetailed(p.x, p.y);
      this.pane.chartEl.style.cursor = !hit ? '' : this.locked(hit.item) ? 'default' : hit.handle ? 'crosshair' : 'grab';
      return;
    }
    if (g.pointerId !== e.pointerId) return;
    const rect = this.pane.chartEl.getBoundingClientRect(), dx = e.clientX - rect.left - g.start.x, dy = e.clientY - rect.top - g.start.y;
    if (Math.hypot(dx, dy) > (e.pointerType === 'touch' ? 6 : 3)) g.moved = true;
    if (g.editable) {
      e.preventDefault(); e.stopImmediatePropagation();
      if (g.moved) {
        this.pane.chartEl.style.cursor = 'grabbing';
        replace(g.hit.item, draggedDrawing(g.original, g.hit.handle, dx, dy, this.layer.projection, this.layer.size, { shift: e.shiftKey }));
        this.layer.update();
      }
    } else requestAnimationFrame(() => { if (!this.abort.signal.aborted) this.refreshToolbar(); });
  }
  finish() {
    const g = this.gesture; if (!g) return null;
    this.gesture = null;
    this.pane.chartEl.style.cursor = '';
    if (g.editable) {
      this.pane.chart.applyOptions(g.options);
      this.pane.main.priceScale().applyOptions({ autoScale: g.autoScale });
      this.suppressUntil = performance.now() + 60;
    }
    return g;
  }
  up(e) {
    if (!this.gesture || this.gesture.pointerId !== e.pointerId) return;
    const g = this.finish();
    if (g.editable) { e.preventDefault(); e.stopImmediatePropagation(); }
    if (g.moved) {
      this.lastTap = null;
      if (g.editable) this.app.saveDrawings(this.pane.cfg.symbol, this.layer.items);
    } else {
      this.select(g.hit?.item || null);
      if (g.hit) {
        const now = performance.now();
        if (this.lastTap?.id === g.hit.item.id && now - this.lastTap.at < 420 && Math.hypot(g.start.x - this.lastTap.x, g.start.y - this.lastTap.y) < 20) {
          this.lastTap = null; this.openSettings(g.hit.item);
        } else this.lastTap = { id: g.hit.item.id, at: now, ...g.start };
      } else this.lastTap = null;
    }
    this.layer.update();
  }
  cancel() {
    const g = this.gesture;
    if (g?.editable) replace(g.hit.item, g.original);
    this.finish(); this.layer.update();
  }
  refreshToolbar() {
    const d = this.layer.selected;
    if (!d || this.app.tool !== 'cursor' || this.gesture?.moved) { this.toolbar.classList.add('hidden'); return; }
    const globalLock = this.app.settings.lockDrawings;
    this.toolbar.innerHTML = `<span class="drawing-name">${esc(TOOL_BY_ID[d.type]?.label || d.type)}</span>
      <button data-drawing-action="settings" title="Drawing settings" aria-label="Drawing settings">⚙</button>
      <button data-drawing-action="lock" title="${globalLock ? 'Unlock all drawings using the left toolbar first' : d.locked ? 'Unlock drawing' : 'Lock drawing'}" ${globalLock ? 'disabled' : ''} aria-label="${d.locked ? 'Unlock drawing' : 'Lock drawing'}">${this.locked(d) ? '🔒' : '🔓'}</button>
      <button data-drawing-action="duplicate" title="Duplicate drawing" aria-label="Duplicate drawing">⧉</button>
      <button data-drawing-action="delete" title="Delete drawing" aria-label="Delete drawing">⌫</button>
      <button data-drawing-action="close" title="Deselect drawing" aria-label="Deselect drawing">×</button>`;
    this.toolbar.classList.remove('hidden');
    const geometry = this.layer.geometry(d), first = geometry?.handles[0];
    const width = this.toolbar.offsetWidth || 280;
    this.toolbar.style.left = `${Math.max(5, Math.min((first?.x || 10) - 20, this.layer.size.width - width - 5))}px`;
    this.toolbar.style.top = `${Math.max(6, Math.min((first?.y || 70) - 48, this.layer.size.height - 42))}px`;
  }
  toggleLock() {
    const d = this.layer.selected; if (!d || this.app.settings.lockDrawings) return;
    this.cancel(); d.locked = !d.locked; this.app.saveDrawings(this.pane.cfg.symbol, this.layer.items); this.layer.update();
  }
  duplicate() {
    const d = this.layer.selected; if (!d) return;
    this.cancel(); const copy = draggedDrawing(d, null, 16, 16, this.layer.projection, this.layer.size);
    copy.id = uid(); copy.locked = false; this.layer.items.push(copy); this.select(copy);
    this.app.saveDrawings(this.pane.cfg.symbol, this.layer.items);
  }
  openSettings(d = this.layer.selected) {
    if (!d) return this.app.toast('Select a drawing first.');
    this.cancel(); this.select(d);
    const s = drawingStyle(d), position = ['long', 'short'].includes(d.type), fill = FILL_TOOLS.includes(d.type);
    const input = (key, label, value, type = 'number', attrs = '') => `<label class="field">${label}<input data-draw="${key}" type="${type}" value="${esc(value)}" ${attrs}></label>`;
    const check = (key, label, value) => `<label class="field drawing-check"><span>${label}</span><input data-draw="${key}" type="checkbox" ${value ? 'checked' : ''}></label>`;
    const style = `${d.type !== 'text' ? input('color', 'Line colour', s.color, 'color') + input('lineWidth', 'Line thickness', s.lineWidth, 'number', 'min="0.5" max="10" step="0.5"') + `<label class="field">Line style<select data-draw="lineStyle">${['Solid', 'Dashed', 'Dotted'].map((v) => `<option ${v === s.lineStyle ? 'selected' : ''}>${v}</option>`).join('')}</select></label>` : ''}
      ${input('opacity', 'Opacity (%)', s.opacity, 'number', 'min="0" max="100"')}
      ${fill ? check('fillEnabled', 'Background fill', s.fillEnabled) + input('fillOpacity', 'Fill opacity (%)', s.fillOpacity, 'number', 'min="0" max="100"') + (position ? input('targetColor', 'Target colour', s.targetColor, 'color') + input('stopColor', 'Stop colour', s.stopColor, 'color') : input('fillColor', 'Background colour', s.fillColor, 'color')) : ''}
      ${['trend', 'ray', 'extended', 'rect', 'fib', 'channel'].includes(d.type) ? check('extendLeft', 'Extend left', s.extendLeft) + check('extendRight', 'Extend right', s.extendRight) : ''}
      ${d.type === 'fib' ? input('fibLevels', 'Fib levels (comma separated)', (d.fibLevels || FIB_LEVELS).join(', '), 'text') : ''}
      ${d.type !== 'text' ? check('showLabels', 'Show price / level labels', d.showLabels !== false) : ''}
      ${check('locked', 'Lock this drawing', d.locked)}
      ${this.app.settings.lockDrawings ? '<p class="hint-text">All drawings are also locked using the left toolbar.</p>' : ''}`;
    const coordinates = d.points.map((point, i) => {
      const actualPrice = position && i === 1 ? d.points[0].price + (d.type === 'long' ? -1 : 1) * (Math.abs(point.price - d.points[0].price) || Math.abs(d.points[0].price) * 0.01 || 1) : point.price;
      return `<fieldset><legend>${position ? i === 0 ? 'Entry / start' : 'Stop / end' : `Point ${i + 1}`}</legend><div class="form-grid">${d.type !== 'hline' ? input(`time-${i}`, 'Time (UTC)', dateValue(point.time), 'datetime-local', 'step="0.001"') : ''}${d.type !== 'vline' ? input(`price-${i}`, 'Price', actualPrice, 'number', 'step="any"') : ''}</div></fieldset>`;
    }).join('') + (position ? `<div class="form-grid">${input('rr', 'Reward / risk ratio', d.rr || 2, 'number', 'min="0.01" max="1000" step="0.1"')}</div><p class="hint-text" data-target></p>` : '');
    const body = `<div class="drawing-setting-tabs" role="tablist">${['Style', 'Text', 'Coordinates'].map((v, i) => `<button role="tab" aria-selected="${!i}" data-draw-tab="${v}" class="btn ${!i ? 'active' : ''}">${v}</button>`).join('')}</div>
      <div data-draw-panel="Style" class="form-grid">${style}</div>
      <div data-draw-panel="Text" class="hidden"><label class="field">Text<textarea data-draw="text" rows="3">${esc(d.text || '')}</textarea></label><div class="form-grid">${input('fontSize', 'Text size', s.fontSize, 'number', 'min="8" max="48"')}${input('textColor', 'Text colour', s.textColor, 'color')}${check('bold', 'Bold text', d.bold)}</div></div>
      <div data-draw-panel="Coordinates" class="hidden">${coordinates}</div><p class="down" data-draw-error role="alert"></p>`;
    const card = this.app.modal(`${TOOL_BY_ID[d.type]?.label || 'Drawing'} settings`, body, { foot: '<button class="btn" data-draw-cancel>Cancel</button><button class="btn primary" data-draw-apply>Apply</button>' });
    card.querySelectorAll('[data-draw-tab]').forEach((button) => button.onclick = () => {
      card.querySelectorAll('[data-draw-panel]').forEach((panel) => panel.classList.toggle('hidden', panel.dataset.drawPanel !== button.dataset.drawTab));
      card.querySelectorAll('[data-draw-tab]').forEach((tab) => { tab.classList.toggle('active', tab === button); tab.setAttribute('aria-selected', String(tab === button)); });
    });
    card.querySelector('[data-draw-cancel]').onclick = () => this.app.closeModal();
    const number = (key, fallback) => { const el = card.querySelector(`[data-draw="${key}"]`); return el ? el.value.trim() === '' ? NaN : Number(el.value) : fallback; };
    const target = () => {
      const el = card.querySelector('[data-target]'); if (!el) return;
      const entry = number('price-0'), stop = number('price-1'), rr = number('rr');
      el.textContent = `Target price: ${this.pane.formatPrice(entry + (d.type === 'long' ? 1 : -1) * Math.abs(entry - stop) * rr)}`;
    };
    card.addEventListener('input', target); target();
    card.querySelector('[data-draw-apply]').onclick = () => {
      try {
        const next = structuredClone(d);
        for (const field of card.querySelectorAll('[data-draw]')) {
          const key = field.dataset.draw; if (/^(time|price)-/.test(key)) continue;
          if (field.type === 'checkbox') next[key] = field.checked;
          else if (field.type === 'number') next[key] = number(key);
          else next[key] = field.value;
        }
        for (const key of ['opacity', 'fillOpacity']) if (next[key] !== undefined && !(Number.isFinite(next[key]) && next[key] >= 0 && next[key] <= 100)) throw new Error('Opacity must be between 0 and 100.');
        if (next.lineWidth !== undefined && !(Number.isFinite(next.lineWidth) && next.lineWidth >= 0.5 && next.lineWidth <= 10)) throw new Error('Line thickness must be between 0.5 and 10.');
        if (!(Number.isFinite(next.fontSize) && next.fontSize >= 8 && next.fontSize <= 48)) throw new Error('Text size must be between 8 and 48.');
        next.points = next.points.map((point, i) => {
          const timeField = card.querySelector(`[data-draw="time-${i}"]`);
          let time = timeField ? Date.parse(`${timeField.value}Z`) / 1000 : point.time;
          if (Math.abs(time - point.time) < 0.001) time = point.time;
          const price = number(`price-${i}`, point.price);
          if (!Number.isFinite(time) || !Number.isFinite(price)) throw new Error('Enter a valid time and price for each point.');
          return { time, price };
        });
        if (position) {
          if (!(Number.isFinite(next.rr) && next.rr >= 0.01 && next.rr <= 1000)) throw new Error('Reward / risk must be between 0.01 and 1000.');
          if ((d.type === 'long' ? 1 : -1) * (next.points[0].price - next.points[1].price) <= 0) throw new Error(d.type === 'long' ? 'The stop price must be below the entry price.' : 'The stop price must be above the entry price.');
        }
        if (d.type === 'fib') {
          const parts = next.fibLevels.split(',').map((part) => part.trim());
          next.fibLevels = parts.map(Number);
          if (!parts.length || parts.some((part) => !part) || next.fibLevels.length > 30 || !next.fibLevels.every(Number.isFinite)) throw new Error('Enter up to 30 numeric Fib levels, separated by commas.');
        }
        replace(d, next); this.app.saveDrawings(this.pane.cfg.symbol, this.layer.items); this.layer.update(); this.app.closeModal();
      } catch (error) { card.querySelector('[data-draw-error]').textContent = error.message; }
    };
  }
  destroy() { this.cancel(); this.abort.abort(); this.pane.chart.timeScale().unsubscribeVisibleLogicalRangeChange(this.rangeChanged); this.toolbar.remove(); }
}
