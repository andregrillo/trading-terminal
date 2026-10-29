# Watchlist flags

The watchlist now has one coloured flag per fully qualified symbol. Eight colours are available. Clicking/tapping a flag or right-clicking a row opens the palette; No flag clears it. Flag changes do not select a different chart symbol.

The Show menu supports all, flagged and unflagged symbols in the current watchlist. Its colour groups collect flagged symbols across all lists, including symbols since removed from a custom list. Adding a symbol while viewing a colour group applies that colour. Removing it there clears its flag and leaves custom watchlists unchanged. The list deletion button is disabled while displaying a global flag group.

`symbolFlags` and `watchlistFlagView` are saved with existing app state. Custom watchlists retain their existing array format, so watchlist alerts and calendars keep working. The palette remembers the last used colour in settings. Option/Alt-Enter toggles that colour on the current chart symbol, outside text inputs or modals.

Keyboard controls: arrows move through palette buttons, Home/End move to the first/last button, Enter/Space apply and Escape cancels. The menu stays usable while quotes refresh. On narrow screens a list button in the left toolbar opens the existing side panel, which can be closed independently of the palette.

References: TradingView's [original flagged symbols](https://www.tradingview.com/blog/en/introducing-flagged-symbols-7443/) and [colour groups and last-colour shortcut](https://www.tradingview.com/blog/en/flagged-lists-improved-9521/). These describe the interaction model; this local implementation has its own palette and Show menu. It does not add TradingView screener integration or bulk selection.

Validation: six model tests cover cross-list identity, colour replacement and clearing, watchlist-preserving filters, global groups, JSON persistence and invalid colours. Actual browser mouse/keyboard and emulated phone touch checks cover every colour, palette cancellation, quote refreshes, filter/list semantics, reload persistence, the shortcut, symbol selection, phone panel access and layout. Checks ran in a separate temporary data folder. The normal check command passed all 278 offline tests and the data/live smoke checks.
