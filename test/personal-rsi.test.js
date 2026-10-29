import { test } from 'node:test';
import assert from 'node:assert/strict';
import def, { findDivergences, rsiPivot } from '../custom/rsi-tradingview-style.js';
import { registerIndicator, compute, indicatorProblems } from '../public/lib/indicators.js';
import { conditionFn } from '../public/lib/backtest.js';
import { fillPaint } from '../public/js/indicator-fills.js';
import { IndicatorAnnotations } from '../public/js/indicator-annotations.js';

const id = 'custom:rsi-tradingview-style';
registerIndicator({ ...def, id });
const start = 1704067200;
const barsOf = (values) => values.map((close, i) => ({ time: start + i * 86400, open: close, high: close + 1, low: close - 1, close, volume: 1 }));
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);
const simple = barsOf([1, 2, 1, 3, 2]);

test('personal RSI validates and preserves the supplied defaults and two-decimal format', () => {
  assert.deepEqual(indicatorProblems(def), []);
  assert.equal(def.overlay, false);
  assert.equal(def.precision, 2);
  for (const bars of [[], simple.slice(0, 1)]) {
    const r = compute(id, bars);
    for (const output of def.outputs) assert.equal(r[output.key].length, bars.length);
    assert.equal(r.paneAnnotations.labels.length, 0);
  }
});

test('Wilder RSI matches hand-calculated changes and the zero-up/down cases', () => {
  const r = compute(id, simple, { length: 2 });
  assert.ok(r.value.slice(0, 2).every(Number.isNaN));
  near(r.value[2], 50); near(r.value[3], 250 / 3); near(r.value[4], 50);
  assert.equal(compute(id, barsOf([1, 2, 3]), { length: 2 }).value[2], 100);
  assert.equal(compute(id, barsOf([3, 2, 1]), { length: 2 }).value[2], 0);
  assert.equal(compute(id, barsOf([1, 1, 1]), { length: 2 }).value[2], 100, 'down == 0 is evaluated first in the supplied Pine');
});

test('all smoothing choices follow the expected formulas', () => {
  const run = (maType) => compute(id, simple, { length: 2, maLength: 2, maType });
  near(run('SMA').ma[3], 200 / 3);
  near(run('SMA + Bollinger Bands').ma[3], 200 / 3);
  near(run('EMA').ma[2], 50); near(run('EMA').ma[3], 650 / 9);
  near(run('SMMA (RMA)').ma[3], 200 / 3);
  near(run('WMA').ma[3], 650 / 9);
  const volumeBars = simple.map((b, i) => ({ ...b, volume: i === 3 ? 3 : 1 }));
  near(compute(id, volumeBars, { length: 2, maLength: 2, maType: 'VWMA' }).ma[3], 75);
  assert.ok(run('None').ma.every(Number.isNaN));
});

test('Bollinger Bands use population deviation and appear only in the selected mode', () => {
  const r = compute(id, simple, { length: 2, maLength: 2, maType: 'SMA + Bollinger Bands', bbMult: 2 });
  near(r.bbUpper[3], 100); near(r.bbLower[3], 100 / 3);
  assert.equal(r.fills.length, 4);
  const normal = compute(id, simple, { length: 2, maType: 'SMA' });
  assert.ok(normal.bbUpper.every(Number.isNaN)); assert.ok(normal.bbLower.every(Number.isNaN));
  assert.equal(normal.fills.length, 3);
});

test('source selection affects RSI without changing the price candles used for divergences', () => {
  const bars = simple.map((b, i) => ({ ...b, open: i + 10 }));
  assert.equal(compute(id, bars, { source: 'open', length: 2 }).value[2], 100);
  assert.equal(compute(id, bars, { source: 'close', length: 2 }).value[2], 50);
});

test('the RSI mask and green/red gradient endpoints match the supplied fill calls', () => {
  const r = compute(id, simple);
  assert.deepEqual(r.upper, [70, 70, 70, 70, 70]);
  assert.deepEqual(r.middle, [50, 50, 50, 50, 50]);
  assert.deepEqual(r.lower, [30, 30, 30, 30, 30]);
  assert.equal(r.fills[0].color, 'rgba(126,87,194,0.1)');
  const captures = [];
  const ctx = { createLinearGradient(...coordinates) { const item = { coordinates, stops: [], addColorStop(...stop) { this.stops.push(stop); } }; captures.push(item); return item; } };
  const series = { priceToCoordinate: (value) => 100 - value };
  fillPaint(r.fills[1], series, ctx); fillPaint(r.fills[2], series, ctx);
  assert.deepEqual(captures[0].coordinates, [0, 0, 0, 30]);
  assert.deepEqual(captures[0].stops, [[0, 'rgba(76,175,80,1)'], [1, 'rgba(76,175,80,0)']]);
  assert.deepEqual(captures[1].coordinates, [0, 70, 0, 100]);
  assert.deepEqual(captures[1].stops, [[0, 'rgba(242,54,69,0)'], [1, 'rgba(242,54,69,1)']]);
  assert.equal(r.fills[1].from, 'value'); assert.equal(r.fills[1].to, 'middle');
  assert.equal(fillPaint({ color: '#123456' }, series, ctx), '#123456');
});

function divergenceFixture({ high = false, distance = 10 } = {}) {
  const values = new Array(10 + distance + 6).fill(50);
  values[10] = high ? 80 : 20; values[10 + distance] = high ? 70 : 30;
  const bars = barsOf(values.map(() => 100));
  if (high) { bars[10].high = 110; bars[10 + distance].high = 120; }
  else { bars[10].low = 90; bars[10 + distance].low = 80; }
  return { values, bars };
}

test('bullish divergence labels the pivot and signals only after five confirming bars', () => {
  const { values, bars } = divergenceFixture();
  const r = findDivergences(values, bars);
  assert.equal(r.bullish.reduce((a, b) => a + b, 0), 1);
  assert.equal(r.bullish[25], 1); assert.equal(r.bullish[20], 0);
  assert.equal(r.labels[0].time, bars[20].time); assert.equal(r.labels[0].price, 30);
  assert.equal(r.labels[0].text, 'Bull');
  assert.equal(r.segments[0].fromTime, bars[10].time);
  assert.equal(findDivergences(values.slice(0, 25), bars.slice(0, 25)).labels.length, 0);
});

test('bearish divergence uses higher price highs and lower RSI highs', () => {
  const { values, bars } = divergenceFixture({ high: true });
  const r = findDivergences(values, bars);
  assert.equal(r.bearish[25], 1); assert.equal(r.labels[0].text, 'Bear');
  assert.equal(r.labels[0].color, '#f23645'); assert.equal(r.labels[0].price, 70);
  bars[20].high = 100;
  assert.equal(findDivergences(values, bars).bearish[25], 0);
});

test('divergence range uses barssince(pivotFound[1]), including the original off-by-one', () => {
  for (const [distance, expected] of [[6, 1], [61, 1], [62, 0]]) {
    const { values, bars } = divergenceFixture({ distance });
    assert.equal(findDivergences(values, bars).bullish[10 + distance + 5], expected, `distance ${distance}`);
  }
});

test('equal pivots prefer the later value and missing RSI windows do not form pivots', () => {
  assert.equal(rsiPivot([50, 20, 20, 50], 2, 1, 1), false);
  assert.equal(rsiPivot([50, 20, 20, 50], 3, 1, 1), true);
  assert.equal(rsiPivot([NaN, 20, 50], 2, 1, 1), false);
});

test('RSI values and optional divergence alerts are causal and work in rules', () => {
  const bars = barsOf(Array.from({ length: 180 }, (_, i) => 100 + Math.sin(i / 6) * 10 + Math.sin(i / 19)));
  const full = compute(id, bars, { calculateDivergence: 'On' });
  for (const n of [30, 60, 120]) {
    const prefix = compute(id, bars.slice(0, n), { calculateDivergence: 'On' });
    for (const key of ['value', 'ma', 'bullish', 'bearish']) assert.deepEqual(prefix[key], full[key].slice(0, n));
    assert.ok(prefix.paneAnnotations.labels.every((label) => label.time <= bars[n - 6].time));
  }
  const disabled = compute(id, bars);
  assert.ok(disabled.bullish.every((v) => v === 0) && disabled.bearish.every((v) => v === 0));
  assert.deepEqual(disabled.paneAnnotations, { segments: [], labels: [] });
  const testRule = conditionFn(bars, { r: { id } })({ left: 'r.value', op: '>', right: 70 });
  assert.equal(testRule(100), disabled.value[100] > 70);
});

test('annotation drawing uses the oscillator pane scale and clips labels to that panel', () => {
  const points = [], texts = [];
  const ctx = { save() {}, restore() {}, beginPath() {}, rect(...r) { assert.deepEqual(r, [0, 0, 300, 100]); }, clip() {}, moveTo(x, y) { points.push([x, y]); }, lineTo(x, y) { points.push([x, y]); }, stroke() {}, fill() {}, closePath() {}, measureText: () => ({ width: 20 }), fillRect() {}, fillText(text) { texts.push(text); } };
  const annotations = { segments: [{ fromTime: 1, fromPrice: 20, toTime: 2, toPrice: 30, color: '#4caf50' }], labels: [{ time: 2, price: 30, text: 'Bull', color: '#4caf50', position: 'below' }] };
  const layer = new IndicatorAnnotations({ timeToX: (time) => time * 10 }, annotations);
  layer.attached({ series: { priceToCoordinate: (price) => 100 - price } });
  assert.equal(layer.paneViews()[0].zOrder(), 'top');
  layer.draw(ctx, { width: 300, height: 100 });
  assert.deepEqual(points.slice(0, 2), [[10, 80], [20, 70]]);
  assert.deepEqual(texts, ['Bull']);
  layer.detached(); layer.draw(ctx, { width: 300, height: 100 });
  assert.equal(texts.length, 1);
});

test('bad inputs are refused instead of drawing invalid values', () => {
  assert.throws(() => compute(id, [], { length: 0 }), /length must be/);
  assert.throws(() => compute(id, [], { maLength: 0 }), /maLength must be/);
  assert.throws(() => compute(id, [], { bbMult: 0 }), /BB StdDev/);
});
