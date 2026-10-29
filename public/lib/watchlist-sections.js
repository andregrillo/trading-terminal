// Watchlists remain flat symbol arrays for alerts, quotes and existing saved files.
// Sections store display grouping separately, scoped to the watchlist's name.
const listOf = (state, list) => state.watchlists?.[list] || [];
const uid = () => `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;

export function sectionGroups(state, list = state.activeWatchlist) {
  const symbols = listOf(state, list), valid = new Set(symbols), used = new Set(), ids = new Set();
  const sections = (state.watchlistSections?.[list] || []).filter((section) => {
    if (!section?.id || !section.name || ids.has(section.id)) return false;
    ids.add(section.id); return true;
  }).map((section) => ({
    id: section.id, name: section.name, collapsed: !!section.collapsed,
    symbols: (section.symbols || []).filter((symbol) => {
      if (!valid.has(symbol) || used.has(symbol)) return false;
      used.add(symbol); return true;
    }),
  }));
  return [{ id: '', name: '', collapsed: false, symbols: symbols.filter((symbol) => !used.has(symbol)) }, ...sections];
}

function save(state, list, groups) {
  state.watchlistSections = { ...state.watchlistSections, [list]: groups.filter((group) => group.id) };
  state.watchlists[list] = groups.flatMap((group) => group.symbols);
}
function nameOf(name) {
  const result = String(name || '').trim();
  if (!result || result.length > 80) throw new Error('Enter a section name between 1 and 80 characters.');
  return result;
}
function find(groups, id) {
  const group = groups.find((group) => group.id === id);
  if (!group) throw new Error('That section no longer exists.');
  return group;
}

export function addSection(state, list, name) {
  if (!Object.hasOwn(state.watchlists, list)) throw new Error('That watchlist no longer exists.');
  const groups = sectionGroups(state, list), section = { id: uid(), name: nameOf(name), collapsed: false, symbols: [] };
  groups.push(section); save(state, list, groups); return section.id;
}
export function renameSection(state, list, id, name) {
  const groups = sectionGroups(state, list); find(groups, id).name = nameOf(name); save(state, list, groups);
}
export function toggleSection(state, list, id) {
  const groups = sectionGroups(state, list), group = find(groups, id); group.collapsed = !group.collapsed; save(state, list, groups);
}
export function removeSection(state, list, id) {
  const groups = sectionGroups(state, list), index = groups.findIndex((group) => group.id === id);
  if (index <= 0) throw new Error('Choose a named section to remove.');
  // Removing a heading never removes its symbols. Keep them beside the preceding group.
  groups[index - 1].symbols.push(...groups[index].symbols);
  groups[index - 1].collapsed = false;
  groups.splice(index, 1); save(state, list, groups);
}
export function moveSymbol(state, list, symbol, id, beforeSymbol = null) {
  if (!listOf(state, list).includes(symbol)) throw new Error('That symbol is no longer in this watchlist.');
  const groups = sectionGroups(state, list), target = find(groups, id);
  if (symbol === beforeSymbol) return;
  for (const group of groups) group.symbols = group.symbols.filter((item) => item !== symbol);
  const index = target.symbols.indexOf(beforeSymbol);
  target.symbols.splice(index < 0 ? target.symbols.length : index, 0, symbol);
  target.collapsed = false; save(state, list, groups);
}
export function moveSection(state, list, id, direction) {
  const groups = sectionGroups(state, list), index = groups.findIndex((group) => group.id === id), next = index + direction;
  if (index <= 0 || next <= 0 || next >= groups.length) return;
  [groups[index], groups[next]] = [groups[next], groups[index]]; save(state, list, groups);
}
export function placeSectionBefore(state, list, id, targetId) {
  if (id === targetId) return;
  const groups = sectionGroups(state, list), group = find(groups, id);
  if (!id || !targetId) return;
  const remaining = groups.filter((item) => item.id !== id), index = remaining.findIndex((item) => item.id === targetId);
  if (index < 1) return;
  remaining.splice(index, 0, group); save(state, list, remaining);
}
export function forgetSectionSymbol(state, list, symbol) {
  const groups = sectionGroups(state, list);
  for (const group of groups) group.symbols = group.symbols.filter((item) => item !== symbol);
  save(state, list, groups);
}
