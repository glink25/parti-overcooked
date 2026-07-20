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

MAP_THEMES.snow = {
  id: 'snow', label: '雪山餐车', icon: '❄️', decor: 'snow', animationSpeed: 0.78,
  sky: 0x8bd5f5, fog: 0xdceffa, ground: 0xeaf7ff, floorA: 0xd9f1ff, floorB: 0xffffff, grout: 0xaacde0,
  wall: 0x4f8fc9, wallAlt: 0x89c7ed, trim: 0xeaf8ff, cabinet: 0x547fa7, cabinetDark: 0x34546f,
  counterTop: 0xeefaff, metal: 0xb9d4df, accent: 0xffa43d, target: 0x78ddff,
  hemiSky: 0xf6fcff, hemiGround: 0x9fb7c5, hemiIntensity: 1.2, sun: 0xffefd0, sunIntensity: 1.95, fogDensity: 0.009,
  daylight: {
    noon: { skyTop: 0x72c9ef, skyBottom: 0xf4fbff, fog: 0xdceffa, sun: 0xfff5dc, hemiSky: 0xffffff, hemiGround: 0xabc5d2, sunIntensity: 2, hemiIntensity: 1.24 },
    afternoon: { skyTop: 0x8ac9e8, skyBottom: 0xffe3c4, fog: 0xe7dfd7, sun: 0xffcc88, hemiSky: 0xf6eddf, hemiGround: 0x9eb6c3, sunIntensity: 1.87, hemiIntensity: 1.2 },
    party: { skyTop: 0x718db9, skyBottom: 0xffb28d, fog: 0xcdbec0, sun: 0xffa85f, hemiSky: 0xe7d9df, hemiGround: 0x8298ad, sunIntensity: 1.75, hemiIntensity: 1.16 },
  },
};
MAP_THEMES.space = {
  id: 'space', label: '星际厨房', icon: '🚀', decor: 'space', animationSpeed: 0.55,
  sky: 0x202653, fog: 0x6576a0, ground: 0x7783a8, floorA: 0x7788b5, floorB: 0xa5b2d0, grout: 0x4c587d,
  wall: 0x6878a7, wallAlt: 0x91a8ce, trim: 0x62edf2, cabinet: 0x6476a5, cabinetDark: 0x3d4d79,
  counterTop: 0xd1edf2, metal: 0xaebdca, accent: 0xe877e9, target: 0x62f2e8,
  hemiSky: 0xe4ecff, hemiGround: 0x7180a6, hemiIntensity: 1.18, sun: 0xdaf7ff, sunIntensity: 2.04, fogDensity: 0.006,
  daylight: {
    noon: { skyTop: 0x202653, skyBottom: 0x7b8fbd, fog: 0x6576a0, sun: 0xdaf7ff, hemiSky: 0xe4ecff, hemiGround: 0x7180a6, sunIntensity: 2.08, hemiIntensity: 1.2 },
    afternoon: { skyTop: 0x292b60, skyBottom: 0x9296c7, fog: 0x747aa6, sun: 0xe8dcff, hemiSky: 0xeee9ff, hemiGround: 0x7c78a5, sunIntensity: 2.02, hemiIntensity: 1.18 },
    party: { skyTop: 0x35265e, skyBottom: 0xb383bd, fog: 0x88759e, sun: 0xffd2f2, hemiSky: 0xffe9fa, hemiGround: 0x846f9b, sunIntensity: 1.94, hemiIntensity: 1.16 },
  },
};
MAP_THEMES.castle = {
  id: 'castle', label: '皇家宴会厅', icon: '🏰', decor: 'castle', animationSpeed: 0.86,
  sky: 0x82acd1, fog: 0xc8c2b2, ground: 0x63815a, floorA: 0xbba47b, floorB: 0xd8c59b, grout: 0x756653,
  wall: 0x847568, wallAlt: 0xb09c82, trim: 0x702f3b, cabinet: 0x68422f, cabinetDark: 0x39251f,
  counterTop: 0xcab88f, metal: 0xb99747, accent: 0xd7a83f, target: 0xffd65c,
  hemiSky: 0xffedcf, hemiGround: 0x65755d, hemiIntensity: 1.15, sun: 0xffd79a, sunIntensity: 1.92, fogDensity: 0.008,
  daylight: {
    noon: { skyTop: 0x77acd8, skyBottom: 0xe9e2cd, fog: 0xd5d0c3, sun: 0xffebc3, hemiSky: 0xfff4df, hemiGround: 0x708268, sunIntensity: 1.98, hemiIntensity: 1.2 },
    afternoon: { skyTop: 0x8aa4bf, skyBottom: 0xf2c895, fog: 0xd4bfa5, sun: 0xffbf72, hemiSky: 0xffe3c2, hemiGround: 0x68755d, sunIntensity: 1.86, hemiIntensity: 1.16 },
    party: { skyTop: 0x736f8d, skyBottom: 0xd98170, fog: 0xb99a8c, sun: 0xff9857, hemiSky: 0xe8c0b0, hemiGround: 0x595b4f, sunIntensity: 1.75, hemiIntensity: 1.12 },
  },
};
MAP_THEMES.awards = { ...MAP_THEMES.classic, id: 'awards', label: '庆典广场', icon: '🏆', decor: 'garden', accent: 0xffc531 };

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
