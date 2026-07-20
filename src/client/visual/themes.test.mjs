import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { daylightFor } from './environment.js';
import { computeRenderPixelRatio, MAP_THEMES, qualitySettings, themeFor } from './themes.js';

test('六张地图与颁奖广场都有主题', () => {
  assert.deepEqual(Object.keys(MAP_THEMES), ['classic', 'split', 'ring', 'snow', 'space', 'castle', 'awards']);
  assert.ok(new Set(Object.values(MAP_THEMES).map((theme) => theme.sky)).size >= 6);
  assert.ok(new Set(Object.values(MAP_THEMES).map((theme) => theme.floorA)).size >= 6);
  assert.ok(new Set(Object.values(MAP_THEMES).map((theme) => theme.decor)).size >= 6);
  for (const [id, theme] of Object.entries(MAP_THEMES)) {
    assert.equal(themeFor(id), theme);
    assert.ok(theme.label && theme.accent && theme.target);
  }
});

test('各主题背景保持可读且过渡连续', () => {
  for (const theme of Object.values(MAP_THEMES)) {
    let previous = daylightFor(theme, 0);
    for (let i = 0; i <= 100; i++) {
      const value = daylightFor(theme, i / 100);
      const lightness = new THREE.Color(value.skyBottom).getHSL({}).l;
      if (theme.id === 'space') assert.ok(lightness > 0.33 && lightness < 0.5);
      else assert.ok(lightness > 0.4);
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

test('太空厨房保留深色星空但游戏表面足够明亮', () => {
  const theme = MAP_THEMES.space;
  const luminance = (hex) => {
    const c = new THREE.Color(hex).convertSRGBToLinear();
    return c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
  };
  assert.ok(luminance(theme.floorA) > luminance(theme.sky) * 3);
  assert.ok(luminance(theme.floorB) > luminance(theme.floorA) * 1.5);
  assert.ok(luminance(theme.counterTop) > luminance(theme.cabinet) * 2);
  assert.ok(theme.hemiIntensity >= 1.1 && theme.sunIntensity >= 1.9 && theme.fogDensity <= 0.006);
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
