import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MobileUI, PHONE_QUERY } from '../public/js/mobile-ui.js';
import { PaneFocus, paneFocusIndex } from '../public/js/pane-focus.js';
import { AssetDetails } from '../public/js/asset-details.js';

test('desktop startup binds pane expansion without creating phone controls', (t) => {
  let query, listener;
  const original = globalThis.matchMedia;
  const oldWindow = globalThis.window, oldDocument = globalThis.document;
  globalThis.window = new EventTarget(); globalThis.document = new EventTarget();
  t.after(() => {
    if (original) globalThis.matchMedia = original; else delete globalThis.matchMedia;
    if (oldWindow) globalThis.window = oldWindow; else delete globalThis.window;
    if (oldDocument) globalThis.document = oldDocument; else delete globalThis.document;
  });
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
  ui.focusAbort.abort();
});

test('focus works on desktop and phone and follows a pane identity after reordering', () => {
  const pane = { app: { mobileUI: { enabled: false } }, paneFocus: 'rsi', indicatorPaneGroups: [{ root: 'rsi', index: 2 }] };
  assert.equal(paneFocusIndex(pane), 2);
  pane.app.mobileUI.enabled = true;
  assert.equal(paneFocusIndex(pane), 2);
  assert.equal(paneFocusIndex(pane, [{ root: 'rsi', index: 1 }]), 1);
  pane.paneFocus = 'price'; assert.equal(paneFocusIndex(pane), 0);
  pane.paneFocus = 'removed'; assert.equal(paneFocusIndex(pane), null);
});

for (const enabled of [false, true]) test(`restoring a focused pane preserves zoom, manual price scale, saved configuration and pane heights (${enabled ? 'phone' : 'desktop'})`, () => {
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
    render(reset) { assert.equal(reset, false); assert.equal(this.paneFocusSnapshot.mainStretch, 1); assert.equal(this.paneFocusSnapshot.stretch.get('rsi'), .4); },
  };
  const shell = { enabled, sync() {}, app: { panes: [pane], active: pane } };
  const focus = new PaneFocus(shell);
  focus.toggle(pane, 'rsi');
  assert.equal(pane.paneFocus, 'rsi');
  assert.deepEqual(cfg, before);
  originalOptions.scaleMargins.top = .5;
  focus.restore();
  assert.equal(pane.paneFocus, null);
  assert.equal(pane.paneFocusSnapshot, undefined);
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
  const focus = new PaneFocus(shell), event = { target: canvas, clientX: 100, clientY: 100, pointerType: 'touch' };
  assert.equal(focus.point(event).key, 'price'); assert.equal(tolerance, 13);
  assert.equal(focus.point({ ...event, clientX: 320 }), null);
  assert.equal(focus.point({ ...event, clientY: 2 }), null);
  assert.equal(focus.point({ ...event, target: { tagName: 'BUTTON' } }), null);
  drawing = true; assert.equal(focus.point(event), null);
  drawing = false; shell.app.tool = 'trend'; assert.equal(focus.point(event), null);
  shell.app.tool = 'cursor'; shell.view = 'watchlist'; assert.equal(focus.point(event), null);
  shell.enabled = false;
  assert.equal(focus.point({ ...event, pointerType: 'mouse' }).key, 'price'); assert.equal(tolerance, 7);
  // A window capture handler runs before the chart's own active-chart handler.
  shell.app.panes = [pane]; shell.app.active = { chartEl: { contains: () => false } };
  assert.equal(focus.point(event).pane, pane);
});

test('mouse double-click and touch double-tap expand once and switching input does not swallow a click', t => {
  const previous = { window: globalThis.window, document: globalThis.document, requestAnimationFrame: globalThis.requestAnimationFrame };
  globalThis.window = new EventTarget(); globalThis.document = new EventTarget(); globalThis.requestAnimationFrame = callback => callback();
  const abort = new AbortController();
  t.after(() => {
    abort.abort();
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
  });
  const pane = {}, focus = new PaneFocus({ app: { active: pane } }); let toggles = 0;
  focus.point = () => ({ pane, key: 'price', x: 100, y: 100 }); focus.toggle = () => toggles++;
  focus.bind(abort.signal);
  const fire = (target, name, data = {}) => {
    const event = new Event(name, { cancelable: true });
    for (const [key, value] of Object.entries({ pointerId: 1, button: 0, clientX: 100, clientY: 100, ...data })) Object.defineProperty(event, key, { value });
    target.dispatchEvent(event);
  };
  const tap = pointerType => { fire(window, 'pointerdown', { pointerType }); fire(window, 'pointerup', { pointerType }); };
  tap('mouse'); tap('mouse'); assert.equal(toggles, 0);
  fire(document, 'dblclick'); assert.equal(toggles, 1);
  tap('touch'); tap('touch'); assert.equal(toggles, 2);
  fire(document, 'dblclick', { sourceCapabilities: { firesTouchEvents: true } }); assert.equal(toggles, 2);
  tap('mouse'); tap('mouse'); fire(document, 'dblclick'); assert.equal(toggles, 3);
  fire(window, 'pointerdown', { pointerType: 'touch' }); fire(window, 'pointermove', { clientX: 130 }); fire(window, 'pointerup');
  tap('touch'); assert.equal(toggles, 3, 'dragging must not count as the first tap');
  fire(window, 'pointerdown', { pointerType: 'touch', pointerId: 2, isPrimary: false }); fire(window, 'pointerup', { pointerId: 2 });
  tap('touch'); assert.equal(toggles, 3, 'pinching must cancel any pending tap');
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

test('the chart menu offers inversion and then offers to restore normal direction', () => {
  let buttons, toggles = 0;
  const pane = { cfg: { symbol: 'BINANCE:BTCUSDT', tf: '1D' }, toggleInversion() { this.cfg.invertScale = !this.cfg.invertScale; toggles++; } };
  const shell = Object.assign(Object.create(MobileUI.prototype), { app: { active: pane, panes: [pane] }, menu: (title, choices) => { buttons = choices; } });
  shell.more(); buttons.find(button => button.label === 'Invert chart').action();
  assert.equal(pane.cfg.invertScale, true);
  shell.more(); buttons.find(button => button.label === 'Restore chart direction').action();
  assert.equal(pane.cfg.invertScale, false); assert.equal(toggles, 2);
});
