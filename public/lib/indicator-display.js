// Display choices belong to an indicator instance, separate from its calculations.
export function indicatorScaleLabelVisible(indicator, output, paneIndex = 0) {
  if (output.hidden) return false;
  const saved = indicator.scaleLabels?.[output.key];
  // Preserve existing charts: oscillator values have tags, price overlays do not.
  return typeof saved === 'boolean' ? saved : paneIndex > 0;
}

export function indicatorLevelLabelVisible(indicator, level) {
  return indicator.levelScaleLabels?.[String(level)] === true;
}
