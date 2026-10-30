import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combineAssetNews } from '../lib/news-feeds.js';

delete process.env.QT_OFFLINE;
const requests = [];
const article = (title, slug) => `<item><title>${title}</title><link>https://example.com/${slug}</link><description>Market update</description><pubDate>Fri, 30 Oct 2026 01:00:00 GMT</pubDate></item>`;
const rss = `<rss>${article('Cardano ecosystem update', 'ada')}${article('Bitcoin network update', 'btc')}${article('Bitcoin and Cardano markets', 'both')}${article('VeChain upgrade announced', 'vet')}${article('Crypto market overview', 'general')}</rss>`;
globalThis.fetch = async url => {
  const u = new URL(url); requests.push(u);
  if (u.host === 'decrypt.co') return new Response('Unavailable', { status: 503 });
  if (u.host === 'cointelegraph.com' || u.host === 'www.coindesk.com') return new Response(rss);
  if (u.host === 'api.nasdaq.com') return Response.json({ data: { rows: [{ title: 'Microsoft company update', url: 'https://example.com/msft', publisher: 'Nasdaq', created: '2026-10-30T01:00:00Z' }] } });
  throw Error(`Unexpected request: ${url}`);
};
const { news } = await import('../lib/market-info.js');
const group = (label, items, scope = 'asset') => ({ symbol: `BINANCE:${label}USDT`, label, items, scope, updatedAt: 100, sources: [{ name: 'Test', available: true }] });
const story = (title, url = `https://example.com/${title}`) => ({ title, url, source: 'Test' });

test('combined crypto news looks up the underlying assets independently', async () => {
  const result = await news('SPREAD:BINANCE:ADAUSDT / BINANCE:BTCUSDT');
  assert.equal(result.scope, 'combined');
  assert.deepEqual(result.components.map(group => group.label), ['ADA', 'BTC']);
  assert.ok(result.items.some(item => item.assetLabels.includes('ADA')));
  assert.ok(result.items.some(item => item.assetLabels.includes('BTC')));
  assert.ok(requests.every(url => !url.href.includes('ADAUSDT') && !url.href.includes('BTCUSDT')));
  assert.ok(result.sources.some(source => source.available));
});

test('a story covering both assets appears once and identifies both assets', async () => {
  const result = await news('SPREAD:BINANCE:ADAUSDT / BINANCE:BTCUSDT');
  const shared = result.items.filter(item => item.title === 'Bitcoin and Cardano markets');
  assert.equal(shared.length, 1);
  assert.deepEqual(shared[0].assetLabels, ['ADA', 'BTC']);
  assert.deepEqual(shared[0].symbols, ['BINANCE:ADAUSDT', 'BINANCE:BTCUSDT']);
});

test('VeChain name matches VET instead of falling back to unrelated market stories', async () => {
  const result = await news('SPREAD:BINANCE:ADAUSDT / BINANCE:VETUSDT');
  assert.ok(result.items.some(item => item.title === 'VeChain upgrade announced' && item.assetLabels.includes('VET')));
  assert.ok(!result.items.some(item => item.title === 'Crypto market overview'));
});

test('a component without matching news stays explicitly empty rather than inheriting market headlines', async () => {
  const result = await news('SPREAD:BINANCE:ADAUSDT / BINANCE:NANOUSDT');
  const nano = result.components.find(group => group.label === 'NANO');
  assert.equal(nano.items.length, 0); assert.match(result.note, /NANO/);
  assert.ok(result.items.every(item => !item.assetLabels.includes('NANO')));
});

test('constant terms and repeated symbols do not trigger additional asset lookups', async () => {
  for (const symbol of ['SPREAD:2 * BINANCE:ADAUSDT', 'SPREAD:BINANCE:ADAUSDT / BINANCE:ADAUSDT']) {
    const result = await news(symbol);
    assert.equal(result.components.length, 1); assert.equal(result.components[0].label, 'ADA');
  }
});

test('mixed stock and crypto charts request the stock ticker and crypto asset separately', async () => {
  const result = await news('SPREAD:US:MSFT / BINANCE:BTCUSDT');
  assert.deepEqual(result.components.map(group => group.label), ['MSFT', 'BTC']);
  assert.ok(result.items.some(item => item.assetLabels.includes('MSFT')));
  assert.ok(result.items.some(item => item.assetLabels.includes('BTC')));
  const stockRequests = requests.filter(url => url.host === 'api.nasdaq.com');
  assert.ok(stockRequests.length > 0);
  assert.ok(stockRequests.every(url => url.searchParams.get('q') === 'msft|stocks'));
});

test('round-robin ordering gives both assets space in the four-card preview', () => {
  const a = group('ADA', [story('a1'), story('a2'), story('a3')]);
  const b = group('BTC', [story('b1'), story('b2'), story('b3')]);
  const snapshot = structuredClone([a, b]);
  const result = combineAssetNews([a, b]);
  assert.deepEqual(result.items.slice(0, 4).map(item => item.assetLabels[0]), ['ADA', 'BTC', 'ADA', 'BTC']);
  assert.deepEqual([a, b], snapshot, 'cached single-asset results remain unchanged');
});

test('duplicates, tracking links and unsafe links are handled while the other asset remains available', () => {
  const result = combineAssetNews([
    group('ADA', [story('Shared', 'https://example.com/same?utm_source=rss'), story('Unsafe', 'javascript:alert(1)')]),
    group('BTC', [story('Shared', 'https://example.com/same?utm_medium=feed'), story('Bitcoin')]),
  ]);
  assert.equal(result.items.length, 2); assert.equal(result.items[0].url, 'https://example.com/same');
  assert.deepEqual(result.items[0].assetLabels, ['ADA', 'BTC']);
});

test('single-asset news retains its original asset scope and refresh interval', async () => {
  const result = await news('BINANCE:BTCUSDT');
  assert.equal(result.scope, 'asset'); assert.equal(result.refreshSeconds, 120);
  assert.equal(result.label, 'BTC'); assert.equal(result.components, undefined);
});
