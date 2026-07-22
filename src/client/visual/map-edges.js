import * as THREE from 'three';

function roundedRectPoints(x, z, width, height, radius, steps = 4) {
  const r = Math.max(0.01, Math.min(radius, width / 2, height / 2));
  const points = [];
  const corners = [
    [x + width - r, z + r, -Math.PI / 2, 0],
    [x + width - r, z + height - r, 0, Math.PI / 2],
    [x + r, z + height - r, Math.PI / 2, Math.PI],
    [x + r, z + r, Math.PI, Math.PI * 1.5],
  ];
  for (const [cx, cz, start, end] of corners) {
    for (let index = 0; index <= steps; index++) {
      const angle = start + (end - start) * index / steps;
      points.push({ x: cx + Math.cos(angle) * r, z: cz + Math.sin(angle) * r });
    }
  }
  return points;
}

function ellipsePoints(cx, cz, radiusX, radiusZ, segments = 28) {
  return Array.from({ length: segments }, (_, index) => {
    const angle = index / segments * Math.PI * 2;
    return { x: cx + Math.cos(angle) * radiusX, z: cz + Math.sin(angle) * radiusZ };
  });
}

function footprintBounds(points) {
  const xs = points.map((point) => point.x);
  const zs = points.map((point) => point.z);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}

function scaleFootprint(points, scale) {
  const bounds = footprintBounds(points);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  return points.map((point) => ({ x: cx + (point.x - cx) * scale, z: cz + (point.z - cz) * scale }));
}

export function mapEdgeFootprints(layout, profile) {
  const { w, h } = layout.bounds || layout;
  const margin = Number(profile?.margin) || 0;
  if (!profile || profile.kind === 'platforms') return [];
  if (profile.kind === 'roundedRect') {
    return [roundedRectPoints(-margin, -margin, w + margin * 2, h + margin * 2, Math.min(w, h) * .18, 5)];
  }
  if (profile.kind === 'ellipse') {
    return [ellipsePoints(w / 2, h / 2, w / 2 + margin, h / 2 + margin, 30)];
  }
  if (profile.kind === 'jagged') {
    return [[
      { x: -margin, z: h * .16 }, { x: -.45 * margin, z: .15 * margin }, { x: w * .16, z: -margin },
      { x: w * .34, z: -.42 * margin }, { x: w * .51, z: -1.05 * margin }, { x: w * .7, z: -.35 * margin },
      { x: w * .87, z: -.82 * margin }, { x: w + margin, z: h * .13 }, { x: w + .55 * margin, z: h * .37 },
      { x: w + margin, z: h * .68 }, { x: w + .25 * margin, z: h + .78 * margin }, { x: w * .77, z: h + .35 * margin },
      { x: w * .58, z: h + margin }, { x: w * .37, z: h + .4 * margin }, { x: w * .17, z: h + .82 * margin },
      { x: -.72 * margin, z: h + .15 * margin }, { x: -.35 * margin, z: h * .72 },
    ]];
  }
  if (profile.kind === 'uHull') {
    const leftInner = w * .29, coreLeft = w * .37, coreRight = w * .63, rightInner = w * .71;
    const top = 2 - margin, coreTop = 4 - margin * .35, bottom = h - 2 + margin;
    return [[
      { x: -margin, z: top }, { x: leftInner, z: top }, { x: leftInner, z: coreTop + 1 },
      { x: coreLeft, z: coreTop + 1 }, { x: coreLeft, z: coreTop }, { x: coreRight, z: coreTop },
      { x: coreRight, z: coreTop + 1 }, { x: rightInner, z: coreTop + 1 }, { x: rightInner, z: top },
      { x: w + margin, z: top }, { x: w + margin, z: bottom }, { x: w * .76, z: bottom },
      { x: w * .76, z: h - 1 + margin }, { x: w * .24, z: h - 1 + margin }, { x: w * .24, z: bottom },
      { x: -margin, z: bottom },
    ]];
  }
  if (profile.kind === 'battlementCross') {
    const x1 = w * .36, x2 = w * .64, z1 = h * .32, z2 = h * .68, cx = w / 2, cz = h / 2;
    const left = -margin, right = w + margin, top = -margin, bottom = h + margin;
    return [[
      { x: x1, z: top + .4 }, { x: cx - .8, z: top + .4 }, { x: cx - .8, z: top }, { x: cx + .8, z: top },
      { x: cx + .8, z: top + .4 }, { x: x2, z: top + .4 }, { x: x2, z: z1 }, { x: right - .4, z: z1 },
      { x: right - .4, z: cz - .7 }, { x: right, z: cz - .7 }, { x: right, z: cz + .7 }, { x: right - .4, z: cz + .7 },
      { x: right - .4, z: z2 }, { x: x2, z: z2 }, { x: x2, z: bottom - .4 }, { x: cx + .8, z: bottom - .4 },
      { x: cx + .8, z: bottom }, { x: cx - .8, z: bottom }, { x: cx - .8, z: bottom - .4 }, { x: x1, z: bottom - .4 },
      { x: x1, z: z2 }, { x: left + .4, z: z2 }, { x: left + .4, z: cz + .7 }, { x: left, z: cz + .7 },
      { x: left, z: cz - .7 }, { x: left + .4, z: cz - .7 }, { x: left + .4, z: z1 }, { x: x1, z: z1 },
    ]];
  }
  throw new Error(`Unknown map edge profile: ${profile.kind}`);
}

export function platformEdgeFootprints(platform, profile) {
  if (!platform?.tiles?.length || profile?.kind !== 'platforms') return [];
  const minX = Math.min(...platform.tiles.map((tile) => tile.x));
  const maxX = Math.max(...platform.tiles.map((tile) => tile.x + 1));
  const minZ = Math.min(...platform.tiles.map((tile) => tile.z));
  const maxZ = Math.max(...platform.tiles.map((tile) => tile.z + 1));
  const margin = Number(profile.margin) || .35;
  const width = maxX - minX + margin * 2;
  const height = maxZ - minZ + margin * 2;
  const radius = platform.id === 'ferry' ? Math.min(width, height) * .48 : Math.min(width, height) * .2;
  return [roundedRectPoints(minX - margin, minZ - margin, width, height, radius, platform.id === 'ferry' ? 5 : 3)];
}

export function sceneStageFootprints(layout, profile) {
  const { w, h } = layout.bounds || layout;
  if (!profile) return [];
  const marginX = Number(profile.marginX) || 3;
  const marginZ = Number(profile.marginZ) || 3;
  const left = -marginX, right = w + marginX, top = -marginZ, bottom = h + marginZ;
  if (profile.kind === 'roundedStage') {
    return [roundedRectPoints(left, top, right - left, bottom - top, Math.min(w, h) * .24, 6)];
  }
  if (profile.kind === 'gearStage') {
    const cx = w / 2;
    return [[
      { x: left + 1.2, z: top }, { x: cx - 2.1, z: top }, { x: cx - 2.1, z: top - .55 },
      { x: cx + 2.1, z: top - .55 }, { x: cx + 2.1, z: top }, { x: right - 1.2, z: top },
      { x: right, z: top + 1.2 }, { x: right, z: bottom - 1.2 }, { x: right - 1.2, z: bottom },
      { x: cx + 2.1, z: bottom }, { x: cx + 2.1, z: bottom + .55 }, { x: cx - 2.1, z: bottom + .55 },
      { x: cx - 2.1, z: bottom }, { x: left + 1.2, z: bottom }, { x: left, z: bottom - 1.2 }, { x: left, z: top + 1.2 },
    ]];
  }
  if (profile.kind === 'lagoonStage') {
    return [ellipsePoints(w / 2, h / 2, w / 2 + marginX, h / 2 + marginZ, 40)];
  }
  if (profile.kind === 'iceShelfStage') {
    const back = Number(profile.marginBack) || marginZ;
    const front = Number(profile.marginFront) || marginZ;
    return [[
      { x: -marginX * .75, z: -back * .56 }, { x: -marginX * .35, z: -back }, { x: w * .15, z: -back * .84 },
      { x: w * .31, z: -back * 1.08 }, { x: w * .48, z: -back * .72 }, { x: w * .66, z: -back * 1.04 },
      { x: w * .84, z: -back * .76 }, { x: w + marginX * .52, z: -back * .9 }, { x: w + marginX, z: -back * .38 },
      { x: w + marginX * .72, z: h * .3 }, { x: w + marginX, z: h * .72 }, { x: w + marginX * .45, z: h + front },
      { x: w * .76, z: h + front * .72 }, { x: w * .58, z: h + front * 1.1 }, { x: w * .37, z: h + front * .74 },
      { x: w * .18, z: h + front }, { x: -marginX * .62, z: h + front * .55 }, { x: -marginX, z: h * .68 },
      { x: -marginX * .7, z: h * .24 },
    ]];
  }
  if (profile.kind === 'hexStage') {
    return [[
      { x: left + 2.2, z: top }, { x: right - 2.2, z: top }, { x: right, z: top + 2.2 },
      { x: right, z: bottom - 2.2 }, { x: right - 2.2, z: bottom }, { x: w * .7, z: bottom },
      { x: w * .64, z: bottom + .75 }, { x: w * .36, z: bottom + .75 }, { x: w * .3, z: bottom },
      { x: left + 2.2, z: bottom }, { x: left, z: bottom - 2.2 }, { x: left, z: top + 2.2 },
    ]];
  }
  if (profile.kind === 'shieldStage') {
    const cx = w / 2;
    return [[
      { x: left + 2, z: top }, { x: right - 2, z: top }, { x: right, z: top + 2 },
      { x: right, z: bottom - 2.6 }, { x: right - 2, z: bottom - .6 }, { x: cx + 4, z: bottom - .6 },
      { x: cx + 3, z: bottom + 1 }, { x: cx, z: bottom + 2.1 }, { x: cx - 3, z: bottom + 1 },
      { x: cx - 4, z: bottom - .6 }, { x: left + 2, z: bottom - .6 }, { x: left, z: bottom - 2.6 },
      { x: left, z: top + 2 },
    ]];
  }
  throw new Error(`Unknown scene stage profile: ${profile.kind}`);
}

export function footprintArea(points) {
  let area = 0;
  for (let index = 0; index < points.length; index++) {
    const a = points[index], b = points[(index + 1) % points.length];
    area += a.x * b.z - b.x * a.z;
  }
  return Math.abs(area) / 2;
}

export function footprintExtents(footprints) {
  const points = footprints.flat();
  if (!points.length) return null;
  const bounds = footprintBounds(points);
  return { ...bounds, w: bounds.maxX - bounds.minX, h: bounds.maxZ - bounds.minZ };
}

function shapeFromPoints(points) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0].x, points[0].z);
  for (let index = 1; index < points.length; index++) shape.lineTo(points[index].x, points[index].z);
  shape.closePath();
  return shape;
}

function edgeMesh(points, color, top, depth, mat, options = {}) {
  const geometry = new THREE.ExtrudeGeometry(shapeFromPoints(points), { depth, bevelEnabled: false, curveSegments: 1, steps: 1 });
  const mesh = new THREE.Mesh(geometry, mat(color, options));
  mesh.rotation.x = Math.PI / 2;
  mesh.position.y = top;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function layeredEdgeGroup(footprints, profile, mat) {
  const group = new THREE.Group();
  for (const points of footprints) {
    group.add(edgeMesh(points, profile.outer, -.13, profile.depth || .4, mat, { kind: 'noise', accent: profile.inner }));
    if (profile.glow) {
      group.add(edgeMesh(scaleFootprint(points, .96), profile.glow, -.085, .08, mat, { emissive: profile.glow, emissiveIntensity: .72, metalness: .25 }));
    }
    group.add(edgeMesh(scaleFootprint(points, profile.innerScale || .9), profile.inner, -.045, .12, mat, { kind: profile.kind === 'uHull' ? 'metal' : 'noise', accent: profile.outer }));
  }
  group.userData.edgeProfileId = profile.id;
  return group;
}

export function createMapEdgeGroup(layout, profile, mat) {
  return layeredEdgeGroup(mapEdgeFootprints(layout, profile), profile, mat);
}

export function createPlatformEdgeGroup(platform, profile, mat) {
  return layeredEdgeGroup(platformEdgeFootprints(platform, profile), profile, mat);
}

export function createSceneStageGroup(layout, profile, mat) {
  const group = new THREE.Group();
  const surfaceMeshes = [];
  for (const points of sceneStageFootprints(layout, profile)) {
    const outer = edgeMesh(points, profile.outer, -.43, profile.depth || .6, mat, { kind: profile.material === 'metal' ? 'metal' : 'noise', accent: profile.rim });
    outer.name = `stage-outer-${profile.id}`;
    const rimPoints = scaleFootprint(points, .975);
    const rim = edgeMesh(rimPoints, profile.rim, -.345, .2, mat, profile.glow ? { emissive: profile.rim, emissiveIntensity: .7, metalness: .28 } : { kind: 'noise', accent: profile.surface });
    rim.name = `stage-rim-${profile.id}`;
    const surfaceOptions = profile.water
      ? { transparent: true, opacity: .92, emissive: 0x149bb8, emissiveIntensity: .16, roughness: .3, metalness: .08 }
      : { kind: profile.material || 'noise', accent: profile.rim };
    const surface = edgeMesh(scaleFootprint(points, profile.surfaceScale || .94), profile.surface, -.265, .12, mat, surfaceOptions);
    surface.name = `stage-surface-${profile.id}`;
    surface.userData.stageSurface = true;
    surface.userData.baseY = surface.position.y;
    if (profile.water) surface.castShadow = false;
    surfaceMeshes.push(surface);
    group.add(outer, rim, surface);
  }
  group.name = `scene-stage-${profile.id}`;
  group.userData.stageProfileId = profile.id;
  group.userData.surfaceMeshes = surfaceMeshes;
  return group;
}
