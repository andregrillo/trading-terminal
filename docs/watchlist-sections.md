# Watchlist sections

Use **+ Section** beside the add-symbol field to create a named section in the current custom watchlist. Existing saved lists keep their symbols and order until you organize them.

- Use the chevron on a heading to fold or unfold its rows.
- The heading's + adds a new symbol directly into that section. Entering an existing symbol moves it there without adding a duplicate.
- A row's move button offers every section, including the ungrouped top of the list. This works on phones as well as desktop.
- Desktop dragging moves symbols onto headings or before other rows. Drag headings to change their order. A temporary drop area also accepts symbols outside sections.
- The heading's ⋯ menu renames it, moves it up/down, or removes the heading. Removing a heading keeps its symbols beside the preceding group, or at the top if it was the first section.

Sections have independent IDs, names, membership, order and collapsed states in `state.watchlistSections[watchlistName]`. The original `watchlists` values remain arrays of symbol strings, so alerts, calendars, flags and quote requests retain their existing format. Folding a section does not remove its symbols from data requests or watchlist alerts. Removing an individual symbol clears its old section membership, preventing it from silently returning there on re-addition. Removing a custom watchlist clears its section metadata.

Current-list flag filters preserve matching sections. Global flag colour groups remain independent, so their rows have no section actions. New sections cannot be created while displaying a global flag group.

The chart canvas now forms its own stacking context. This keeps the chart engine's resize handles below side panels and dialogs; phone interaction checks found that a resize handle could otherwise intercept a watchlist tap at the same height.

Validation used a separate temporary data directory. Eight model tests cover compatibility with existing lists, moving/reordering, duplicate prevention, saved states, heading removal, symbol removal and invalid operations. Browser checks cover create/rename/reorder/delete, adding existing/new symbols, folds through quote refreshes, flag filters, list independence, JSON reloads, phone touch controls and narrow dialogs. A real desktop mouse drag with Chrome's native drag/drop path also passed. Regression checks cover the previous colour flags and indicator-pane headers. The complete app check passed 286 tests, source checks and live smoke checks.
