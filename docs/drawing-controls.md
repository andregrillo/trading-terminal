# Editing drawings

All 13 drawing tools support selection, moving, editing and locking. Existing saved drawings work without conversion.

- Use the cursor tool. Click or tap a drawing to select it.
- Drag its body to move it. Drag a white handle to change its points. Rectangles have four corner handles. Parallel channels have a third point to change their width. Position drawings have entry, stop, target and width handles.
- Double-click or double-tap a drawing to open its settings. You can also use the gear button beside the selected drawing, right-click it, or press Enter while it is selected.
- Settings have Style, Text and Coordinates tabs. Change colours, thickness, solid/dashed/dotted lines, opacity, fills, text and precise prices/times. Applicable tools also offer line extensions, Fib levels or reward/risk. Coordinate times are in UTC.
- Use the small lock beside a selected drawing to keep it fixed. The lock on the left toolbar locks every drawing. Locked drawings remain selectable, and dragging over one pans the chart. A global lock must be turned off separately from an individual lock.
- Duplicate and delete are on the selected drawing's toolbar. Undo and redo buttons are on the left. On Mac, use Command-Z and Command-Shift-Z; on Windows use Control-Z, Control-Shift-Z or Control-Y. History is separate for each symbol and lasts for the current browser session, up to 100 edits.
- Escape cancels a drag before saving it. Apply commits settings; Cancel leaves them as they were. Holding Shift while dragging constrains movement, snaps line angles to 45° steps, or makes rectangles square on screen.

Drawings and all their settings save in the existing `data` folder and synchronize across charts showing the same symbol. Mouse and touch controls use the same saved points. Public market data and the underlying chart remain the existing app's implementation.

## Quick actions at a level

Move the crosshair over a chart or indicator pane, then use the **+** beside its
right-hand scale. The menu stays at that level and keeps both dashed guides visible.
Choose **Draw horizontal line** or **Add alert at this level**. Alert creation opens
the existing alert window with the selected value filled in for review.

Price lines use the normal drawing tools. Indicator horizontal lines save with the
chart and follow their indicator pane when it moves. Use **Edit horizontal lines…**
in that pane's + menu to change a level, colour, thickness or style, or delete it.
Clearing all drawings also clears these indicator lines.

Indicator alerts copy the indicator's current parameters and use its timeframe.
The output can be changed in the alert window. Indicators calculated from another
indicator's output do not support quick alerts yet; the app explains this instead
of creating a condition based on a different source. Inverted scales and expanded
panes on desktop and phone use the same underlying level values.

## References and scope

The interaction design follows TradingView's public documentation, including [rectangle style, text and coordinate settings](https://www.tradingview.com/support/solutions/43000516984-rectangle-drawing-tool/) and [drawing shortcuts](https://www.tradingview.com/charting-library-docs/latest/configuration/Shortcuts/). This is a local implementation for Trade Terminal's existing tools. It does not add TradingView's full drawing catalogue or proprietary charting code.

## Validation

`node --test test/drawings.test.js` checks geometry and movement for every tool, lock hit testing, rectangle/channel/position handles, logarithmic prices, Shift constraints, full-state snapshots and undo/redo. The standard `node scripts/check.js` includes these checks.

Chrome browser checks used a separate temporary data folder. Actual mouse and emulated phone touch events verified moving, resizing, individual/global locks while panning, double-click/tap settings, applying and cancelling settings, duplication, deletion, undo/redo, persistence after reload and a phone-sized settings window. The user's saved state was not used for those edits.
