import { test } from 'node:test';
import assert from 'node:assert/strict';
import { basicAssetInfo, cryptoPair, cryptoProfile, companyProfile, plainText, safeWebUrl } from '../lib/asset-info.js';
const sym=(exchange,ticker)=>({id:`${exchange}:${ticker}`,exchange,ticker});
test('crypto identity preserves quote units, exchange and common provider aliases',()=>{
 for(const [ticker,base,quote]of[['BTCUSDT','BTC','USDT'],['ETHBTC','ETH','BTC'],['BTC-USD','BTC','USD'],['XBTUSD','BTC','USD'],['XXBTZUSD','BTC','USD']])assert.deepEqual(cryptoPair(ticker),{base,quote});
 const p=basicAssetInfo(sym('BINANCE','BTCUSDT'));assert.equal(p.name,'Bitcoin');assert.equal(p.quote,'USDT');assert.equal(p.type,'Crypto');assert.equal(p.coinId,'bitcoin');assert.equal(basicAssetInfo(sym('COINBASE','ETH-USD')).quote,'USD');
});
test('unknown crypto names are left as tickers rather than matching an unrelated token',()=>{
 const p=basicAssetInfo(sym('BINANCE','UNKNOWNUSDT'));assert.equal(p.name,'UNKNOWN');assert.equal(p.coinId,null);assert.match(p.description,/UNKNOWN/);
});
test('forex, calculated charts, imports and stocks have useful distinct identities',()=>{
 const fx=basicAssetInfo(sym('FX','EURUSD'));assert.equal(fx.quote,'USD');assert.match(fx.description,/one euro in US dollar/);assert.equal(basicAssetInfo(sym('FX','XAUUSD')).type,'Precious metal');assert.equal(basicAssetInfo(sym('US','AAPL')).quote,'USD');assert.equal(basicAssetInfo(sym('SPREAD','BINANCE:BTCUSDT / BINANCE:ETHUSDT')).type,'Calculated chart');assert.equal(basicAssetInfo(sym('CSV','MINE')).type,'Imported data');
});
test('external profile markup becomes bounded plain text and only web links are used',()=>{
 assert.equal(plainText('<script>alert(1)</script><p>A &amp; B &#x1f600;</p>'),'A & B 😀');assert.ok(plainText('hello '.repeat(500),100).length<=101);assert.equal(safeWebUrl('javascript:alert(1)'),null);assert.equal(safeWebUrl('file:///etc/passwd'),null);assert.equal(safeWebUrl('https://bitcoin.org/'),'https://bitcoin.org/');
 const base=basicAssetInfo(sym('BINANCE','BTCUSDT')),p=cryptoProfile(base,{name:'Bitcoin',description:{en:'<b>A public network.</b>'},links:{homepage:['javascript:alert(1)']},image:{small:'https://assets.coingecko.com/bitcoin.png'}});assert.equal(p.description,'A public network.');assert.equal(p.website,null);assert.equal(p.source.name,'CoinGecko');assert.equal(p.quote,'USDT');
});
test('company profiles handle Nasdaq label/value fields and missing data',()=>{
 const base=basicAssetInfo(sym('US','AAPL'));const p=companyProfile(base,{CompanyName:{value:'Apple Inc.'},CompanyDescription:{value:'<p>Consumer products.</p>'},Sector:{value:'Technology'},CompanyUrl:{value:'https://apple.com'}});assert.equal(p.name,'Apple Inc.');assert.equal(p.sector,'Technology');assert.equal(p.description,'Consumer products.');assert.equal(p.source.name,'Nasdaq');assert.equal(companyProfile(base,{}).description,base.description);
});
test('a transient description failure can recover rather than caching the fallback for six hours',async()=>{
 const {assetInfo}=await import('../lib/asset-info.js'),originalFetch=globalThis.fetch,originalNow=Date.now;let calls=0;
 try{globalThis.fetch=async()=>++calls===1?new Response('unavailable',{status:503}):Response.json({name:'Bitcoin',description:{en:'Recovered description.'}});
 const first=await assetInfo('COINBASE:BTC-USD');assert.ok(first.note);const future=originalNow()+61000;Date.now=()=>future;
 const second=await assetInfo('COINBASE:BTC-USD');assert.equal(second.description,'Recovered description.');assert.ok(calls>=2);
 }finally{globalThis.fetch=originalFetch;Date.now=originalNow;}
});
