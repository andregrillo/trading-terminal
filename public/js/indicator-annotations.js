// Divergence lines and labels live in the indicator's own pane and use its
// scale, rather than placing RSI values on the instrument's price chart.
export class IndicatorAnnotations {
  constructor(pane, annotations) {
    this.pane = pane; this.annotations = annotations;
    this.view = { zOrder: () => 'top', renderer: () => ({ draw: (target) => target.useMediaCoordinateSpace(({ context, mediaSize }) => this.draw(context, mediaSize)) }) };
  }
  attached({ series }) { this.series = series; }
  detached() { this.series = null; }
  updateAllViews() {}
  paneViews() { return [this.view]; }
  draw(ctx, size) {
    if (!this.series) return;
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, size.width, size.height); ctx.clip();
    for (const line of this.annotations.segments || []) {
      const x0 = this.pane.timeToX(line.fromTime), x1 = this.pane.timeToX(line.toTime);
      const y0 = this.series.priceToCoordinate(line.fromPrice), y1 = this.series.priceToCoordinate(line.toPrice);
      if (![x0, x1, y0, y1].every(Number.isFinite)) continue;
      ctx.strokeStyle = line.color; ctx.lineWidth = line.width || 2;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }
    ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
    for (const label of this.annotations.labels || []) {
      const x = this.pane.timeToX(label.time), y = this.series.priceToCoordinate(label.price);
      if (![x, y].every(Number.isFinite) || x < -50 || x > size.width + 50) continue;
      const width = ctx.measureText(label.text).width + 12;
      const top = label.position === 'above' ? y - 24 : y + 6;
      ctx.fillStyle = label.color; ctx.fillRect(x - width / 2, top, width, 18);
      ctx.beginPath(); ctx.moveTo(x - 4, label.position === 'above' ? top + 18 : top);
      ctx.lineTo(x, y); ctx.lineTo(x + 4, label.position === 'above' ? top + 18 : top); ctx.closePath(); ctx.fill();
      ctx.fillStyle = label.textColor || '#ffffff'; ctx.fillText(label.text, x - width / 2 + 6, top + 13);
    }
    ctx.restore();
  }
}
