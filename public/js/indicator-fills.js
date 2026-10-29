// Fill between two indicator plots in their own pane, below the plotted lines.
// Returns the fraction of a bar-to-bar segment on the requested side of a bound.
export function fillInterval(a0, b0, a1, b1, where) {
  if (![a0, b0, a1, b1].every(Number.isFinite)) return null;
  if (!where) return [0, 1];
  const sign = where === 'below' ? -1 : 1;
  const d0 = (a0 - b0) * sign, d1 = (a1 - b1) * sign;
  if (d0 <= 0 && d1 <= 0) return null;
  if (d0 >= 0 && d1 >= 0) return [0, 1];
  const crossing = d0 / (d0 - d1);
  return d0 > 0 ? [0, crossing] : [crossing, 1];
}

export function fillPaint(fill, series, ctx) {
  if (!fill.gradient) return fill.color;
  const g = fill.gradient;
  const top = series.priceToCoordinate(g.topValue), bottom = series.priceToCoordinate(g.bottomValue);
  if (![top, bottom].every(Number.isFinite) || top === bottom) return null;
  const gradient = ctx.createLinearGradient(0, top, 0, bottom);
  gradient.addColorStop(0, g.topColor);
  gradient.addColorStop(1, g.bottomColor);
  return gradient;
}

export class IndicatorFills {
  constructor(pane, result, timeAt) {
    this.pane = pane; this.result = result; this.timeAt = timeAt;
    this.view = { zOrder: () => 'bottom', renderer: () => ({ draw: (target) => target.useMediaCoordinateSpace(({ context, mediaSize }) => this.draw(context, mediaSize)) }) };
  }
  attached({ series }) { this.series = series; }
  detached() { this.series = null; }
  updateAllViews() {}
  paneViews() { return [this.view]; }
  draw(ctx, size) {
    const range = this.pane.chart.timeScale().getVisibleLogicalRange();
    if (!range || !this.series) return;
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, size.width, size.height); ctx.clip();
    for (const fill of this.result.fills || []) {
      const a = this.result[fill.from], b = this.result[fill.to];
      if (!Array.isArray(a) || !Array.isArray(b)) continue;
      const first = Math.max(1, Math.floor(range.from)), last = Math.min(a.length - 1, b.length - 1, Math.ceil(range.to));
      const paint = fillPaint(fill, this.series, ctx);
      if (!paint) continue;
      ctx.beginPath(); ctx.fillStyle = paint;
      for (let i = first; i <= last; i++) {
        const part = fillInterval(a[i - 1], b[i - 1], a[i], b[i], fill.where);
        if (!part) continue;
        const x0 = this.pane.chart.timeScale().timeToCoordinate(this.timeAt(i - 1)), x1 = this.pane.chart.timeScale().timeToCoordinate(this.timeAt(i));
        if (!Number.isFinite(x0) || !Number.isFinite(x1)) continue;
        const [t0, t1] = part;
        const x = (t) => x0 + (x1 - x0) * t;
        const y = (values, t) => this.series.priceToCoordinate(values[i - 1] + (values[i] - values[i - 1]) * t);
        const ya0 = y(a, t0), ya1 = y(a, t1), yb0 = y(b, t0), yb1 = y(b, t1);
        if (![ya0, ya1, yb0, yb1].every(Number.isFinite)) continue;
        ctx.moveTo(x(t0), ya0); ctx.lineTo(x(t1), ya1); ctx.lineTo(x(t1), yb1); ctx.lineTo(x(t0), yb0); ctx.closePath();
      }
      ctx.fill();
    }
    ctx.restore();
  }
}
