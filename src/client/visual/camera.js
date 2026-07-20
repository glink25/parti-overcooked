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
  const { w, h } = layout;
  const safeAspect = Math.max(0.55, aspect || 1);
  const fitW = (w / 2 + 2.2) / Math.tan(Math.PI * 24 / 180) / safeAspect;
  const fitH = (h + 2) * 1.02;
  const distance = Math.max(fitW, fitH, 8.5);
  const target = { x: w / 2, y: 0, z: h / 2 + 0.2 };
  const playing = { x: w / 2, y: distance * 0.86, z: h / 2 + distance * 0.6 };
  const overviewDistance = distance * 1.55;
  const overview = { x: w / 2, y: overviewDistance * 0.86, z: h / 2 + overviewDistance * 0.6 };
  return { target, playing, overview };
}

export function lerpCameraPose(from, to, progress) {
  const t = clamp01(progress);
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    z: from.z + (to.z - from.z) * t,
  };
}
