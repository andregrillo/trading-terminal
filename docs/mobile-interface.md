# Phone interface

The phone shell activates only when the screen is at most 1024 CSS pixels wide,
has no hover input, and has a coarse primary pointer. Width alone does not enable
it. `public/css/app.css` is unchanged; phone styles live in `mobile.css`. Phone
controls are created only while this mode is active and removed when it ends.

Watchlist and Chart are the two navigation tabs. Chart tools provide symbol search,
timeframes, the drawing drawer, indicators and an extra-controls menu. Desktop
research tabs remain available on the desktop interface. The phone displays only
the active chart from a saved grid, without changing that grid's configuration.

Pane expansion is temporary presentation state. It preserves pane identities,
stretch factors, chart zoom, series visibility and the main price-scale options.
Indicator dependencies are still calculated while other panes are hidden. Restoring
the panes or leaving phone mode restores their previous arrangement. No saved chart
configuration is rewritten to expand a pane. Phone asset-card sizing is also kept
separate from saved desktop preferences.

Two short taps on a pane's plot background expand/restore it. Drawings retain their
own editing gestures. Axis taps, pane dividers, dragging, long presses, drawing mode
and pinching do not trigger expansion. A restore button offers a second way back.

## Validation on 2026-10-29

- Pre-change source committed as `7c63ff4` before implementation.
- Before/after Mac screenshots matched byte for byte with identical fixture data
  and zoom: 1600×1000 and 800×1000 in dark mode, and 1600×1000 in light mode with
  indicator headers expanded.
- Chrome touch emulation checked 414×896 portrait and 852×393 landscape, all four
  saved indicator/price panes, restoration after repeated renders, zoom, settings,
  drawing edits, watchlist navigation, timeframes and pane reordering.
- A four-chart saved grid remained intact when entering and leaving phone mode.
- Automated tests cover desktop gating, stable pane identity, snapshot restoration,
  gesture hit testing and independent phone/desktop asset-card preferences.

These browser checks use Chrome emulation. Physical iPhone Safari and its browser
bars should also be checked on the user's device. The layout uses dynamic viewport
height and safe-area insets for Safari's available screen area.
