import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../public/js/api.js';

globalThis.window = { LightweightCharts: { PriceScaleMode: { Normal: 0 } } };
const { ChartPane } = await import('../public/js/chart.js');
const bar = { time: 1000, open: 10, high: 12, low: 9, close: 11, volume: 3 };
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

test('volume draws missing values as gaps and preserves genuine zero-volume candles', () => {
  const pane = Object.create(ChartPane.prototype); pane.toChart = time => time;
  assert.deepEqual(pane.volPoint({ ...bar, volume: null }), { time: bar.time });
  assert.equal(pane.volPoint({ ...bar, volume: 0 }).value, 0);
});

test('chart inversion changes scale direction, restores focused panes first and saves per chart', () => {
  const calls = [], cfg = { symbol: 'BINANCE:BTCUSDT', tf: '1D', indicators: [{ uid: 'rsi' }] };
  const pane = Object.assign(Object.create(ChartPane.prototype), {
    cfg, chart: { applyOptions: options => calls.push(['price-and-indicators', options.rightPriceScale.invertScale]) },
    volume: { priceScale: () => ({ applyOptions: options => calls.push(['volume', options.invertScale]) }) },
    drawings: { update: () => calls.push(['drawings']) },
    app: { mobileUI: { restorePane: p => { assert.equal(p, pane); calls.push(['restore']); } }, persist: () => calls.push(['save']) },
  });
  const original = structuredClone(cfg);
  pane.toggleInversion();
  assert.equal(cfg.invertScale, true);
  assert.deepEqual(calls, [['restore'], ['price-and-indicators', true], ['volume', true], ['drawings'], ['save']]);
  calls.length = 0; pane.toggleInversion(); assert.equal(cfg.invertScale, false);
  assert.deepEqual(calls, [['restore'], ['price-and-indicators', false], ['volume', false], ['drawings'], ['save']]);
  const { invertScale, ...unchanged } = cfg; assert.deepEqual(unchanged, original);
});

test('inversion keeps separate indicator scales linear while leaving price log mode unchanged', () => {
  const calls = [];
  const pane = Object.assign(Object.create(ChartPane.prototype), {
    cfg: { invertScale: true, log: true },
    chart: { applyOptions: options => calls.push(['chart', options]) },
    indPaneOf: { rsi: 1, ma: 0 },
    indSeries: new Map(['rsi', 'ma'].map(uid => [uid, [{ priceScale: () => ({ applyOptions: options => calls.push([uid, options]) }) }]])),
    drawings: { update() {} },
  });
  pane.applyScaleDirection();
  assert.deepEqual(calls, [['chart', { rightPriceScale: { invertScale: true } }], ['rsi', { mode: 0 }]]);
  assert.equal(pane.cfg.log, true);
});
function setup(t, crypto = true) {
  const originals = Object.fromEntries(['window', 'document', 'WebSocket', 'setTimeout', 'clearTimeout'].map(key => [key, globalThis[key]]));
  const originalCandles = api.candles;
  const timers = new Map(), sockets = [], requests = [], merges = [];
  let time = 0, serial = 0;
  globalThis.window = new EventTarget(); globalThis.document = new EventTarget(); document.hidden = false;
  globalThis.setTimeout = (fn, ms = 0) => { const id = ++serial; timers.set(id, { at: time + ms, fn }); return id; };
  globalThis.clearTimeout = id => timers.delete(id);
  globalThis.WebSocket = class {
    constructor(url) { this.url = url; sockets.push(this); }
    open() { this.onopen?.(); }
    message(value = bar) { this.onmessage?.({ data: JSON.stringify({ k: { t: value.time * 1000, o: value.open, h: value.high, l: value.low, c: value.close, v: value.volume } }) }); }
    close() { this.closed = true; this.onclose?.(); }
  };
  api.candles = async (symbol, tf, limit, options) => { requests.push({ symbol, tf, limit, options }); return { candles: [bar] }; };
  const pane = Object.assign(Object.create(ChartPane.prototype), {
    cfg: { symbol: crypto ? 'BINANCE:BTCUSDT' : 'US:AAPL', tf: '1m', indicators: [{ uid: 'rsi', scaleLabels: { value: false } }] },
    provider: crypto ? 'Binance' : 'Nasdaq', bars: [bar], chart: { remove() {} },
    app: { settings: { bars: 3000 }, setStatus() {}, persist() { throw Error('Live recovery must not rewrite saved configuration'); } },
    merge: values => merges.push(values), load: options => { pane.loaded = options; },
  });
  t.after(() => { pane.liveEvents?.abort(); pane.stopLive(); api.candles = originalCandles; Object.assign(globalThis, originals); });
  const advance = async ms => {
    const until = time + ms;
    for (;;) {
      const due = [...timers].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      time = due[1].at; timers.delete(due[0]); due[1].fn(); await flush();
    }
    time = until; await flush();
  };
  return { pane, timers, sockets, requests, merges, advance };
}

test('healthy crypto streams continue updating without extra polling', async t => {
  const h = setup(t); h.pane.startLive(); h.sockets[0].open();
  for (let i = 0; i < 30; i++) { await h.advance(1000); h.sockets[0].message(); }
  assert.equal(h.sockets.length, 1); assert.equal(h.requests.length, 0); assert.equal(h.merges.length, 30);
});

test('a connection that never opens times out through both hosts and falls back to polling', async t => {
  const h = setup(t); h.pane.startLive(); await h.advance(8000);
  assert.equal(h.sockets[0].closed, true); assert.equal(h.sockets.length, 2);
  await h.advance(8000); assert.equal(h.sockets[1].closed, true); assert.equal(h.requests.length, 1);
  await h.advance(3000); assert.equal(h.requests.length, 2);
});

test('an open connection that stops sending candles cannot leave a chart frozen', async t => {
  const h = setup(t); h.pane.startLive(); h.sockets[0].open();
  await h.advance(19000); h.sockets[0].message(); await h.advance(19000);
  assert.equal(h.sockets.length, 1);
  await h.advance(1000); assert.equal(h.sockets.length, 2); h.sockets[1].open();
  await h.advance(20000); assert.equal(h.requests.length, 1);
});

test('returning to the page reconnects and catches up history without changing saved settings', async t => {
  const h = setup(t), before = structuredClone(h.pane.cfg); h.pane.bindLiveRecovery(); h.pane.startLive(); h.sockets[0].open();
  document.hidden = true; document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(h.sockets[0].closed, true); assert.equal(h.pane.liveToken, null);
  document.hidden = false; document.dispatchEvent(new Event('visibilitychange'));
  window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('pageshow')); window.dispatchEvent(new Event('online'));
  await h.advance(100);
  assert.equal(h.sockets.length, 2); assert.equal(h.requests.length, 1); assert.equal(h.requests[0].limit, 3000);
  assert.deepEqual(h.pane.cfg, before); assert.deepEqual(h.merges, [[bar]]);
});

test('polling charts also catch up full history on wake before regular ten-second checks', async t => {
  const h = setup(t, false); h.pane.bindLiveRecovery(); window.dispatchEvent(new Event('online')); await h.advance(100);
  assert.equal(h.requests.length, 1); assert.equal(h.requests[0].limit, 3000);
  await h.advance(10000); assert.equal(h.requests.length, 2); assert.equal(h.requests[1].limit, 5);
});

test('history catch-up finishes before a new stream can skip over missed candles', async t => {
  const h = setup(t); let resolve;
  api.candles = () => new Promise(r => { resolve = r; });
  h.pane.startLive({ catchUp: true });
  assert.equal(h.sockets.length, 0);
  resolve({ candles: [bar] }); await flush();
  assert.deepEqual(h.merges, [[bar]]); assert.equal(h.sockets.length, 1);
});

test('stopping a pending poll prevents stale data and prevents its loop restarting', async t => {
  const h = setup(t, false); let resolve;
  api.candles = (symbol, tf, limit, options) => { h.requests.push({ options }); return new Promise(r => { resolve = r; }); };
  h.pane.startLive(); assert.equal(h.requests.length, 1);
  h.pane.stopLive(); assert.equal(h.requests[0].options.signal.aborted, true);
  resolve({ candles: [bar] }); await flush(); await h.advance(60000);
  assert.equal(h.merges.length, 0); assert.equal(h.requests.length, 1); assert.equal(h.timers.size, 0);
});

test('a hung polling request times out and the next request succeeds', async t => {
  const h = setup(t);
  h.pane.provider = 'Coinbase'; let firstSignal;
  api.candles = async (symbol, tf, limit, options) => {
    h.requests.push({ symbol });
    if (h.requests.length === 1) return new Promise((resolve, reject) => { firstSignal = options.signal; options.signal.addEventListener('abort', () => reject(Error('Timed out')), { once: true }); });
    return { candles: [bar] };
  };
  h.pane.startLive(); await h.advance(15000); assert.equal(firstSignal.aborted, true);
  await h.advance(3000); assert.equal(h.requests.length, 2); assert.deepEqual(h.merges, [[bar]]);
});

test('replay remains paused in history when the page resumes', async t => {
  const h = setup(t); h.pane.replay = { index: 10 }; h.pane.bindLiveRecovery();
  window.dispatchEvent(new Event('pageshow')); await h.advance(100);
  assert.equal(h.sockets.length, 0); assert.equal(h.requests.length, 0); assert.deepEqual(h.pane.replay, { index: 10 });
});

test('destroyed charts remove recovery listeners and timers', async t => {
  const h = setup(t); h.pane.bindLiveRecovery(); h.pane.startLive(); h.pane.destroy();
  window.dispatchEvent(new Event('online')); document.dispatchEvent(new Event('visibilitychange')); await h.advance(60000);
  assert.equal(h.sockets.length, 1); assert.equal(h.requests.length, 0); assert.equal(h.timers.size, 0);
});

test('late socket messages and late HTTP responses cannot update a different symbol', async t => {
  const h = setup(t); h.pane.startLive(); const old = h.sockets[0]; h.pane.stopLive(); old.message(); assert.equal(h.merges.length, 0);
  h.pane.startLive(); let resolve;
  api.candles = () => new Promise(r => { resolve = r; });
  const pending = h.pane.refreshLive(); h.pane.cfg.symbol = 'BINANCE:ETHUSDT'; resolve({ candles: [bar] }); await pending;
  assert.equal(h.merges.length, 0);
});
