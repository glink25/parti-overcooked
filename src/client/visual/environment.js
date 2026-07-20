import * as THREE from 'three';

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const smoothstep = (value) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

function mixColor(a, b, t, out = new THREE.Color()) {
  return out.setHex(a).lerp(new THREE.Color(b), clamp01(t));
}

export function daylightFor(theme, progress) {
  const p = clamp01(progress);
  const stops = theme.daylight;
  const late = p > 0.75;
  const from = late ? stops.afternoon : stops.noon;
  const to = late ? stops.party : stops.afternoon;
  const t = smoothstep(late ? (p - 0.75) / 0.25 : p / 0.75);
  const color = (key) => mixColor(from[key], to[key], t).getHex();
  const number = (key) => THREE.MathUtils.lerp(from[key], to[key], t);
  return {
    skyTop: color('skyTop'), skyBottom: color('skyBottom'), fog: color('fog'),
    sun: color('sun'), hemiSky: color('hemiSky'), hemiGround: color('hemiGround'),
    sunIntensity: number('sunIntensity'), hemiIntensity: number('hemiIntensity'),
    party: smoothstep((p - 0.82) / 0.18),
  };
}

function makeSkyMaterial(top, bottom) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { topColor: { value: new THREE.Color(top) }, bottomColor: { value: new THREE.Color(bottom) } },
    vertexShader: 'varying float vHeight; void main(){vHeight=normalize(position).y;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'uniform vec3 topColor;uniform vec3 bottomColor;varying float vHeight;void main(){float h=smoothstep(-0.15,0.72,vHeight);gl_FragColor=vec4(mix(bottomColor,topColor,h),1.0);}',
  });
}

function addCloud(group, x, y, z, scale, material) {
  const cloud = new THREE.Group();
  const parts = [[-0.42, 0, 0, 0.34], [-0.12, 0.13, 0, 0.43], [0.23, 0.04, 0, 0.38], [0.5, -0.02, 0, 0.27]];
  for (const [px, py, pz, size] of parts) {
    const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(size, 1), material);
    puff.position.set(px, py, pz); cloud.add(puff);
  }
  cloud.position.set(x, y, z); cloud.scale.setScalar(scale); cloud.userData.startX = x; cloud.userData.startY = y;
  group.add(cloud); return cloud;
}

export function createEnvironmentController({ scene, hemi, sun, mat, box, cyl, sph, qualityTier }) {
  let group = null;
  let theme = null;
  let bounds = null;
  let sky = null;
  let sunDisk = null;
  let water = null;
  let waterPositions = null;
  const clouds = [];
  const rotors = [];
  const movers = [];
  const partyLights = [];

  function addTree(parent, x, z, palm = false) {
    const trunk = cyl(palm ? 0.09 : 0.12, palm ? 0.15 : 0.17, palm ? 1.15 : 0.72, palm ? 0xb77a45 : 0x845235, 7, { kind: 'wood', accent: 0x5d3826 });
    trunk.position.set(x, palm ? 0.58 : 0.36, z);
    parent.add(trunk);
    if (!palm) {
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.48, 0), mat(0x73c95a, { kind: 'noise', accent: 0x3f9145 }));
      crown.position.set(x, 1.02, z); crown.scale.y = 1.15; crown.castShadow = true; parent.add(crown);
    } else {
      const leaves = new THREE.Group(); leaves.position.set(x, 1.18, z);
      for (let i = 0; i < 6; i++) {
        const leaf = box(0.08, 0.035, 0.68, i % 2 ? 0x45b85d : 0x64cf69);
        leaf.position.z = 0.27; leaf.rotation.y = i * Math.PI / 3; leaf.rotation.x = -0.22; leaves.add(leaf);
      }
      parent.add(leaves); movers.push({ kind: 'sway', object: leaves, phase: x * 0.7 });
    }
  }

  function addFlowerBed(parent, x, z, length = 1.8) {
    const soil = box(length, 0.2, 0.52, 0xa66b45, { kind: 'noise', accent: 0x70422d }); soil.position.set(x, 0.02, z); parent.add(soil);
    const count = qualityTier === 'low' ? 4 : 7;
    const colors = [0xff6684, 0xffcc45, 0x8d76e8, 0xffffff];
    for (let i = 0; i < count; i++) {
      const fx = x - length * 0.42 + (i / Math.max(1, count - 1)) * length * 0.84;
      const stem = cyl(0.018, 0.022, 0.28, 0x4f9b4b, 5); stem.position.set(fx, 0.24, z); parent.add(stem);
      const bloom = sph(0.095, colors[i % colors.length], 7, 5); bloom.position.set(fx, 0.41, z); parent.add(bloom);
    }
  }

  function addBunting(parent, w, z) {
    const rope = box(w + 1, 0.025, 0.025, 0x795548); rope.position.set(w / 2, 2.25, z); parent.add(rope);
    const colors = [0xff665e, 0xffc83d, 0x47c8b6, 0x6f8ee8];
    for (let x = 0.5, i = 0; x < w; x += 1.15, i++) {
      const flag = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.42, 3), mat(colors[i % colors.length]));
      flag.rotation.z = Math.PI; flag.position.set(x, 2.04, z); parent.add(flag);
      movers.push({ kind: 'flag', object: flag, phase: i * 0.8 });
    }
  }

  function buildGarden(parent, w, h) {
    const lawn = box(w + 4.5, 0.16, h + 4.2, 0x75c95d, { kind: 'noise', accent: 0xa7de78 });
    lawn.position.set(w / 2, -0.2, h / 2); lawn.castShadow = false; lawn.receiveShadow = true; parent.add(lawn);
    const patio = box(w + 2.2, 0.12, h + 2, 0xf5c97f, { kind: 'tile', accent: 0xd99c5c });
    patio.position.set(w / 2, -0.11, h / 2); patio.castShadow = false; patio.receiveShadow = true; parent.add(patio);
    addBunting(parent, w, -0.65);
    addFlowerBed(parent, 2, -0.82, 2.2); addFlowerBed(parent, w - 2, -0.82, 2.2);
    addTree(parent, -1.2, 1); addTree(parent, w + 1.2, h - 1);
    if (qualityTier !== 'low') { addTree(parent, -1.25, h - 1); addTree(parent, w + 1.25, 1); }
    const windmill = new THREE.Group(); windmill.position.set(-1.2, 1.45, h / 2);
    const mast = box(0.2, 2.5, 0.2, 0xfff4d0, { kind: 'wood', accent: 0xd7a86e }); mast.position.y = -0.2; windmill.add(mast);
    const hub = cyl(0.15, 0.15, 0.18, 0xffb43c, 8); hub.rotation.x = Math.PI / 2; windmill.add(hub);
    const blades = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const angle = i * Math.PI / 2;
      const blade = box(0.16, 1.05, 0.06, i % 2 ? 0xff7468 : 0x58c7b4);
      blade.position.set(-Math.sin(angle) * 0.55, Math.cos(angle) * 0.55, 0); blade.rotation.z = angle; blades.add(blade);
    }
    windmill.add(blades); parent.add(windmill); rotors.push({ object: blades, speed: 0.55 });
  }

  function addGear(parent, x, y, z, color, scale, speed) {
    const gear = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42 * scale, 0.1 * scale, 6, 12), mat(color, { kind: 'metal', accent: 0xffffff }));
    gear.add(ring);
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      const tooth = box(0.13 * scale, 0.25 * scale, 0.12, color);
      tooth.position.set(-Math.sin(angle) * 0.53 * scale, Math.cos(angle) * 0.53 * scale, 0); tooth.rotation.z = angle; gear.add(tooth);
    }
    gear.position.set(x, y, z); parent.add(gear); rotors.push({ object: gear, speed });
  }

  function buildFactory(parent, layout) {
    const { w, h, cells } = layout;
    const slab = box(w + 4.2, 0.16, h + 4, 0xb9eee2, { kind: 'tile', accent: 0x79cfc7 });
    slab.position.set(w / 2, -0.2, h / 2); slab.castShadow = false; slab.receiveShadow = true; parent.add(slab);
    const colors = [0xff7f73, 0xffd34f, 0x52cdb8, 0x8ea9f3];
    for (const side of [-1, 1]) {
      const x = side < 0 ? -0.72 : w + 0.72;
      const pipe = cyl(0.12, 0.12, h + 1.4, side < 0 ? 0xff7f73 : 0x52cdb8, 8, { kind: 'metal' });
      pipe.rotation.x = Math.PI / 2; pipe.position.set(x, 0.9, h / 2); parent.add(pipe);
      for (let z = 1; z < h; z += 2) { const candy = sph(0.2, colors[(z + (side > 0 ? 1 : 0)) % colors.length], 8, 6); candy.position.set(x, 1.45, z); parent.add(candy); }
    }
    addGear(parent, -0.9, 1.8, 2, 0xffc83d, 1.15, 0.65);
    addGear(parent, w + 0.9, 1.7, h - 2, 0xff7468, 0.95, -0.8);
    if (qualityTier !== 'low') addGear(parent, -0.85, 1.25, h - 1.7, 0x6d8feb, 0.7, -1.05);
    for (const [x, color] of [[2.3, 0xff7f73], [w - 2.3, 0x6d8feb]]) {
      const chimney = cyl(0.22, 0.28, 1.7, color, 8, { kind: 'metal', accent: 0xffffff });
      chimney.position.set(x, 0.72, -1.05); parent.add(chimney);
      const rim = cyl(0.3, 0.3, 0.16, 0xffefb0, 8); rim.position.set(x, 1.62, -1.05); parent.add(rim);
      for (let i = 0; i < (qualityTier === 'low' ? 2 : 3); i++) {
        const puff = sph(0.2 + i * 0.07, 0xffffff, 7, 5); puff.position.set(x + i * 0.16, 1.95 + i * 0.27, -1.05); parent.add(puff);
      }
    }
    for (let z = 0; z < h; z++) {
      for (let x = 0; x < w; x++) {
        if (cells[z * w + x] !== 'C' || Math.abs(x - Math.floor(w / 2)) > 1) continue;
        const belt = box(0.7, 0.025, 0.58, z % 2 ? 0xffd653 : 0xff9b75);
        belt.position.set(x + 0.5, 0.93, z + 0.5); parent.add(belt);
      }
    }
    for (let x = 1; x < w; x += 2) {
      const bulb = sph(0.075, colors[x % colors.length], 7, 5);
      bulb.material = mat(colors[x % colors.length], { emissive: colors[x % colors.length], emissiveIntensity: 0.25 });
      bulb.position.set(x, 1.9, -0.65); parent.add(bulb); partyLights.push(bulb);
    }
  }

  function addUmbrella(parent, x, z, color) {
    const pole = cyl(0.035, 0.035, 1.15, 0xffffff, 7); pole.position.set(x, 0.55, z);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.65, 0.26, 10), mat(color)); shade.position.set(x, 1.18, z); parent.add(pole, shade);
  }

  function addSailboat(parent, x, z, color, phase) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.8, 5), mat(0xf7d18c)); hull.rotation.z = Math.PI / 2; boat.add(hull);
    const mast = box(0.025, 0.72, 0.025, 0x795548); mast.position.y = 0.35; boat.add(mast);
    const sail = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.62, 3), mat(color)); sail.position.set(0.18, 0.5, 0); sail.rotation.z = -0.15; boat.add(sail);
    boat.position.set(x, 0.05, z); parent.add(boat); movers.push({ kind: 'boat', object: boat, startX: x, phase });
  }

  function buildIsland(parent, w, h) {
    water = new THREE.Mesh(new THREE.PlaneGeometry(90, 90, qualityTier === 'low' ? 1 : 12, qualityTier === 'low' ? 1 : 12), mat(0x35c8df, {
      roughness: 0.28, metalness: 0.08, transparent: true, opacity: 0.94, emissive: 0x149bb8, emissiveIntensity: 0.16,
    }));
    water.rotation.x = -Math.PI / 2; water.position.set(w / 2, -0.38, h / 2); water.receiveShadow = true; parent.add(water);
    if (qualityTier !== 'low') waterPositions = water.geometry.attributes.position;
    const sand = box(w + 3.6, 0.15, h + 3.5, 0xffdf91, { kind: 'noise', accent: 0xf3bd6f }); sand.position.set(w / 2, -0.21, h / 2); parent.add(sand);
    const deck = box(w + 2.1, 0.16, h + 2, 0xe7b870, { kind: 'wood', accent: 0xa86d47 }); deck.position.set(w / 2, -0.11, h / 2); parent.add(deck);
    addTree(parent, -1.15, 1.1, true); addTree(parent, w + 1.15, h - 1, true);
    addUmbrella(parent, -1.05, h - 1.2, 0xff6680); addUmbrella(parent, w + 1.05, 1.2, 0x5bc9ed);
    addSailboat(parent, -3.4, -1.6, 0xff6680, 0); if (qualityTier !== 'low') addSailboat(parent, w + 2.8, h + 1.8, 0xffd449, 2.4);
    for (let x = 0.4; x < w; x += 1.35) {
      const color = Math.floor(x) % 2 ? 0xff6f9e : 0xffd44d;
      const bulb = sph(0.07, color, 7, 5); bulb.material = mat(color, { emissive: color, emissiveIntensity: 0.3 }); bulb.position.set(x, 2.12, -0.62); parent.add(bulb); partyLights.push(bulb);
    }
    addBunting(parent, w, -0.66);
  }

  function buildEnvironment(parent, layout, nextTheme) {
    dispose();
    theme = nextTheme; bounds = { w: layout.w, h: layout.h };
    group = new THREE.Group(); group.name = `environment-${theme.decor}`; parent.add(group);
    const initial = daylightFor(theme, 0);
    const skyMaterial = makeSkyMaterial(initial.skyTop, initial.skyBottom);
    sky = new THREE.Mesh(new THREE.SphereGeometry(65, 20, 12), skyMaterial); sky.position.set(layout.w / 2, 0, layout.h / 2); sky.renderOrder = -100; group.add(sky);
    sunDisk = sph(1.15, initial.sun, 12, 8); sunDisk.material = mat(initial.sun, { emissive: initial.sun, emissiveIntensity: 0.75 }); sunDisk.castShadow = false; group.add(sunDisk);
    const cloudMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, fog: false });
    const cloudCount = qualityTier === 'low' ? 3 : 6;
    for (let i = 0; i < cloudCount; i++) clouds.push(addCloud(group, -7 + i * 5.6, 3.35 + (i % 2) * 0.75, -4.2 - (i % 3) * 1.25, 0.82 + (i % 3) * 0.18, cloudMaterial));
    if (theme.decor === 'garden') buildGarden(group, layout.w, layout.h);
    else if (theme.decor === 'factory') buildFactory(group, layout);
    else buildIsland(group, layout.w, layout.h);
    updateEnvironment(0, 0);
    return group;
  }

  function updateEnvironment(progress, elapsed) {
    if (!group || !theme || !bounds) return;
    const daylight = daylightFor(theme, progress);
    sky.material.uniforms.topColor.value.setHex(daylight.skyTop);
    sky.material.uniforms.bottomColor.value.setHex(daylight.skyBottom);
    scene.background.setHex(daylight.skyTop);
    if (scene.fog) scene.fog.color.setHex(daylight.fog);
    hemi.color.setHex(daylight.hemiSky); hemi.groundColor.setHex(daylight.hemiGround); hemi.intensity = daylight.hemiIntensity;
    sun.color.setHex(daylight.sun); sun.intensity = daylight.sunIntensity;
    const angle = THREE.MathUtils.lerp(0.2, 1.08, clamp01(progress));
    sun.position.set(bounds.w / 2 + Math.cos(angle) * 12, 10 + Math.sin(angle) * 6, bounds.h / 2 - 8);
    sunDisk.position.set(bounds.w / 2 + Math.cos(angle) * 17, 6.5 + Math.sin(angle) * 7, -10);
    const pace = theme.animationSpeed * (1 + daylight.party * 0.55);
    clouds.forEach((cloud, index) => {
      const span = bounds.w + 18;
      cloud.position.x = ((cloud.userData.startX + elapsed * pace * (0.22 + index * 0.018) + 9) % span) - 9;
      cloud.position.y = cloud.userData.startY + Math.sin(elapsed * 0.35 + index) * 0.08;
    });
    rotors.forEach((rotor) => { rotor.object.rotation.z = elapsed * rotor.speed * pace; });
    movers.forEach((mover) => {
      if (mover.kind === 'flag') mover.object.rotation.z = Math.PI + Math.sin(elapsed * 2.2 * pace + mover.phase) * 0.08;
      else if (mover.kind === 'sway') mover.object.rotation.z = Math.sin(elapsed * 0.9 * pace + mover.phase) * 0.055;
      else if (mover.kind === 'boat') {
        mover.object.position.x = mover.startX + Math.sin(elapsed * 0.2 * pace + mover.phase) * 1.2;
        mover.object.position.y = 0.05 + Math.sin(elapsed * 1.1 + mover.phase) * 0.045;
      }
    });
    if (water) {
      water.position.y = -0.38 + Math.sin(elapsed * 0.72) * 0.018;
      water.rotation.z = Math.sin(elapsed * 0.2) * 0.008;
      if (waterPositions) {
        for (let i = 0; i < waterPositions.count; i++) {
          const x = waterPositions.getX(i); const y = waterPositions.getY(i);
          waterPositions.setZ(i, Math.sin(x * 0.18 + elapsed * 0.7) * 0.045 + Math.cos(y * 0.22 + elapsed * 0.52) * 0.03);
        }
        waterPositions.needsUpdate = true;
      }
    }
    partyLights.forEach((light, index) => {
      light.material.emissiveIntensity = 0.2 + daylight.party * (0.75 + Math.max(0, Math.sin(elapsed * 6 - index * 0.7)) * 0.85);
      light.scale.setScalar(1 + daylight.party * Math.max(0, Math.sin(elapsed * 6 - index * 0.7)) * 0.22);
    });
  }

  function dispose() {
    if (group && group.parent) group.parent.remove(group);
    if (group) group.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      if (object.material && object.material.isShaderMaterial) object.material.dispose();
      if (object.material && object.material.isMeshBasicMaterial) object.material.dispose();
    });
    group = null; theme = null; bounds = null; sky = null; sunDisk = null; water = null; waterPositions = null;
    clouds.length = 0; rotors.length = 0; movers.length = 0; partyLights.length = 0;
  }

  return { buildEnvironment, updateEnvironment, dispose };
}
