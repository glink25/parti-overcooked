import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createEnvironmentController } from './environment.js';
import { MAP_THEMES } from './themes.js';

function factory(qualityTier = 'high') {
  const scene = new THREE.Scene(); scene.background = new THREE.Color(); scene.fog = new THREE.FogExp2();
  const hemi = new THREE.HemisphereLight(); const sun = new THREE.DirectionalLight();
  const mat = (color, options = {}) => new THREE.MeshStandardMaterial({ color, emissive: options.emissive || 0 });
  const mesh = (geometry, color, options) => new THREE.Mesh(geometry, mat(color, options));
  const box = (w, h, d, color, options) => mesh(new THREE.BoxGeometry(w, h, d), color, options);
  const cyl = (rt, rb, h, color, segments = 8, options) => mesh(new THREE.CylinderGeometry(rt, rb, h, segments), color, options);
  const sph = (radius, color, ws = 8, hs = 6) => mesh(new THREE.SphereGeometry(radius, ws, hs), color);
  return { scene, controller: createEnvironmentController({ scene, hemi, sun, mat, box, cyl, sph, qualityTier }) };
}

test('七个主题构建不同环境并可完整释放', () => {
  const layout = { w: 5, h: 5, cells: Array(25).fill('.').map((v, i) => i % 5 === 2 ? 'C' : v) };
  for (const theme of Object.values(MAP_THEMES)) {
    const { scene, controller } = factory(); const parent = new THREE.Group(); scene.add(parent);
    const environment = controller.buildEnvironment(parent, layout, theme);
    assert.equal(environment.name, `environment-${theme.decor}`);
    assert.ok(environment.children.length > 5);
    controller.updateEnvironment(1, 12);
    controller.dispose();
    assert.equal(parent.children.length, 0);
  }
});

test('新地图使用独立标志性装饰，太空不生成云层', () => {
  const layout = { w: 15, h: 10, cells: Array(150).fill('.') };
  const expected = { snow: ['mountains', 'food-truck', 'snow-pines', 'snowfall'], space: ['starfield', 'ringed-planet', 'station-hull', 'isolation-chamber'], castle: ['towers', 'battlements', 'royal-banners', 'torches'] };
  for (const id of Object.keys(expected)) {
    const { scene, controller } = factory(); const parent = new THREE.Group(); scene.add(parent);
    const environment = controller.buildEnvironment(parent, layout, MAP_THEMES[id]);
    assert.deepEqual(environment.userData.landmarks, expected[id]);
    assert.equal(environment.userData.cloudCount, id === 'space' ? 0 : 6);
    controller.dispose();
  }
});

test('新地图低画质保留主题且减少装饰数量', () => {
  const layout = { w: 15, h: 10, cells: Array(150).fill('.') };
  for (const id of ['snow', 'space', 'castle']) {
    const high = factory('high'); const highParent = new THREE.Group(); high.scene.add(highParent);
    const highEnvironment = high.controller.buildEnvironment(highParent, layout, MAP_THEMES[id]);
    const highCount = highEnvironment.children.length; high.controller.dispose();
    const low = factory('low'); const lowParent = new THREE.Group(); low.scene.add(lowParent);
    const lowEnvironment = low.controller.buildEnvironment(lowParent, layout, MAP_THEMES[id]);
    assert.deepEqual(lowEnvironment.userData.landmarks.length, 4);
    assert.ok(lowEnvironment.children.length < highCount, `${id}: ${lowEnvironment.children.length} < ${highCount}`);
    low.controller.updateEnvironment(1, 20); low.controller.dispose();
  }
});
