import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FLAG_COLORS, flagColor, setFlag, watchlistSymbols } from '../public/lib/watchlist-flags.js';
const make = () => ({ watchlists: { Main: ['BINANCE:BTCUSDT','BINANCE:ETHUSDT','US:SPY'], Other:['US:SPY','US:AAPL'] }, activeWatchlist:'Main' });
test('flags are per symbol and the same flag follows it into another watchlist',()=>{
 const s=make();setFlag(s,'US:SPY','green');assert.equal(flagColor(s.symbolFlags,'US:SPY').id,'green');s.activeWatchlist='Other';s.watchlistFlagView='flagged';assert.deepEqual(watchlistSymbols(s),['US:SPY']);assert.equal(flagColor(s.symbolFlags,'US:SPY').id,'green');
});
test('recolouring replaces the old colour; clearing a flag leaves list membership untouched',()=>{
 const s=make(),lists=structuredClone(s.watchlists);setFlag(s,'US:SPY','red');const old=s.symbolFlags;setFlag(s,'US:SPY','purple');assert.equal(old['US:SPY'],'red');assert.deepEqual(s.symbolFlags,{'US:SPY':'purple'});setFlag(s,'US:SPY',null);assert.deepEqual(s.symbolFlags,{});assert.deepEqual(s.watchlists,lists);assert.equal(setFlag(s,'US:SPY',null),false);
});
test('flagged and unflagged filters preserve watchlist ordering and never alter it',()=>{
 const s=make();setFlag(s,'US:SPY','red');setFlag(s,'BINANCE:BTCUSDT','blue');s.watchlistFlagView='flagged';assert.deepEqual(watchlistSymbols(s),['BINANCE:BTCUSDT','US:SPY']);s.watchlistFlagView='unflagged';assert.deepEqual(watchlistSymbols(s),['BINANCE:ETHUSDT']);s.watchlistFlagView='all';assert.equal(watchlistSymbols(s),s.watchlists.Main);
});
test('colour groups include flagged symbols across lists, once each, even after removal from a custom list',()=>{
 const s=make();setFlag(s,'US:AAPL','blue');setFlag(s,'US:SPY','blue');setFlag(s,'BINANCE:BTCUSDT','red');s.watchlistFlagView='flags:blue';assert.deepEqual(watchlistSymbols(s),['US:AAPL','US:SPY']);s.watchlists.Other=[];assert.deepEqual(watchlistSymbols(s),['US:AAPL','US:SPY']);s.watchlistFlagView='flags:any';assert.equal(watchlistSymbols(s).length,3);setFlag(s,'US:AAPL',null);assert.deepEqual(watchlistSymbols(s),['US:SPY','BINANCE:BTCUSDT']);
});
test('all colours and the selected view survive saving and reloading plain JSON',()=>{
 const s=make();for(const c of FLAG_COLORS)setFlag(s,`US:${c.id.toUpperCase()}`,c.id);s.watchlistFlagView='flags:orange';const restored=JSON.parse(JSON.stringify(s));assert.equal(Object.keys(restored.symbolFlags).length,8);assert.deepEqual(watchlistSymbols(restored),['US:ORANGE']);
});
test('unknown colours are rejected and stale invalid flag values do not count as flagged',()=>{
 const s=make();assert.throws(()=>setFlag(s,'US:SPY','javascript:alert(1)'));s.symbolFlags={'US:SPY':'invalid'};s.watchlistFlagView='flags:any';assert.deepEqual(watchlistSymbols(s),[]);assert.equal(flagColor({},'toString'),null);assert.throws(()=>setFlag(s,'','red'));assert.equal(new Set(FLAG_COLORS.map(c=>c.id)).size,8);
});
