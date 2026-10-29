# RSI — TradingView Style

Personal conversion of the Pine Script v6 supplied by the user, installed as
`custom/rsi-tradingview-style.js` under **Indicators → Custom**.

It uses the supplied Wilder RSI formula and defaults: length 14, close as the
source, and SMA 14 smoothing. The purple RSI line, yellow smoothing line,
30/50/70 guide lines and faint purple background are included. The display
uses two decimal places.

The green gradient becomes visible above 70, becoming fully opaque at 100.
The red gradient becomes visible below 30, becoming fully opaque at zero.
Both use the original mask between RSI and 50. They are vertical gradients,
not fixed solid backgrounds. Pine v6's green, red and yellow colours are used.

All seven smoothing choices are available: None, SMA, SMA + Bollinger Bands,
EMA, SMMA (RMA), WMA and VWMA. The Bollinger mode includes both green bands
and their faint background, with the original 2.0 standard-deviation default.

**Calculate Divergence** is Off by default, matching the supplied script.
When enabled, regular bullish and bearish divergences are drawn in the RSI
panel with Bull/Bear labels and connecting lines. Pivots use five bars on
each side. A label is placed on a pivot only after the five bars on its right
have confirmed it; the alert signal is on that later confirmation bar.

The supplied `barssince(pivotFound[1])` range is preserved exactly: its 5..60
inclusive check means distances of 6..61 bars between consecutive pivots.
Alerts and strategy rules can use `bullish` or `bearish` greater than zero,
with Once per bar close for completed-bar signals. Importing the indicator
does not create active alerts.

The main numerical outputs retain the existing RSI keys `value` and `ma`.
This allows an existing chart's RSI instance and its source references to be
replaced without renaming those outputs. The built-in RSI is still available.

Custom fills now accept a `gradient` object with `topValue`, `bottomValue`,
`topColor` and `bottomColor`. Results may also provide `paneAnnotations`
with `segments` and `labels` that use the indicator panel's own scale.
Other indicators' flat fills work as before.
