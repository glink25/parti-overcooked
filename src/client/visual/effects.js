import * as THREE from 'three';

const COLORS = {
  steam: 0xf5fbff, smoke: 0x31343b, bubble: 0x88e5ff,
  crumb: 0xf5bf56, spark: 0xffd84d, star: 0xffdf55,
};

export function createEffectSystem(scene, tier) {
  const max = tier === 'low' ? 28 : 64;
  const pool = [];
  const geometry = new THREE.IcosahedronGeometry(0.075, 0);
  const materials = new Map();
  let cursor = 0;

  function material(kind, color) {
    const c = color || COLORS[kind] || 0xffffff;
    if (!materials.has(c)) materials.set(c, new THREE.MeshStandardMaterial({
      color: c, emissive: c, emissiveIntensity: kind === 'star' ? 0.45 : 0,
      flatShading: true, roughness: 0.75, transparent: true,
    }));
    return materials.get(c);
  }
  for (let i = 0; i < max; i++) {
    const mesh = new THREE.Mesh(geometry, material('steam'));
    mesh.visible = false; mesh.castShadow = false; scene.add(mesh);
    pool.push({ mesh, life: 0, maxLife: 1, velocity: new THREE.Vector3(), spin: 0 });
  }

  function emit(kind, position, options = {}) {
    const count = Math.min(options.count || 1, tier === 'low' ? 5 : 10);
    for (let i = 0; i < count; i++) {
      const p = pool[cursor++ % pool.length];
      p.mesh.visible = true;
      p.mesh.material = material(kind, options.color);
      p.mesh.position.copy(position);
      p.mesh.position.x += (Math.random() - 0.5) * (options.spread || 0.32);
      p.mesh.position.z += (Math.random() - 0.5) * (options.spread || 0.32);
      const size = (options.size || 1) * (0.65 + Math.random() * 0.65);
      p.mesh.scale.setScalar(size);
      const outward = options.outward || 0.3;
      p.velocity.set((Math.random() - 0.5) * outward, options.rise ?? 0.55, (Math.random() - 0.5) * outward);
      p.life = p.maxLife = options.life || (0.65 + Math.random() * 0.55);
      p.spin = (Math.random() - 0.5) * 6;
    }
  }

  function update(dt) {
    for (const p of pool) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.mesh.visible = false; continue; }
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.velocity.y -= dt * 0.15;
      p.mesh.rotation.y += p.spin * dt;
      p.mesh.scale.multiplyScalar(Math.max(0.92, 1 - dt * 0.7));
    }
  }

  function burst(kind, position, color) {
    emit(kind, position, { count: tier === 'low' ? 5 : 9, color, spread: 0.25, outward: 1.5, rise: 1.25, life: 0.9, size: 1.2 });
  }

  function dispose() {
    for (const p of pool) scene.remove(p.mesh);
    geometry.dispose();
    for (const effectMaterial of materials.values()) effectMaterial.dispose();
    materials.clear();
  }
  return { emit, burst, update, dispose };
}
