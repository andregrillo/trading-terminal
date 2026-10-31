import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sectionGroups,addSection,renameSection,toggleSection,removeSection,moveSymbol,placeSymbol,moveSection,placeSectionBefore,forgetSectionSymbol} from '../public/lib/watchlist-sections.js';
import {watchlistSymbols} from '../public/lib/watchlist-flags.js';
const make=()=>({watchlists:{Main:['BINANCE:BTCUSDT','BINANCE:ETHUSDT','US:SPY'],Other:['US:SPY']},activeWatchlist:'Main',symbolFlags:{'BINANCE:BTCUSDT':'red','US:SPY':'green'}});
const btc='BINANCE:BTCUSDT',eth='BINANCE:ETHUSDT',spy='US:SPY';

test('flat watchlists reorder upward, downward and to the final position without losing flags or membership',()=>{
 const s=make(),flags=structuredClone(s.symbolFlags);
 placeSymbol(s,'Main',btc,spy,true);assert.deepEqual(s.watchlists.Main,[eth,spy,btc]);
 placeSymbol(s,'Main',btc,eth);assert.deepEqual(s.watchlists.Main,[btc,eth,spy]);
 placeSymbol(s,'Main',eth,btc,true);assert.deepEqual(s.watchlists.Main,[btc,eth,spy],'dropping immediately after the preceding row is a no-op');
 placeSymbol(s,'Main',eth,eth,true);assert.deepEqual(s.watchlists.Main,[btc,eth,spy]);
 assert.deepEqual(s.symbolFlags,flags);assert.deepEqual(s.watchlists.Other,[spy]);
});
test('relative placement crosses sections, preserves hidden neighbours and survives saving',()=>{
 const s=make(),a=addSection(s,'Main','A'),b=addSection(s,'Main','B');moveSymbol(s,'Main',btc,a);moveSymbol(s,'Main',eth,b);moveSymbol(s,'Main',spy,b);
 placeSymbol(s,'Main',btc,eth,true);assert.deepEqual(sectionGroups(s)[2].symbols,[eth,btc,spy]);
 placeSymbol(s,'Main',btc,spy,true);assert.deepEqual(sectionGroups(s)[2].symbols,[eth,spy,btc]);
 const restored=JSON.parse(JSON.stringify(s));assert.deepEqual(restored.watchlists.Main,[eth,spy,btc]);assert.deepEqual(sectionGroups(restored)[2].symbols,[eth,spy,btc]);
 const before=structuredClone(s);assert.throws(()=>placeSymbol(s,'Main',btc,'US:MISSING'));assert.deepEqual(s,before);
});

test('old flat watchlists display without conversion and empty named sections do not consume symbols',()=>{
 const s=make();assert.deepEqual(sectionGroups(s)[0].symbols,s.watchlists.Main);const before=structuredClone(s.watchlists);addSection(s,'Main','  Market cap  ');assert.equal(sectionGroups(s)[1].name,'Market cap');assert.deepEqual(sectionGroups(s)[1].symbols,[]);assert.deepEqual(s.watchlists,before);
});
test('moving into sections changes display order and keeps flat membership, flags and other lists',()=>{
 const s=make(),flags=structuredClone(s.symbolFlags),id=addSection(s,'Main','Crypto');moveSymbol(s,'Main',btc,id);moveSymbol(s,'Main',eth,id);assert.deepEqual(sectionGroups(s).map(g=>g.symbols),[[spy],[btc,eth]]);assert.deepEqual(s.watchlists.Main,[spy,btc,eth]);assert.ok(s.watchlists.Main.every(x=>typeof x==='string'));assert.deepEqual(s.watchlists.Other,[spy]);assert.deepEqual(s.symbolFlags,flags);moveSymbol(s,'Main',eth,'');assert.deepEqual(sectionGroups(s)[0].symbols,[spy,eth]);
});
test('moving between sections and before another row creates no duplicates',()=>{
 const s=make(),a=addSection(s,'Main','A'),b=addSection(s,'Main','B');moveSymbol(s,'Main',btc,a);moveSymbol(s,'Main',eth,b);moveSymbol(s,'Main',btc,b,eth);assert.deepEqual(sectionGroups(s)[1].symbols,[]);assert.deepEqual(sectionGroups(s)[2].symbols,[btc,eth]);moveSymbol(s,'Main',btc,b,btc);assert.equal(new Set(s.watchlists.Main).size,3);
});
test('collapsed sections retain all quote/alert symbols and expand when a symbol is moved into them',()=>{
 const s=make(),id=addSection(s,'Main','Crypto');moveSymbol(s,'Main',btc,id);toggleSection(s,'Main',id);assert.ok(sectionGroups(s)[1].collapsed);assert.ok(watchlistSymbols(s).includes(btc));moveSymbol(s,'Main',eth,id);assert.equal(sectionGroups(s)[1].collapsed,false);assert.equal(s.watchlists.Main.length,3);
});
test('rename, reorder, collapse and membership survive JSON persistence, independently per list',()=>{
 const s=make(),a=addSection(s,'Main','A'),b=addSection(s,'Main','B');addSection(s,'Other','Other section');moveSymbol(s,'Main',btc,a);renameSection(s,'Main',a,'Market cap');toggleSection(s,'Main',a);moveSection(s,'Main',a,1);assert.deepEqual(sectionGroups(s).slice(1).map(g=>g.id),[b,a]);placeSectionBefore(s,'Main',a,b);const restored=JSON.parse(JSON.stringify(s));assert.equal(sectionGroups(restored)[1].name,'Market cap');assert.ok(sectionGroups(restored)[1].collapsed);assert.deepEqual(sectionGroups(restored)[1].symbols,[btc]);assert.equal(sectionGroups(restored,'Other')[1].name,'Other section');
});
test('removing first or later headings preserves every symbol and flag',()=>{
 const s=make(),a=addSection(s,'Main','A'),b=addSection(s,'Main','B');moveSymbol(s,'Main',btc,a);moveSymbol(s,'Main',eth,b);removeSection(s,'Main',b);assert.deepEqual(sectionGroups(s)[1].symbols,[btc,eth]);removeSection(s,'Main',a);assert.equal(sectionGroups(s).length,1);assert.deepEqual([...s.watchlists.Main].sort(),[btc,eth,spy].sort());assert.equal(s.symbolFlags[btc],'red');
});
test('removing a symbol removes its old membership, so re-adding it starts outside sections',()=>{
 const s=make(),id=addSection(s,'Main','Crypto');moveSymbol(s,'Main',btc,id);forgetSectionSymbol(s,'Main',btc);assert.ok(!s.watchlists.Main.includes(btc));assert.deepEqual(sectionGroups(s)[1].symbols,[]);s.watchlists.Main.push(btc);assert.ok(sectionGroups(s)[0].symbols.includes(btc));assert.equal(s.symbolFlags[btc],'red');
});
test('stale grouping ignores removed/duplicate symbols, validates names, and rejects invalid moves without losing data',()=>{
 const s=make(),id=addSection(s,'Main','A');s.watchlistSections.Main[0].symbols=[btc,btc,'US:MISSING'];assert.deepEqual(sectionGroups(s)[1].symbols,[btc]);const before=structuredClone(s);assert.throws(()=>renameSection(s,'Main',id,' '));assert.throws(()=>addSection(s,'Main','x'.repeat(81)));assert.throws(()=>moveSymbol(s,'Main',btc,'missing'));assert.throws(()=>moveSymbol(s,'Main','US:MISSING',id));assert.deepEqual(s,before);
});
