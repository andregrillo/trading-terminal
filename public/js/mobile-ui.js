import { esc, ticker } from './api.js';
import { BY_ID } from '../lib/indicators.js';
import { MobilePaneFocus } from './mobile-pane-focus.js';
import { parseTf } from '../lib/series.js';

export const PHONE_QUERY = '(max-width: 1024px) and (hover: none) and (pointer: coarse)';
const icons = {
  pencil: '<path d="M4 16l11-11 4 4-11 11-5 1zM13 7l4 4M3 22h18"/>',
  indicators: '<path d="M3 17l5-8 5 6 8-12M3 21h18"/>',
  watchlist: '<path d="M8 5h13M8 12h13M8 19h13M3 5h1M3 12h1M3 19h1"/>',
  // Lucide chart-candlestick, ISC licence: https://lucide.dev/icons/chart-candlestick
  chart: '<path d="M9 5v4"/><rect width="4" height="6" x="7" y="9" rx="1"/><path d="M9 15v2"/><path d="M17 3v2"/><rect width="4" height="8" x="15" y="5" rx="1"/><path d="M17 13v3"/><path d="M3 3v16a2 2 0 0 0 2 2h16"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  restore: '<path d="M9 3H3v6M15 3h6v6M3 15v6h6M21 15v6h-6M7 7l10 10M17 7L7 17"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  up: '<path d="M6 15l6-6 6 6"/>', down: '<path d="M6 9l6 6 6-6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
};
const svg = name => `<svg viewBox="0 0 24 24" aria-hidden="true"${name === 'chart' ? ' class="lucide-chart-candlestick"' : ''}>${icons[name]}</svg>`;

export class MobileUI {
  constructor(app) {
    this.app = app; this.enabled = false; this.view = 'chart'; this.assetCollapsed = true;
    this.media = matchMedia(PHONE_QUERY); this.focus = new MobilePaneFocus(this); this.restoreButtons = new Map();
  }
  start() {
    this.changed = () => this.media.matches ? this.enable() : this.disable();
    this.media.addEventListener('change', this.changed);
    if (this.media.matches) this.enable();
  }
  enable() {
    if (this.enabled) return;
    this.enabled = true; this.abort = new AbortController();
    this.viewport = document.querySelector('meta[name="viewport"]'); this.originalViewport = this.viewport.content;
    this.viewport.content = this.originalViewport + ', viewport-fit=cover';
    document.body.classList.add('mobile-ui');
    this.el = document.createElement('nav'); this.el.className = 'mobile-shell'; this.el.setAttribute('aria-label', 'Phone chart navigation');
    this.el.innerHTML = `<div class="mobile-chart-tools" aria-label="Chart tools"><button data-mobile="symbol" title="Change symbol"></button><button data-mobile="timeframe" title="Change timeframe"></button><button data-mobile="drawings" aria-label="Drawing tools" aria-expanded="false">${svg('pencil')}</button><button data-mobile="indicators" aria-label="Indicators">${svg('indicators')}</button><button data-mobile="more" aria-label="Chart menu">${svg('more')}</button></div>
      <div class="mobile-tabs"><button data-mobile="watchlist">${svg('watchlist')}<span>Watchlist</span></button><button data-mobile="chart">${svg('chart')}<span>Chart</span></button></div>`;
    document.body.appendChild(this.el);
    this.el.onclick = event => {
      const action = event.target.closest('[data-mobile]')?.dataset.mobile;
      if (action === 'watchlist') this.showWatchlist();
      if (action === 'chart') this.showChart();
      if (action === 'drawings') this.toggleDrawings();
      if (action === 'symbol') this.app.openSymbolSearch();
      if (action === 'timeframe') this.timeframes();
      if (action === 'indicators') this.indicators();
      if (action === 'more') this.more();
    };
    this.drawerClose = document.createElement('button'); this.drawerClose.title = 'Close drawing tools'; this.drawerClose.setAttribute('aria-label', 'Close drawing tools'); this.drawerClose.innerHTML = svg('close'); this.drawerClose.onclick = () => this.closeDrawings(); document.querySelector('#drawbar').prepend(this.drawerClose);
    this.watchHeading = document.createElement('div'); this.watchHeading.className = 'mobile-watchlist-heading'; this.watchHeading.innerHTML = `<strong>Watchlist</strong><button aria-label="Watchlist menu">${svg('more')}</button>`;
    this.watchHeading.querySelector('button').onclick = () => this.watchlistMenu(); document.querySelector('.side').prepend(this.watchHeading);
    document.addEventListener('click', event => {
      const name = event.target.closest('.legend .ind .name');
      if (!name) return;
      const pane = this.app.panes.find(p => p.el.contains(name)), ind = pane?.cfg.indicators.find(i => i.uid === name.closest('[data-uid]').dataset.uid);
      if (ind) { this.restorePane(pane); this.app.openIndicatorSettings(pane, ind); }
    }, { signal: this.abort.signal });
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || !document.querySelector('#modal').classList.contains('hidden')) return;
      if (document.body.classList.contains('mobile-drawings-open')) { this.closeDrawings(); event.preventDefault(); event.stopImmediatePropagation(); }
      else if (this.app.active?.mobilePaneFocus) { this.restorePane(); event.preventDefault(); event.stopImmediatePropagation(); }
    }, { capture: true, signal: this.abort.signal });
    this.focus.bind(this.abort.signal);
    this.showChart(); this.app.panels.refreshAssetDetails(); this.sync();
  }
  disable() {
    if (!this.enabled) return;
    this.focus.restoreAll(); this.enabled = false; this.abort.abort();
    this.el.remove(); this.drawerClose.remove(); this.watchHeading.remove();
    for (const [pane, button] of this.restoreButtons) { button.remove(); delete pane.el.dataset.mobileFocus; }
    this.restoreButtons.clear();
    document.body.classList.remove('mobile-ui', 'mobile-drawings-open', 'mobile-view-watchlist');
    this.viewport.content = this.originalViewport; this.app.panels.refreshAssetDetails();
    requestAnimationFrame(() => { for (const pane of this.app.panes) pane.legends.scheduleLayout(); });
  }
  showChart() {
    if (!this.enabled) return;
    this.view = 'chart'; document.body.classList.remove('mobile-view-watchlist'); document.querySelector('.side').classList.remove('mobile-open'); this.sync();
  }
  showWatchlist() {
    if (!this.enabled) return;
    this.closeDrawings(); this.view = 'watchlist'; document.body.classList.add('mobile-view-watchlist'); this.app.panels.showWatchlist(); this.sync();
  }
  toggleDrawings() {
    if (!this.enabled) return;
    this.restorePane(); this.showChart();
    const open = document.body.classList.toggle('mobile-drawings-open'); this.el.querySelector('[data-mobile="drawings"]').setAttribute('aria-expanded', String(open));
  }
  closeDrawings() { document.body.classList.remove('mobile-drawings-open'); this.el?.querySelector('[data-mobile="drawings"]')?.setAttribute('aria-expanded', 'false'); }
  restorePane(pane = this.app.active) { if (this.enabled) this.focus.restore(pane); }
  onToolChange() {
    if (!this.enabled) return;
    if (this.app.tool !== 'cursor') { this.restorePane(); this.closeDrawings(); }
    this.sync();
  }
  sync() {
    if (!this.enabled || !this.app.active) return;
    const pane = this.app.active;
    this.el.querySelector('[data-mobile="symbol"]').textContent = ticker(pane.cfg.symbol);
    this.el.querySelector('[data-mobile="timeframe"]').textContent = pane.cfg.tf;
    this.el.querySelector('[data-mobile="drawings"]').classList.toggle('active', this.app.tool !== 'cursor');
    for (const name of ['chart', 'watchlist']) { const button = this.el.querySelector(`[data-mobile="${name}"]`); button.classList.toggle('active', this.view === name); button.setAttribute('aria-current', this.view === name ? 'page' : 'false'); }
    for (const item of this.app.panes) {
      if (item.mobilePaneFocus) {
        item.el.dataset.mobileFocus = item.mobilePaneFocus === 'price' ? 'price' : 'indicator';
        if (!this.restoreButtons.has(item)) { const button = document.createElement('button'); button.className = 'mobile-pane-restore'; button.innerHTML = svg('restore'); button.title = 'Restore all panes'; button.setAttribute('aria-label', 'Restore all panes'); button.onclick = () => this.restorePane(item); item.el.appendChild(button); this.restoreButtons.set(item, button); }
      } else { this.restoreButtons.get(item)?.remove(); this.restoreButtons.delete(item); delete item.el.dataset.mobileFocus; }
    }
  }
  menu(title, buttons, extra = '') {
    this.closeDrawings();
    const card = this.app.modal(title, `<div class="mobile-menu">${buttons.map((button, i) => `<button data-choice="${i}" ${button.disabled ? 'disabled' : ''} class="${button.active ? 'active' : ''}">${esc(button.label)}</button>`).join('')}${extra}</div>`);
    card.querySelectorAll('[data-choice]').forEach(button => button.onclick = () => { const action = buttons[Number(button.dataset.choice)].action; this.app.closeModal(); action(); this.sync(); });
    return card;
  }
  timeframes() {
    const current = this.app.active.cfg.tf;
    const card = this.menu('Timeframe', ['1m', '5m', '15m', '30m', '1h', '4h', '8h', '1D', '1W', '1M'].map(tf => ({ label: tf, active: current === tf, action: () => this.app.setTf(tf) })), '<label class="field mobile-field">Custom timeframe<input id="mobileTf" placeholder="e.g. 2h or 3D" autocomplete="off"></label><button id="mobileTfApply">Apply custom</button>');
    const apply = () => { const value = card.querySelector('#mobileTf').value.trim(); if (!value) return; try { parseTf(value); } catch (error) { this.app.toast(error.message, 'err'); return; } this.app.closeModal(); this.app.setTf(value); this.sync(); };
    card.querySelector('#mobileTfApply').onclick = apply; card.querySelector('#mobileTf').onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); apply(); } };
  }
  more() {
    const pane = this.app.active;
    this.menu('Chart', [
      ...(pane.mobilePaneFocus ? [{ label: 'Restore all panes', action: () => this.restorePane() }] : []),
      { label: 'Chart type', action: () => this.chartTypes() }, { label: 'Settings', action: () => { this.restorePane(); this.app.openSettings(); } },
      { label: pane.cfg.log ? 'Linear scale' : 'Log scale', action: () => { this.restorePane(); document.querySelector('#logBtn').click(); } },
      { label: 'Light / dark', action: () => document.querySelector('#themeBtn').click() },
      { label: pane.replay ? 'Stop replay' : 'Replay', action: () => { this.restorePane(); document.querySelector('#replayBtn').click(); } },
      { label: 'Fit chart', action: () => pane.chart.timeScale().fitContent() },
      ...this.app.panes.map((p, i) => ({ label: `Chart ${i + 1}: ${ticker(p.cfg.symbol)}`, active: p === pane, action: () => { this.app.setActive(p); this.showChart(); } })).filter(() => this.app.panes.length > 1),
    ]);
  }
  chartTypes() {
    const options = [...document.querySelector('#chartType').options];
    this.menu('Chart type', options.map(option => ({ label: option.text, active: option.value === this.app.active.cfg.type, action: () => { this.restorePane(); const select = document.querySelector('#chartType'); select.value = option.value; select.dispatchEvent(new Event('change')); } })));
  }
  watchlistMenu() {
    this.menu('Watchlist', [
      { label: 'New list', action: () => document.querySelector('#wlNew').click() },
      { label: 'New section', disabled: document.querySelector('#wlSectionNew').disabled, action: () => document.querySelector('#wlSectionNew').click() },
      { label: 'Delete list', disabled: document.querySelector('#wlDel').disabled || Object.keys(this.app.state.watchlists).length < 2, action: () => document.querySelector('#wlDel').click() },
    ]);
  }
  indicators() {
    this.closeDrawings();
    const pane = this.app.active;
    const card = this.app.modal('Indicators', pane.cfg.indicators.map(ind => {
      const def = BY_ID[ind.id]; if (!def) return '';
      const index = pane.indPaneOf?.[ind.uid] || 0;
      const button = (action, icon, label, disabled = false) => `<button data-ind-action="${action}" aria-label="${label}" title="${label}" ${disabled ? 'disabled' : ''}>${svg(icon)}</button>`;
      return `<div class="mobile-indicator-row" data-ind="${esc(ind.uid)}"><span>${esc(def.name)}${ind.hidden ? ' · hidden' : ''}</span><div class="mobile-indicator-actions">${index ? button('up', 'up', 'Move pane up', index === 1) + button('down', 'down', 'Move pane down', index === pane.indicatorPaneGroups.length) : ''}${button('settings', 'gear', 'Settings')}${button('hide', 'eye', 'Show or hide')}${button('remove', 'close', 'Remove')}</div></div>`;
    }).join('') + '<button class="btn primary mobile-add-indicator" data-add-indicator>Add indicator</button>');
    card.querySelector('[data-add-indicator]').onclick = () => { this.restorePane(pane); this.app.closeModal(); this.app.openIndicatorPicker(); };
    card.querySelectorAll('[data-ind-action]').forEach(button => button.onclick = () => {
      const ind = pane.cfg.indicators.find(i => i.uid === button.closest('[data-ind]').dataset.ind), action = button.dataset.indAction;
      if (!ind) return;
      if (action === 'settings') { this.restorePane(pane); this.app.openIndicatorSettings(pane, ind); return; }
      this.restorePane(pane);
      if (action === 'up' || action === 'down') pane.moveIndicatorPane(ind.uid, action === 'up' ? -1 : 1);
      if (action === 'hide') { ind.hidden = !ind.hidden; pane.render(false); this.app.persist(); }
      if (action === 'remove') pane.removeIndicator(ind.uid);
      this.indicators();
    });
  }
}
