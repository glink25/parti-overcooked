import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraPoses, countdownIntroProgress, lerpCameraPose } from './camera.js';

test('地图全景机位比游戏机位更远且共用观察中心', () => {
  for (const layout of [{ w: 15, h: 9 }, { w: 17, h: 11 }, { w: 21, h: 8 }]) {
    for (const aspect of [0.55, 1, 16 / 9]) {
      const poses = cameraPoses(layout, aspect);
      assert.ok(poses.overview.y > poses.playing.y);
      assert.ok(poses.overview.z > poses.playing.z);
      assert.deepEqual(poses.target, { x: layout.w / 2, y: 0, z: layout.h / 2 + 0.2 });
    }
  }
});

test('倒计时进度平滑覆盖完整三秒并支持中途加入', () => {
  assert.equal(countdownIntroProgress(3), 0);
  assert.equal(countdownIntroProgress(0), 1);
  assert.equal(countdownIntroProgress(1.5), 0.5);
  assert.ok(countdownIntroProgress(2) < countdownIntroProgress(1));
});

test('镜头插值精确落在两端并限制越界进度', () => {
  const from = { x: 1, y: 10, z: 20 };
  const to = { x: 3, y: 4, z: 8 };
  assert.deepEqual(lerpCameraPose(from, to, -1), from);
  assert.deepEqual(lerpCameraPose(from, to, 1), to);
  assert.deepEqual(lerpCameraPose(from, to, 0.5), { x: 2, y: 7, z: 14 });
});
