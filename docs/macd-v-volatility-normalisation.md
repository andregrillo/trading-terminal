# MACD-V Volatility Normalisation

Converted from the Pine Script v5 supplied by the user. The name is unchanged.
Find it under **Indicators → Custom**. Its source file is
`custom/macd-v-volatility-normalisation.js`.

The indicator has its own panel. It calculates
`100 × (EMA(source, fast) − EMA(source, slow)) / ATR(atr length)`, then an EMA
signal and the difference between MACD-V and that signal as a histogram.
Defaults remain 12, 26, 9 and 26. The EMA starts at its first finite sample,
as in Pine; ATR uses Wilder smoothing and includes price gaps. No MACD-V value
is produced before ATR has enough samples, or when ATR is zero.

All four histogram colours are preserved. Above zero, a rising value is teal
and a falling or equal value is pale teal. Below zero, a rising value is pale
red and a falling or equal value is red. The first valid histogram value is
zero and uses pale teal because no previous histogram value exists.

The four threshold lines default to +150, −150, +50 and −50 and can be changed
in settings. The three background bands and four conditional fills are kept,
including Pine v5's green, red, yellow and dark grey (`color.black`) colours and
the original transparencies. The app draws fills in the indicator's panel
below its lines and histogram, with clipping at threshold crossings.

MACD and signal colours are in the settings' **Colours** section. The four
histogram colour pickers are separate inputs, as in the supplied Pine script.
Changing the source affects the EMAs; ATR continues to use the instrument's
price candles. `macd`, `signal`, `hist`, `overbought`, `oversold`, `rally` and
`rebound` are available to alerts and strategy rules. No active alerts are
created automatically; the supplied script did not declare alert conditions.

The formulas use no future candles and work with replay. Public data, candle
history length and trading sessions can differ from TradingView, so values
need not match another feed exactly.

Custom calculation results can now return `fills`, an ordered list of
`{ from: outputKey, to: outputKey, color, where?: 'above' | 'below' }`.
The optional `where` applies only where `from` is above or below `to`.
Outputs may set `legend: false` to omit constant levels from the legend while
leaving them plotted and available to rules. Existing indicator formats work
unchanged.
