// Personal RSI, converted from the TradingView Pine Script v6 supplied by the user.
// Keeps the source script's gradient colours, smoothing options and optional
// regular divergences. Signals occur on confirmation, five bars after a pivot.
const GREEN = '#4caf50', RED = '#f23645';

export function pineEma(values, length) {
  let previous = NaN;
  const alpha = 2 / (length + 1);
  return values.map((value) => {
    if (Number.isFinite(value)) previous = Number.isFinite(previous) ? alpha * value + (1 - alpha) * previous : value;
    return previous;
  });
}

export function rsiPivot(values, index, left = 5, right = 5, high = false) {
  const pivot = index - right;
  if (pivot < left || !Number.isFinite(values[pivot])) return false;
  const sign = high ? 1 : -1, value = values[pivot] * sign;
  for (let j = pivot - left; j <= index; j++) {
    if (!Number.isFinite(values[j])) return false;
    if (j < pivot && values[j] * sign > value || j > pivot && values[j] * sign >= value) return false;
  }
  return true;
}

export function findDivergences(values, bars, { left = 5, right = 5, rangeLower = 5, rangeUpper = 60 } = {}) {
  const bullish = new Array(values.length).fill(0), bearish = new Array(values.length).fill(0);
  const segments = [], labels = [];
  let previousLow = null, previousHigh = null;
  for (let i = left + right; i < values.length; i++) {
    const k = i - right;
    for (const high of [false, true]) {
      if (!rsiPivot(values, i, left, right, high)) continue;
      const previous = high ? previousHigh : previousLow;
      const current = { index: k, confirmed: i, time: bars[k].time, value: values[k], price: high ? bars[k].high : bars[k].low };
      // Pine uses barssince(plFound[1]) / barssince(phFound[1]), not the
      // unshifted condition. Its 5..60 range means pivot distances of 6..61.
      const distance = previous ? i - previous.confirmed - 1 : -1;
      const inRange = distance >= rangeLower && distance <= rangeUpper;
      const found = previous && inRange && (high
        ? current.value < previous.value && current.price > previous.price
        : current.value > previous.value && current.price < previous.price);
      if (found) {
        (high ? bearish : bullish)[i] = 1;
        const color = high ? RED : GREEN;
        segments.push({ fromTime: previous.time, fromPrice: previous.value, toTime: current.time, toPrice: current.value, color, width: 2 });
        labels.push({ time: current.time, price: current.value, text: high ? 'Bear' : 'Bull', color, textColor: '#ffffff', position: high ? 'above' : 'below' });
      }
      if (high) previousHigh = current;
      else previousLow = current;
    }
  }
  return { bullish, bearish, segments, labels };
}

export default {
  name: 'RSI — TradingView Style',
  overlay: false,
  precision: 2,
  legendInputs: ['length', 'maType', 'maLength'],
  description: 'Personal RSI from your TradingView code: green gradient above 70, red gradient below 30, purple background and selectable smoothing. Divergence is off by default. When enabled, Bull/Bear labels are drawn at a pivot only after five later candles confirm it; alerts fire on the confirmation candle.',
  inputs: [
    { key: 'length', label: 'RSI Length', type: 'int', default: 14, min: 1 },
    { key: 'source', label: 'Source', type: 'source', default: 'close' },
    { key: 'calculateDivergence', label: 'Calculate Divergence', type: 'select', default: 'Off', options: ['Off', 'On'] },
    { key: 'maType', label: 'Smoothing Type', type: 'select', default: 'SMA', options: ['None', 'SMA', 'SMA + Bollinger Bands', 'EMA', 'SMMA (RMA)', 'WMA', 'VWMA'] },
    { key: 'maLength', label: 'Smoothing Length', type: 'int', default: 14, min: 1 },
    { key: 'bbMult', label: 'BB StdDev (SMA + Bollinger Bands only)', type: 'float', default: 2, min: 0.001, max: 50 },
  ],
  outputs: [
    { key: 'value', label: 'RSI', color: '#7e57c2' },
    { key: 'ma', label: 'RSI-based MA', color: '#fdd835' },
    { key: 'bbUpper', label: 'Upper Bollinger Band', color: GREEN },
    { key: 'bbLower', label: 'Lower Bollinger Band', color: GREEN },
    { key: 'upper', label: 'RSI Upper Band (70)', color: '#787b86', legend: false },
    { key: 'middle', label: 'RSI Middle Band (50)', color: '#787b86', legend: false },
    { key: 'lower', label: 'RSI Lower Band (30)', color: '#787b86', legend: false },
    { key: 'bullish', label: 'Regular Bullish Divergence', hidden: true },
    { key: 'bearish', label: 'Regular Bearish Divergence', hidden: true },
  ],
  calc(bars, p, ta, context = {}) {
    for (const key of ['length', 'maLength']) if (!Number.isInteger(p[key]) || p[key] < 1) throw new Error(`${key} must be a whole number of at least 1`);
    if (!(p.bbMult >= 0.001 && p.bbMult <= 50)) throw new Error('BB StdDev must be between 0.001 and 50');
    const n = bars.length, blank = () => new Array(n).fill(NaN), constant = (value) => new Array(n).fill(value);
    const value = ta.rsi(ta.source(bars, p.source), p.length);
    const isBB = p.maType === 'SMA + Bollinger Bands';
    let ma;
    switch (p.maType) {
      case 'None': ma = blank(); break;
      case 'SMA': case 'SMA + Bollinger Bands': ma = ta.sma(value, p.maLength); break;
      case 'EMA': ma = pineEma(value, p.maLength); break;
      case 'SMMA (RMA)': ma = ta.rma(value, p.maLength); break;
      case 'WMA': ma = ta.wma(value, p.maLength); break;
      case 'VWMA': ma = ta.vwma(value, ta.source(bars, 'volume'), p.maLength); break;
      default: throw new Error('Unknown smoothing type');
    }
    const sd = isBB ? ta.stdev(value, p.maLength) : null;
    const bbUpper = isBB ? ma.map((v, i) => v + sd[i] * p.bbMult) : blank();
    const bbLower = isBB ? ma.map((v, i) => v - sd[i] * p.bbMult) : blank();
    const divergence = p.calculateDivergence === 'On'
      ? findDivergences(value, context.priceBars || bars)
      : { bullish: new Array(n).fill(0), bearish: new Array(n).fill(0), segments: [], labels: [] };
    const fills = [
      { from: 'upper', to: 'lower', color: 'rgba(126,87,194,0.1)' },
      { from: 'value', to: 'middle', gradient: { topValue: 100, bottomValue: 70, topColor: 'rgba(76,175,80,1)', bottomColor: 'rgba(76,175,80,0)' } },
      { from: 'value', to: 'middle', gradient: { topValue: 30, bottomValue: 0, topColor: 'rgba(242,54,69,0)', bottomColor: 'rgba(242,54,69,1)' } },
      ...(isBB ? [{ from: 'bbUpper', to: 'bbLower', color: 'rgba(76,175,80,0.1)' }] : []),
    ];
    return { value, ma, bbUpper, bbLower, upper: constant(70), middle: constant(50), lower: constant(30), bullish: divergence.bullish, bearish: divergence.bearish,
      fills, paneAnnotations: { segments: divergence.segments, labels: divergence.labels },
      plotStyles: { upper: { lineStyle: 'Dashed' }, middle: { lineStyle: 'Dashed', transparency: 50 }, lower: { lineStyle: 'Dashed' } } };
  },
};
