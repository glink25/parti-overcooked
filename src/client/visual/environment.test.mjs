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

test('三个主题构建不同环境并可完整释放', () => {
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
