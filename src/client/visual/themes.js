export const MAP_THEMES = {
  classic: {
    id: 'classic', label: '晴日花园市集', icon: '🌻', decor: 'garden', animationSpeed: 1,
    sky: 0x72d4ff, fog: 0xc8efff, ground: 0x75c95d,
    floorA: 0xffd88d, floorB: 0xffefbd, grout: 0xd9a45f,
    wall: 0xf06d57, wallAlt: 0xff9b70, trim: 0x9c5139,
    cabinet: 0xb86f45, cabinetDark: 0x82472f, counterTop: 0xfff1cc,
    metal: 0xa8b1b0, accent: 0xf4a340, target: 0xffd45c,
    hemiSky: 0xfff5d8, hemiGround: 0x83ad64, hemiIntensity: 1.3,
    sun: 0xffe3a6, sunIntensity: 2.05, fogDensity: 0.006,
    daylight: {
      noon: { skyTop: 0x55c8ff, skyBottom: 0xe9faff, fog: 0xd8f5ff, sun: 0xfff2c7, hemiSky: 0xffffff, hemiGround: 0x8fcf72, sunIntensity: 2.1, hemiIntensity: 1.35 },
      afternoon: { skyTop: 0x78cfff, skyBottom: 0xffefc2, fog: 0xf6e8c9, sun: 0xffd27c, hemiSky: 0xfff3d1, hemiGround: 0x8fbd70, sunIntensity: 1.95, hemiIntensity: 1.32 },
      party: { skyTop: 0x86bded, skyBottom: 0xffc993, fog: 0xf2d1b2, sun: 0xffb85f, hemiSky: 0xffe8c4, hemiGround: 0x82aa69, sunIntensity: 1.8, hemiIntensity: 1.28 },
    },
  },
  split: {
    id: 'split', label: '彩色糖果工厂', icon: '🍬', decor: 'factory', animationSpeed: 1.12,
    sky: 0x91dcff, fog: 0xd6f6ff, ground: 0xb9eee2,
    floorA: 0xbceade, floorB: 0xffe7a8, grout: 0x6fc9bf,
    wall: 0x62cbbb, wallAlt: 0x8ce2d1, trim: 0xffc940,
    cabinet: 0x5e9fd1, cabinetDark: 0x386c9b, counterTop: 0xfff1ba,
    metal: 0x9dadb3, accent: 0xffb52e, target: 0xffcf43,
    hemiSky: 0xf4fdff, hemiGround: 0x91c9b7, hemiIntensity: 1.3,
    sun: 0xffefc1, sunIntensity: 2, fogDensity: 0.006,
    daylight: {
      noon: { skyTop: 0x72cfff, skyBottom: 0xecfbff, fog: 0xdaf7fa, sun: 0xfff4cf, hemiSky: 0xffffff, hemiGround: 0x92d7c7, sunIntensity: 2.05, hemiIntensity: 1.34 },
      afternoon: { skyTop: 0x8fd7ff, skyBottom: 0xffe9b8, fog: 0xf5e6c8, sun: 0xffd97f, hemiSky: 0xfff4d8, hemiGround: 0x8dceb9, sunIntensity: 1.9, hemiIntensity: 1.3 },
      party: { skyTop: 0x9ac4ef, skyBottom: 0xffc69c, fog: 0xf4d2bb, sun: 0xffbd70, hemiSky: 0xffe7cd, hemiGround: 0x87bcae, sunIntensity: 1.78, hemiIntensity: 1.26 },
    },
  },
  ring: {
    id: 'ring', label: '热带海岛餐吧', icon: '🏝️', decor: 'island', animationSpeed: 0.92,
    sky: 0x4dc9ff, fog: 0xc9f5ff, ground: 0x35c8df,
    floorA: 0x64d6cb, floorB: 0x9be6d8, grout: 0x38a9a6,
    wall: 0x4bbfc3, wallAlt: 0x7bdad0, trim: 0xf06f78,
    cabinet: 0x3fb5ad, cabinetDark: 0x277e83, counterTop: 0xfff3ca,
    metal: 0x91b5ba, accent: 0xff5fa2, target: 0x58f4e8,
    hemiSky: 0xf1fdff, hemiGround: 0x69bba8, hemiIntensity: 1.32,
    sun: 0xfff0b5, sunIntensity: 2.08, fogDensity: 0.005,
    daylight: {
      noon: { skyTop: 0x28bfff, skyBottom: 0xe5fbff, fog: 0xd5f7f7, sun: 0xfff3be, hemiSky: 0xffffff, hemiGround: 0x6bc8b2, sunIntensity: 2.12, hemiIntensity: 1.36 },
      afternoon: { skyTop: 0x63cfff, skyBottom: 0xffe5a7, fog: 0xf4e4c2, sun: 0xffd26e, hemiSky: 0xfff1cc, hemiGround: 0x67baa5, sunIntensity: 1.95, hemiIntensity: 1.32 },
      party: { skyTop: 0x75b9ea, skyBottom: 0xffbd8c, fog: 0xf0ccb1, sun: 0xffad5d, hemiSky: 0xffe2bd, hemiGround: 0x61aa98, sunIntensity: 1.82, hemiIntensity: 1.28 },
    },
  },
};

export function themeFor(mapId) {
  return MAP_THEMES[mapId] || MAP_THEMES.classic;
}

export function detectQualityTier() {
  const mobile = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  const memory = Number(navigator.deviceMemory) || 4;
  const cores = Number(navigator.hardwareConcurrency) || 4;
  return mobile || memory <= 3 || cores <= 4 ? 'low' : 'high';
}

export function qualitySettings(tier) {
  return tier === 'low'
    ? { maxPixelRatio: 2, pixelBudget: 2_500_000, antialias: false, shadowSize: 512, particles: 28, decorations: 0.55 }
    : { maxPixelRatio: 1.65, pixelBudget: Infinity, antialias: true, shadowSize: 1024, particles: 64, decorations: 1 };
}

export function computeRenderPixelRatio({ width, height, devicePixelRatio, maxPixelRatio, pixelBudget }) {
  const viewportWidth = Math.max(1, Number(width) || 1);
  const viewportHeight = Math.max(1, Number(height) || 1);
  const deviceRatio = Math.max(1, Number(devicePixelRatio) || 1);
  const ratioLimit = Math.max(1, Number(maxPixelRatio) || 1);
  const budget = Number(pixelBudget);
  const budgetRatio = Number.isFinite(budget) && budget > 0
    ? Math.sqrt(budget / (viewportWidth * viewportHeight))
    : Infinity;
  return Math.max(1, Math.min(deviceRatio, ratioLimit, budgetRatio));
}
