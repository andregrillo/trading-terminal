import { test } from 'node:test';
import assert from 'node:assert/strict';
import def, { mapAverage, pineEma, volumePivot, migrateParams } from '../custom/order-blocks-moving-averages.js';
import { registerIndicator, compute, defaults, indicatorProblems } from '../public/lib/indicators.js';
import { conditionFn, backtest } from '../public/lib/backtest.js';
import { requiredTimeframes, loadIndicatorContext } from '../public/lib/indicator-data.js';
import { IndicatorGraphics } from '../public/js/indicator-graphics.js';

const id = 'custom:order-blocks-moving-averages';
registerIndicator({ ...def, id });
const start = Date.UTC(2025, 0, 6) / 1000;
const bar = (i, high, low, close, volume) => ({ time: start + i * 86400, open: close, high, low, close, volume });
const bull = [bar(0, 12, 10, 11, 1), bar(1, 11, 8, 9, 10), bar(2, 12, 9, 11, 1), bar(3, 12, 8, 10, 1), bar(4, 11, 7, 9, 1)];
const noMA = { sma200_enabled: 'Off', ema50_enabled: 'Off', sma50_enabled: 'Off' };
const run = (bars, params = {}, context = {}) => compute(id, bars, { ...noMA, length: 1, ...params }, context);

test('converted indicator validates and handles empty and short histories', () => {
  assert.deepEqual(indicatorProblems({ ...def, id }), []);
  for (const bars of [[], bull.slice(0, 1)]) {
    const r = run(bars);
    for (const out of def.outputs) assert.equal(r[out.key].length, bars.length);
    assert.deepEqual(r.rectangles, []);
  }
});

test('bullish pivot confirms later and uses half the pivot candle for its zone', () => {
  assert.equal(run(bull.slice(0, 2)).bullFormed[1], 0);
  const r = run(bull.slice(0, 3));
  assert.deepEqual(r.bullFormed, [0, 0, 1]);
  assert.equal(r.bullOb[2], 8);
  assert.equal(r.rectangles[0].time, bull[1].time);
  assert.equal(r.rectangles[0].top, 9.5);
  assert.equal(r.rectangles[0].bottom, 8);
  assert.equal(r.rectangles[0].fill, 'rgba(22,148,0,0.19999999999999996)');
});

test('bearish blocks are the mirrored calculation', () => {
  const bars = bull.slice(0, 3).map((b) => ({ ...b, open: 40 - b.open, high: 40 - b.low, low: 40 - b.high, close: 40 - b.close }));
  const r = run(bars);
  assert.deepEqual(r.bearFormed, [0, 0, 1]);
  assert.equal(r.bearOb[2], 32);
  assert.equal(r.rectangles[0].top, 32);
  assert.equal(r.rectangles[0].bottom, 30.5);
});

test('mitigation uses a strict breach, and Wick and Close behave differently', () => {
  assert.equal(run(bull.slice(0, 4)).rectangles.length, 1, 'touching the low is not a breach');
  assert.equal(run(bull).rectangles.length, 0);
  assert.equal(run(bull).bullMitigated[4], 1);
  const close = run(bull, { mitigation: 'Close' });
  assert.equal(close.rectangles.length, 1);
  assert.equal(close.bullMitigated[4], 0);
});

test('only the requested newest surviving blocks are drawn; one breach clears multiple blocks', () => {
  const bars = [...bull.slice(0, 3), bar(3, 13, 10, 12, 20), bar(4, 14, 11, 13, 1)];
  assert.equal(run(bars).rectangles.length, 2);
  const latest = run(bars, { bull_ext_last: 1 });
  assert.equal(latest.rectangles.length, 1);
  assert.equal(latest.rectangles[0].bottom, 10);
  const breached = run([...bars, bar(5, 15, 7, 10, 1)]);
  assert.equal(breached.rectangles.length, 0);
  assert.equal(breached.bullMitigated[5], 1);
});

test('volume pivots prefer the latest equal high and need both sides of the pivot', () => {
  const bars = [1, 10, 10, 1].map((v, i) => bar(i, 12, 8, 10, v));
  assert.equal(volumePivot(bars, 1, 1), false);
  assert.equal(volumePivot(bars, 2, 1), false);
  assert.equal(volumePivot(bars, 3, 1), true);
});

test('formation and mitigation signals never move into earlier bars', () => {
  const full = run(bull);
  for (let n = 1; n <= bull.length; n++) {
    const prefix = run(bull.slice(0, n));
    for (const key of ['bullFormed', 'bearFormed', 'bullMitigated', 'bearMitigated']) assert.deepEqual(prefix[key], full[key].slice(0, n));
  }
});

test('SMA 200 uses 200 daily closes and Pine EMA starts at the first close', () => {
  const bars = Array.from({ length: 260 }, (_, i) => bar(i, i + 2, i, i + 1, 10));
  const r = compute(id, bars, {}, { timeframe: '1D', timeframes: { '1D': bars } });
  assert.ok(Number.isNaN(r.sma200[198]));
  assert.equal(r.sma200[199], 100.5);
  assert.equal(r.sma200[259], 160.5);
  assert.deepEqual(pineEma([10, 20, 30], 3), [10, 15, 22.5]);
  assert.equal(r.ema50[0], 1);
  assert.equal(r.sma50[49], 25.5);
});

test('historical lookahead matches Pine; confirmed mapping waits for the next period', () => {
  const weekly = [0, 7, 14].map((d) => bar(d, 12, 8, 10, 1));
  const chart = [7, 8, 14, 15].map((d) => bar(d, 12, 8, 10, 1));
  assert.deepEqual(mapAverage(chart, weekly, [10, 20, 30], '1W', { timeframe: '1D' }, true), [20, 20, 30, 30]);
  assert.deepEqual(mapAverage(chart, weekly, [10, 20, 30], '1W', { timeframe: '1D' }, false), [10, 10, 20, 20]);
});

test('daily data with exchange-session timestamps aligns with daily and intraday charts', () => {
  const daily = [0, 1].map((d) => ({ ...bar(d, 12, 8, 10, 1), time: start + d * 86400 + 13.5 * 3600 }));
  assert.deepEqual(mapAverage(daily, daily, [10, 20], '1D', { timeframe: '1D' }, true), [10, 20]);
  const chart = daily.map((b) => ({ ...b, time: b.time + 3600 }));
  assert.deepEqual(mapAverage(chart, daily, [10, 20], '1D', { timeframe: '1h' }, true), [10, 20]);
});

test('daily averages on weekly charts sample the first day for Pine history and the last for confirmed mode', () => {
  const weekly = [bar(0, 12, 8, 10, 1), bar(7, 12, 8, 10, 1)];
  const daily = Array.from({ length: 14 }, (_, i) => bar(i, 12, 8, 10, 1));
  const values = daily.map((_, i) => i + 1);
  assert.deepEqual(mapAverage(weekly, daily, values, '1D', { timeframe: '1W' }, true), [1, 8]);
  assert.deepEqual(mapAverage(weekly, daily, values, '1D', { timeframe: '1W' }, false), [7, 14]);
});

test('alerts and backtests can use hidden signals without creating chart series', () => {
  const indicators = { blocks: { id, params: { ...noMA, length: 1 } } };
  const check = conditionFn(bull, indicators)({ left: 'blocks.bullFormed', op: '>', right: 0 });
  assert.equal(check(1), false);
  assert.equal(check(2), true);
  assert.equal(def.outputs.find((o) => o.key === 'bullFormed').hidden, true);
  const result = backtest(bull, { indicators, entryLong: [{ left: 'blocks.bullFormed', op: '>', right: 0 }], exitLong: [{ left: 'blocks.bullMitigated', op: '>', right: 0 }], entryShort: [], exitShort: [] });
  assert.ok(result.stats);
});

test('replay and strategy rules force confirmed weekly averages, even with Pine display selected', () => {
  const weekly = Array.from({ length: 80 }, (_, i) => bar(i * 7, i + 2, i, i + 1, 1));
  const chart = Array.from({ length: 14 }, (_, i) => bar(70 * 7 + i, 12, 8, 10, 1));
  const context = { timeframe: '1D', timeframes: { '1W': weekly, '1D': chart } };
  const params = { ...noMA, ma50_tf: 'W', ema50_enabled: 'On', ma_mode: 'Match TradingView' };
  const history = compute(id, chart, params, context);
  const replay = compute(id, chart, params, { ...context, causal: true });
  assert.notEqual(history.ema50[0], replay.ema50[0]);
  const cache = {};
  conditionFn(chart, { x: { id, params } }, cache, context)({ left: 'x.ema50', op: '>', right: 0 })(0);
  assert.deepEqual(cache['@x'].ema50, replay.ema50);
  const shorterFuture = { ...context, timeframes: { ...context.timeframes, '1W': weekly.slice(0, 72) }, causal: true };
  assert.deepEqual(compute(id, chart, params, shorterFuture).ema50, replay.ema50);
});

test('context loading fetches real daily/weekly data only when needed, and keeps source failures visible', async () => {
  const ind = { x: { id, params: { ma50_tf: 'W' } } };
  assert.deepEqual(requiredTimeframes(ind), ['1D', '1W']);
  const calls = [];
  const context = await loadIndicatorContext(ind, { symbol: 'BTCUSDT', timeframe: '1h', bars: bull, fetchCandles: async (symbol, tf, limit) => { calls.push({ symbol, tf, limit }); return { candles: bull }; } });
  assert.equal(calls.length, 2);
  assert.equal(context.causal, true);
  assert.equal(context.timeframes['1W'], bull);
  assert.deepEqual(requiredTimeframes({ x: { id, params: noMA } }), []);
  await assert.rejects(loadIndicatorContext(ind, { symbol: 'BTCUSDT', timeframe: '1h', bars: bull, fetchCandles: async () => { throw new Error('data source unavailable'); } }), /data source unavailable/);
});

test('each moving average has its own dropdown with intraday, daily, weekly and monthly choices', () => {
  for (const key of ['sma200_tf', 'ema50_tf', 'sma50_tf']) {
    const input = def.inputs.find((i) => i.key === key);
    assert.equal(input.type, 'select');
    assert.equal(input.default, '1D');
    for (const tf of ['1m', '1h', '4h', '1D', '1W', '1M']) assert.ok(input.options.includes(tf));
  }
  assert.ok(!def.inputs.some((i) => i.key === 'ma50_tf'), 'the old shared dropdown should not remain');
});

test('legacy shared weekly settings migrate without overwriting new independent choices', () => {
  const original = { ma50_tf: 'W', length: 7, ema50_tf: '4h' };
  assert.deepEqual(migrateParams(original), { length: 7, sma200_tf: '1D', ema50_tf: '4h', sma50_tf: '1W' });
  assert.deepEqual(original, { ma50_tf: 'W', length: 7, ema50_tf: '4h' });
  assert.deepEqual(requiredTimeframes({ x: { id, params: { ma50_tf: 'W' } } }), ['1D', '1W']);
});

test('independent source candles drive only their own moving averages and price labels', () => {
  const history = (seconds, close) => Array.from({ length: 260 }, (_, i) => ({ ...bar(0, close + 1, close - 1, close, 1), time: start + (i - 259) * seconds }));
  const chart = Array.from({ length: 8 }, (_, i) => ({ ...bar(0, 12, 8, 10, 1), time: start + i * 3600 }));
  const context = { timeframe: '1h', timeframes: { '1D': history(86400, 100), '1W': history(604800, 200), '4h': history(14400, 300) } };
  const params = { sma200_tf: '1W', ema50_tf: '4h', sma50_tf: '1D' };
  const r = compute(id, chart, params, context);
  assert.equal(r.sma200.at(-1), 200);
  assert.equal(r.ema50.at(-1), 300);
  assert.equal(r.sma50.at(-1), 100);
  assert.deepEqual(r.priceLabels.map((l) => l.text), ['SMA 200 W', 'EMA 50 4h', 'SMA 50 D']);
  const changed = compute(id, chart, { ...params, ema50_tf: '1D' }, context);
  assert.equal(changed.ema50.at(-1), 100);
  assert.deepEqual(changed.sma200, r.sma200);
  assert.deepEqual(changed.sma50, r.sma50);
  assert.deepEqual(changed.bullFormed, r.bullFormed);
});

test('source loading fetches all three selected timeframes, deduplicates and ignores disabled averages', async () => {
  const params = { sma200_tf: '1W', ema50_tf: '4h', sma50_tf: '1D' };
  const calls = [];
  await loadIndicatorContext({ x: { id, params } }, { symbol: 'BTCUSDT', timeframe: '1h', bars: bull, fetchCandles: async (_, tf) => { calls.push(tf); return { candles: [] }; } });
  assert.deepEqual(calls.sort(), ['1D', '1W', '4h']);
  assert.deepEqual(requiredTimeframes({ x: { id, params: { ...params, ema50_enabled: 'Off' } } }), ['1W', '1D']);
  assert.deepEqual(requiredTimeframes({ x: { id, params: { sma200_tf: '4h', ema50_tf: '4h', sma50_tf: '4h' } } }), ['4h']);
});

test('all three moving averages have independent thickness without changing values or order blocks', () => {
  const bars = Array.from({ length: 260 }, (_, i) => bar(i, i + 2, i, i + 1, 10));
  const context = { timeframe: '1D', timeframes: { '1D': bars } };
  const before = compute(id, bars, {}, context), after = compute(id, bars, { sma200_width: '4', ema50_width: '1', sma50_width: '3' }, context);
  assert.deepEqual(['sma200', 'ema50', 'sma50'].map(key => before.plotStyles[key].lineWidth), [2, 2, 2]);
  assert.deepEqual(['sma200', 'ema50', 'sma50'].map(key => after.plotStyles[key].lineWidth), [4, 1, 3]);
  for (const key of ['sma200', 'ema50', 'sma50', 'rectangles', 'bullFormed', 'bearFormed', 'priceLabels']) assert.deepEqual(after[key], before[key]);
  assert.equal(after.plotStyles.sma200.lineStyle, before.plotStyles.sma200.lineStyle);
  assert.throws(() => compute(id, bars, { sma50_width: '0' }, context), /thickness/);
});

function paintLabels(x, barCount = 100) {
  const calls = [], indices = [];
  const pane = { shown: Array(barCount), chart: { timeScale: () => ({ logicalToCoordinate: index => { indices.push(index); return x; } }) }, formatPrice: String };
  const result = { priceLabels: [
    { key: 'sma200', price: 100, text: 'SMA 200 D' },
    { key: 'ema50', price: 120, text: 'EMA 50 W' },
    { key: 'sma50', price: 140, text: 'SMA 50 D' },
  ] };
  const graphics = new IndicatorGraphics(pane, result, {});
  graphics.attached({ series: { priceToCoordinate: price => price } });
  const ctx = { save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, measureText: () => ({ width: 100 }), fillRect: (...args) => calls.push(args), fillText() {} };
  graphics.draw(ctx, { width: 500, height: 300 }, 'top');
  return { calls, indices };
}

test('moving-average labels move with the latest candle instead of clamping to the right edge', () => {
  const before = paintLabels(350), after = paintLabels(450);
  assert.deepEqual(before.calls.map(c => c[0]), [350, 350, 350]);
  assert.deepEqual(after.calls.map(c => c[0]), [450, 450, 450]);
});

test('scrolling into history moves all three labels off the right edge', () => {
  assert.deepEqual(paintLabels(650).calls, []);
  assert.deepEqual(paintLabels(500).calls, []);
});

test('labels clip naturally at the left edge instead of sticking there', () => {
  assert.deepEqual(paintLabels(-50).calls.map(c => c[0]), [-50, -50, -50]);
  assert.deepEqual(paintLabels(-200).calls, []);
});

test('missing chart coordinates do not produce screen-pinned fallback labels', () => {
  assert.deepEqual(paintLabels(null).calls, []);
  assert.deepEqual(paintLabels(NaN).calls, []);
});

test('label anchors retain the original 17-bar offset, including the replay slice', () => {
  assert.deepEqual(paintLabels(100).indices, [116]);
  assert.deepEqual(paintLabels(100, 20).indices, [36]);
});
