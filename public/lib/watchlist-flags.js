export const FLAG_COLORS = [
  { id: 'red', name: 'Red', color: '#f23645' },
  { id: 'orange', name: 'Orange', color: '#ff9800' },
  { id: 'yellow', name: 'Yellow', color: '#fdd835' },
  { id: 'green', name: 'Green', color: '#089981' },
  { id: 'cyan', name: 'Cyan', color: '#00bcd4' },
  { id: 'blue', name: 'Blue', color: '#2962ff' },
  { id: 'purple', name: 'Purple', color: '#9c6ade' },
  { id: 'pink', name: 'Pink', color: '#ec407a' },
];

export const flagColor = (flags, symbol) => Object.hasOwn(flags || {}, symbol)
  ? FLAG_COLORS.find((color) => color.id === flags[symbol]) || null : null;

export function setFlag(state, symbol, color) {
  if (!symbol || typeof symbol !== 'string') throw new Error('Choose a symbol first.');
  if (color !== null && !FLAG_COLORS.some((entry) => entry.id === color)) throw new Error('Choose a flag colour from the palette.');
  const previous = flagColor(state.symbolFlags, symbol)?.id || null;
  if (previous === color) return false;
  state.symbolFlags = { ...state.symbolFlags };
  if (color === null) delete state.symbolFlags[symbol];
  else state.symbolFlags[symbol] = color;
  return true;
}

export function watchlistSymbols(state) {
  const flags = state.symbolFlags, view = state.watchlistFlagView || 'all';
  if (view.startsWith('flags:')) {
    const color = view.slice(6);
    return Object.keys(flags || {}).filter((symbol) => {
      const flag = flagColor(flags, symbol);
      return flag && (color === 'any' || flag.id === color);
    });
  }
  const list = state.watchlists[state.activeWatchlist] || [];
  if (view === 'flagged') return list.filter((symbol) => flagColor(flags, symbol));
  if (view === 'unflagged') return list.filter((symbol) => !flagColor(flags, symbol));
  return list;
}
