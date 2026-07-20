import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { daylightFor } from './environment.js';
import { computeRenderPixelRatio, MAP_THEMES, qualitySettings, themeFor } from './themes.js';

test('三张地图都有独立主题', () => {
  assert.deepEqual(Object.keys(MAP_THEMES), ['classic', 'split', 'ring']);
  assert.equal(new Set(Object.values(MAP_THEMES).map((theme) => theme.sky)).size, 3);
  assert.equal(new Set(Object.values(MAP_THEMES).map((theme) => theme.floorA)).size, 3);
  assert.equal(new Set(Object.values(MAP_THEMES).map((theme) => theme.decor)).size, 3);
  for (const [id, theme] of Object.entries(MAP_THEMES)) {
    assert.equal(themeFor(id), theme);
    assert.ok(theme.label && theme.accent && theme.target);
  }
});

test('所有时间节点保持明亮且过渡连续', () => {
  for (const theme of Object.values(MAP_THEMES)) {
    let previous = daylightFor(theme, 0);
    for (let i = 0; i <= 100; i++) {
      const value = daylightFor(theme, i / 100);
      assert.ok(new THREE.Color(value.skyBottom).getHSL({}).l > 0.55);
      assert.ok(value.sunIntensity >= 1.7);
      if (i > 0) {
        const a = new THREE.Color(value.skyTop); const b = new THREE.Color(previous.skyTop);
        const delta = Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
        assert.ok(delta < 0.04);
      }
      previous = value;
    }
  }
});

test('未知地图稳定回退到经典主题', () => {
  assert.equal(themeFor('unknown'), MAP_THEMES.classic);
});

test('低画质严格限制渲染预算', () => {
  const low = qualitySettings('low');
  const high = qualitySettings('high');
  assert.equal(low.maxPixelRatio, 2);
  assert.equal(low.pixelBudget, 2_500_000);
  assert.equal(low.antialias, false);
  assert.equal(high.antialias, true);
  assert.ok(low.shadowSize < high.shadowSize);
  assert.ok(low.particles < high.particles);
  assert.ok(low.decorations < high.decorations);
});

test('常见 Retina iPhone 使用 DPR 2 上限', () => {
  const quality = qualitySettings('low');
  const ratio = computeRenderPixelRatio({
    width: 390, height: 844, devicePixelRatio: 3,
    maxPixelRatio: quality.maxPixelRatio, pixelBudget: quality.pixelBudget,
  });
  assert.equal(ratio, 2);
});

test('大尺寸 iPad 按总像素预算降低 DPR', () => {
  const quality = qualitySettings('low');
  const ratio = computeRenderPixelRatio({
    width: 1024, height: 1366, devicePixelRatio: 2,
    maxPixelRatio: quality.maxPixelRatio, pixelBudget: quality.pixelBudget,
  });
  assert.ok(ratio > 1 && ratio < 2);
  assert.ok(1024 * 1366 * ratio * ratio <= quality.pixelBudget + 1);
});

test('渲染 DPR 不超过设备、画质与像素预算限制', () => {
  const ratio = computeRenderPixelRatio({
    width: 800, height: 600, devicePixelRatio: 1.5,
    maxPixelRatio: 2, pixelBudget: 600_000,
  });
  assert.ok(ratio <= 1.5);
  assert.ok(ratio <= 2);
  assert.ok(800 * 600 * ratio * ratio <= 600_000 + 1);
  assert.equal(computeRenderPixelRatio({
    width: 390, height: 844, devicePixelRatio: 1,
    maxPixelRatio: 2, pixelBudget: 2_500_000,
  }), 1);
});
