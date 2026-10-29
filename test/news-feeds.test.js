import {test} from 'node:test';import assert from 'node:assert/strict';
import {parseRss,loadCryptoFeeds,selectCryptoNews,CRYPTO_NEWS_SOURCES} from '../lib/news-feeds.js';
const item=(title,url='https://example.com/article?utm_source=rss',extra='')=>`<item id="1"><title><![CDATA[${title}]]></title><link>${url}</link><pubDate>Thu, 29 Oct 2026 12:00:00 GMT</pubDate><description><![CDATA[<b>Short &amp; useful</b>]]></description>${extra}</item>`;
test('RSS extracts attributed text, timestamps and clean article links',()=>{
 const items=parseRss(`<rss>${item('Bitcoin &amp; markets')}</rss>`,'Test source');assert.equal(items.length,1);assert.equal(items[0].title,'Bitcoin & markets');assert.equal(items[0].source,'Test source');assert.equal(items[0].url,'https://example.com/article');assert.equal(items[0].summary,'Short & useful');assert.ok(items[0].time>0);
});
test('feed links cannot run scripts and labelled promotions are excluded',()=>{
 assert.equal(parseRss(item('Bad','javascript:alert(1)'),'Test').length,0);assert.equal(parseRss(item('Sponsored token offer'),'Test').length,0);assert.equal(parseRss(item('Token news','https://example.com/press-releases/token'),'Test').length,0);assert.equal(parseRss(item('Token news','https://example.com/story','<category>Partner content</category>'),'Test').length,0);
});
test('one blocked publisher does not discard healthy feeds; duplicates are removed',async()=>{
 const result=await loadCryptoFeeds(async url=>url.includes('decrypt')?new Response('blocked',{status:403}):new Response(`<rss>${item('Bitcoin market update')}</rss>`,{status:200}));assert.equal(result.items.length,1);assert.equal(result.sources.filter(s=>s.available).length,2);assert.equal(result.sources.find(s=>s.name==='Decrypt').available,false);assert.equal(result.refreshSeconds,120);
});
test('matching headlines are preferred even if there is only one, and market fallback is labelled',()=>{
 const data={items:[{title:'Bitcoin market update',summary:''},{title:'Ethereum network update',summary:''}],sources:[]};const btc=selectCryptoNews(data,'BTC');assert.equal(btc.scope,'asset');assert.equal(btc.items.length,1);const sol=selectCryptoNews(data,'SOL');assert.equal(sol.scope,'market');assert.equal(sol.items.length,2);assert.match(sol.note,/crypto market/);assert.equal(selectCryptoNews({items:[],sources:[]},'BTC').scope,'none');
});
test('ambiguous everyday words do not masquerade as Chainlink or NEAR news',()=>{
 const data={items:[{title:'A new link near the market',summary:''},{title:'LINK rallies after Chainlink update',summary:''}],sources:[]};assert.equal(selectCryptoNews(data,'LINK').items.length,1);assert.equal(selectCryptoNews(data,'NEAR').scope,'market');assert.equal(CRYPTO_NEWS_SOURCES.length,3);
});
