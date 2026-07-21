import test from 'node:test';
import assert from 'node:assert/strict';
import { INGREDIENT_VISUALS, ingredientVisual } from './ingredients.js';

test('十种食材的完整与切碎状态都有独特造型规格', () => {
  const specs = Object.values(INGREDIENT_VISUALS);
  assert.equal(specs.length, 10);
  assert.equal(new Set(specs.map((spec) => spec.whole)).size, 10);
  assert.equal(new Set(specs.map((spec) => spec.chopped)).size, 10);
  for (const spec of specs) assert.ok(spec.accent !== undefined);
  assert.equal(ingredientVisual('missing').whole, 'unknown');
});
