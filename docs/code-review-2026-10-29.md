# Trade Terminal: source and code review

Reviewed on 29 October 2026. This records the installed copy and the local
changes, rather than making a guarantee about every future release.

## Source and licences

The original application was downloaded from
`https://part-timequant.com/kit/quant-terminal.tar.gz`. It includes readable
JavaScript, HTML and CSS and an MIT licence naming Lewis Jackson. There is no
packaged native engine, encrypted application module or mandatory paid account
in the local application. The Rust and Python files are readable API examples,
not precompiled programs used by the app.

The chart library is a minified JavaScript build of the open-source TradingView
Lightweight Charts 5.2.1, under Apache License 2.0. Minified means compressed
for delivery, not closed source. Its public source is in
[TradingView's repository](https://github.com/tradingview/lightweight-charts).

The Order Block indicator includes LuxAlgo code under CC BY-NC-SA 4.0.
That source is present, but the licence restricts commercial use and requires
attribution and share alike. Consequently, it would be inaccurate to describe
every file in this customized folder as unrestricted MIT code. The other Pine
scripts were supplied by the user; this review does not establish additional
rights to redistribute those authors' work.

The paid PTQ engine is not included or installed. The original local API adapter
is ordinary JavaScript in `lib/ptq.js`; the promotional browser module and UI
entry points have been removed. Explicit calls to that adapter can still contact
a separately installed PTQ service, normally at 127.0.0.1:8787. Its licence
lookup reads PTQ's own local licence files only when that adapter is called.

## Chart file verified

The package metadata and tarball were fetched from the npm registry for the
official `lightweight-charts` package at version 5.2.1, without installing or
executing that package. The tarball's SHA-512 matched the registry integrity
value. The installed standalone production file matched the published file
byte for byte.

SHA-256 of both chart files:

```text
e21cc5caa0226ef30bd8549c50b9ef926615f2a4ee6b4e486353477a55f598cf
```

Package metadata: `https://registry.npmjs.org/lightweight-charts/5.2.1`.

## Network and local behaviour reviewed

- Browser scripts and styles are served from this app. Remote font loading was
  removed. The browser can connect directly to Binance's market-data streams.
- Server-side requests obtain prices, quotes and search results from Binance,
  Coinbase, Kraken, Nasdaq and Yahoo; calendar data from Forex Factory's public
  feed host; and news from Nasdaq, Cointelegraph and Decrypt. Optional Alpaca or
  Massive feeds are used only if the user adds their keys.
- Configured alert webhooks send messages to destinations the user supplies.
  They are a deliberate feature, not an invisible analytics upload.
- The inspected app code did not reveal an analytics SDK, hidden tracking
  request, chart/watchlist uploader, automatic code updater or subscription
  check required to use the local terminal.
- Charts, drawings, alerts, watchlists and paper trading state are stored as
  local files under `data/`.
- Network update, 30 October 2026: the launcher now binds the app to `0.0.0.0`
  for local network access, while retaining Tailscale Serve. The server accepts
  this computer's interface addresses and configured hostnames; writes still
  require the app header and a matching origin when one is supplied. Connected
  devices share saved state, and the app does not add a separate login page.
- Custom indicators execute JavaScript in the browser and in Node on this Mac.
  This is not an isolated scripting sandbox. Only add code you trust.

Public data providers are external services with their own code and policies;
they are not made open source by this application's licence. Market requests
necessarily reveal the requested symbol and the connection's address to the
provider. This review cannot audit those providers' servers.

## Changes made for this copy

- Product title, notifications, startup messages and local documentation now say
  Trade Terminal. The folder and internal compatibility identifier remain
  unchanged to preserve saved paths and stop/start detection.
- Removed the course/competition banner, its animation and hidden-for-a-week
  logic, the paid PTQ tab, strategy-result sales panels, tracking-marked sales
  URL and the promotional browser module.
- Removed Google Fonts loading and replaced the original external help link
  with local help. The original licence notices and chart attribution remain.
- Preserved saved data, indicator settings, Tailscale access, local strategy
  tests and quant checks.

This is a focused source inspection and behaviour check, not a formal security
audit or a promise that software cannot have bugs. Open source helps inspection;
it is not by itself a guarantee of safety.

## Verification results

- 248 automated calculation and server checks passed, followed by public data
  source checks and a live smoke test: READY.
- A fresh browser session through the private Tailscale address loaded all four
  custom indicators, including Slow Stochastic and its 80/20 gradients.
- The product title and help were local and correct. The banner and paid-product
  panels were absent, including after running a strategy and its quant checks.
- Browser request capture recorded 35 requests during that check. The only
  external browser host was `stream.binance.com` for live prices; no course,
  PTQ, external-font or tracking-marked request was recorded. This browser
  capture does not inspect the data providers' servers or replace the separate
  server-code review.
- No browser JavaScript exceptions occurred. Desktop and 390-pixel-wide phone
  layouts were checked.
- The server was confirmed listening on 127.0.0.1:3777; Tailscale access remained
  available. No provider keys or active alerts were configured in the health
  report at the time of review.
