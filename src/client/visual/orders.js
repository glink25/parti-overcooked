export function ingredientBadge(ingredients, id, prep = null) {
  const ingredient = ingredients[id];
  return {
    color: ingredient ? '#' + ingredient.color.toString(16).padStart(6, '0') : '#999999',
    label: ingredient ? ingredient.name[0] : '?',
    name: ingredient ? ingredient.name : '未知食材',
    prep: prep === 'chopped' ? 'chopped' : 'whole',
  };
}

export function plateStationState(clean, elapsed = 0) {
  const empty = clean <= 0;
  return {
    empty,
    color: empty ? 0xff4b45 : 0x78d9ff,
    intensity: empty ? 1.8 + Math.sin(elapsed * 5) * 0.45 : 1.05 + Math.sin(elapsed * 2.2) * 0.18,
  };
}
