import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SidebarResize, sidebarBounds, sidebarWidth } from '../public/js/sidebar-resize.js';

test('sidebar limits keep a usable chart area and constrain oversized or undersized widths', () => {
  assert.deepEqual(sidebarBounds(1000), { min: 240, max: 680 });
  assert.equal(sidebarWidth(10, 1500), 240); assert.equal(sidebarWidth(2000, 1500), 720);
  assert.equal(sidebarWidth(500, 700), 380); assert.equal(700 - sidebarWidth(500, 700), 320);
});
test('missing or invalid saved widths use the original desktop default', () => {
  for (const value of [undefined, null, NaN, 'broken', -20, 0]) assert.equal(sidebarWidth(value, 1500), 300);
  assert.equal(sidebarWidth(480.4, 1500), 480);
});
test('finishing a resize saves once, while cancellation restores the saved width', t => {
  const oldDocument = globalThis.document; globalThis.document = { body: { classList: { remove() {} } } };
  t.after(() => { if (oldDocument) globalThis.document = oldDocument; else delete globalThis.document; });
  let writes = 0, released;
  const resize = Object.assign(Object.create(SidebarResize.prototype), {
    app: { settings: { sidebarWidth: 300 }, persist: () => writes++ },
    gesture: { id: 7 }, width: 480, dragWidth: 480,
    handle: { hasPointerCapture: () => true, releasePointerCapture: id => { released = id; } },
    apply() { this.width = this.app.settings.sidebarWidth; },
  });
  resize.finish(true); assert.equal(resize.app.settings.sidebarWidth, 480); assert.equal(writes, 1); assert.equal(released, 7);
  resize.gesture = { id: 8 }; resize.width = 600; resize.dragWidth = 600; resize.finish(false);
  assert.equal(resize.width, 480); assert.equal(resize.dragWidth, undefined); assert.equal(writes, 1);
});
test('phone and narrow-screen overlay layouts do not enable desktop resizing', t => {
  const previous = globalThis.innerWidth; globalThis.innerWidth = 1600;
  t.after(() => { if (previous === undefined) delete globalThis.innerWidth; else globalThis.innerWidth = previous; });
  let overlay = false;
  const resize = Object.assign(Object.create(SidebarResize.prototype), { app: { mobileUI: { enabled: false } }, side: { classList: { contains: () => overlay } } });
  assert.equal(resize.enabled, true); resize.app.mobileUI.enabled = true; assert.equal(resize.enabled, false);
  resize.app.mobileUI.enabled = false; overlay = true; assert.equal(resize.enabled, false);
  overlay = false; globalThis.innerWidth = 800; assert.equal(resize.enabled, false);
});
