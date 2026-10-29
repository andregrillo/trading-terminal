# Indicator headers

Indicator names, inputs, values and settings/show-hide/remove buttons now appear at the top of the pane containing that indicator. Price overlays stay on the main price pane. Indicators using another indicator as their source share that source's pane and header area.

The chevron beside the symbol in the main chart header hides or shows indicator headers across all the panes in that chart. The chart symbol, prices and plots stay visible. Each chart saves its own `indicatorHeadersCollapsed` choice in its existing configuration. Refreshing or changing indicators does not reset that choice.

Headers follow the chart library's actual pane rows using `IPaneApi.getHTMLElement()` and `ResizeObserver`, so pane separator drags and screen/layout resizing keep them aligned. `ChartLegends` cleans up its elements, observer and scheduled frame when its chart is destroyed. Empty panes are preserved for hidden, loading or failing indicators, so their controls remain available where expected. Phone headers put values on a separate line to leave room for the controls.

Reference: TradingView's [indicator legend show/hide control](https://www.tradingview.com/support/solutions/43000473925-indicator-titles-parameters-values-disappeared-from-the-legend-top-left-corner-of-the-chart/). Its current documentation describes a plus/minus control; this implementation uses the requested chevron.

Browser checks in a separate temporary data folder verified:

- Correct placement of all four custom indicators, including the price overlay.
- Crosshair values, settings buttons, hiding/restoring plots, indicator errors and indicators built on RSI.
- Header alignment after an actual separator drag and after removing an earlier indicator pane.
- Collapsing/restoring all indicator headers without hiding plots or the main symbol, including after a chart update and browser reload.
- Independent controls in multiple charts, chart cleanup, phone tapping, narrow-screen controls and no browser errors.

The normal `node scripts/check.js` also passed all 272 offline tests, public data-source checks and live smoke checks. The user's saved charts and drawings were unchanged by the checks.

## Moving indicator panes

Up/down arrows now sit beside Settings, Show/hide and Remove in each separate indicator pane's header. They appear on hover or keyboard focus, and remain visible on touch screens. Boundary arrows are disabled. Price overlays stay on the main price chart.

`indicatorPaneOrder` stores the separate panes' root indicator IDs per chart. Derived indicators share their source pane and move with it. Removed IDs are ignored and newly added panes append. Computing indicators still follows dependency order, independently of their display order. Moving panes preserves the visible time range and runtime pane heights; subsequent live renders also preserve those heights.

Six model tests and browser mouse/touch checks verify ordering, dependencies, boundaries, chart series placement, unchanged parameters/zoom, resized heights, reloads and adding/removing panes.
