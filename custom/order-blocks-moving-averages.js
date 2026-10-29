// Order Block Detector & Moving Averages — converted from the user's Pine v6 script.
// Original order-block work © LuxAlgo. Adaptation: Trade Terminal JavaScript port.
// CC BY-NC-SA 4.0: https://creativecommons.org/licenses/by-nc-sa/4.0/
// Attribution, noncommercial use and share-alike terms apply to this adaptation.
import { bucketStart, parseTf, resample } from '../public/lib/series.js';

const blank = (n) => new Array(n).fill(NaN);
const on = (v) => v !== 'Off';
const rgba = (hex, transparency) => {
  const h = /^#[\da-f]{6}$/i.test(hex) ? hex.slice(1) : '9598a1';
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${1 - Math.max(0, Math.min(100, transparency)) / 100})`;
};
const num = (key, label, value, min = 0, max = 100) => ({ key, label, type: 'int', default: value, min, max });
const choice = (key, label, value, options) => ({ key, label, type: 'select', default: value, options });
const color = (key, label, value) => ({ key, label, type: 'color', default: value });
const TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '2h', '4h', '8h', '12h', '1D', '1W', '1M'];
const frameLabel = (tf) => ['1D', '1W', '1M'].includes(tf) ? tf.slice(1) : tf;

export function migrateParams(params = {}) {
  const { ma50_tf, ...rest } = params;
  const legacy = ma50_tf === 'W' || ma50_tf === '1W' ? '1W' : '1D';
  return { ...rest, sma200_tf: params.sma200_tf || '1D', ema50_tf: params.ema50_tf || legacy, sma50_tf: params.sma50_tf || legacy };
}

// Pine's EMA begins at the first non-na close (not an SMA seed).
export function pineEma(values, length) {
  let previous = NaN;
  const alpha = 2 / (length + 1);
  return values.map((value) => {
    if (Number.isFinite(value)) previous = Number.isFinite(previous) ? alpha * value + (1 - alpha) * previous : value;
    return previous;
  });
}

// A volume pivot is confirmed length bars later. Equal values to the left are
// allowed; an equal value to the right makes the later bar the pivot instead.
export function volumePivot(bars, i, length) {
  const k = i - length;
  if (k < length || !Number.isFinite(bars[k]?.volume)) return false;
  const value = bars[k].volume;
  for (let j = k - length; j <= i; j++) {
    if (!Number.isFinite(bars[j].volume)) return false;
    if (j < k && bars[j].volume > value || j > k && bars[j].volume >= value) return false;
  }
  return true;
}

function inferTf(bars) {
  let seconds = Infinity;
  for (let i = 1; i < bars.length; i++) seconds = Math.min(seconds, bars[i].time - bars[i - 1].time);
  return seconds >= 604800 ? '1W' : seconds >= 86400 ? '1D' : `${Number.isFinite(seconds) ? seconds : 60}s`;
}

export function mapAverage(bars, higher, values, tf, context, matchPine) {
  const chartTf = context.timeframe || inferTf(bars);
  const chartSec = parseTf(chartTf).seconds, otherSec = parseTf(tf).seconds;
  let j = -1;
  return bars.map((bar, i) => {
    if (otherSec >= chartSec) {
      // Daily/weekly bucket starts handle market holidays and gaps without
      // assuming the next returned bar begins immediately after this one ends.
      const period = bucketStart(bar.time, tf);
      while (j + 1 < higher.length && bucketStart(higher[j + 1].time, tf) <= period) j++;
      let index = j;
      if (otherSec > chartSec && !matchPine && index >= 0 && bucketStart(higher[index].time, tf) >= period) index--;
      return index >= 0 ? values[index] : NaN;
    }
    const end = i + 1 < bars.length ? bars[i + 1].time : bar.time + chartSec;
    while (j + 1 < higher.length && higher[j + 1].time < bar.time) j++;
    let first = j + 1, last = first - 1;
    while (last + 1 < higher.length && higher[last + 1].time < end) last++;
    const realtime = context.realtime && i === bars.length - 1;
    const index = matchPine && !realtime ? first : last;
    j = last;
    return index >= 0 && index < higher.length && higher[index].time < end ? values[index] : (j >= 0 ? values[j] : NaN);
  });
}

export default {
  name: 'Order Block Detector & Moving Averages',
  overlay: true,
  fixedTimeframes: true,
  legendInputs: ['length', 'mitigation', 'sma200_tf', 'ema50_tf', 'sma50_tf'],
  description: 'LuxAlgo order blocks + SMA 200, EMA 50 and SMA 50, each with its own timeframe. Match TradingView reproduces historical look-ahead: past averages can change. Confirmed only uses finished periods. Replay, alerts and strategy tests always use confirmed periods. © LuxAlgo · CC BY-NC-SA 4.0.',
  migrateParams,
  timeframes(p) { return [...new Set([...(on(p.sma200_enabled) ? [p.sma200_tf] : []), ...(on(p.ema50_enabled) ? [p.ema50_tf] : []), ...(on(p.sma50_enabled) ? [p.sma50_tf] : [])])]; },
  inputs: [
    num('length', 'Volume pivot length', 5, 1, 500),
    num('bull_ext_last', 'Bullish blocks shown', 3, 1, 500),
    color('bg_bull_css', 'Bullish fill', '#169400'),
    num('bull_fill_transp', 'Bullish fill transparency (%)', 80),
    color('bull_css', 'Bullish border', '#169400'),
    color('bull_avg_css', 'Bullish average line', '#9598a1'),
    num('bear_ext_last', 'Bearish blocks shown', 3, 1, 500),
    color('bg_bear_css', 'Bearish fill', '#ff1100'),
    num('bear_fill_transp', 'Bearish fill transparency (%)', 80),
    color('bear_css', 'Bearish border', '#ff1100'),
    color('bear_avg_css', 'Bearish average line', '#9598a1'),
    choice('line_style', 'Block average line style', 'Solid', ['Solid', 'Dashed', 'Dotted']),
    num('line_width', 'Block average line width', 1, 1, 4),
    choice('mitigation', 'Mitigation method', 'Wick', ['Wick', 'Close']),
    choice('sma200_enabled', 'Show SMA 200', 'On', ['On', 'Off']),
    choice('sma200_tf', 'SMA 200 Timeframe', '1D', TIMEFRAMES),
    choice('sma200_width', 'SMA 200 line thickness', '2', ['1', '2', '3', '4']),
    num('sma200_transp', 'SMA 200 transparency (%)', 0),
    choice('sma200_style', 'SMA 200 line style', 'Solid', ['Solid', 'Dashed', 'Dotted']),
    choice('ema50_enabled', 'Show EMA 50', 'On', ['On', 'Off']),
    choice('ema50_tf', 'EMA 50 Timeframe', '1D', TIMEFRAMES),
    choice('ema50_width', 'EMA 50 line thickness', '2', ['1', '2', '3', '4']),
    num('ema50_transp', 'EMA 50 transparency (%)', 0),
    choice('sma50_enabled', 'Show SMA 50', 'On', ['On', 'Off']),
    choice('sma50_tf', 'SMA 50 Timeframe', '1D', TIMEFRAMES),
    choice('sma50_width', 'SMA 50 line thickness', '2', ['1', '2', '3', '4']),
    num('sma50_transp', 'SMA 50 transparency (%)', 0),
    choice('ma_mode', 'Average history', 'Match TradingView', ['Match TradingView', 'Confirmed only']),
    choice('labels_enabled', 'Show average price labels', 'On', ['On', 'Off']),
  ],
  outputs: [
    { key: 'sma200', label: 'SMA 200', color: '#ffffff', lineWidth: 2 },
    { key: 'ema50', label: 'EMA 50', color: '#00897b', lineWidth: 2 },
    { key: 'sma50', label: 'SMA 50', color: '#ff9800', lineWidth: 2 },
    { key: 'bullFormed', label: 'Bullish OB Formed', hidden: true },
    { key: 'bearFormed', label: 'Bearish OB Formed', hidden: true },
    { key: 'bullMitigated', label: 'Bullish OB Mitigated', hidden: true },
    { key: 'bearMitigated', label: 'Bearish OB Mitigated', hidden: true },
    { key: 'bullOb', label: 'Bull OB price at confirmation', hidden: true },
    { key: 'bearOb', label: 'Bear OB price at confirmation', hidden: true },
  ],
  calc(bars, p, ta, context = {}) {
    for (const key of ['sma200_width', 'ema50_width', 'sma50_width']) if (![1, 2, 3, 4].includes(Number(p[key]))) throw new Error('Line thickness must be 1, 2, 3 or 4.');
    const n = bars.length, length = Math.max(1, Math.floor(p.length));
    const bullFormed = new Array(n).fill(0), bearFormed = new Array(n).fill(0);
    const bullMitigated = new Array(n).fill(0), bearMitigated = new Array(n).fill(0);
    const bullOb = blank(n), bearOb = blank(n);
    let bulls = [], bears = [], state = null;
    for (let i = 0; i < n; i++) {
      const start = Math.max(0, i - length + 1);
      let upper = -Infinity, lower = Infinity, closeHigh = -Infinity, closeLow = Infinity;
      for (let j = start; j <= i; j++) {
        upper = Math.max(upper, bars[j].high); lower = Math.min(lower, bars[j].low);
        closeHigh = Math.max(closeHigh, bars[j].close); closeLow = Math.min(closeLow, bars[j].close);
      }
      const pivot = bars[i - length];
      if (pivot) state = pivot.high > upper ? 0 : pivot.low < lower ? 1 : state;
      if (volumePivot(bars, i, length)) {
        const middle = (pivot.high + pivot.low) / 2;
        if (state === 1) {
          bulls.unshift({ time: pivot.time, top: middle, bottom: pivot.low });
          bullFormed[i] = 1; bullOb[i] = pivot.low;
        } else if (state === 0) {
          bears.unshift({ time: pivot.time, top: pivot.high, bottom: middle });
          bearFormed[i] = 1; bearOb[i] = pivot.high;
        }
      }
      const targetBull = p.mitigation === 'Close' ? closeLow : lower;
      const targetBear = p.mitigation === 'Close' ? closeHigh : upper;
      const keptBulls = bulls.filter((block) => !(targetBull < block.bottom));
      const keptBears = bears.filter((block) => !(targetBear > block.top));
      bullMitigated[i] = +(keptBulls.length < bulls.length);
      bearMitigated[i] = +(keptBears.length < bears.length);
      bulls = keptBulls; bears = keptBears;
    }
    const matchPine = p.ma_mode === 'Match TradingView' && !context.causal;
    const chartTf = context.timeframe || inferTf(bars);
    const getBars = (tf) => context.timeframes?.[tf] || (parseTf(chartTf).seconds <= parseTf(tf).seconds ? resample(bars, tf) : []);
    const cache = new Map();
    const dataFor = (tf) => { if (!cache.has(tf)) cache.set(tf, getBars(tf)); return cache.get(tf); };
    const mapped = (data, values, tf) => mapAverage(bars, data, values, tf, { ...context, timeframe: chartTf }, matchPine);
    const average = (tf, length, calculate) => { const data = dataFor(tf); return mapped(data, calculate(data.map((b) => b.close), length), tf); };
    const sma200 = on(p.sma200_enabled) ? average(p.sma200_tf, 200, ta.sma) : blank(n);
    const ema50 = on(p.ema50_enabled) ? average(p.ema50_tf, 50, pineEma) : blank(n);
    const sma50 = on(p.sma50_enabled) ? average(p.sma50_tf, 50, ta.sma) : blank(n);
    const rectangles = [
      ...bulls.slice(0, p.bull_ext_last).map((b) => ({ ...b, fill: rgba(p.bg_bull_css, p.bull_fill_transp), border: rgba(p.bull_css, 70), middleColor: rgba(p.bull_avg_css, 37), lineStyle: p.line_style, lineWidth: p.line_width })),
      ...bears.slice(0, p.bear_ext_last).map((b) => ({ ...b, fill: rgba(p.bg_bear_css, p.bear_fill_transp), border: rgba(p.bear_css, 70), middleColor: rgba(p.bear_avg_css, 37), lineStyle: p.line_style, lineWidth: p.line_width })),
    ];
    const plotStyles = {
      sma200: { transparency: p.sma200_transp, lineStyle: p.sma200_style, lineWidth: Number(p.sma200_width) },
      ema50: { transparency: p.ema50_transp, lineWidth: Number(p.ema50_width) }, sma50: { transparency: p.sma50_transp, lineWidth: Number(p.sma50_width) },
    };
    const priceLabels = on(p.labels_enabled) ? [
      { key: 'sma200', price: sma200.at(-1), text: `SMA 200 ${frameLabel(p.sma200_tf)}` },
      { key: 'ema50', price: ema50.at(-1), text: `EMA 50 ${frameLabel(p.ema50_tf)}` },
      { key: 'sma50', price: sma50.at(-1), text: `SMA 50 ${frameLabel(p.sma50_tf)}` },
    ].filter((label) => Number.isFinite(label.price)) : [];
    return { sma200, ema50, sma50, bullFormed, bearFormed, bullMitigated, bearMitigated, bullOb, bearOb, rectangles, plotStyles, priceLabels };
  },
};
