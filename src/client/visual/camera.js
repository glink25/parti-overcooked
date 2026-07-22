const clamp01 = (value) => Math.max(0, Math.min(1, value));

export function smoothstep(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

export function countdownIntroProgress(countdown, duration = 3) {
  if (!Number.isFinite(countdown) || duration <= 0) return 1;
  return smoothstep(1 - countdown / duration);
}

export function cameraPoses(layout, aspect = 1) {
  const { w, h } = layout.bounds || { w: 15, h: 9 };
  const safeAspect = Math.max(0.55, aspect || 1);
  const fitW = (w / 2 + 2.2) / Math.tan(Math.PI * 24 / 180) / safeAspect;
  const fitH = (h + 2) * 1.02;
  const distance = Math.max(fitW, fitH, 8.5);
  const target = { x: w / 2, y: 0, z: h / 2 + 0.2 };
  const playingDistance = distance;
  const playing = { x: w / 2, y: playingDistance * 0.86, z: h / 2 + playingDistance * 0.6 };
  const overviewDistance = distance * 1.55;
  const overview = { x: w / 2, y: overviewDistance * 0.86, z: h / 2 + overviewDistance * 0.6 };
  return { target, playing, overview };
}

export function nextCameraFollowMode(current, pixelsPerTile, threshold = 44) {
  if (current) return pixelsPerTile < threshold + 12;
  return pixelsPerTile < threshold - 8;
}

export function advanceDeadZoneCenter(current, subject, radius = 2.1, alpha = 0.08) {
  if (!current) return { x: subject.x, z: subject.z };
  const dx=subject.x-current.x,dz=subject.z-current.z,distance=Math.hypot(dx,dz);
  if(distance<=radius)return {...current};
  const excess=distance-radius,target={x:current.x+dx/distance*excess,z:current.z+dz/distance*excess};
  return {x:current.x+(target.x-current.x)*alpha,z:current.z+(target.z-current.z)*alpha};
}

export function lerpCameraPose(from, to, progress) {
  const t = clamp01(progress);
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    z: from.z + (to.z - from.z) * t,
  };
}
