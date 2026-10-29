import { test } from 'node:test';
import assert from 'node:assert/strict';
import def, { pineSma } from '../custom/slow-stochastic.js';
import { registerIndicator, compute, defaults, indicatorProblems } from '../public/lib/indicators.js';
import { conditionFn } from '../public/lib/backtest.js';

const id = 'custom:slow-stochastic';
registerIndicator({ ...def, id });
const barsOf = (values) => values.map((close, i) => ({ time: 1704067200 + i * 86400, open: close, high: 10, low: 0, close, volume: 100 }));
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);

test('Slow Stochastic validates with original 14/3 defaults and its own panel', () => {
  assert.deepEqual(indicatorProblems(def), []);
  assert.equal(def.overlay, false); assert.equal(def.precision, 2);
  assert.deepEqual(defaults(id), { smoothK: 14, smoothD: 3, k_width: '2', d_width: '1' });
  for (const bars of [[], barsOf([5])]) {
    const r = compute(id, bars);
    for (const out of def.outputs) assert.equal(r[out.key].length, bars.length);
  }
});

test('fixed three-bar K smoothing and D smoothing match a hand-calculated series', () => {
  const r = compute(id, barsOf([0, 3, 6, 9, 6, 3, 0]));
  assert.deepEqual(r.raw, [0, 30, 60, 90, 60, 30, 0]);
  assert.ok(r.k.slice(0, 2).every(Number.isNaN));
  assert.deepEqual(r.k.slice(2), [30, 60, 70, 60, 30]);
  assert.ok(r.d.slice(0, 4).every(Number.isNaN));
  near(r.d[4], 160 / 3); near(r.d[5], 190 / 3); near(r.d[6], 160 / 3);
});

test('lookback excludes old extremes; changing D leaves K unchanged', () => {
  const bars = barsOf([2, 4, 3, 7, 6]).map((b) => ({ ...b, high: b.close + 1, low: b.close - 1 }));
  const r = compute(id, bars, { smoothK: 2 });
  near(r.raw[2], 100 / 3); near(r.raw[3], 250 / 3); near(r.raw[4], 100 / 3);
  near(r.k[2], 475 / 9); near(r.k[3], 575 / 9); near(r.k[4], 50);
  const d1 = compute(id, bars, { smoothK: 2, smoothD: 1 });
  assert.deepEqual(d1.k, r.k); assert.deepEqual(d1.d, r.k);
  const k1 = compute(id, bars, { smoothK: 1 });
  assert.deepEqual(k1.k.slice(2), [50, 50, 50]);
});

test('Pine SMA skips missing raw values and zero ranges never generate infinity', () => {
  const sma = pineSma([1, NaN, 2, NaN, 3, NaN, 4], 3);
  assert.ok(sma.slice(0, 4).every(Number.isNaN));
  assert.deepEqual(sma.slice(4), [2, 2, 3]);
  const flat = barsOf(Array(40).fill(5)).map((b) => ({ ...b, high: 5, low: 5 }));
  const r = compute(id, flat);
  for (const key of ['raw', 'k', 'd']) assert.ok(r[key].every(Number.isNaN));
});

test('the requested gradients follow K at 80/20 and preserve the faint purple background', () => {
  const r = compute(id, barsOf([1, 2, 3, 4, 5]));
  assert.ok(r.upper.every((v) => v === 80) && r.lower.every((v) => v === 20));
  assert.ok(r.middle.every((v) => v === 50));
  assert.equal(def.outputs.find((o) => o.key === 'middle').hidden, true);
  assert.equal(r.fills[0].color, 'rgba(156,39,176,0.05)');
  assert.equal(r.fills[1].from, 'k'); assert.equal(r.fills[1].to, 'middle');
  assert.deepEqual(r.fills[1].gradient, { topValue: 100, bottomValue: 80, topColor: 'rgba(76,175,80,1)', bottomColor: 'rgba(76,175,80,0)' });
  assert.deepEqual(r.fills[2].gradient, { topValue: 20, bottomValue: 0, topColor: 'rgba(242,54,69,0)', bottomColor: 'rgba(242,54,69,1)' });
});

test('ordinary history agrees with the existing 14/3/3 stochastic after warm-up', () => {
  const bars = barsOf(Array.from({ length: 100 }, (_, i) => 5 + Math.sin(i / 5) * 4)).map((b) => ({ ...b, high: b.close + 0.5, low: b.close - 0.5 }));
  const r = compute(id, bars), builtin = compute('stoch', bars, { k: 14, smoothK: 3, d: 3 });
  for (let i = 17; i < bars.length; i++) { near(r.k[i], builtin.k[i]); near(r.d[i], builtin.d[i]); }
});

test('no future candles are used and both lines are available in alert rules', () => {
  const bars = barsOf(Array.from({ length: 80 }, (_, i) => 5 + Math.sin(i / 4) * 4));
  const full = compute(id, bars);
  for (const n of [5, 20, 40, 79]) {
    const prefix = compute(id, bars.slice(0, n));
    for (const key of ['k', 'd']) assert.deepEqual(prefix[key], full[key].slice(0, n));
  }
  const check = conditionFn(bars, { s: { id } })({ left: 's.k', op: '>', right: 's.d' });
  for (let i = 4; i < bars.length; i++) assert.equal(check(i), full.k[i] > full.d[i]);
});

test('K remains readable in both themes and invalid periods fail clearly', () => {
  const k = def.outputs.find((o) => o.key === 'k');
  assert.equal(k.themeColors.light, '#000000'); assert.equal(k.themeColors.dark, '#d1d4dc');
  assert.throws(() => compute(id, [], { smoothK: 0 }), /smoothK must be/);
  assert.throws(() => compute(id, [], { smoothD: 1.5 }), /smoothD must be/);
});

test('K and D thickness are independent style settings and do not change calculations or fills', () => {
  const bars = barsOf([1, 4, 2, 7, 9, 6, 3, 5]), before = compute(id, bars);
  assert.equal(before.plotStyles.k.lineWidth, 2); assert.equal(before.plotStyles.d.lineWidth, 1);
  const after = compute(id, bars, { k_width: '4', d_width: '3' });
  assert.equal(after.plotStyles.k.lineWidth, 4); assert.equal(after.plotStyles.d.lineWidth, 3);
  for (const key of ['k', 'd', 'raw', 'upper', 'lower', 'middle', 'fills']) assert.deepEqual(after[key], before[key]);
  assert.equal(after.plotStyles.upper.lineStyle, 'Dashed');
  assert.throws(() => compute(id, bars, { k_width: '5' }), /thickness/);
});
