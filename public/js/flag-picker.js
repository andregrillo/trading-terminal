import { esc, ticker } from './api.js';
import { FLAG_COLORS, flagColor } from '../lib/watchlist-flags.js';

export const FLAG_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V3m0 1c5-4 9 4 14 0v10c-5 4-9-4-14 0"/></svg>';

export function flagButton(symbol, flags) {
  const color = flagColor(flags, symbol);
  const label = `${color ? `${color.name} flag` : 'Set flag'} for ${ticker(symbol)}. Click to choose a colour.`;
  return `<button class="wl-flag${color ? ' flagged' : ''}" style="${color ? `--flag-color:${color.color}` : ''}" title="${esc(label)}" aria-label="${esc(label)}" aria-haspopup="menu" aria-expanded="false">${FLAG_ICON}</button>`;
}

export class FlagPicker {
  constructor(app, onChange) {
    this.app = app; this.onChange = onChange;
    this.el = document.createElement('div');
    this.el.className = 'flag-picker hidden'; this.el.setAttribute('role', 'menu');
    document.body.appendChild(this.el);
    this.el.addEventListener('click', (event) => {
      const button = event.target.closest('[data-flag-color]');
      if (!button) return;
      this.onChange(this.symbol, button.dataset.flagColor || null);
      this.close(true);
    });
    document.addEventListener('pointerdown', (event) => {
      if (!this.el.contains(event.target) && !event.target.closest('.wl-flag')) this.close();
    }, true);
    document.addEventListener('keydown', (event) => {
      if (!this.symbol) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); this.close(true); }
      if (['Enter', ' '].includes(event.key) && event.target.matches('[data-flag-color]')) {
        event.preventDefault(); event.stopImmediatePropagation(); event.target.click(); return;
      }
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
        event.preventDefault(); event.stopImmediatePropagation();
        const buttons = [...this.el.querySelectorAll('[data-flag-color]')], index = buttons.indexOf(document.activeElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1) + buttons.length) % buttons.length;
        buttons[next].focus();
      }
      // A focused menu button must not trigger chart typing or drawing shortcuts underneath it.
      if (this.el.contains(event.target)) event.stopImmediatePropagation();
    }, true);
    this.el.addEventListener('focusout', (event) => {
      if (event.relatedTarget && this.el.contains(event.relatedTarget)) return;
      requestAnimationFrame(() => {
        if (this.symbol && !this.el.contains(document.activeElement)) this.close();
      });
    });
    window.addEventListener('resize', () => this.close());
    document.addEventListener('scroll', (event) => { if (!this.el.contains(event.target)) this.close(); }, true);
  }
  open(symbol, anchor) {
    if (this.symbol === symbol) return this.close(true);
    this.close(); this.symbol = symbol; this.anchor = anchor;
    const color = flagColor(this.app.state.symbolFlags, symbol);
    this.el.setAttribute('aria-label', `Flag ${ticker(symbol)}`);
    this.el.innerHTML = `<div class="flag-picker-title">Flag ${esc(ticker(symbol))}</div><div class="flag-swatches">${FLAG_COLORS.map((entry) => `<button data-flag-color="${entry.id}" role="menuitemradio" aria-checked="${entry.id === color?.id}" aria-label="${entry.name} flag" title="${entry.name}" style="--flag-color:${entry.color}">${FLAG_ICON}</button>`).join('')}</div><button class="flag-clear" data-flag-color="" role="menuitemradio" aria-checked="${!color}">No flag</button>`;
    this.el.classList.remove('hidden'); anchor?.setAttribute('aria-expanded', 'true');
    const rect = anchor.getBoundingClientRect();
    this.el.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - this.el.offsetWidth - 8))}px`;
    this.el.style.top = `${Math.max(8, Math.min(rect.bottom + 4, innerHeight - this.el.offsetHeight - 8))}px`;
    this.el.querySelector(`[data-flag-color="${color?.id || 'red'}"]`).focus();
  }
  close(focus = false) {
    const symbol = this.symbol; this.symbol = null;
    this.anchor?.setAttribute('aria-expanded', 'false');
    this.el.classList.add('hidden');
    if (focus && symbol) (document.querySelector(`.wl-row[data-sym="${CSS.escape(symbol)}"] .wl-flag`) || document.querySelector('#wlFlagFilter'))?.focus();
  }
}
