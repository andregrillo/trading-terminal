import { api, esc, ticker, fmtPrice, fmtPct } from './api.js';

const NEWS_INTERVAL = 120000, QUOTE_INTERVAL = 15000;
const webUrl = (value) => { try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) ? u.href : null; } catch { return null; } };
const ago = (time) => {
  if (!time) return '';
  const mins = Math.max(0, Math.floor((Date.now() - time) / 60000));
  return mins < 1 ? 'Just now' : mins < 60 ? `${mins}m ago` : mins < 1440 ? `${Math.floor(mins / 60)}h ago` : new Date(time).toLocaleDateString();
};

export class AssetDetails {
  constructor(app, side) {
    this.app = app; this.side = side; this.revision = 0; this.visible = true; this.profiles = new Map();
    this.el = document.createElement('section'); this.el.className = 'asset-details'; this.el.setAttribute('aria-label', 'Selected asset details');
    this.el.innerHTML = `<div class="asset-details-resize" role="separator" aria-label="Resize asset details" aria-orientation="horizontal" tabindex="0"></div>
      <div class="asset-details-top"><button data-asset-collapse aria-controls="asset-details-body"><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>Asset details</button><button data-asset-refresh title="Refresh asset details and news" aria-label="Refresh asset details and news">↻</button></div>
      <div class="asset-details-body" id="asset-details-body"><div class="asset-identity"><span class="asset-badge" data-badge></span><div><strong data-asset-symbol></strong><div class="asset-name" data-asset-name></div></div></div>
      <div class="asset-meta" data-asset-meta></div><div class="asset-price-line"><strong data-asset-price>—</strong><span data-asset-currency></span></div><div class="asset-change" data-asset-change>Loading quote…</div>
      <div class="asset-about"><p data-asset-about>Loading description…</p><button data-asset-about-more class="hidden">Read more</button><div class="asset-source" data-asset-source></div></div>
      <div class="asset-news-heading"><strong data-asset-news-heading>Latest news</strong><span data-asset-news-time></span></div><p class="asset-news-note" data-asset-news-note>Loading headlines…</p><div data-asset-news-list></div><button class="asset-more-news hidden" data-asset-more-news>More news →</button></div>`;
    side.appendChild(this.el);
    this.el.querySelector('[data-asset-collapse]').onclick = () => {
      if (this.phone) this.app.mobileUI.assetCollapsed = !this.collapsed;
      else { app.settings.assetDetailsCollapsed = !this.collapsed; app.persist(); }
      this.applySize(); if (!this.collapsed) this.sync();
    };
    this.el.querySelector('[data-asset-refresh]').onclick = () => this.refresh();
    this.el.querySelector('[data-asset-about-more]').onclick = () => { this.aboutOpen = !this.aboutOpen; this.drawProfile(); };
    this.el.querySelector('[data-asset-more-news]').onclick = () => document.querySelector('#sideTabs [data-tab="news"]').click();
    this.priceListener = (symbol, price) => { if (symbol === this.symbol) this.setPrice(price); };
    app.priceListeners.add(this.priceListener);
    this.observer = new ResizeObserver(() => this.applySize()); this.observer.observe(side);
    this.resizeControls(); this.applySize();
    this.newsTimer = setInterval(() => { if (this.canLoad()) this.refresh(); }, NEWS_INTERVAL);
    this.quoteTimer = setInterval(() => { if (this.canLoad()) this.refreshQuote(this.symbol, this.revision); }, QUOTE_INTERVAL);
    this.wake = () => { if (!document.hidden && this.canLoad()) this.sync(); };
    document.addEventListener('visibilitychange', this.wake);
    this.sync();
  }
  get phone() { return !!this.app.mobileUI?.enabled; }
  get collapsed() { return this.phone ? this.app.mobileUI.assetCollapsed : !!this.app.settings.assetDetailsCollapsed; }
  get preferredHeight() { return this.phone ? this.app.mobileUI.assetHeight || 300 : this.app.settings.assetDetailsHeight || 420; }
  set preferredHeight(value) { if (this.phone) this.app.mobileUI.assetHeight = value; else this.app.settings.assetDetailsHeight = value; }
  saveSize() { if (!this.phone) this.app.persist(); }
  node(name) { return this.el.querySelector(`[data-asset-${name}]`); }
  canLoad() { return this.visible && !this.collapsed && !document.hidden && !!this.side.getClientRects().length; }
  setVisible(value) { this.visible = value; this.el.classList.toggle('hidden', !value); if (value) this.sync(); }
  applySize() {
    const max = Math.max(170, (this.side.clientHeight || innerHeight - 44) * .62);
    this.height = Math.max(170, Math.min(Number(this.preferredHeight) || 420, max));
    this.el.style.height = this.collapsed ? '36px' : `${this.height}px`;
    this.el.classList.toggle('collapsed', !!this.collapsed);
    this.node('collapse').setAttribute('aria-expanded', String(!this.collapsed));
    const handle = this.el.querySelector('[role="separator"]'); handle.setAttribute('aria-valuemin', '170'); handle.setAttribute('aria-valuemax', String(Math.round(max))); handle.setAttribute('aria-valuenow', String(Math.round(this.height)));
  }
  resizeControls() {
    const handle = this.el.querySelector('[role="separator"]');
    handle.addEventListener('pointerdown', (event) => {
      if (this.collapsed) return;
      event.preventDefault(); const start = event.clientY, height = this.height; handle.setPointerCapture(event.pointerId);
      const move = (e) => { this.preferredHeight = height + start - e.clientY; this.applySize(); };
      const stop = () => { handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', stop); handle.removeEventListener('pointercancel', cancel); this.preferredHeight = this.height; this.saveSize(); };
      const cancel = () => { handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', stop); handle.removeEventListener('pointercancel', cancel); this.preferredHeight = height; this.applySize(); };
      handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', stop); handle.addEventListener('pointercancel', cancel);
    });
    handle.onkeydown = (event) => {
      if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation(); this.preferredHeight = this.height + (event.key === 'ArrowUp' ? 20 : -20); this.applySize(); this.saveSize();
    };
  }
  sync() {
    const symbol = this.app.active?.cfg.symbol; if (!symbol) return;
    if (symbol !== this.symbol) {
      this.symbol = symbol; this.revision++; this.busy = false; this.quote = null; this.aboutOpen = false; this.lastNews = 0;
      this.profile = this.profiles.get(symbol); this.node('symbol').textContent = ticker(symbol); this.node('name').textContent = ''; this.node('meta').textContent = '';
      this.node('currency').textContent = ''; this.node('price').textContent = '—'; this.node('price').className = ''; this.node('change').textContent = 'Loading quote…'; this.node('change').className = 'asset-change';
      this.el.querySelector('[data-badge]').classList.remove('has-logo'); this.el.querySelector('[data-badge]').textContent = ticker(symbol).slice(0, 2);
      this.node('news-list').innerHTML = ''; this.node('news-heading').textContent = 'Latest news'; this.node('news-note').textContent = 'Loading headlines…'; this.node('news-time').textContent = ''; this.node('more-news').classList.add('hidden');
      this.node('about').textContent = 'Loading description…'; this.node('source').innerHTML = ''; this.node('about-more').classList.add('hidden');
      if (this.profile) this.drawProfile();
      this.setPrice(this.app.prices[symbol]);
    }
    if (this.canLoad() && (!this.profile || !this.lastNews || Date.now() - this.lastNews >= NEWS_INTERVAL)) this.refresh();
  }
  async refresh() {
    if (!this.canLoad() || this.busy || !this.symbol) return;
    this.busy = true; const symbol = this.symbol, revision = ++this.revision;
    const current = () => this.symbol === symbol && this.revision === revision;
    this.node('refresh').disabled = true;
    await Promise.allSettled([
      api.get(`/api/asset?symbol=${encodeURIComponent(symbol)}`).then(profile => {
        if (!current()) return; this.profile = profile; this.profiles.set(symbol, profile); if (this.profiles.size > 100) this.profiles.delete(this.profiles.keys().next().value); this.drawProfile();
      }).catch(() => { if (current() && !this.profile) this.node('about').textContent = 'The asset description is unavailable right now.'; }),
      api.get(`/api/news?symbol=${encodeURIComponent(symbol)}`).then(data => {
        if (!current()) return; this.lastNews = Date.now(); this.drawNews(data);
      }).catch(() => { if (current()) this.node('news-note').textContent = 'News feeds are unavailable right now. Try refreshing shortly.'; }),
      this.refreshQuote(symbol, revision),
    ]);
    if (current()) { this.busy = false; this.node('refresh').disabled = false; }
  }
  async refreshQuote(symbol, revision) {
    if (!symbol) return;
    try {
      const result = await api.quotes([symbol]), quote = result[symbol] || Object.values(result)[0];
      if (symbol !== this.symbol || revision !== this.revision) return;
      if (!Number.isFinite(quote?.price)) throw new Error('Quote unavailable');
      this.quote = { ...quote, reference: Number.isFinite(quote.changePct) && quote.changePct > -100 ? quote.price / (1 + quote.changePct / 100) : null };
      this.setPrice(quote.price);
    } catch { if (symbol === this.symbol && revision === this.revision && !this.quote) this.node('change').textContent = 'Day change unavailable.'; }
  }
  setPrice(price) {
    if (!Number.isFinite(price)) return;
    this.node('price').textContent = fmtPrice(price);
    if (!this.quote) return;
    const reference = this.quote.reference, change = reference ? price - reference : null, pct = reference ? change / reference * 100 : this.quote.changePct;
    const color = Number.isFinite(pct) ? pct >= 0 ? 'up' : 'down' : '';
    this.node('price').className = color; this.node('change').className = `asset-change ${color}`;
    this.node('change').textContent = `${change == null ? '' : `${change >= 0 ? '+' : ''}${fmtPrice(change)} · `}${fmtPct(pct)} · ${this.quote.changePeriod || 'Day'}`;
  }
  drawProfile() {
    const profile = this.profile; if (!profile) return;
    this.node('name').textContent = profile.name;
    this.node('currency').textContent = profile.quote || '';
    this.node('meta').textContent = [profile.type, profile.exchange, profile.type === 'Crypto' ? '24/7 market' : profile.sector].filter(Boolean).join(' · ');
    this.node('about').textContent = profile.description || 'No description is available for this asset.';
    this.node('about').classList.toggle('expanded', !!this.aboutOpen);
    this.node('about-more').classList.toggle('hidden', (profile.description || '').length < 200);
    this.node('about-more').textContent = this.aboutOpen ? 'Show less' : 'Read more';
    const source = webUrl(profile.source?.url), website = webUrl(profile.website);
    this.node('source').innerHTML = [source ? `<a href="${esc(source)}" target="_blank" rel="noopener noreferrer">${esc(profile.source.name)}</a>` : '', website ? `<a href="${esc(website)}" target="_blank" rel="noopener noreferrer">Website ↗</a>` : '', profile.note ? `<span>${esc(profile.note)}</span>` : ''].filter(Boolean).join(' · ');
    const badge = this.el.querySelector('[data-badge]'), logo = webUrl(profile.logo);
    badge.classList.remove('has-logo'); badge.textContent = (profile.base || profile.ticker).slice(0, 2);
    if (logo) { const img = document.createElement('img'); img.alt = ''; img.referrerPolicy = 'no-referrer'; img.onload = () => { if (img.isConnected) badge.classList.add('has-logo'); }; img.onerror = () => img.remove(); badge.appendChild(img); img.src = logo; }
  }
  drawNews(data) {
    const assets = [...new Set((data.components || []).map(asset => asset.label))];
    this.node('news-heading').textContent = data.scope === 'combined' ? `News for ${assets.join(' + ')}` : data.scope === 'market' ? 'Crypto market news' : 'Latest news';
    const available = (data.sources || []).filter(source => source.available).map(source => source.name);
    this.node('news-note').textContent = [data.note, available.length ? available.join(' · ') : ''].filter(Boolean).join(' · ');
    this.node('news-time').textContent = data.updatedAt ? `Checked ${new Date(data.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · 2 min` : 'Every 2 min';
    const items = (data.items || []).filter(item => webUrl(item.url)).slice(0, 4);
    this.node('news-list').innerHTML = items.map((item, index) => `<a class="asset-headline ${index === 0 ? 'featured' : ''}" href="${esc(webUrl(item.url))}" target="_blank" rel="noopener noreferrer">${item.assetLabels?.length ? `<span class="asset-headline-assets">${item.assetLabels.map(esc).join(' · ')}</span>` : ''}<span class="asset-headline-title">${esc(item.title)}</span><span class="asset-headline-meta">${esc(item.source || '')}${item.time ? ` · ${esc(ago(item.time))}` : item.ago ? ` · ${esc(item.ago)}` : ''}</span>${index === 0 && item.summary ? `<span class="asset-headline-summary">${esc(item.summary.slice(0, 180))}${item.summary.length > 180 ? '…' : ''}</span>` : ''}</a>`).join('');
    this.node('more-news').classList.toggle('hidden', !items.length);
  }
  destroy() {
    clearInterval(this.newsTimer); clearInterval(this.quoteTimer); this.revision++;
    this.observer.disconnect(); document.removeEventListener('visibilitychange', this.wake); this.app.priceListeners.delete(this.priceListener); this.el.remove();
  }
}
