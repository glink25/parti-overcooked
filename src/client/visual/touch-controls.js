export const JOYSTICK_DEAD_ZONE = 0.18;

export function clampJoystickCenter(point, viewport, radius, safe = {}) {
  const left = (safe.left || 0) + radius;
  const right = Math.max(left, viewport.width / 2 - radius);
  const top = (safe.top || 0) + radius;
  const bottom = Math.max(top, viewport.height - (safe.bottom || 0) - radius);
  return {
    x: Math.min(right, Math.max(left, point.x)),
    y: Math.min(bottom, Math.max(top, point.y)),
  };
}

export function joystickVector(point, center, radius, deadZone = JOYSTICK_DEAD_ZONE) {
  const rawX = point.x - center.x;
  const rawY = point.y - center.y;
  const rawLength = Math.hypot(rawX, rawY);
  const magnitude = Math.min(1, rawLength / radius);
  const scale = rawLength > radius ? radius / rawLength : 1;
  const knobX = rawX * scale;
  const knobY = rawY * scale;
  if (magnitude < deadZone || rawLength === 0) {
    return { dx: 0, dz: 0, knobX, knobY };
  }
  return {
    dx: rawX / rawLength * magnitude,
    dz: rawY / rawLength * magnitude,
    knobX,
    knobY,
  };
}

export function shortActionLabel(text, fallback) {
  if (!text) return fallback;
  const action = text.split(/[（｜]/, 1)[0];
  const aliases = [
    [/^拿取|^拿起|^拿盘子/, '拿取'],
    [/^放下|^把.+放上盘子/, '放下'],
    [/^装盘出锅/, '装盘'],
    [/^上菜/, '上菜'],
    [/^下锅/, '下锅'],
    [/^倒掉/, '倒掉'],
    [/^扔掉/, '扔掉'],
    [/^切菜/, '切菜'],
    [/^洗碗/, '洗碗'],
  ];
  return aliases.find(([pattern]) => pattern.test(action))?.[1] || action.slice(0, 4) || fallback;
}
