import { api, esc, ticker } from './api.js';
import { sectionGroups, addSection, renameSection, toggleSection, removeSection, moveSymbol, placeSymbol, moveSection, placeSectionBefore } from '../lib/watchlist-sections.js';

const chevron = '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>';
export const MOVE_SYMBOL_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="5" r="1"/><circle cx="16" cy="5" r="1"/><circle cx="8" cy="12" r="1"/><circle cx="16" cy="12" r="1"/><circle cx="8" cy="19" r="1"/><circle cx="16" cy="19" r="1"/></svg>';

export class WatchlistSections {
  constructor(app, changed, flaggedView) { this.app = app; this.changed = changed; this.flaggedView = flaggedView; this.drag = null; }
  get list() { return this.app.state.activeWatchlist; }
  get groups() { return sectionGroups(this.app.state); }
  get hasSections() { return !this.flaggedView() && this.groups.length > 1; }

  render(symbols, renderRow) {
    if (this.flaggedView()) return symbols.map((symbol) => renderRow(symbol, '', false)).join('');
    const visible = new Set(symbols), all = (this.app.state.watchlistFlagView || 'all') === 'all', groups = this.groups;
    const hasSections = groups.length > 1;
    const body = groups.map((group) => {
      const members = group.symbols.filter((symbol) => visible.has(symbol));
      const rows = members.map((symbol) => renderRow(symbol, group.id, hasSections)).join('');
      if (!group.id) return rows;
      if (!all && !members.length) return '';
      return `<div class="wl-section" data-section="${esc(group.id)}" draggable="true">
        <button class="wl-section-toggle ${group.collapsed ? 'collapsed' : ''}" data-section-action="toggle" aria-expanded="${!group.collapsed}" aria-controls="wl-section-${esc(group.id)}" title="${group.collapsed ? 'Expand' : 'Collapse'} ${esc(group.name)}">${chevron}<span class="wl-section-name">${esc(group.name)}</span><span class="wl-section-count">${members.length}</span></button>
        <button class="wl-section-add" data-section-action="add" title="Add symbol to ${esc(group.name)}" aria-label="Add symbol to ${esc(group.name)}">+</button>
        <button class="wl-section-edit" data-section-action="settings" title="Edit ${esc(group.name)} section" aria-label="Edit ${esc(group.name)} section">⋯</button>
      </div><div class="wl-section-body ${group.collapsed ? 'hidden' : ''}" id="wl-section-${esc(group.id)}">${rows || '<div class="wl-section-empty">Use + to add a symbol, or move one here.</div>'}</div>`;
    }).join('');
    return body ? (hasSections ? '<div class="wl-ungrouped-drop" data-section="">Drop here: no section</div>' : '') + body : '';
  }

  bind(box) {
    this.pointerAbort?.abort(); this.pointerAbort = new AbortController(); this.pointer = null;
    box.addEventListener('click', event => {
      if (this.suppressClick) { this.suppressClick = false; event.preventDefault(); event.stopImmediatePropagation(); }
    }, true);
    box.addEventListener('pointerdown', event => {
      const handle = event.target.closest('.wl-move'), row = handle?.closest('.wl-row');
      if (!row || this.flaggedView() || event.button !== 0 || event.isPrimary === false) return;
      event.preventDefault(); event.stopPropagation();
      this.pointer = { id: event.pointerId, handle, list: this.list, symbol: row.dataset.sym, x: event.clientX, y: event.clientY, moved: false };
      this.drag = { list: this.list, symbol: row.dataset.sym };
      handle.setPointerCapture(event.pointerId);
    }, { capture: true, passive: false });
    const pointerTarget = event => {
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.wl-row, .wl-section, .wl-ungrouped-drop');
      return target && box.contains(target) ? target : null;
    };
    window.addEventListener('pointermove', event => {
      const p = this.pointer; if (!p || p.id !== event.pointerId) return;
      if (!p.moved && Math.hypot(event.clientX - p.x, event.clientY - p.y) < 6) return;
      event.preventDefault(); p.moved = true; this.drag = { list: p.list, symbol: p.symbol }; box.classList.add('wl-dragging');
      this.showDrop(box, pointerTarget(event), event.clientY);
    }, { capture: true, passive: false, signal: this.pointerAbort.signal });
    window.addEventListener('pointerup', event => {
      const p = this.pointer; if (!p || p.id !== event.pointerId) return;
      this.pointer = null; event.preventDefault();
      if (p.handle.hasPointerCapture(event.pointerId)) p.handle.releasePointerCapture(event.pointerId);
      this.suppressClick = true; setTimeout(() => { this.suppressClick = false; }, 0);
      if (p.moved) this.drop(box, pointerTarget(event));
      else { this.drag = null; this.move(p.symbol); }
    }, { capture: true, passive: false, signal: this.pointerAbort.signal });
    const cancelPointer = () => {
      if (!this.pointer) return;
      const p = this.pointer;
      if (p.handle.hasPointerCapture(p.id)) p.handle.releasePointerCapture(p.id);
      this.pointer = null; this.drag = null; box.classList.remove('wl-dragging'); this.changed();
    };
    window.addEventListener('pointercancel', cancelPointer, { capture: true, signal: this.pointerAbort.signal });
    window.addEventListener('blur', cancelPointer, { signal: this.pointerAbort.signal });
    window.addEventListener('keydown', event => {
      if (event.key === 'Escape' && this.pointer) { event.preventDefault(); event.stopImmediatePropagation(); cancelPointer(); }
    }, { capture: true, signal: this.pointerAbort.signal });
    box.addEventListener('click', (event) => {
      const button = event.target.closest('[data-section-action]'); if (!button) return;
      const id = button.closest('.wl-section').dataset.section;
      if (button.dataset.sectionAction === 'toggle') { toggleSection(this.app.state, this.list, id); this.changed(); }
      if (button.dataset.sectionAction === 'settings') this.edit(id);
      if (button.dataset.sectionAction === 'add') this.addSymbol(id);
    });
    box.addEventListener('dragstart', (event) => {
      if (this.flaggedView() || (event.target.closest('button') && !event.target.closest('.wl-section-toggle'))) { event.preventDefault(); return; }
      const row = event.target.closest('.wl-row'), section = event.target.closest('.wl-section');
      if (!row && !section) return;
      this.drag = { list: this.list, symbol: row?.dataset.sym, section: section?.dataset.section };
      event.dataTransfer.setData('text/plain', row?.dataset.sym || section.dataset.section);
      event.dataTransfer.effectAllowed = 'move'; box.classList.add('wl-dragging');
    });
    box.addEventListener('dragover', (event) => {
      const target = event.target.closest('.wl-row, .wl-section, .wl-ungrouped-drop');
      if (!this.drag || this.drag.list !== this.list || !target) return;
      event.preventDefault(); event.dataTransfer.dropEffect = 'move';
      this.showDrop(box, target, event.clientY);
    });
    box.addEventListener('drop', (event) => {
      const target = event.target.closest('.wl-row, .wl-section, .wl-ungrouped-drop'), drag = this.drag;
      if (!drag || drag.list !== this.list || !target) return;
      event.preventDefault();
      this.drop(box, target);
    });
    box.addEventListener('dragend', () => { this.drag = null; box.classList.remove('wl-dragging'); this.changed(); });
  }

  showDrop(box, target, y) {
    box.querySelectorAll('.wl-drop-target').forEach(el => el.classList.remove('wl-drop-target', 'wl-drop-after'));
    if (!target) return;
    const rect = target.getBoundingClientRect(), after = !!this.drag?.symbol && target.classList.contains('wl-row') && y > rect.top + rect.height / 2;
    target.classList.add('wl-drop-target'); target.classList.toggle('wl-drop-after', after);
  }
  drop(box, target) {
    const drag = this.drag;
    if (drag && drag.list === this.list && target) {
      try {
        if (drag.symbol && target.dataset.sym) placeSymbol(this.app.state, this.list, drag.symbol, target.dataset.sym, target.classList.contains('wl-drop-after'));
        else if (drag.symbol) moveSymbol(this.app.state, this.list, drag.symbol, target.dataset.section || '');
        else placeSectionBefore(this.app.state, this.list, drag.section, target.dataset.section);
      } catch (error) { this.app.toast(error.message, 'err'); }
    }
    this.drag = null; box.classList.remove('wl-dragging'); this.changed();
  }

  nameDialog(id = null) {
    const list = this.list, groups = this.groups, group = groups.find((entry) => entry.id === id);
    const card = this.app.modal(id ? 'Section settings' : 'New section', `<label class="field" style="display:flex">Section name<input id="wlSectionName" maxlength="80" value="${esc(group?.name || '')}" placeholder="e.g. Coins per BTC"></label>
      ${id ? '<p class="hint-text">Removing this heading keeps all its symbols in the watchlist.</p>' : '<p class="hint-text">Add symbols with the + beside the heading, move them with the row button, or drag them into this section.</p>'}
      <p class="down" data-section-error role="alert"></p>`, { foot: `${id ? `<button class="btn" data-section-up ${groups.indexOf(group) <= 1 ? 'disabled' : ''} title="Move section up">↑</button><button class="btn" data-section-down ${groups.indexOf(group) === groups.length - 1 ? 'disabled' : ''} title="Move section down">↓</button><button class="btn" data-section-remove>Remove heading</button>` : ''}<button class="btn" data-section-cancel>Cancel</button><button class="btn primary" data-section-save>${id ? 'Save' : 'Create'}</button>` });
    const finish = (action) => {
      try { action(); this.changed(); this.app.closeModal(); }
      catch (error) { card.querySelector('[data-section-error]').textContent = error.message; }
    };
    card.querySelector('[data-section-save]').onclick = () => finish(() => id ? renameSection(this.app.state, list, id, card.querySelector('#wlSectionName').value) : addSection(this.app.state, list, card.querySelector('#wlSectionName').value));
    card.querySelector('[data-section-cancel]').onclick = () => this.app.closeModal();
    if (id) {
      card.querySelector('[data-section-up]').onclick = () => finish(() => moveSection(this.app.state, list, id, -1));
      card.querySelector('[data-section-down]').onclick = () => finish(() => moveSection(this.app.state, list, id, 1));
      card.querySelector('[data-section-remove]').onclick = () => finish(() => removeSection(this.app.state, list, id));
    }
    const input = card.querySelector('#wlSectionName'); input.focus(); input.select();
    input.onkeydown = (event) => { if (event.key === 'Enter') { event.preventDefault(); card.querySelector('[data-section-save]').click(); } };
  }
  create() { this.nameDialog(); }
  edit(id) { this.nameDialog(id); }

  move(symbol) {
    const list = this.list, groups = this.groups, current = groups.find((group) => group.symbols.includes(symbol));
    if (!current) return;
    const card = this.app.modal(`Move ${ticker(symbol)}`, `<div class="form-grid"><label class="field ${groups.length === 1 ? 'hidden' : ''}">Section<select id="wlMoveSection">${groups.map((group) => `<option value="${esc(group.id)}" ${group.id === current.id ? 'selected' : ''}>${esc(group.name || 'No section — top of list')}</option>`).join('')}</select></label><label class="field">Position<select id="wlMovePosition"></select></label></div><p class="hint-text">You can also drag the dotted handle beside an asset to put it above or below another.</p><p class="down" data-section-error role="alert"></p>`, { foot: '<button class="btn" data-section-cancel>Cancel</button><button class="btn primary" data-section-move>Move</button>' });
    const section = card.querySelector('#wlMoveSection'), position = card.querySelector('#wlMovePosition');
    const positions = (initial = false) => {
      const group = groups.find(group => group.id === section.value), members = group.symbols.filter(item => item !== symbol);
      const next = initial ? group.symbols[group.symbols.indexOf(symbol) + 1] || '' : '';
      position.innerHTML = members.map(item => `<option value="${esc(item)}" ${item === next ? 'selected' : ''}>Before ${esc(ticker(item))}</option>`).join('') + `<option value="" ${!next ? 'selected' : ''}>${group.id ? 'Bottom of section' : 'Bottom of list'}</option>`;
    };
    positions(true); section.onchange = () => positions();
    card.querySelector('[data-section-cancel]').onclick = () => this.app.closeModal();
    card.querySelector('[data-section-move]').onclick = () => {
      try { moveSymbol(this.app.state, list, symbol, section.value, position.value || null); this.changed(); this.app.closeModal(); }
      catch (error) { card.querySelector('[data-section-error]').textContent = error.message; }
    };
    (groups.length > 1 ? section : position).focus();
  }

  addSymbol(id) {
    const list = this.list, group = this.groups.find((entry) => entry.id === id);
    const card = this.app.modal(`Add symbol to ${group.name}`, '<label class="field" style="display:flex">Symbol<input id="wlSectionSymbol" placeholder="BTCUSDT, AAPL, EURUSD…" autocomplete="off"></label><p class="down" data-section-error role="alert"></p>', { foot: '<button class="btn" data-section-cancel>Cancel</button><button class="btn primary" data-section-add>Add</button>' });
    card.querySelector('[data-section-cancel]').onclick = () => this.app.closeModal();
    const button = card.querySelector('[data-section-add]'), input = card.querySelector('#wlSectionSymbol');
    button.onclick = async () => {
      if (button.disabled) return;
      button.disabled = true;
      try {
        if (!input.value.trim()) throw new Error('Enter a symbol to add.');
        const symbol = (await api.get(`/api/resolve?symbol=${encodeURIComponent(input.value.trim())}`)).id;
        if (!input.isConnected) return; // Cancelled while the data source was resolving the symbol.
        const symbols = this.app.state.watchlists[list];
        if (!symbols.includes(symbol)) symbols.push(symbol);
        moveSymbol(this.app.state, list, symbol, id); this.changed(); this.app.closeModal();
      } catch (error) {
        if (!input.isConnected) return;
        card.querySelector('[data-section-error]').textContent = error.message; button.disabled = false;
      }
    };
    input.focus(); input.onkeydown = (event) => { if (event.key === 'Enter') { event.preventDefault(); button.click(); } };
  }
}
