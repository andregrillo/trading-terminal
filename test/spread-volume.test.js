import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resample } from '../public/lib/series.js';

delete process.env.QT_OFFLINE;
const t0 = Date.UTC(2026, 9, 1);
const row = (i, price, baseVolume, quoteVolume) => [t0 + i * 60000, String(price), String(price + .1), String(price - .1), String(price), String(baseVolume), t0 + (i + 1) * 60000 - 1, quoteVolume, 1, '0', '0', '0'];
const ada = [row(0, 2, 3, '9'), row(1, 3, 4, '15'), row(2, 4, 5, '21')];
const vet = [row(0, .5, 20, '7'), row(1, .6, 30, '14'), row(2, .7, 40, '28')];
const rows = new Map([['ADAUSDT', ada], ['VETUSDT', vet], ['ADABTC', ada]]);
globalThis.fetch = async url => {
  const u = new URL(url);
  if (u.pathname === '/api/v3/klines') return Response.json(rows.get(u.searchParams.get('symbol')) || []);
  return new Response('Unexpected source', { status: 404 });
};
const { getCandles } = await import('../lib/providers.js');
const spread = (op = '/') => `SPREAD:BINANCE:ADAUSDT ${op} BINANCE:VETUSDT`;

test('Binance retains its reported quote turnover while ordinary asset volume stays in coins', async () => {
  const r = await getCandles('BINANCE:ADAUSDT', '1m', 10);
  assert.deepEqual(r.candles.map(b => b.volume), [3, 4, 5]);
  assert.deepEqual(r.candles.map(b => b.quoteVolume), [9, 15, 21]);
  assert.notEqual(r.candles[0].quoteVolume, r.candles[0].close * r.candles[0].volume);
});

test('ratio volume sums actual traded USDT and preserves the price ratio', async () => {
  const r = await getCandles(spread(), '1m', 10);
  assert.deepEqual(r.candles.map(b => b.volume), [16, 29, 49]);
  assert.equal(r.candles[0].close, 4);
  assert.equal(r.volumeInfo.currency, 'USDT');
  assert.equal(r.volumeInfo.method, 'sum-quote-volume');
  assert.deepEqual(r.volumeInfo.sources, ['BINANCE:ADAUSDT', 'BINANCE:VETUSDT']);
  assert.equal(r.volumeInfo.available, true); assert.equal(r.volumeInfo.missingBars, 0);
});

test('combined turnover is independent of the chosen price operator', async () => {
  for (const op of ['+', '-', '*']) {
    const r = await getCandles(spread(op), '1m', 10);
    assert.deepEqual(r.candles.map(b => b.volume), [16, 29, 49]);
  }
});

test('resampled spreads preserve and sum the quote amounts across all underlying bars', async () => {
  const r = await getCandles(spread(), '2m', 10);
  assert.equal(r.candles.length, 2);
  assert.deepEqual(r.candles.map(b => b.volume), [45, 49]);
});

test('only matching timestamps contribute volume', async () => {
  rows.set('LINKUSDT', [vet[1], vet[2]]);
  const r = await getCandles('SPREAD:BINANCE:ADAUSDT / BINANCE:LINKUSDT', '1m', 10);
  assert.deepEqual(r.candles.map(b => b.time), [(t0 + 60000) / 1000, (t0 + 120000) / 1000]);
  assert.deepEqual(r.candles.map(b => b.volume), [29, 49]);
});

test('repeated assets are counted once and a numeric price multiplier adds no volume', async () => {
  const same = await getCandles('SPREAD:BINANCE:ADAUSDT / BINANCE:ADAUSDT', '1m', 10);
  const scalar = await getCandles('SPREAD:2 * BINANCE:ADAUSDT', '1m', 10);
  for (const r of [same, scalar]) {
    assert.deepEqual(r.candles.map(b => b.volume), [9, 15, 21]);
    assert.equal(r.volumeInfo.sources.length, 1);
  }
});

test('missing quote turnover stays unavailable instead of estimating it or treating it as zero', async () => {
  rows.set('XRPUSDT', vet.map(r => r.map((value, i) => i === 7 ? null : value)));
  const r = await getCandles('SPREAD:BINANCE:ADAUSDT / BINANCE:XRPUSDT', '1m', 10);
  assert.ok(r.candles.every(b => b.volume === null));
  assert.equal(r.volumeInfo.available, false); assert.equal(r.volumeInfo.missingBars, 3);
  assert.ok(r.candles.every(b => Number.isFinite(b.close)));
});

test('different quote currencies are never added together as USDT', async () => {
  const r = await getCandles('SPREAD:BINANCE:ADABTC / BINANCE:VETUSDT', '1m', 10);
  assert.equal(r.volumeInfo, undefined); assert.ok(r.candles.every(b => b.volume === 0));
});

test('a zero reported amount remains a valid zero, not unavailable', async () => {
  rows.set('ZEROUSDT', vet.map(r => r.map((value, i) => i === 7 ? '0' : value)));
  const r = await getCandles('SPREAD:BINANCE:ZEROUSDT / BINANCE:ZEROUSDT', '1m', 10);
  assert.ok(r.candles.every(b => b.volume === 0)); assert.equal(r.volumeInfo.available, true);
});

test('resampling drops incomplete quote totals and leaves ordinary OHLCV bars unchanged', () => {
  const bars = [{ time: t0 / 1000, open: 2, high: 3, low: 1, close: 2, volume: 3, quoteVolume: 9 }, { time: t0 / 1000 + 60, open: 2, high: 4, low: 1, close: 3, volume: 4 }];
  assert.equal(resample(bars, '3m')[0].quoteVolume, undefined);
  assert.equal(resample(bars.slice().reverse(), '3m')[0].quoteVolume, undefined);
  const regular = bars.map(({ quoteVolume, ...bar }) => bar);
  assert.deepEqual(resample(regular, '3m')[0], { time: t0 / 1000, open: 2, high: 4, low: 1, close: 3, volume: 7 });
});
