// Converted from the Pine Script v5 supplied by the user.
// MACD-V = 100 * (EMA(source, fast) - EMA(source, slow)) / ATR(atrLength).

// Pine EMA seeds at the first finite sample and skips missing samples. In
// particular, the signal starts at the first MACD-V value after ATR warms up.
export function pineEma(values, length) {
  const alpha = 2 / (length + 1);
  let value = NaN;
  return values.map((sample) => {
    if (Number.isFinite(sample)) value = Number.isFinite(value) ? alpha * sample + (1 - alpha) * value : sample;
    return value;
  });
}

export function histogramColors(hist, p) {
  return hist.map((value, i) => value >= 0
    ? (hist[i - 1] < value ? p.col_grow_above : p.col_fall_above)
    : (hist[i - 1] < value ? p.col_grow_below : p.col_fall_below));
}

export default {
  name: 'MACD-V Volatility Normalisation',
  overlay: false,
  legendInputs: ['fast_len', 'slow_len', 'signal_len', 'atr_len'],
  description: 'The difference between the fast and slow EMAs, divided by Wilder ATR and multiplied by 100. The ATR length is usually kept equal to the slow length. Includes the original four histogram colours, editable bounds and all seven shaded fills.',
  inputs: [
    { key: 'fast_len', label: 'MACD Fast Length', type: 'int', default: 12, min: 1 },
    { key: 'slow_len', label: 'MACD Slow Length', type: 'int', default: 26, min: 1 },
    { key: 'source', label: 'Source', type: 'source', default: 'close' },
    { key: 'signal_len', label: 'Signal Line Smoothing Length', type: 'int', default: 9, min: 1 },
    { key: 'atr_len', label: 'ATR Length', type: 'int', default: 26, min: 1 },
    { key: 'overbought_bounds', label: 'Overbought Bounds', type: 'int', default: 150, min: 1 },
    { key: 'oversold_bounds', label: 'Oversold Bounds', type: 'int', default: -150, max: -1 },
    { key: 'rally_bounds', label: 'Rally Bounds', type: 'int', default: 50, min: 1 },
    { key: 'rebound_bounds', label: 'Rebound Bounds', type: 'int', default: -50, max: -1 },
    { key: 'col_grow_above', label: 'Histogram: Above Grow', type: 'color', default: '#26a69a' },
    { key: 'col_fall_above', label: 'Histogram: Above Fall', type: 'color', default: '#b2dfdb' },
    { key: 'col_grow_below', label: 'Histogram: Below Grow', type: 'color', default: '#ffcdd2' },
    { key: 'col_fall_below', label: 'Histogram: Below Fall', type: 'color', default: '#ff5252' },
  ],
  outputs: [
    { key: 'macd', label: 'MACD Line', color: '#2962ff' },
    { key: 'signal', label: 'Signal Line', color: '#ff6d00' },
    { key: 'hist', label: 'Histogram', kind: 'histogram', color: '#26a69a' },
    { key: 'overbought', label: 'Overbought Bounds', color: '#4caf50', legend: false },
    { key: 'oversold', label: 'Oversold Bounds', color: '#ff5252', legend: false },
    { key: 'rally', label: 'Rally Bounds', color: '#4caf50', legend: false },
    { key: 'rebound', label: 'Rebound Bounds', color: '#ff5252', legend: false },
  ],
  calc(bars, p, ta, context = {}) {
    for (const key of ['fast_len', 'slow_len', 'signal_len', 'atr_len']) {
      if (!Number.isInteger(p[key]) || p[key] < 1) throw new Error(`${key} must be a whole number of at least 1`);
    }
    const source = ta.source(bars, p.source);
    const fast = pineEma(source, p.fast_len), slow = pineEma(source, p.slow_len);
    // Choosing a different source changes the EMAs, not the instrument's true range.
    const atr = ta.atr(context.priceBars || bars, p.atr_len);
    const macd = fast.map((value, i) => atr[i] > 0 && Number.isFinite(atr[i]) ? (value - slow[i]) / atr[i] * 100 : NaN);
    const signal = pineEma(macd, p.signal_len);
    const hist = macd.map((value, i) => value - signal[i]);
    const constant = (value) => new Array(bars.length).fill(value);
    const plotStyles = Object.fromEntries(['overbought', 'oversold', 'rally', 'rebound'].map((key) => [key, { transparency: 30 }]));
    // Pine v5 named colours, with the exact transparencies in the supplied script.
    const fills = [
      { from: 'rally', to: 'rebound', color: 'rgba(255,235,59,0.35)' },
      { from: 'overbought', to: 'rally', color: 'rgba(76,175,80,0.35)' },
      { from: 'oversold', to: 'rebound', color: 'rgba(255,82,82,0.35)' },
      { from: 'macd', to: 'rally', where: 'above', color: 'rgba(76,175,80,0.7)' },
      { from: 'macd', to: 'rebound', where: 'below', color: 'rgba(255,82,82,0.7)' },
      { from: 'macd', to: 'overbought', where: 'above', color: 'rgba(54,58,69,0.7)' },
      { from: 'macd', to: 'oversold', where: 'below', color: 'rgba(54,58,69,0.7)' },
    ];
    return { macd, signal, hist, overbought: constant(p.overbought_bounds), oversold: constant(p.oversold_bounds), rally: constant(p.rally_bounds), rebound: constant(p.rebound_bounds), colors: histogramColors(hist, p), plotStyles, fills };
  },
};
