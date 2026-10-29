import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indicatorScaleLabelVisible, indicatorLevelLabelVisible } from '../public/lib/indicator-display.js';

test('existing charts keep oscillator tags and leave price-overlay tags off by default', () => {
  const indicator = {}, output = { key: 'value' };
  assert.equal(indicatorScaleLabelVisible(indicator, output, 0), false);
  assert.equal(indicatorScaleLabelVisible(indicator, output, 2), true);
  // A moving average built on RSI uses the oscillator pane, including during phone expansion.
  assert.equal(indicatorScaleLabelVisible(indicator, output, 1), true);
  assert.equal(indicatorLevelLabelVisible(indicator, 70), false);
  assert.deepEqual(indicator, {});
});

test('each output can be selected independently without exposing hidden calculation outputs', () => {
  const indicator = { scaleLabels: { macd: true, signal: true, hist: false, rally: false, mask: true } };
  for (const key of ['macd', 'signal']) assert.equal(indicatorScaleLabelVisible(indicator, { key }, 1), true);
  for (const key of ['hist', 'rally']) assert.equal(indicatorScaleLabelVisible(indicator, { key }, 1), false);
  assert.equal(indicatorScaleLabelVisible(indicator, { key: 'mask', hidden: true }, 1), false);
  assert.equal(indicatorScaleLabelVisible(indicator, { key: 'newOutput' }, 1), true);
});

test('explicit choices survive saving and loading and remain independent for duplicate indicators', () => {
  const charts = JSON.parse(JSON.stringify([
    { uid: 'first', id: 'macd', scaleLabels: { hist: false, macd: true }, levelScaleLabels: { 50: true, 150: false } },
    { uid: 'second', id: 'macd', scaleLabels: { hist: true, macd: false } },
  ]));
  assert.equal(indicatorScaleLabelVisible(charts[0], { key: 'hist' }, 1), false);
  assert.equal(indicatorScaleLabelVisible(charts[1], { key: 'hist' }, 1), true);
  assert.equal(indicatorLevelLabelVisible(charts[0], 50), true);
  assert.equal(indicatorLevelLabelVisible(charts[0], 150), false);
  assert.equal(indicatorLevelLabelVisible(charts[1], 50), false);
});

test('price overlays can opt in and clearing choices restores the original display', () => {
  const indicator = { scaleLabels: { value: true }, levelScaleLabels: { 70: true } };
  assert.equal(indicatorScaleLabelVisible(indicator, { key: 'value' }, 0), true);
  delete indicator.scaleLabels;
  delete indicator.levelScaleLabels;
  assert.equal(indicatorScaleLabelVisible(indicator, { key: 'value' }, 0), false);
  assert.equal(indicatorScaleLabelVisible(indicator, { key: 'value' }, 1), true);
  assert.equal(indicatorLevelLabelVisible(indicator, 70), false);
});
