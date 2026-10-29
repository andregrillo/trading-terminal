import { resolve, getJson, cached, NQ } from './providers.js';

const OFFLINE = process.env.QT_OFFLINE === '1';
const COINS = {
  BTC: ['Bitcoin', 'bitcoin'], ETH: ['Ethereum', 'ethereum'], SOL: ['Solana', 'solana'], XRP: ['XRP', 'ripple'],
  BNB: ['BNB', 'binancecoin'], DOGE: ['Dogecoin', 'dogecoin'], ADA: ['Cardano', 'cardano'], AVAX: ['Avalanche', 'avalanche-2'],
  LINK: ['Chainlink', 'chainlink'], DOT: ['Polkadot', 'polkadot'], LTC: ['Litecoin', 'litecoin'], TRX: ['TRON', 'tron'],
  TON: ['Toncoin', 'the-open-network'], SHIB: ['Shiba Inu', 'shiba-inu'], PEPE: ['Pepe', 'pepe'], SUI: ['Sui', 'sui'],
  NEAR: ['NEAR Protocol', 'near'], ZEC: ['Zcash', 'zcash'], BCH: ['Bitcoin Cash', 'bitcoin-cash'], ETC: ['Ethereum Classic', 'ethereum-classic'],
  ATOM: ['Cosmos', 'cosmos'], UNI: ['Uniswap', 'uniswap'], AAVE: ['Aave', 'aave'], XLM: ['Stellar', 'stellar'],
  USDT: ['Tether', 'tether'], USDC: ['USDC', 'usd-coin'], BUSD: ['Binance USD', 'binance-usd'],
};
const CURRENCIES = { USD: 'US dollar', EUR: 'euro', GBP: 'British pound', JPY: 'Japanese yen', CAD: 'Canadian dollar', AUD: 'Australian dollar', CHF: 'Swiss franc', NZD: 'New Zealand dollar' };

export function safeWebUrl(value) {
  try { const url = new URL(String(value)); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}
export function plainText(value, limit = 900) {
  let text = String(value || '').replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]*>/g, ' ').replace(/&(?:amp|lt|gt|quot|apos|nbsp);|&#(?:x[\da-f]+|\d+);/gi, (entity) => {
      const named = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&nbsp;': ' ' };
      if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
      const n = entity[2].toLowerCase() === 'x' ? parseInt(entity.slice(3), 16) : parseInt(entity.slice(2), 10);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
    }).replace(/\s+/g, ' ').trim();
  if (text.length > limit) text = text.slice(0, limit).replace(/\s+\S*$/, '') + '…';
  return text;
}
export function cryptoPair(ticker) {
  const normalized = String(ticker).toUpperCase().replace(/[-/_]/g, '');
  const legacy = { XXBTZUSD: ['BTC', 'USD'], XETHZUSD: ['ETH', 'USD'], XETHXXBT: ['ETH', 'BTC'] }[normalized];
  const match = /^(.+?)(FDUSD|USDT|USDC|BUSD|USD|EUR|GBP|JPY|AUD|CAD|CHF|BTC|ETH|BNB)$/.exec(normalized);
  let [base, quote] = legacy || (match ? [match[1], match[2]] : [normalized, '']);
  base = { XBT: 'BTC', XDG: 'DOGE' }[base] || base;
  return { base, quote };
}
export function basicAssetInfo(sym) {
  const out = { symbol: sym.id, ticker: sym.ticker, name: sym.ticker, exchange: sym.exchange, type: 'Market data', quote: '', description: '', source: null, website: null, logo: null };
  if (['BINANCE', 'COINBASE', 'KRAKEN'].includes(sym.exchange)) {
    const pair = cryptoPair(sym.ticker), coin = COINS[pair.base];
    Object.assign(out, pair, { type: 'Crypto', name: coin?.[0] || pair.base, coinId: coin?.[1] || null });
    out.description = `${out.name}${pair.quote ? ` priced in ${pair.quote}` : ''}, traded on ${sym.exchange}.`;
  } else if (sym.exchange === 'US') {
    out.type = 'US stock / fund'; out.quote = 'USD'; out.description = `${sym.ticker} is a US-listed security.`;
  } else if (sym.exchange === 'FX') {
    const base = sym.ticker.slice(0, 3), quote = sym.ticker.slice(3);
    out.quote = quote; out.type = 'Forex'; out.name = `${CURRENCIES[base] || base} / ${CURRENCIES[quote] || quote}`;
    out.description = `This pair quotes the value of one ${CURRENCIES[base] || base} in ${CURRENCIES[quote] || quote}.`;
    if (base === 'XAU' || base === 'XAG') {
      out.type = 'Precious metal'; out.name = `${base === 'XAU' ? 'Gold' : 'Silver'} / ${quote}`;
      out.description = `${out.name}. The chart may use a futures or token-backed public data source.`;
    }
  } else if (sym.exchange === 'SPREAD') {
    out.type = 'Calculated chart'; out.description = 'A calculated chart combining matching price bars from its component symbols.';
  } else if (sym.exchange === 'CSV') {
    out.type = 'Imported data'; out.description = 'Market data imported from a local file.';
  } else out.description = `${sym.ticker} market data from ${sym.exchange}.`;
  return out;
}
export function cryptoProfile(base, data) {
  return { ...base, name: plainText(data.name, 100) || base.name,
    description: plainText(data.description?.en) || base.description,
    logo: safeWebUrl(data.image?.small), website: safeWebUrl(data.links?.homepage?.find(Boolean)),
    source: { name: 'CoinGecko', url: `https://www.coingecko.com/en/coins/${encodeURIComponent(base.coinId)}` } };
}
export function companyProfile(base, data) {
  const field = (key) => plainText(data?.[key]?.value ?? data?.[key], key === 'CompanyDescription' ? 900 : 150);
  return { ...base, name: field('CompanyName') || base.name, description: field('CompanyDescription') || base.description,
    sector: field('Sector'), industry: field('Industry'), website: safeWebUrl(field('CompanyUrl')),
    source: { name: 'Nasdaq', url: `https://www.nasdaq.com/market-activity/stocks/${encodeURIComponent(base.ticker.toLowerCase())}/company-profile` } };
}
export async function assetInfo(symbol) {
  const sym = await resolve(symbol), base = basicAssetInfo(sym);
  if (OFFLINE) return base;
  return cached(`asset-profile:${sym.id}`, 6 * 3600e3, async () => {
    if (base.coinId) return cryptoProfile(base, await getJson(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(base.coinId)}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false`));
      if (sym.exchange === 'US') {
        const data = (await getJson(`https://api.nasdaq.com/api/company/${encodeURIComponent(sym.ticker)}/company-profile`, NQ))?.data;
        if (data?.CompanyName || data?.CompanyDescription) return companyProfile(base, data);
        const etf = (await getJson(`https://api.nasdaq.com/api/quote/${encodeURIComponent(sym.ticker)}/info?assetclass=etf`, NQ))?.data;
        if (etf?.companyName) return { ...base, name: plainText(etf.companyName, 150), type: 'US fund', description: `${plainText(etf.companyName, 150)} is a US-listed fund.`, source: { name: 'Nasdaq', url: `https://www.nasdaq.com/market-activity/etf/${encodeURIComponent(sym.ticker.toLowerCase())}` } };
      }
    return base;
  }).catch(() => ({ ...base, note: 'Detailed description is temporarily unavailable.' }));
}
