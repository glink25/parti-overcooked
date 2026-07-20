import test from 'node:test';
import assert from 'node:assert/strict';
import { stepMovement } from '../movement.js';

const openLayout = (movementProfile = null) => ({
  w: 12, h: 6, movementProfile, dynamicBlocked: {},
  cells: Array.from({ length: 72 }, (_, i) => {
    const x = i % 12; const z = Math.floor(i / 12);
    return x === 0 || z === 0 || x === 11 || z === 5 ? '#' : '.';
  }),
});

function run(layout, state, input, seconds, modifiers) {
  for (let t = 0; t < seconds - 1e-9; t += 1 / 60) stepMovement(layout, state, input, 1 / 60, 0.3, [], modifiers);
}

test('雪地松键滑行明显长于普通地面', () => {
  const normal = { x: 2, z: 2, vx: 3.2, vz: 0 };
  const ice = { x: 2, z: 3, vx: 3.2, vz: 0 };
  run(openLayout(), normal, {}, 0.8);
  run(openLayout({ speed: 3.2, stopTime: 0.65, turnTime: 0.25 }), ice, {}, 0.8);
  assert.ok(ice.x - 2 > (normal.x - 2) * 4);
  assert.equal(ice.vx, 0);
});

test('疾步倍率同时提高目标速度与雪地滑行距离', () => {
  const layout = openLayout({ speed: 3.2, stopTime: 0.65, turnTime: 0.25 });
  const normal = { x: 2, z: 2, vx: 0, vz: 0 };
  const swift = { x: 2, z: 3, vx: 0, vz: 0 };
  run(layout, normal, { dx: 1, dz: 0 }, 1);
  run(layout, swift, { dx: 1, dz: 0 }, 1, { speedMultiplier: 1.25 });
  assert.ok(swift.x > normal.x + 0.5);
});

test('动态城门格参与客户端碰撞', () => {
  const layout = openLayout(); layout.dynamicBlocked['5,2'] = true;
  const state = { x: 4.2, z: 2.5, vx: 0, vz: 0 };
  run(layout, state, { dx: 1, dz: 0 }, 1);
  assert.ok(state.x <= 4.7 + 1e-6);
});
