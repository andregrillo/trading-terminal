// Extra source timeframes for compound custom indicators, shared by charts and server tools.
import { BY_ID, defaults } from './indicators.js';
import { parseTf } from './series.js';

export function requiredTimeframes(indicators = {}) {
  const frames = new Set();
  for (const ind of Object.values(indicators)) {
    const def = BY_ID[ind.id];
    if (typeof def?.timeframes === 'function') {
      const params = typeof def.migrateParams === 'function' ? def.migrateParams(ind.params || {}) : ind.params;
      for (const tf of def.timeframes({ ...defaults(ind.id), ...params })) { parseTf(tf); frames.add(tf); }
    }
  }
  return [...frames];
}

export async function loadIndicatorContext(indicators, { symbol, timeframe, bars, fetchCandles, causal = true }) {
  const timeframes = { [timeframe]: bars };
  await Promise.all(requiredTimeframes(indicators).filter((tf) => tf !== timeframe).map(async (tf) => {
    const span = bars.length ? bars.at(-1).time - bars[0].time : 0;
    const limit = Math.min(10000, Math.max(2000, Math.ceil(span / parseTf(tf).seconds) + 250));
    const r = await fetchCandles(symbol, tf, limit);
    timeframes[tf] = r.candles;
  }));
  return { timeframe, timeframes, causal };
}
