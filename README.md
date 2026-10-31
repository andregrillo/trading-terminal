# Trade Terminal

Your personal, locally running charting and research app, free to use with source
code included. Charts and indicators calculate on your computer, and public
providers supply market data and news. No account is needed for the public feeds.

The interface has no advertising or promotional panels. Help opens a page served
by this app. Software licences and required credits are included in the repository.

## Open and stop

On your Mac, double-click `start.command`, or run this inside the app folder:

```sh
node scripts/launch.js
```

The launcher opens your browser and starts the app in the background. It listens
on `0.0.0.0` and prints this computer's network addresses, so devices on the same
local network can open the app using one of those addresses. When
Tailscale is connected, it also prints the private address to open on your iPhone.
Keep the Mac awake and connected to Tailscale. Startup preserves other Tailscale
services on this computer. To stop the app and its Tailscale sharing route:

```sh
node scripts/stop.js
```

Use the addresses printed at startup: the local network port can differ from the
Tailscale port if that port is already in use. Startup updates this app's recorded
Tailscale route when its local port changes.

Run `node scripts/launch.js --no-tailscale` to use localhost and your local network
without Tailscale sharing. For access only on this computer, run
`HOST=127.0.0.1 node scripts/launch.js --no-tailscale` on Mac or Linux.
Devices that can reach the app share its saved charts and watchlists; there is no
separate app login.
Node.js 18 or later is required. There are no npm dependencies to install.

## On your iPhone

Open the local network address or private Tailscale address in Safari. The phone layout has just
**Watchlist** and **Chart** tabs. Tap a watchlist symbol to open its chart.
The pencil button opens the drawing tools; choosing a tool closes that drawer.
Timeframes, indicators and extra chart controls have their own bottom buttons.

In the ⋯ menu, **Invert chart** flips the price scale and every indicator pane,
including volume. **Restore chart direction** turns them back. This choice saves
per chart and returns after reopening the app; prices and calculations stay the same.

Double-tap the background of the price pane or an indicator pane to expand it.
Double-tap again, or tap the restore button at the top right, to bring back all
panes with their previous sizes. Double-tapping a drawing still opens its settings.
The Indicators menu has settings, visibility and up/down pane controls.

This layout applies only to small touch screens, including phone landscape.
Your Mac keeps its existing interface, even in a narrow browser window. A saved
multi-chart layout is shown one chart at a time on the phone; choose another from
the ⋯ menu. The desktop layout stays saved. The phone's asset-card size and
collapsed state are separate from the Mac's preferences.

Charts reconnect and fetch missed candles when you return to the page or regain
a connection. A silent or unavailable crypto stream falls back to polling through
the Mac. The watchlist checks every 5 seconds; chart polling checks every 3 seconds
for crypto and 10 seconds for other markets. Provider delays and cached candle
responses still apply (daily and longer candle responses can be cached for a minute).
Replay stays in its historical session when you return.
Live updates and background indicator refreshes preserve your pan, zoom, right-hand
spacing and manual indicator scales. New candles keep following the latest bar
while it is visible; scrolling back through history keeps that view in place.
Chart position, zoom, manual scales and pane sizes also save and return after a
page reload. Views are kept separately for each chart, symbol, timeframe and chart
type, with separate desktop and phone views. Temporary pane expansion and replay
do not replace your saved normal view.
Switching assets fits the new asset's price range, or restores that asset's own
saved scale; it does not carry over the previous asset's prices.

For calculated charts combining Binance USDT pairs, volume adds each asset's
exchange-reported traded value in USDT for matching candles. The chart labels it
**Combined volume · USDT**. This volume also feeds volume-based indicators on
that calculated chart. Ordinary single-asset volume keeps its original units.
If a fallback source lacks exact USDT turnover, the chart shows it as unavailable.

## Watchlists

On desktop, drag the watchlist column's left edge to make it wider or narrower.
The width saves automatically. Double-click the divider to reset it to the default.
Phone watchlists keep their full-screen layout.

Drag the dotted handle beside an asset to move it above or below another asset.
You can also click or tap the handle and choose its position, including the bottom
of the list. When sections are present, the same control can move assets between
sections. The order saves automatically and returns after reloading.

Use **+ Section** to create named groups within a watchlist. Drag symbols into a
section, use a row's move button, or add symbols using the + beside a heading.
Chevrons fold/unfold sections; the ⋯ menu renames, reorders or removes headings
while keeping the symbols. Section names, order and folded states save per list.

Click the flag beside any watchlist symbol to choose one of eight colours or clear
it. The Show menu filters the current list or displays automatic colour groups
across all lists. A symbol's flag follows it between lists and saves in the existing
`data/state.json` file. Option/Alt-Enter toggles the current chart symbol's flag.
On a phone, open the watchlist with the **Watchlist** tab at the bottom.

## Selected asset details

The card below the watchlist follows the active chart, with a sourced description,
quote and news. Cointelegraph, Decrypt and CoinDesk headlines refresh every two
minutes while the card and page are visible. Coin-specific and general crypto
headlines are labelled separately. The card can be resized or collapsed.

For a calculated chart such as ADAUSDT/BTCUSDT, news is looked up for each
underlying asset separately. Cards name the relevant asset; a shared story appears
once with both names. The preview makes room for news from both assets. If one
has no matching headlines or its news source is unavailable, the card says so.

## Drawing controls

The ruler is the first tool in the left toolbar. Select it and drag across the
chart, or click/tap two points, to measure price and percentage change, bars and
elapsed time. Measurements save automatically and can be edited like other drawings.

On desktop, double-click the background of the price pane or any indicator pane
to expand it within that chart. Double-click again, click **Restore all panes**,
or press Escape to return to the previous pane sizes and chart position. Other
charts in a multi-chart layout stay in place. Double-clicking a drawing still
opens its settings.

Select a drawing to move it or adjust its white handles. Double-click or double-tap
it for colours, line thickness, fills, text and precise coordinates. Lock one drawing
from its small toolbar, or lock all drawings from the left toolbar. Undo and redo
work with the left buttons and Command/Control-Z shortcuts. All 13 existing tools
support editing; your older saved drawings work too.

See [Drawing controls](docs/drawing-controls.md) for details.

## Your indicators

Each indicator's header appears inside its own pane. Its up/down buttons move the
whole pane, including indicators sharing its scale, and save the order per chart. The chevron beside the main
chart symbol shows or hides indicator headers across that chart's panes, keeping
the symbol and price information visible. The choice is saved for each chart.

Open an indicator's settings and find **Scale labels** to choose which values
get coloured tags on the right-hand scale. Each plotted value and reference level
has its own checkbox. These choices save with that indicator and work on both
Mac and iPhone, including expanded panes. Lines, fills and header values remain
visible. **Defaults** restores the indicator's original label choices.

The Custom group includes:

- Order Block Detector & Moving Averages, with a separate timeframe dropdown
  for SMA 200, EMA 50 and SMA 50.
- MACD-V Volatility Normalisation, with the original histogram colours and fills.
- RSI — TradingView Style, with gradients, smoothing options, Bollinger Bands
  and optional divergence signals.
- Slow Stochastic, with 14/3 defaults, fixed three-bar K smoothing, and green/red
  gradients at 80/20.

Their JavaScript files are in `custom/`. Their notes are in `docs/`.

## Saved work and market data

Charts, watchlists, alerts and paper trading are saved under `data/`. Back up
that folder and `custom/`. Public price feeds, calendars, news and company data
are fetched from their providers. Optional provider keys are not needed for the
public feeds. Charts and indicators calculate on this computer. Alerts require
this computer and the app to stay on.

The Strategy tester, quant checks, replay, screener, heatmap, seasonals,
financials, drawings and paper trading are available. The app does not place
real-money orders by itself.

## Check the app

```sh
node scripts/check.js
```

This runs the calculation/server tests, public-feed checks and live smoke tests.
The [code review](docs/code-review-2026-10-29.md) records the source, licences,
network behaviour and chart-file verification.

Keep a backup of your `data/` and `custom/` folders before updating.

## Licences and credits

- Application core: MIT, copyright 2026 Lewis Jackson. See `LICENSE` and `NOTICE`.
- Chart library: TradingView Lightweight Charts 5.2.1, Apache License 2.0.
  Its minified file matches the published package byte for byte.
- Order Block indicator: includes work by LuxAlgo under CC BY-NC-SA 4.0,
  which includes noncommercial and share-alike restrictions.
- Other converted scripts: source supplied by the user; their original authors'
  rights and any applicable original licences remain unchanged.

The chart library's public source is at
https://github.com/tradingview/lightweight-charts. Trade Terminal is independent
of TradingView. Market data providers have their own terms.
