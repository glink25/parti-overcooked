// Parti Worker 模拟加载器 + Mock Runtime
// 复刻 packages/worker-sdk/src/loader.ts 的行为：剥离 @parti/* import，注入 defineRoom。
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export function loadRoomDefinition(file) {
  let src = readFileSync(file, 'utf8');
  // 剥离 @parti/* import（含 minify 后的形式）
  src = src.replace(/import\s*\{[^}]*\}\s*from\s*['"]@parti\/[^'"]*['"];?/g, '');
  src = src.replace(/import\s+['"]@parti\/[^'"]*['"];?/g, '');
  // export default X / export { X as default } → module.exports
  src = src.replace(/export\s*\{\s*([A-Za-z_$][\w$]*)\s+as\s+default\s*\};?/, 'module.exports = $1;');
  src = src.replace(/export\s+default\s+/, 'module.exports = ');
  const module = { exports: {} };
  const context = vm.createContext({
    module,
    exports: module.exports,
    defineRoom: (def) => def,
    console,
  });
  new vm.Script(src, { filename: file }).runInContext(context);
  return module.exports.default || module.exports;
}

// 确定性随机数（LCG）
export function lcg(seed = 42) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

export function makeCtx(def, { seed = 42 } = {}) {
  const ctx = {
    state: null,
    players: [],
    host: null,
    events: [],
    _timers: new Map(),
    now: () => Date.now(),
    random: lcg(seed),
    broadcast(e, p) { ctx.events.push({ e, p }); },
    send() {},
    kick() {},
    log() {},
    setTimer(name, ms, cb) { ctx._timers.set(name, { ms, cb }); },
    clearTimer(name) { ctx._timers.delete(name); },
  };
  return ctx;
}

export function createRoom(def, ctx, hostId = 'host') {
  // 真实运行时：房间由房主创建，onCreate 时 host 已在场
  const hostPlayer = { id: hostId, name: '房主', role: 'host' };
  ctx.players.push(hostPlayer);
  ctx.host = hostPlayer;
  ctx.state = def.initialState(ctx);
  if (def.onCreate) def.onCreate(ctx);
  // 房主本人也会触发 onJoin
  def.onJoin(ctx, hostPlayer);
  return ctx.state;
}

export function join(ctx, def, id, name, role = 'player') {
  const player = { id, name, role };
  ctx.players.push(player);
  if (!ctx.host) ctx.host = ctx.players[0];
  def.onJoin(ctx, player);
  return player;
}

export function leave(ctx, def, id) {
  const idx = ctx.players.findIndex((p) => p.id === id);
  if (idx < 0) return;
  const player = ctx.players[idx];
  def.onLeave(ctx, player);
  ctx.players.splice(idx, 1);
}

export function act(ctx, def, playerId, action, payload = null) {
  const player = ctx.players.find((p) => p.id === playerId);
  if (!player) throw new Error('no such player ' + playerId);
  const handler = def.actions[action];
  if (!handler) throw new Error('unknown action ' + action);
  handler(ctx, { player, payload, actionId: 'test-' + action });
}

// 触发一次 tick 定时器回调（定时器会自续约，这里串行驱动）
export function pump(ctx, ticks = 1) {
  for (let i = 0; i < ticks; i++) {
    const t = ctx._timers.get('tick');
    if (!t) return false;
    t.cb();
  }
  return true;
}

export function lastEvents(ctx, name) {
  return ctx.events.filter((x) => x.e === name);
}

// 让某玩家走到 (tx,tz)；可选 face：到位后向该方向打一个短脉冲以设置朝向
//（与真实玩家「点按一下方向键」行为一致，位移 <=0.1 格，不影响站台判定）
export function walkTo(ctx, def, pid, tx, tz, face = null, maxTicks = 800) {
  const st = ctx.state;
  const p = st.players[pid];
  if (!p) throw new Error('walkTo: no player ' + pid);
  let ok = false;
  for (let i = 0; i < maxTicks; i++) {
    const dx = tx - p.x;
    const dz = tz - p.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.05) { ok = true; break; }
    // 步长 0.32/ tick：接近目标时缩小输入幅度，防止振荡
    const step = Math.min(1, len / 0.32);
    act(ctx, def, pid, 'move', { dx: (dx / len) * step, dz: (dz / len) * step });
    pump(ctx, 1);
    if (st.phase !== 'playing') return false;
  }
  act(ctx, def, pid, 'move', { dx: 0, dz: 0 });
  if (ok && face) {
    act(ctx, def, pid, 'move', { dx: face.dx * 0.25, dz: face.dz * 0.25 });
    pump(ctx, 1);
    act(ctx, def, pid, 'move', { dx: 0, dz: 0 });
  }
  return ok;
}
