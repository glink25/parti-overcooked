import * as THREE from 'three';

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function proceduralTexture(kind, baseHex, accentHex = baseHex) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const c = canvas.getContext('2d');
  const base = new THREE.Color(baseHex);
  const accent = new THREE.Color(accentHex);
  c.fillStyle = `#${base.getHexString()}`;
  c.fillRect(0, 0, size, size);
  const rnd = mulberry32((baseHex ^ accentHex ^ kind.length * 997) >>> 0);

  if (kind === 'wood') {
    c.strokeStyle = `#${accent.getHexString()}`;
    c.globalAlpha = 0.22;
    c.lineWidth = 2;
    for (let y = 7; y < size; y += 12) {
      c.beginPath();
      for (let x = -8; x <= size + 8; x += 8) {
        const yy = y + Math.sin(x * 0.14 + y) * 2.5 + (rnd() - 0.5) * 2;
        x < 0 ? c.moveTo(x, yy) : c.lineTo(x, yy);
      }
      c.stroke();
    }
  } else if (kind === 'tile') {
    c.strokeStyle = `#${accent.getHexString()}`;
    c.globalAlpha = 0.34;
    c.lineWidth = 4;
    for (let p = 0; p <= size; p += 32) {
      c.beginPath(); c.moveTo(p, 0); c.lineTo(p, size); c.stroke();
      c.beginPath(); c.moveTo(0, p); c.lineTo(size, p); c.stroke();
    }
  } else {
    for (let i = 0; i < 900; i++) {
      const a = 0.025 + rnd() * 0.06;
      c.fillStyle = rnd() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
      const s = 1 + rnd() * 2;
      c.fillRect(rnd() * size, rnd() * size, s, s);
    }
    if (kind === 'metal') {
      c.globalAlpha = 0.16; c.strokeStyle = '#ffffff'; c.lineWidth = 1;
      for (let i = 0; i < 18; i++) {
        const y = rnd() * size;
        c.beginPath(); c.moveTo(rnd() * 50, y); c.lineTo(70 + rnd() * 58, y + rnd() * 2); c.stroke();
      }
    }
  }
  c.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 2;
  return texture;
}

export function createMaterialSystem() {
  const materials = new Map();
  const textures = new Map();

  function get(color, options = {}) {
    const key = `${color}:${options.kind || 'flat'}:${options.accent || ''}:${options.emissive || 0}:${options.metalness || 0}`;
    if (materials.has(key)) return materials.get(key);
    let map = null;
    if (options.kind && options.kind !== 'flat') {
      const textureKey = `${options.kind}:${color}:${options.accent || color}`;
      if (!textures.has(textureKey)) textures.set(textureKey, proceduralTexture(options.kind, color, options.accent || color));
      map = textures.get(textureKey);
    }
    const material = new THREE.MeshStandardMaterial({
      color,
      map,
      flatShading: options.flatShading !== false,
      roughness: options.roughness ?? (options.kind === 'metal' ? 0.46 : 0.88),
      metalness: options.metalness ?? (options.kind === 'metal' ? 0.35 : 0),
      emissive: options.emissive || 0x000000,
      emissiveIntensity: options.emissiveIntensity || 0,
      transparent: Boolean(options.transparent),
      opacity: options.opacity ?? 1,
    });
    materials.set(key, material);
    return material;
  }

  function dispose() {
    for (const material of materials.values()) material.dispose();
    for (const texture of textures.values()) texture.dispose();
    materials.clear(); textures.clear();
  }

  return { get, dispose, materialCount: () => materials.size, textureCount: () => textures.size };
}
