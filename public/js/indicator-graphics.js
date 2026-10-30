// Price-chart shapes returned by custom indicators. They are recomputed from the
// replay slice, and disappear when an indicator is hidden or a block is mitigated.
export class IndicatorGraphics {
  constructor(pane, result, colors) {
    this.pane = pane;
    this.result = result;
    this.colors = colors;
    this.views = ['bottom', 'top'].map((layer) => ({
      zOrder: () => layer,
      renderer: () => ({ draw: (target) => target.useMediaCoordinateSpace(({ context, mediaSize }) => this.draw(context, mediaSize, layer)) }),
    }));
  }
  attached({ series }) { this.series = series; }
  detached() { this.series = null; }
  updateAllViews() {}
  paneViews() { return this.views; }
  draw(ctx, size, layer) {
    if (!this.series) return;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, size.width, size.height); ctx.clip();
    if (layer === 'bottom') {
      for (const block of this.result.rectangles || []) {
        const left = this.pane.timeToX(block.time);
        const top = this.series.priceToCoordinate(block.top), bottom = this.series.priceToCoordinate(block.bottom);
        const middle = this.series.priceToCoordinate((block.top + block.bottom) / 2);
        if (![left, top, bottom, middle].every(Number.isFinite) || left > size.width) continue;
        const x = Math.max(0, left), y = Math.min(top, bottom), h = Math.max(1, Math.abs(bottom - top));
        ctx.fillStyle = block.fill; ctx.fillRect(x, y, size.width - x, h);
        ctx.setLineDash([]); ctx.lineWidth = 1; ctx.strokeStyle = block.border;
        ctx.strokeRect(x, y, size.width - x + 1, h);
        ctx.lineWidth = block.lineWidth || 1; ctx.strokeStyle = block.middleColor;
        ctx.setLineDash(block.lineStyle === 'Dashed' ? [6, 4] : block.lineStyle === 'Dotted' ? [2, 3] : []);
        ctx.beginPath(); ctx.moveTo(x, middle); ctx.lineTo(size.width, middle); ctx.stroke();
      }
    } else {
      // Keep the labels anchored to the latest bar, including when it is off-screen.
      const x = this.pane.chart.timeScale().logicalToCoordinate(this.pane.shown.length - 1 + 17);
      if (!Number.isFinite(x) || x >= size.width) { ctx.restore(); return; }
      ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
      const labels = (this.result.priceLabels || []).map((label) => ({ ...label, y: this.series.priceToCoordinate(label.price) })).filter((label) => Number.isFinite(label.y)).sort((a, b) => a.y - b.y);
      let previousY = -Infinity;
      for (const label of labels) {
        const text = `${label.text} · ${this.pane.formatPrice(label.price)}`;
        const width = ctx.measureText(text).width + 12;
        if (x + width <= 0) continue;
        const y = Math.max(10, Math.min(size.height - 10, Math.max(label.y, previousY + 20)));
        previousY = y;
        const color = this.colors[label.key] || '#9598a1';
        ctx.fillStyle = color; ctx.globalAlpha = 0.27; ctx.fillRect(x, y - 9, width, 18);
        ctx.globalAlpha = 1; ctx.fillText(text, x + 6, y + 4);
      }
    }
    ctx.restore();
  }
}
