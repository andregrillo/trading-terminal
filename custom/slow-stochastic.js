// Converted from the user's Slow Stochastic Pine script.
// K = SMA(stoch(close, high, low, smoothK), 3); D = SMA(K, smoothD).
// Added RSI-style gradients above 80 and below 20 at the user's request.

// Pine SMA ignores missing samples, including a stoch value with zero range.
export function pineSma(values, length) {
  const samples = new Array(length), out = new Array(values.length).fill(NaN);
  let count = 0, sum = 0;
  for (let i = 0; i < values.length; i++) {
    if (Number.isFinite(values[i])) {
      const slot = count % length;
      if (count >= length) sum -= samples[slot];
      samples[slot] = values[i]; sum += values[i]; count++;
    }
    if (count >= length) out[i] = sum / length;
  }
  return out;
}

export default {
  name: 'Slow Stochastic',
  overlay: false,
  precision: 2,
  legendInputs: ['smoothK', 'smoothD'],
  description: 'Your Slow Stochastic: 14-bar high/low range, fixed 3-bar smoothing for K, and a 3-bar SMA for D by default. RSI-style green shading above 80 and red shading below 20 follow K. The original black K line becomes light on a dark background for readability. Each line has its own thickness setting; both colours can be changed below.',
  inputs: [
    { key: 'smoothK', label: 'Stochastic Length', type: 'int', default: 14, min: 1 },
    { key: 'smoothD', label: 'D Smoothing Length', type: 'int', default: 3, min: 1 },
    { key: 'k_width', label: '%K line thickness', type: 'select', default: '2', options: ['1', '2', '3', '4'] },
    { key: 'd_width', label: '%D line thickness', type: 'select', default: '1', options: ['1', '2', '3', '4'] },
  ],
  outputs: [
    { key: 'k', label: '%K', color: '#000000', themeColors: { light: '#000000', dark: '#d1d4dc' }, lineWidth: 2 },
    { key: 'd', label: '%D', color: '#ff0000' },
    { key: 'upper', label: 'Overbought (80)', color: '#787b86', legend: false },
    { key: 'lower', label: 'Oversold (20)', color: '#787b86', legend: false },
    { key: 'middle', label: 'Gradient mask (50)', hidden: true },
  ],
  calc(bars, p) {
    for (const key of ['smoothK', 'smoothD']) if (!Number.isInteger(p[key]) || p[key] < 1) throw new Error(`${key} must be a whole number of at least 1`);
    for (const key of ['k_width', 'd_width']) if (![1, 2, 3, 4].includes(Number(p[key]))) throw new Error('Line thickness must be 1, 2, 3 or 4.');
    const raw = bars.map((bar, i) => {
      let high = -Infinity, low = Infinity;
      for (let j = Math.max(0, i - p.smoothK + 1); j <= i; j++) {
        if (Number.isFinite(bars[j].high)) high = Math.max(high, bars[j].high);
        if (Number.isFinite(bars[j].low)) low = Math.min(low, bars[j].low);
      }
      const range = high - low;
      return range > 0 && Number.isFinite(range) && Number.isFinite(bar.close) ? 100 * (bar.close - low) / range : NaN;
    });
    const k = pineSma(raw, 3), d = pineSma(k, p.smoothD);
    const constant = (value) => new Array(bars.length).fill(value);
    return {
      k, d, raw, upper: constant(80), lower: constant(20), middle: constant(50),
      plotStyles: { k: { lineWidth: Number(p.k_width) }, d: { lineWidth: Number(p.d_width) }, upper: { lineStyle: 'Dashed' }, lower: { lineStyle: 'Dashed' } },
      fills: [
        { from: 'upper', to: 'lower', color: 'rgba(156,39,176,0.05)' },
        { from: 'k', to: 'middle', gradient: { topValue: 100, bottomValue: 80, topColor: 'rgba(76,175,80,1)', bottomColor: 'rgba(76,175,80,0)' } },
        { from: 'k', to: 'middle', gradient: { topValue: 20, bottomValue: 0, topColor: 'rgba(242,54,69,0)', bottomColor: 'rgba(242,54,69,1)' } },
      ],
    };
  },
};
