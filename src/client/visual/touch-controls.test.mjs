import test from 'node:test';
import assert from 'node:assert/strict';
import { clampJoystickCenter, joystickVector, shortActionLabel } from './touch-controls.js';

test('浮动摇杆中心限制在左半屏和安全区域内', () => {
  const viewport = { width: 800, height: 400 };
  assert.deepEqual(clampJoystickCenter({ x: 5, y: 390 }, viewport, 59, { left: 10, bottom: 20 }), { x: 69, y: 321 });
  assert.deepEqual(clampJoystickCenter({ x: 390, y: 10 }, viewport, 59), { x: 341, y: 59 });
});

test('摇杆正确处理死区、方向和最大半径', () => {
  assert.deepEqual(joystickVector({ x: 104, y: 100 }, { x: 100, y: 100 }, 40), { dx: 0, dz: 0, knobX: 4, knobY: 0 });
  assert.deepEqual(joystickVector({ x: 140, y: 100 }, { x: 100, y: 100 }, 40), { dx: 1, dz: 0, knobX: 40, knobY: 0 });
  assert.deepEqual(joystickVector({ x: 100, y: 180 }, { x: 100, y: 100 }, 40), { dx: 0, dz: 1, knobX: 0, knobY: 40 });
});

test('操作提示压缩成移动端按钮短文本', () => {
  assert.equal(shortActionLabel('拿取番茄', '互动'), '拿取');
  assert.equal(shortActionLabel('下锅（即可开煮番茄浓汤）', '互动'), '下锅');
  assert.equal(shortActionLabel('洗碗（按住）', '切/洗'), '洗碗');
  assert.equal(shortActionLabel(null, '互动'), '互动');
});
