import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MobileUI, PHONE_QUERY } from '../public/js/mobile-ui.js';
import { MobilePaneFocus, phoneFocusIndex } from '../public/js/mobile-pane-focus.js';
import { AssetDetails } from '../public/js/asset-details.js';

test('desktop startup does not create phone controls or access the document', (t) => {
  let query, listener;
  const original = globalThis.matchMedia;
  t.after(() => { if (original) globalThis.matchMedia = original; else delete globalThis.matchMedia; });
  globalThis.matchMedia = value => {
    query = value;
    return { matches: false, addEventListener: (name, callback) => { assert.equal(name, 'change'); listener = callback; } };
  };
  const ui = new MobileUI(Object.freeze({}));
  ui.start();
  assert.equal(query, PHONE_QUERY);
  assert.match(query, /hover: none/);
  assert.match(query, /pointer: coarse/);
  assert.equal(typeof listener, 'function');
  assert.equal(ui.enabled, false);
  assert.equal(ui.el, undefined);
});

test('focus is phone-only and follows a pane identity after reordering', () => {
  const pane = { app: { mobileUI: { enabled: false } }, mobilePaneFocus: 'rsi', indicatorPaneGroups: [{ root: 'rsi', index: 2 }] };
  assert.equal(phoneFocusIndex(pane), null);
  pane.app.mobileUI.enabled = true;
  assert.equal(phoneFocusIndex(pane), 2);
  assert.equal(phoneFocusIndex(pane, [{ root: 'rsi', index: 1 }]), 1);
  pane.mobilePaneFocus = 'price'; assert.equal(phoneFocusIndex(pane), 0);
  pane.mobilePaneFocus = 'removed'; assert.equal(phoneFocusIndex(pane), null);
});

test('restoring a focused pane preserves zoom, manual price scale, saved configuration and pane heights', () => {
  const cfg = { symbol: 'BTCUSDT', tf: '4h', indicators: [{ uid: 'rsi', params: { length: 14 } }] };
  const before = structuredClone(cfg), range = { from: 4, to: 104 }, priceRange = { from: 60000, to: 90000 };
  let restoredOptions, restoredPriceRange, rangeSet;
  const originalOptions = { autoScale: false, mode: 1, scaleMargins: { top: .1, bottom: .2 } };
  const scale = { options: () => originalOptions, getVisibleRange: () => priceRange, applyOptions: value => { restoredOptions = value; }, setVisibleRange: value => { restoredPriceRange = value; } };
  const pane = {
    cfg, bars: [{}], indicatorPaneGroups: [{ root: 'rsi', index: 1 }],
    main: { options: () => ({ visible: true }), priceScale: () => scale }, volume: { options: () => ({ visible: true }) },
    chart: { panes: () => [1, .4].map(value => ({ getStretchFactor: () => value })), timeScale: () => ({ getVisibleLogicalRange: () => range, setVisibleLogicalRange: value => { rangeSet = value; } }) },
    drawingEditor: { cancel() {}, select() {} },
    render(reset) { assert.equal(reset, false); assert.equal(this.mobilePaneSnapshot.mainStretch, 1); assert.equal(this.mobilePaneSnapshot.stretch.get('rsi'), .4); },
  };
  const shell = { enabled: true, sync() {}, app: { panes: [pane], active: pane } };
  const focus = new MobilePaneFocus(shell);
  focus.toggle(pane, 'rsi');
  assert.equal(pane.mobilePaneFocus, 'rsi');
  assert.deepEqual(cfg, before);
  originalOptions.scaleMargins.top = .5;
  focus.restore();
  assert.equal(pane.mobilePaneFocus, null);
  assert.equal(pane.mobilePaneSnapshot, undefined);
  assert.equal(restoredOptions.scaleMargins.top, .1);
  assert.deepEqual(restoredPriceRange, priceRange);
  assert.deepEqual(rangeSet, range);
  assert.deepEqual(cfg, before);
});

test('pane background hit testing excludes axes, pane dividers, drawings and drawing mode', () => {
  const canvas = { tagName: 'CANVAS' };
  let drawing = false, tolerance;
  const pane = {
    chartEl: { contains: target => target === canvas, getBoundingClientRect: () => ({ left: 0 }) },
    chart: { timeScale: () => ({ width: () => 300 }), panes: () => [{ getHTMLElement: () => ({ getBoundingClientRect: () => ({ top: 0, bottom: 300 }) }) }] },
    drawings: { hitTestDetailed: (x, y, options) => { tolerance = options.tolerance; return drawing; } },
  };
  const shell = { enabled: true, view: 'chart', app: { active: pane, tool: 'cursor' } };
  const focus = new MobilePaneFocus(shell), event = { target: canvas, clientX: 100, clientY: 100, pointerType: 'touch' };
  assert.equal(focus.point(event).key, 'price'); assert.equal(tolerance, 13);
  assert.equal(focus.point({ ...event, clientX: 320 }), null);
  assert.equal(focus.point({ ...event, clientY: 2 }), null);
  assert.equal(focus.point({ ...event, target: { tagName: 'BUTTON' } }), null);
  drawing = true; assert.equal(focus.point(event), null);
  drawing = false; shell.app.tool = 'trend'; assert.equal(focus.point(event), null);
  shell.app.tool = 'cursor'; shell.view = 'watchlist'; assert.equal(focus.point(event), null);
});

test('phone asset-card preferences do not overwrite Mac preferences', () => {
  let writes = 0;
  const settings = { assetDetailsHeight: 420, assetDetailsCollapsed: false };
  const card = Object.create(AssetDetails.prototype);
  card.app = { settings, mobileUI: { enabled: true, assetCollapsed: true }, persist: () => writes++ };
  assert.equal(card.collapsed, true); assert.equal(card.preferredHeight, 300);
  card.preferredHeight = 220; card.saveSize();
  assert.equal(card.preferredHeight, 220); assert.equal(writes, 0);
  assert.deepEqual(settings, { assetDetailsHeight: 420, assetDetailsCollapsed: false });
  card.app.mobileUI.enabled = false;
  assert.equal(card.collapsed, false); assert.equal(card.preferredHeight, 420);
  card.preferredHeight = 380; card.saveSize();
  assert.equal(settings.assetDetailsHeight, 380); assert.equal(writes, 1);
});
