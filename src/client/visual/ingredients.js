export const INGREDIENT_VISUALS = Object.freeze({
  tomato: { whole: 'round-stem', chopped: 'wedges', accent: 0x2e7d32 },
  onion: { whole: 'bulb-tip', chopped: 'rings', accent: 0xf4e3ef },
  mushroom: { whole: 'cap-stem', chopped: 'slices', accent: 0xf5f0e1 },
  lettuce: { whole: 'leaf-head', chopped: 'leaf-pile', accent: 0xaed581 },
  cucumber: { whole: 'long-ridged', chopped: 'round-slices', accent: 0xa5d66f },
  carrot: { whole: 'tapered-leaves', chopped: 'coin-stack', accent: 0x43a047 },
  potato: { whole: 'lumpy-eyes', chopped: 'skin-cubes', accent: 0x9b7045 },
  meat: { whole: 'steak-fat', chopped: 'marbled-cubes', accent: 0xffd0c8 },
  cheese: { whole: 'wedge-holes', chopped: 'hole-cubes', accent: 0xffed91 },
  rice: { whole: 'rice-mound', chopped: 'rice-clusters', accent: 0xd8cdb8 },
});

export function ingredientVisual(id) {
  return INGREDIENT_VISUALS[id] || { whole: 'unknown', chopped: 'unknown', accent: 0xffffff };
}
