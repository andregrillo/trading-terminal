# Order Block Detector & Moving Averages

Converted from the Pine Script v6 supplied by the user. It remains one combined
indicator, named **Order Block Detector & Moving Averages**, under **Custom**.
The file is `custom/order-blocks-moving-averages.js`.

Original order-block work © LuxAlgo. This JavaScript adaptation is provided under
the same [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)
terms: attribution, noncommercial use, and share alike.

## Included

- Volume pivot confirmation after the selected number of bars. The block starts
  at the original pivot candle; the signal occurs later, when it is confirmed.
- Bullish and bearish half-candle zones extending to the right, with selectable
  fill colours, border colours, average lines, line styles and line width.
- The newest surviving blocks (three per side by default). A strict breach of
  the block removes it using the chosen Wick or Close rule. Touching the edge
  alone does not remove it. All breached blocks are removed, including multiple
  blocks crossed on the same bar; old drawing objects are not left behind.
- SMA 200, EMA 50 and SMA 50 each have their own independent timeframe dropdown.
  Choices range from 1 minute through hours, daily, weekly and monthly candles.
  The numbers 200 and 50 count bars in each average's selected timeframe.
  Their defaults are daily, matching the initial import.
- Each moving average also has its own **line thickness** dropdown, from 1 to 4.
  Defaults stay at 2 for all three. These settings are separate from the existing
  block average line width and do not change calculations, colours or timeframes.
- The original white, teal and orange average lines, transparency controls,
  visibility switches and average price labels. Colours for average lines are
  in the settings' Colours section. Labels are kept within the visible chart;
  when there is room they sit 17 bars to the right of the newest candle.
- SMA 200's style setting is applied. The supplied Pine declares that setting
  but does not actually pass it to its plot.

## Historical averages and replay

The original uses `request.security(..., lookahead = barmerge.lookahead_on)`
without a previous-bar offset. On historical intraday charts, it can show the
final daily or weekly average before that day or week has finished. Such values
can change after a reload and must not be used as evidence of an earlier signal.
See [TradingView's explanation](https://www.tradingview.com/pine-script-docs/concepts/other-timeframes-and-data/#lookahead).

The **Average history** setting defaults to **Match TradingView** to preserve
that historical appearance. **Confirmed only** uses the previous finished daily
or weekly period on smaller chart timeframes. When the average and chart use the
same timeframe, the value belongs to that chart candle without an extra delay.

Replay, alerts, screening rules, strategy testing and quant checks always use
confirmed periods. They do not read future daily or weekly closes, even if the
chart display setting says Match TradingView. The block signals themselves are
always evaluated at the pivot's confirmation bar, without a backwards shift.

Daily averages on historical weekly/monthly charts use the first available
daily candle in the chart candle for Pine-compatible display. Confirmed mode
uses the last available daily candle instead.

The app loads separate candle histories for each selected timeframe, and labels
each average with that timeframe. For example, weekly SMA 200, daily EMA 50 and
4-hour SMA 50 can be used together while order blocks follow the chart's own
timeframe. Disabling an average avoids requesting its data. The old shared
daily/weekly setting is migrated for existing charts, alerts and strategies:
weekly EMA/SMA 50 stay weekly, SMA 200 stays daily, and explicitly selected new
timeframes take precedence. Your colours and other settings are preserved.

Some public feeds may have insufficient history for a long average in the
selected timeframe; those unavailable values remain blank. Data availability, exchange
sessions, candle timestamps and the public provider may differ from TradingView,
so exact values or the latest provisional block can differ. A chart type that
transforms candle prices also transforms the order-block input prices. This is
a conversion of the supplied formulas, not a native Pine interpreter.

## Alerts

The following outputs are available in alert and strategy conditions but hidden
from the price plot, so their 0/1 values do not squash the chart's price scale:

| Output | Signal |
|---|---|
| `bullFormed` | Bullish OB Formed |
| `bearFormed` | Bearish OB Formed |
| `bullMitigated` | Bullish OB Mitigated |
| `bearMitigated` | Bearish OB Mitigated |

Choose the indicator and signal, compare it to **greater than 0**, and select
**Once per bar close** for signals from finished candles. These are available
conditions; importing the indicator does not create active alerts automatically.

`bullOb` and `bearOb` contain a new block's price on its confirmation bar. The
averages are available as `sma200`, `ema50` and `sma50`.

## App support added for this conversion

Custom indicators may declare `timeframes(params)`, `fixedTimeframes` and
`description`, accept a fourth `calc` argument containing `timeframe`,
`timeframes`, `causal` and `realtime`, use six-digit hex `color` inputs and mark
outputs `hidden: true`. Chart results may include `rectangles`, `priceLabels`
and per-output `plotStyles`. The indicator editor and server validate the same
file, and Node and browser imports can share `../public/lib/` paths.

`loadIndicatorContext` obtains extra histories for charts, alerts, screening,
backtests and quant checks. The original indicator format still works unchanged.

These are local changes. Reinstalling the downloaded app over this folder can
replace the app support files; keep a copy of this folder before updating.
