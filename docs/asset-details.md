# Selected asset details and news

The bottom of the watchlist side panel now has a separate, scrollable asset card. It follows the active chart, including symbols outside the watchlist and activation of another chart in a layout. The card shows the ticker, name, type, quote currency, current quote, daily/24h change, a short description and recent news. The divider above it resizes the split; the chevron collapses it. Height and collapsed state save in the existing settings. Other side tabs use the full side panel.

`/api/asset` supplies metadata. Known crypto identities use CoinGecko's public coin-by-ID endpoint; Nasdaq supplies US company profiles and fund names. Forex, calculated charts, local imports and unrecognised assets receive generic descriptions. Descriptions are bounded plain text with attribution links. Profiles are cached for six hours when successful; temporary failures can retry rather than holding a failed response for six hours. No account, API key or extra dependency is required.

## News

The sources are public RSS feeds from [Cointelegraph](https://cointelegraph.com/rss), [Decrypt](https://decrypt.co/feed) and [CoinDesk](https://www.coindesk.com/arc/outboundfeeds/rss/). The backend reads the feeds in parallel and caches the merged result for a minute. Source availability is recorded; one blocked publisher does not discard the others. Duplicate headlines/URLs, unsafe link protocols, tracking parameters and explicitly labelled sponsored or press-release items are removed.

The card checks `/api/news` every two minutes while open and visible. Headlines matching the selected coin are preferred, even if there is only one match. A clearly labelled general crypto feed is used when none match. The first story is highlighted with a short published summary, source and timestamp. Links open the original article. No generated market claims or AI summaries are added. More news opens the existing full News tab. This is periodic feed refresh, not an instant push or operating-system notification service.

Quotes refresh every 15 seconds and also receive chart/watchlist price events. The Binance ticker labels rolling 24h change; Nasdaq labels day change; the candle fallback labels daily close change. The panel does not infer stock-market open/closed status from a clock or claim every quote is streaming. A symbol/request revision guard prevents an older symbol's response replacing the current card. Feed failures keep the previous stories, without stopping quotes or charts.

Reference: [CoinGecko coin data documentation](https://docs.coingecko.com/reference/coins-id), [CoinDesk's RSS announcement](https://www.coindesk.com/coindesk-news/2021/09/17/coindesk-rss). Actual keyless requests confirmed that all three crypto feeds and the Bitcoin/Nasdaq metadata sources were reachable during implementation.

## Validation

Model/API tests cover identities and currencies, safe text/URLs, metadata recovery, RSS parsing, publisher failures, duplicates, promotion filtering and relevance/fallback labels. Browser tests use an isolated data folder and explicitly labelled mock news to verify live quote updates, symbol/layout switching, late replies, the refresh schedule, outages, resize/collapse persistence and phone touch controls. Live source checks run separately from those fixtures.
