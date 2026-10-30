import { test } from 'node:test';
import assert from 'node:assert/strict';
import { levelTarget, levelAlertPreset, LevelActions } from '../public/js/level-actions.js';

function chart() {
  const series = { coordinateToPrice: y => 100 - y, options: () => ({ priceFormat: { minMove: .01 } }), priceFormatter: () => ({ format: value => value.toFixed(2) }) };
  const indicator = { uid: 'rsi-1', id: 'rsi', params: { length: 21, source: 'open' }, tf: '4h' };
  const pane = {
    app: { tool: 'cursor', mobileUI: { enabled: false } }, cfg: { symbol: 'BINANCE:BTCUSDT', tf: '1h', indicators: [indicator] },
    chart: { panes: () => [{ getHeight: () => 100 }, { getHeight: () => 100 }], timeScale: () => ({ width: () => 400 }) },
    main: series, indSeries: new Map([['rsi-1', [series]]]), indicatorPaneGroups: [{ root: 'rsi-1', index: 1, indicators: ['rsi-1'] }],
    indResults: { 'rsi-1': { value: [30, 40, 50] } }, timeOfLogical: logical => 1000 + logical * 60,
  };
  return pane;
}
const point = { point: { x: 200, y: 42 }, logical: 2, paneIndex: 0 };

test('price actions use the actual scale coordinate and selected timestamp', () => {
  const target = levelTarget(chart(), point);
  assert.equal(target.value, 58); assert.equal(target.time, 1120); assert.equal(target.text, '58.00'); assert.equal(target.root, null);
  assert.deepEqual(levelAlertPreset(target).rules[0], { left: { kind: 'price', field: 'close' }, op: 'crosses', right: { kind: 'value', v: 58 } });
});

test('indicator actions use their own local scale and preserve all indicator inputs and timeframe', () => {
  const pane = chart(), target = levelTarget(pane, { ...point, paneIndex: 1 });
  const preset = levelAlertPreset(target);
  assert.equal(target.root, 'rsi-1'); assert.equal(preset.tf, '4h');
  assert.deepEqual(preset.rules[0].left, { kind: 'ind', id: 'rsi', params: { length: 21, source: 'open' }, output: 'value' });
  pane.cfg.indicators[0].params.length = 99; assert.equal(target.indicator.params.length, 21);
});

test('expanded indicator panes retain indicator context instead of becoming price alerts', () => {
  const pane = chart(); pane.app.mobileUI.enabled = true; pane.mobilePaneFocus = 'rsi-1';
  const target = levelTarget(pane, point); assert.equal(target.root, 'rsi-1'); assert.equal(levelAlertPreset(target).rules[0].left.kind, 'ind');
});

test('non-plot coordinates and drawing mode cannot show a quick action', () => {
  const pane = chart();
  assert.equal(levelTarget(pane, { ...point, point: { x: 450, y: 50 } }), null);
  assert.equal(levelTarget(pane, { ...point, point: { x: 100, y: 110 } }), null);
  assert.equal(levelTarget(pane, { point: undefined }), null);
  pane.app.tool = 'trend'; assert.equal(levelTarget(pane, point), null);
});

test('inverted and logarithmic prices are converted by the chart engine', () => {
  const pane = chart(); pane.main.coordinateToPrice = y => 10 ** (y / 10);
  assert.equal(levelTarget(pane, { ...point, point: { x: 200, y: 30 } }).value, 1000);
});

test('derived indicator alerts are refused rather than silently evaluating a price source', () => {
  const pane = chart(); pane.cfg.indicators[0].params.source = 'ind:another:value';
  assert.equal(levelAlertPreset(levelTarget(pane, { ...point, paneIndex: 1 })), null);
});

test('saved indicator lines follow their pane root and ignore removed indicators', () => {
  const pane = chart(), created = [];
  pane.indSeries.get('rsi-1')[0].createPriceLine = options => created.push(options);
  pane.cfg.indicatorLines = [{ root: 'rsi-1', value: 70, color: '#ff0000', lineWidth: 3, lineStyle: 'Dashed' }, { root: 'removed', value: 30 }];
  LevelActions.prototype.renderLines.call({ pane });
  assert.equal(created.length, 1); assert.equal(created[0].price, 70); assert.equal(created[0].lineStyle, 2); assert.equal(created[0].axisLabelVisible, true);
});

test('crosshair updates safely ignore pane rows detached during indicator rebuilding', t => {
  const previous = globalThis.document; t.after(() => { if (previous) globalThis.document = previous; else delete globalThis.document; });
  globalThis.document = { querySelector: () => ({ classList: { contains: () => true } }) };
  const pane = chart(); pane.chart.panes = () => [{ getHeight: () => 100, getHTMLElement: () => null }];
  let hidden = false;
  const actions = Object.assign(Object.create(LevelActions.prototype), { pane, hide: () => { hidden = true; } });
  actions.update(point); assert.equal(hidden, true);
});
