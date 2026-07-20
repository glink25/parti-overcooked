import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { advanceChefAnimation, animateChefModel, makeChefModel } from './chef.js';

test('带噪速度和不规则帧率下步态相位仍连续单调', () => {
  const animation = { speed: 0, walkPhase: 0, workPhase: 0 };
  const dts = [1 / 60, 1 / 47, 1 / 72, 1 / 55, 1 / 90];
  let previous = 0;
  for (let i = 0; i < 240; i++) {
    advanceChefAnimation(animation, 3.2 + Math.sin(i * 1.7) * 0.16, dts[i % dts.length]);
    assert.ok(animation.walkPhase >= previous);
    assert.ok(animation.walkPhase - previous < 0.35);
    previous = animation.walkPhase;
  }
});

test('移动停止后动画速度平滑归零', () => {
  const animation = { speed: 1, walkPhase: 4, workPhase: 0 };
  for (let i = 0; i < 90; i++) advanceChefAnimation(animation, i < 4 ? 0.08 : 0, 1 / 60);
  assert.equal(animation.speed, 0);
});

test('视觉动画不改变网络根节点缩放或侧倾', () => {
  const material = () => new THREE.MeshBasicMaterial();
  const mesh = () => new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material());
  const chef = makeChefModel('#ff5533', { box: mesh, cyl: mesh, sph: mesh, mat: material });
  chef.scale.set(0.7, 1.3, 0.8); chef.rotation.z = 0.4;
  chef.userData.animKick = 1;
  animateChefModel(chef, { working: false, carrying: null }, { speed: 3.2 }, 2, 1 / 60, null);
  assert.deepEqual(chef.scale.toArray(), [1, 1, 1]);
  assert.equal(chef.rotation.z, 0);
  assert.notEqual(chef.userData.visualRig.scale.y, 1);
});
