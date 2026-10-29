import { plainText, safeWebUrl } from './asset-info.js';

export const CRYPTO_NEWS_SOURCES = [
  { name: 'Cointelegraph', url: 'https://cointelegraph.com/rss' },
  { name: 'Decrypt', url: 'https://decrypt.co/feed' },
  { name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
];
const promo = /\b(sponsored|advertorial|press[ -]releases?|partner content|paid post)\b/i;
function articleUrl(value) {
  const safe = safeWebUrl(value); if (!safe) return null;
  const url = new URL(safe);
  for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
  return url.href;
}
export function parseRss(xml, source) {
  const items = [];
  for (const match of String(xml).matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const block = match[1], pick = (tag, limit = 900) => plainText((new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(block) || [])[1], limit);
    const title = pick('title', 240), url = articleUrl(pick('link', 2000));
    const categories = [...block.matchAll(/<category\b[^>]*>([\s\S]*?)<\/category>/gi)].map(m => plainText(m[1])).join(' ');
    if (!title || !url || promo.test(`${title} ${categories} ${new URL(url).pathname}`)) continue;
    items.push({ title, url, source, time: Date.parse(pick('pubDate')) || null, summary: pick('description', 280) });
  }
  return items;
}
export async function loadCryptoFeeds(fetcher = fetch) {
  const results = await Promise.all(CRYPTO_NEWS_SOURCES.map(async (source) => {
    try {
      const response = await fetcher(source.url, { headers: { 'User-Agent': 'Mozilla/5.0 TradeTerminal', Accept: 'application/rss+xml,application/xml,text/xml' }, signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const items = parseRss(await response.text(), source.name);
      return { ...source, available: items.length > 0, count: items.length, items };
    } catch { return { ...source, available: false, count: 0, items: [] }; }
  }));
  const urls = new Set(), titles = new Set();
  const items = results.flatMap(source => source.items).sort((a, b) => (b.time || 0) - (a.time || 0)).filter(item => {
    const key = item.title.toLowerCase().replace(/\W/g, '');
    if (urls.has(item.url) || titles.has(key)) return false;
    urls.add(item.url); titles.add(key); return true;
  });
  return { items, sources: results.map(({ items, ...source }) => source), updatedAt: Date.now(), refreshSeconds: 120 };
}
const NAMES = { BTC: ['bitcoin', 'btc'], ETH: ['ethereum', 'ether'], SOL: ['solana'], XRP: ['xrp', 'ripple'], BNB: ['binance coin', 'bnb'], DOGE: ['dogecoin', 'doge'], ADA: ['cardano'], AVAX: ['avalanche'], LINK: ['chainlink'], DOT: ['polkadot'], LTC: ['litecoin'], TRX: ['tron'], TON: ['toncoin'], SHIB: ['shiba inu', 'shib'], PEPE: ['pepe'], SUI: ['sui'], NEAR: ['near protocol'], ZEC: ['zcash'], BCH: ['bitcoin cash'], ETC: ['ethereum classic'], XLM: ['stellar'], ATOM: ['cosmos'], UNI: ['uniswap'], AAVE: ['aave'] };
export function selectCryptoNews(data, base) {
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const names = NAMES[base] || [], re = names.length ? new RegExp(`\\b(${names.map(escape).join('|')})\\b`, 'i') : null;
  const ticker = new RegExp(`\\b${escape(base)}\\b`);
  const hits = data.items.filter(item => (re?.test(`${item.title} ${item.summary}`)) || ticker.test(`${item.title} ${item.summary}`));
  return { ...data, items: (hits.length ? hits : data.items).slice(0, 30), scope: hits.length ? 'asset' : data.items.length ? 'market' : 'none',
    note: !data.items.length ? 'Crypto news feeds are unavailable right now.' : hits.length ? `Headlines mentioning ${base}` : `No recent headlines matched ${base}; showing the crypto market.` };
}
