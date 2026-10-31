// Lightweight Charts 5.2.1 exposes a price range in real prices for log scales,
// but its range setter consumes the stored log coordinates. Read those coordinates
// with a synchronous, temporary linear mode so restoring a manual log view is exact.
export function captureScaleView(scale) {
  const options = structuredClone(scale.options());
  let range = null;
  if (!options.autoScale) {
    if (options.mode === 1) scale.applyOptions({ mode: 0 });
    try { range = scale.getVisibleRange(); }
    finally { if (options.mode === 1) scale.applyOptions({ mode: 1 }); }
    if (!Number.isFinite(range?.from) || !Number.isFinite(range?.to)) range = null;
  }
  return { options, range };
}

export function restoreScaleView(scale, view) {
  scale.applyOptions(view.options);
  if (!view.options.autoScale && view.range) scale.setVisibleRange(view.range);
}
