import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChartViewport, savedTimeView, restoredTimeView } from '../public/js/chart-viewport.js';

function fixture(t, cfg = {}, range = { from: 20.25, to: 60.75 }, length = 100, start = 0) {
  if (!globalThis.localStorage) {
    const memory = new Map(); globalThis.localStorage = { getItem: key => memory.get(key) || null, setItem: (key, value) => memory.set(key, value) };
    t.after(() => { delete globalThis.localStorage; });
  }
  let current = { ...range }, price = { from: 60000, to: 90000 }, saved = 0;
  const options = { mode: 0, autoScale: false, invertScale: false, scaleMargins: { top: .1, bottom: .2 } };
  const heights = [1, .4], priceScale = { options: () => options, getVisibleRange: () => price, applyOptions: value => Object.assign(options, value), setVisibleRange: value => { price = value; } };
  const pane = {
    cfg: { symbol: 'BINANCE:BTCUSDT', tf: '1D', type: 'candles', ...cfg },
    app: { mobileUI: { enabled: false }, persist: () => saved++ },
    shown: Array.from({ length }, (_, index) => ({ time: 1000 + (index + start) * 60 })),
    logicalOf: time => (time - 1000) / 60 - start,
    chart: {
      timeScale: () => ({ getVisibleLogicalRange: () => current, setVisibleLogicalRange: value => { current = value; } }),
      panes: () => heights.map((height, index) => ({ getStretchFactor: () => height, setStretchFactor: value => { heights[index] = value; } })),
    },
    main: { priceScale: () => priceScale }, indicatorPaneGroups: [{ root: 'rsi', index: 1 }],
    captureIndicatorScaleViews: () => new Map([['rsi', { options: { mode: 0, autoScale: false, scaleMargins: { top: .1, bottom: .1 } }, range: { from: 25, to: 75 } }]]),
    restoreIndicatorScaleViews: value => { pane.restoredIndicators = value; }, legends: { scheduleLayout() {} },
  };
  const controller = Object.assign(Object.create(ChartViewport.prototype), { pane, slot: 0, ready: true, dirty: true }); controller.loadedKey = controller.key;
  return { pane, controller, range: () => current, heights, options, saved: () => saved };
}

test('historical views anchor to candle timestamps when the loaded history window changes', t => {
  const old = fixture(t), view = savedTimeView(old.pane);
  const shifted = fixture(t, {}, undefined, 100, 10);
  assert.deepEqual(restoredTimeView(shifted.pane, view), { from: 10.25, to: 50.75 });
});

test('latest views preserve zoom and right spacing as new candles arrive while away', t => {
  const old = fixture(t, {}, { from: 70, to: 125 });
  const next = fixture(t, {}, undefined, 103);
  assert.deepEqual(restoredTimeView(next.pane, savedTimeView(old.pane)), { from: 73, to: 128 });
});

test('views save with chart configuration and restore pan, zoom, scales and pane sizes after reloading', t => {
  const first = fixture(t); assert.equal(first.controller.save(), true);
  assert.equal(first.saved(), 1); assert.equal(first.controller.save(), false, 'unchanged views do not keep writing state');
  const cfg = JSON.parse(JSON.stringify(first.pane.cfg)); localStorage.setItem(first.controller.cacheKey, '{}');
  const reloaded = fixture(t, cfg, { from: 0, to: 160 }); reloaded.heights[1] = .2; reloaded.controller.restore();
  assert.deepEqual(reloaded.range(), first.range()); assert.deepEqual(reloaded.heights, [1, .4]);
  assert.deepEqual(reloaded.pane.restoredIndicators.get('rsi').range, { from: 25, to: 75 });
  assert.equal(reloaded.options.autoScale, false);
});

test('immediate reload uses the browser cache and promotes the view into server configuration', t => {
  const first = fixture(t); first.controller.save();
  const fresh = fixture(t, {}, { from: 0, to: 160 }); fresh.controller.restore();
  assert.deepEqual(fresh.range(), first.range()); assert.ok(fresh.pane.cfg.chartViews[fresh.controller.key]);
  assert.equal(fresh.saved(), 1, 'a cached view is eventually saved to disk even without another gesture');
});

test('phone, symbol and timeframe views do not replace the desktop chart view', t => {
  const desktop = fixture(t); desktop.controller.save();
  const cfg = JSON.parse(JSON.stringify(desktop.pane.cfg));
  const phone = fixture(t, cfg, { from: 45, to: 65 }); phone.pane.app.mobileUI.enabled = true; phone.controller.loadedKey = phone.controller.key; phone.controller.save();
  const other = fixture(t, { ...phone.pane.cfg, tf: '4h' }, { from: 10, to: 25 }); other.controller.save();
  const back = fixture(t, { ...other.pane.cfg, tf: '1D' }, { from: 0, to: 160 }); back.controller.restore();
  assert.deepEqual(back.range(), desktop.range());
  back.pane.app.mobileUI.enabled = true; back.controller.restore(); assert.deepEqual(back.range(), phone.range());
});

test('replay, temporary expansion and in-flight symbol changes cannot overwrite a normal saved view', t => {
  const f = fixture(t); f.controller.save(); const original = JSON.stringify(f.pane.cfg.chartViews);
  f.controller.dirty = true;
  f.pane.replay = {}; assert.equal(f.controller.save(), false); f.pane.replay = null;
  f.pane.paneFocus = 'rsi'; assert.equal(f.controller.save(), false); f.pane.paneFocus = null;
  f.pane.cfg.symbol = 'BINANCE:ETHUSDT'; assert.equal(f.controller.save(), false);
  assert.equal(JSON.stringify(f.pane.cfg.chartViews), original);
});

test('automatic resizing and refreshes cannot replace a saved user view', t => {
  const f = fixture(t); f.controller.save(); const before = JSON.stringify(f.pane.cfg.chartViews);
  f.pane.chart.timeScale().setVisibleLogicalRange({ from: 50, to: 60 });
  assert.equal(f.controller.save(), false);
  assert.equal(JSON.stringify(f.pane.cfg.chartViews), before);
});

test('legacy or mismatched manual price ranges cannot carry the scale of a different asset', t => {
  const f = fixture(t); f.controller.save();
  const view = f.pane.cfg.chartViews[f.controller.key];
  delete view.price.symbol; delete view.price.tf;
  view.price.range = { from: .001, to: .005 };
  localStorage.setItem(f.controller.cacheKey, '{}');
  f.options.autoScale = true; f.controller.restore();
  assert.equal(f.options.autoScale, true, 'an unverifiable old manual range must not turn fitting off');
  view.price.symbol = 'BINANCE:VETUSDT'; view.price.tf = '1D';
  f.controller.restore(); assert.equal(f.options.autoScale, true);
  view.price.symbol = f.pane.cfg.symbol; f.controller.restore(); assert.equal(f.options.autoScale, false, 'a verified view for this asset may restore its manual range');
});

test('invalid saved time ranges are ignored and old per-chart views are bounded', t => {
  const f = fixture(t);
  for (const view of [null, {}, { width: -1 }, { width: Infinity }, { width: 10, anchor: NaN }]) assert.equal(restoredTimeView(f.pane, view), null);
  const views = Object.fromEntries(Array.from({ length: 60 }, (_, index) => [`view${index}`, { updatedAt: index }]));
  const kept = f.controller.trim(views); assert.equal(Object.keys(kept).length, 40); assert.ok(kept.view59); assert.equal(kept.view0, undefined);
});
