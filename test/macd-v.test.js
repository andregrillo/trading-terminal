import { test } from 'node:test';
import assert from 'node:assert/strict';
import def, { pineEma, histogramColors } from '../custom/macd-v-volatility-normalisation.js';
import { compute, registerIndicator, defaults, indicatorProblems } from '../public/lib/indicators.js';
import { conditionFn } from '../public/lib/backtest.js';
import { fillInterval, IndicatorFills } from '../public/js/indicator-fills.js';

const id = 'custom:macd-v-volatility-normalisation';
registerIndicator({ ...def, id });
const barsOf = (closes) => closes.map((close, i) => ({ time: 1704067200 + i * 86400, open: close, high: close + 1, low: close - 1, close, volume: 100 + i }));
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} differs from ${expected}`);
const params = { fast_len: 2, slow_len: 3, signal_len: 2, atr_len: 3 };

test('MACD-V validates, retains its title and starts in a separate panel', () => {
  assert.deepEqual(indicatorProblems(def), []);
  assert.equal(def.name, 'MACD-V Volatility Normalisation');
  assert.equal(def.overlay, false);
  assert.deepEqual(def.legendInputs.map((key) => defaults(id)[key]), [12, 26, 9, 26]);
  for (const bars of [[], barsOf([10])]) {
    const r = compute(id, bars);
    for (const output of def.outputs) assert.equal(r[output.key].length, bars.length);
  }
});

test('MACD-V and signal match a hand-calculated EMA / Wilder ATR example', () => {
  // TR: 2,3,2,5,2. ATR(3): na,na,7/3,29/9,76/27.
  // At bar 2 EMA(2)=100/9 and EMA(3)=11, hence MACD-V=100/21.
  const r = compute(id, barsOf([10, 12, 11, 15, 14]), params);
  assert.ok(Number.isNaN(r.macd[0]) && Number.isNaN(r.macd[1]));
  near(r.macd[2], 100 / 21);
  near(r.macd[3], 1900 / 87);
  near(r.macd[4], 1625 / 114);
  near(r.signal[2], 100 / 21);
  near(r.signal[3], 2 / 3 * (1900 / 87) + 1 / 3 * (100 / 21));
  near(r.hist[2], 0);
  near(r.hist[3], r.macd[3] - r.signal[3]);
});

test('Pine EMA seeds at the first valid value and skips missing samples', () => {
  const r = pineEma([NaN, 10, NaN, 20, 30], 3);
  assert.ok(Number.isNaN(r[0]));
  assert.deepEqual(r.slice(1), [10, 10, 15, 22.5]);
});

test('the four histogram states handle rising, falling, equal values, and zero exactly as Pine', () => {
  const p = defaults(id);
  const colors = histogramColors([1, 2, 2, 1, 0, -1, -2, -2, -1, 0], p);
  assert.deepEqual(colors, ['#b2dfdb', '#26a69a', '#b2dfdb', '#b2dfdb', '#b2dfdb', '#ff5252', '#ff5252', '#ff5252', '#ffcdd2', '#26a69a']);
  assert.deepEqual(histogramColors([1, 2], { ...p, col_grow_above: '#112233' }), ['#b2dfdb', '#112233']);
});

test('ATR warm-up and zero-volatility data produce blanks instead of infinities', () => {
  const bars = barsOf(Array(40).fill(10)).map((b) => ({ ...b, high: 10, low: 10 }));
  const r = compute(id, bars);
  for (const key of ['macd', 'signal', 'hist']) assert.ok(r[key].every(Number.isNaN));
  const regular = compute(id, barsOf(Array.from({ length: 40 }, (_, i) => i + 10)));
  assert.ok(regular.macd.slice(0, 25).every(Number.isNaN));
  assert.ok(Number.isFinite(regular.macd[25]));
  assert.equal(regular.hist[25], 0);
});

test('changing source changes the EMA input and retains the original price ATR', () => {
  const bars = barsOf([10, 12, 11, 15, 14]);
  const regular = compute(id, bars, { ...params, source: 'close' });
  const volume = compute(id, bars, { ...params, source: 'volume' });
  // EMA(2) of 100,101,102 is 914/9; EMA(3) is 405/4.
  near(volume.macd[2], (914 / 9 - 405 / 4) / (7 / 3) * 100);
  assert.notEqual(volume.macd[3], regular.macd[3]);
  const synthetic = bars.map((b) => ({ ...b, open: b.volume, high: b.volume, low: b.volume, close: b.volume }));
  const fromIndicator = compute(id, synthetic, params, { priceBars: bars });
  assert.deepEqual(fromIndicator.macd, volume.macd);
});

test('bounds and seven fills retain their colours and follow edited thresholds', () => {
  const r = compute(id, barsOf([10, 12, 11]), { overbought_bounds: 200, oversold_bounds: -200, rally_bounds: 75, rebound_bounds: -75 });
  assert.deepEqual(r.overbought, [200, 200, 200]);
  assert.deepEqual(r.oversold, [-200, -200, -200]);
  assert.deepEqual(r.rally, [75, 75, 75]);
  assert.deepEqual(r.rebound, [-75, -75, -75]);
  assert.equal(r.fills.length, 7);
  assert.deepEqual(r.fills.slice(0, 3).map((f) => f.color), ['rgba(255,235,59,0.35)', 'rgba(76,175,80,0.35)', 'rgba(255,82,82,0.35)']);
  assert.equal(r.fills[5].color, 'rgba(54,58,69,0.7)', 'Pine v5 color.black is not #000000');
});

test('the calculation is causal and usable by alert/strategy conditions', () => {
  const bars = barsOf(Array.from({ length: 80 }, (_, i) => 100 + 10 * Math.sin(i / 4)));
  const full = compute(id, bars, params);
  for (const n of [5, 20, 40, 79]) {
    const prefix = compute(id, bars.slice(0, n), params);
    for (const key of ['macd', 'signal', 'hist']) assert.deepEqual(prefix[key], full[key].slice(0, n));
  }
  const check = conditionFn(bars, { v: { id, params } })({ left: 'v.macd', op: '>', right: 'v.signal' });
  for (let i = 2; i < bars.length; i++) assert.equal(check(i), full.hist[i] > 0);
});

test('periods of one work, and invalid lengths fail with a clear message', () => {
  const r = compute(id, barsOf([10, 12, 11]), { fast_len: 1, slow_len: 1, signal_len: 1, atr_len: 1 });
  assert.deepEqual(r.macd, [0, 0, 0]);
  assert.deepEqual(r.hist, [0, 0, 0]);
  assert.throws(() => compute(id, [], { signal_len: 0 }), /signal_len must be/);
  assert.throws(() => compute(id, [], { fast_len: 2.5 }), /fast_len must be/);
});

test('conditional fills clip at actual threshold crossings and skip missing data', () => {
  assert.deepEqual(fillInterval(0, 50, 100, 50, 'above'), [0.5, 1]);
  assert.deepEqual(fillInterval(100, 50, 0, 50, 'above'), [0, 0.5]);
  assert.deepEqual(fillInterval(-100, -50, 0, -50, 'below'), [0, 0.5]);
  assert.equal(fillInterval(0, 50, 25, 50, 'above'), null);
  assert.equal(fillInterval(50, 50, 50, 50, 'above'), null);
  assert.deepEqual(fillInterval(150, 50, 150, 50), [0, 1]);
  assert.equal(fillInterval(NaN, 50, 100, 50, 'above'), null);
});

test('fill rendering uses its own indicator scale, clips to the panel, and draws below plots', () => {
  const points = [], colors = [];
  const ctx = { save() {}, restore() {}, beginPath() {}, rect(...args) { assert.deepEqual(args, [0, 0, 300, 100]); }, clip() {}, moveTo(x, y) { points.push([x, y]); }, lineTo(x, y) { points.push([x, y]); }, closePath() {}, fill() { colors.push(this.fillStyle); } };
  const pane = { chart: { timeScale: () => ({ getVisibleLogicalRange: () => ({ from: 0, to: 2 }), timeToCoordinate: (t) => t * 10 }) } };
  const primitive = new IndicatorFills(pane, { a: [10, 20, 30], b: [0, 0, 0], fills: [{ from: 'a', to: 'b', color: '#abcdef' }] }, (i) => i);
  primitive.attached({ series: { priceToCoordinate: (value) => 100 - value } });
  assert.equal(primitive.paneViews()[0].zOrder(), 'bottom');
  primitive.draw(ctx, { width: 300, height: 100 });
  assert.ok(points.some(([x, y]) => x === 20 && y === 70));
  assert.deepEqual(colors, ['#abcdef']);
  primitive.detached();
  primitive.draw(ctx, { width: 300, height: 100 });
  assert.equal(colors.length, 1);
});
