// Input is already sorted so an indicator's source is processed before its dependants.
export function indicatorPaneGroups(ordered, definitions, preferred = []) {
  const rootOf = new Map();
  for (const ind of ordered) {
    const def = definitions[ind.id]; if (!def) continue;
    const source = String(ind.params?.source || ''), parent = source.startsWith('ind:') ? source.split(':')[1] : null;
    const root = rootOf.has(parent) ? rootOf.get(parent) : def.overlay ? null : ind.uid;
    rootOf.set(ind.uid, root);
  }
  const roots = [...new Set([...rootOf.values()].filter(Boolean))];
  const order = [...new Set([...(Array.isArray(preferred) ? preferred.filter(uid => roots.includes(uid)) : []), ...roots])];
  const paneOf = Object.fromEntries([...rootOf].map(([uid, root]) => [uid, root ? order.indexOf(root) + 1 : 0]));
  return { paneOf, groups: order.map((root, index) => ({ root, index: index + 1, indicators: [...rootOf].filter(([, value]) => value === root).map(([uid]) => uid) })) };
}
export function movePaneOrder(groups, paneIndex, direction) {
  const order = groups.map(group => group.root), from = paneIndex - 1, to = from + direction;
  if (from >= 0 && from < order.length && to >= 0 && to < order.length) [order[from], order[to]] = [order[to], order[from]];
  return order;
}
