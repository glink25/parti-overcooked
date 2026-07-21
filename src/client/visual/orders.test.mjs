import test from 'node:test';
import assert from 'node:assert/strict';
import { ingredientBadge, plateStationState } from './orders.js';

const ingredients = {
  tomato: { color: 0xe53935, name: '番茄' }, onion: { color: 0xd9a7d8, name: '洋葱' },
  mushroom: { color: 0xc8a582, name: '菌菇' }, lettuce: { color: 0x7cb342, name: '生菜' },
  cucumber: { color: 0x2e7d32, name: '黄瓜' }, carrot: { color: 0xf57c00, name: '胡萝卜' },
  potato: { color: 0xd9b382, name: '土豆' }, meat: { color: 0xb94c55, name: '肉' },
  cheese: { color: 0xffca3a, name: '奶酪' }, rice: { color: 0xf4efe4, name: '米饭' },
};

test('十种订单食材使用食材箱一致的单字提示', () => {
  assert.deepEqual(Object.keys(ingredients).map((id) => ingredientBadge(ingredients, id).label), ['番', '洋', '菌', '生', '黄', '胡', '土', '肉', '奶', '米']);
  assert.equal(ingredientBadge(ingredients, 'rice').color, '#f4efe4');
  assert.deepEqual(ingredientBadge(ingredients, 'missing'), { color: '#999999', label: '?', name: '未知食材', prep: 'whole' });
  assert.equal(ingredientBadge(ingredients, 'tomato', 'chopped').prep, 'chopped');
  assert.equal(ingredientBadge(ingredients, 'tomato', 'whole').prep, 'whole');
});

test('订单用完整圆和分割圆区分处理状态', () => {
  assert.notEqual(ingredientBadge(ingredients, 'tomato', 'chopped').prep, ingredientBadge(ingredients, 'tomato', 'whole').prep);
});

test('盘子架在有盘与空盘时使用明确的蓝红状态', () => {
  assert.deepEqual(plateStationState(3, 0), { empty: false, color: 0x78d9ff, intensity: 1.05 });
  assert.deepEqual(plateStationState(0, 0), { empty: true, color: 0xff4b45, intensity: 1.8 });
});
