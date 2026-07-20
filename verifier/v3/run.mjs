// verifier v1：parti-overcooked 验收测试
// 用法：node verifier/v1/run.mjs [--src]   （--src 只测源码 worker，跳过 dist 产物检查）
import { existsSync, readFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRoomDefinition, makeCtx, createRoom, join, leave, act, pump, lastEvents, walkTo } from './harness.mjs';
import { musicModeFor, orderWarningLevel, potWarningLevel } from '../../src/client/audio.js';
import { collides, reconcilePrediction, stepMovement } from '../../src/client/movement.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC_ONLY = process.argv.includes('--src');

let passed = 0;
let failed = 0;
const lines = [];
function ok(name, cond, detail = '') {
  if (cond) { passed++; lines.push(`PASS  ${name}`); }
  else { failed++; lines.push(`FAIL  ${name}  ${detail}`); }
}
function section(name) { lines.push(`\n== ${name} ==`); }

// ---------------------------------------------------------------------------
// 1. Manifest 校验（docs/manifest.md）
// ---------------------------------------------------------------------------
section('manifest');
const manifestPath = path.join(root, 'public/parti.room.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const nonEmptyStr = (v) => typeof v === 'string' && v.length > 0;
ok('id/name/version/partiVersion 非空字符串',
  nonEmptyStr(manifest.id) && nonEmptyStr(manifest.name) && nonEmptyStr(manifest.version) && nonEmptyStr(manifest.partiVersion));
ok('protocolVersion 是数字', typeof manifest.protocolVersion === 'number');
ok('entry 含 ui 与 worker 字符串',
  manifest.entry && nonEmptyStr(manifest.entry.ui) && nonEmptyStr(manifest.entry.worker));
ok('packageMode 合法', manifest.packageMode === 'blob' || manifest.packageMode === 'filesystem');
ok('tags 非空无重复', !manifest.tags || (Array.isArray(manifest.tags) && manifest.tags.every(nonEmptyStr) && new Set(manifest.tags).size === manifest.tags.length));
ok('sensors 合法', !manifest.permissions?.sensors || (Array.isArray(manifest.permissions.sensors) && manifest.permissions.sensors.every((s) => ['accelerometer', 'gyroscope', 'magnetometer'].includes(s))));
ok('room 人数 2-4', manifest.room?.minPlayers === 2 && manifest.room?.maxPlayers === 4);

section('动态音频阶段');
ok('大厅使用轻松音乐', musicModeFor('lobby', 180) === 'lobby');
ok('倒计时使用渐强音乐', musicModeFor('countdown', 180) === 'countdown');
ok('正常对局使用派对音乐', musicModeFor('playing', 31) === 'playing');
ok('最后 30 秒切换冲刺音乐', musicModeFor('playing', 30) === 'urgent');
ok('结算停止循环音乐', musicModeFor('ended', 0) === null);
ok('锅在烧糊前分级催促', potWarningLevel(3.9) === null && potWarningLevel(4) === 'warning' && potWarningLevel(8) === 'critical');
ok('订单最后 20/8 秒分级催促', orderWarningLevel(21) === null && orderWarningLevel(20) === 'warning' && orderWarningLevel(8) === 'critical');

// ---------------------------------------------------------------------------
// 2. Worker 产物契约（docs/worker-api.md / room-dev-harness.md）
// ---------------------------------------------------------------------------
function workerContract(file, label) {
  section(`worker 契约（${label}）`);
  const src = readFileSync(file, 'utf8');
  ok('保留 canonical import', /import\s*\{[^}]*defineRoom[^}]*\}\s*from\s*['"]@parti\/worker-sdk['"]/.test(src));
  ok('无相对路径 import', !/from\s*['"]\.{1,2}\//.test(src));
  ok('无其他第三方 import', !/import[\s\S]{0,80}from\s*['"](?!@parti\/worker-sdk)[^'"]+['"]/.test(src.replace(/import\s*\{[^}]*defineRoom[^}]*\}\s*from\s*['"]@parti\/worker-sdk['"]/, '')));
  ok('存在 export default', /export\s+default|export\s*\{[^}]*as\s+default\}/.test(src));
  const def = loadRoomDefinition(file);
  ok('defineRoom 定义可加载', !!def && typeof def === 'object');
  ok('initialState 是函数', typeof def.initialState === 'function');
  ok('actions 全部同步（非 async）', Object.values(def.actions || {}).every((f) => f.constructor.name !== 'AsyncFunction'));
  return def;
}

const def = workerContract(path.join(root, 'src/worker/index.js'), '源码');

// ---------------------------------------------------------------------------
// 3. 移动、滑墙与客户端预测
// ---------------------------------------------------------------------------
section('移动手感与碰撞');
{
  const makeLayout = (rows) => ({
    w: rows[0].length,
    h: rows.length,
    cells: rows.join('').split(''),
    stationAt: {},
  });
  const openWithPillar = makeLayout([
    '#######',
    '#.....#',
    '#.....#',
    '#..#..#',
    '#.....#',
    '#.....#',
    '#######',
  ]);
  const verticalWall = makeLayout([
    '#######',
    '#..#..#',
    '#..#..#',
    '#..#..#',
    '#..#..#',
    '#..#..#',
    '#######',
  ]);

  const headOn = { x: 2.5, z: 3.5, vx: 0, vz: 0 };
  for (let i = 0; i < 30; i++) stepMovement(openWithPillar, headOn, { dx: 1, dz: 0 }, 1 / 60);
  ok('正面撞墙不穿透', headOn.x <= 2.700001 && !collides(openWithPillar, headOn.x, headOn.z));

  const slide = { x: 2.65, z: 2.2, vx: 0, vz: 0 };
  const slideStartZ = slide.z;
  for (let i = 0; i < 35; i++) stepMovement(verticalWall, slide, { dx: 1, dz: 1 }, 1 / 60);
  ok('斜向接触保留滑墙速度', slide.z > slideStartZ + 0.8 && !collides(verticalWall, slide.x, slide.z), JSON.stringify(slide));

  const corridor = makeLayout([
    '#######',
    '#.#.#.#',
    '#.#.#.#',
    '#.#.#.#',
    '#.#.#.#',
    '#.#.#.#',
    '#######',
  ]);
  for (const startX of [3.5, 3.34, 3.66]) {
    const chef = { x: startX, z: 1.5, vx: 0, vz: 0 };
    for (let i = 0; i < 65; i++) stepMovement(corridor, chef, { dx: 0, dz: 1 }, 1 / 60);
    ok(`一格通道可通过 x=${startX}`, chef.z > 4.5 && !collides(corridor, chef.x, chef.z), JSON.stringify(chef));
  }
  const blockedChef = { x: 3.5, z: 1.5, vx: 0, vz: 0 };
  const corridorBlocker = { x: 3.5, z: 3, radius: 0.3 };
  for (let i = 0; i < 60; i++) {
    stepMovement(corridor, blockedChef, { dx: 0, dz: 1 }, 1 / 60, 0.3, [corridorBlocker]);
  }
  ok('静止玩家可以堵住一格通道', blockedChef.z <= corridorBlocker.z - 0.599,
    JSON.stringify({ blockedChef, corridorBlocker }));

  const fine = { x: 1.5, z: 2.25, vx: 0, vz: 0 };
  const coarse = { ...fine };
  for (let i = 0; i < 60; i++) stepMovement(openWithPillar, fine, { dx: 1, dz: 0.35 }, 1 / 60);
  for (let i = 0; i < 10; i++) stepMovement(openWithPillar, coarse, { dx: 1, dz: 0.35 }, 0.1);
  ok('60Hz 与 10Hz 求解结果一致', Math.hypot(fine.x - coarse.x, fine.z - coarse.z) < 0.03,
    JSON.stringify({ fine, coarse }));

  const stopping = { x: 1.5, z: 1.5, vx: 0, vz: 0 };
  stepMovement(openWithPillar, stopping, { dx: 1, dz: 0 }, 0.1);
  const positions = [stopping.x];
  for (let i = 0; i < 6; i++) {
    stepMovement(openWithPillar, stopping, { dx: 0, dz: 0 }, 1 / 60);
    positions.push(stopping.x);
  }
  ok('松键减速不产生反向位移', positions.every((x, i) => i === 0 || x >= positions[i - 1] - 1e-9));
  ok('松键后 100ms 内速度归零', Math.hypot(stopping.vx, stopping.vz) < 1e-9);

  const predicted = { x: 2, z: 2, vx: 0, vz: 0 };
  reconcilePrediction(openWithPillar, predicted,
    { x: 1.9, z: 2, vx: 0, vz: 0, moveSeq: 2 },
    { dx: 0, dz: 0 }, { dx: 1, dz: 0 }, 2, 1 / 60);
  ok('停止后的旧位置不会反向回拉', Math.abs(predicted.x - 2) < 1e-9);

  const ctx = makeCtx(def);
  createRoom(def, ctx);
  join(ctx, def, 'p2', '小明');
  act(ctx, def, 'host', 'start');
  pump(ctx, 31);
  ctx.state.layout = openWithPillar;
  ctx.state.stations = {};
  const authoritative = ctx.state.players.host;
  authoritative.x = 1.5;
  authoritative.z = 2.25;
  authoritative.vx = 0;
  authoritative.vz = 0;
  act(ctx, def, 'host', 'move', { dx: 1, dz: 0.35, seq: 41 });
  for (let i = 0; i < 10; i++) pump(ctx, 1);
  ok('Worker 与客户端移动求解一致', Math.hypot(fine.x - authoritative.x, fine.z - authoritative.z) < 0.03,
    JSON.stringify({ fine, authoritative }));
  ok('Worker 回传最新移动序号', authoritative.moveSeq === 41);
  act(ctx, def, 'host', 'move', { dx: -1, dz: 0, seq: 40 });
  ok('Worker 忽略乱序旧移动指令', authoritative.moveSeq === 41 && authoritative.input.dx > 0);
  act(ctx, def, 'host', 'move', { dx: 0, dz: 0, seq: 42 });
  const beforeStop = authoritative.x;
  pump(ctx, 1);
  ok('Worker 减速只沿原方向', authoritative.x >= beforeStop && Math.hypot(authoritative.vx, authoritative.vz) < 1e-9);

  const opponent = ctx.state.players.p2;
  authoritative.x = 2;
  authoritative.z = 1.5;
  opponent.x = 5;
  opponent.z = 1.5;
  authoritative.vx = authoritative.vz = opponent.vx = opponent.vz = 0;
  act(ctx, def, 'host', 'move', { dx: 1, dz: 0, seq: 43 });
  act(ctx, def, 'p2', 'move', { dx: -1, dz: 0, seq: 1 });
  for (let i = 0; i < 10; i++) pump(ctx, 1);
  ok('对向玩家相撞后不能互相穿过', authoritative.x < opponent.x
    && Math.hypot(authoritative.x - opponent.x, authoritative.z - opponent.z) >= 0.599,
  JSON.stringify({ authoritative, opponent }));
}

// ---------------------------------------------------------------------------
// 4. Worker 逻辑全流程模拟
// ---------------------------------------------------------------------------
section('大厅与准入');
{
  const ctx = makeCtx(def);
  createRoom(def, ctx);
  ok('初始 phase=lobby', ctx.state.phase === 'lobby');
  ok('hostId 记录', ctx.state.hostId === 'host');

  // 单人不能开局
  act(ctx, def, 'host', 'start');
  ok('单人 start 被拒绝', ctx.state.phase === 'lobby');

  join(ctx, def, 'p2', '小明');
  act(ctx, def, 'p2', 'selectMap', { mapId: 'ring' });
  ok('非房主不能选图', ctx.state.mapId === 'classic');
  act(ctx, def, 'host', 'selectMap', { mapId: '不存在' });
  ok('非法 mapId 被拒绝', ctx.state.mapId === 'classic');
  act(ctx, def, 'host', 'selectMap', { mapId: 'split' });
  ok('房主选图成功', ctx.state.mapId === 'split');
  act(ctx, def, 'host', 'selectMap', { mapId: 'classic' });
  act(ctx, def, 'p2', 'start');
  ok('非房主 start 被拒绝', ctx.state.phase === 'lobby');
}

// --- 完整对局：经典厨房 ---
section('经典厨房：完整做菜流程');
{
  const ctx = makeCtx(def);
  createRoom(def, ctx);
  join(ctx, def, 'p2', '小明');
  act(ctx, def, 'host', 'start');
  ok('start 进入 countdown', ctx.state.phase === 'countdown');

  // 倒计时期间移动无效
  const before = { ...ctx.state.players.host };
  act(ctx, def, 'host', 'move', { dx: 1, dz: 0 });
  pump(ctx, 5);
  ok('倒计时期间移动被忽略', ctx.state.players.host.x === before.x && ctx.state.players.host.z === before.z);
  pump(ctx, 26); // 共 31 tick ≈ 3.1s
  ok('倒计时结束进入 playing', ctx.state.phase === 'playing');
  ok('game:start 广播', lastEvents(ctx, 'game:start').length === 1);

  const L = ctx.state.layout;
  ok('layout 尺寸 15x9', L.w === 15 && L.h === 9);
  ok('灶台动态已建', ctx.state.stations['10,5'] && ctx.state.stations['10,5'].phase === 'idle');
  ok('出生点落位', Math.floor(ctx.state.players.host.x) === 3 && Math.floor(ctx.state.players.host.z) === 2);
  // 此段验证做菜流程，不让第二名玩家无意中占住灶台路线。
  ctx.state.players.p2.x = 13.5;
  ctx.state.players.p2.z = 2.5;

  // 越界移动钳制
  act(ctx, def, 'host', 'move', { dx: 999, dz: 0 });
  ok('move 钳制到单位向量', ctx.state.players.host.input.dx === 1);

  // p1：番茄箱 → 砧板 ×3 → 灶台
  const tomatoRun = () => {
    if (!walkTo(ctx, def, 'host', 1.5, 2.5, { dx: 0, dz: -1 })) throw new Error('走到番茄箱失败');
    act(ctx, def, 'host', 'interact');
    if (ctx.state.players.host.carrying?.g !== 'tomato') throw new Error('没拿到番茄');
    walkTo(ctx, def, 'host', 2.5, 2.5);
    walkTo(ctx, def, 'host', 2.5, 4.5);
    if (!walkTo(ctx, def, 'host', 1.5, 4.5, { dx: 0, dz: 1 })) throw new Error('走到砧板失败');
    act(ctx, def, 'host', 'interact'); // 放上砧板
    if (ctx.state.stations['1,5'].item?.k !== 'raw') throw new Error('砧板没有食材');
    act(ctx, def, 'host', 'work', { on: true });
    pump(ctx, 32);
    act(ctx, def, 'host', 'work', { on: false });
    if (ctx.state.stations['1,5'].item?.k !== 'chopped') throw new Error('切菜未完成: ' + JSON.stringify(ctx.state.stations['1,5']));
    act(ctx, def, 'host', 'interact'); // 拿起切碎的番茄
    walkTo(ctx, def, 'host', 2.5, 4.5);
    walkTo(ctx, def, 'host', 2.5, 2.5);
    walkTo(ctx, def, 'host', 10.5, 2.5);
    if (!walkTo(ctx, def, 'host', 10.5, 4.5, { dx: 0, dz: 1 })) throw new Error('走到灶台失败');
    act(ctx, def, 'host', 'interact'); // 下锅
  };
  tomatoRun();
  tomatoRun();
  ok('锅里 2 份番茄', ctx.state.stations['10,5'].contents.length === 2);
  tomatoRun();
  const pot = ctx.state.stations['10,5'];
  ok('3 番茄入锅开始烹饪', pot.phase === 'cooking' && pot.contents.length === 3);
  // 给端盘玩家让出灶台正前方；玩家碰撞专项单独验证堵路行为。
  walkTo(ctx, def, 'host', 10.5, 2.5);
  walkTo(ctx, def, 'host', 10.5, 3.5);
  walkTo(ctx, def, 'host', 9.5, 3.5);

  // p2：取盘子待命
  walkTo(ctx, def, 'p2', 7.5, 2.5, { dx: 0, dz: 1 });
  act(ctx, def, 'p2', 'interact');
  ok('p2 拿到盘子', ctx.state.players.p2.carrying?.k === 'plate');
  ok('干净盘子减少', ctx.state.plates.clean === 3);
  walkTo(ctx, def, 'p2', 10.5, 2.5);
  walkTo(ctx, def, 'p2', 10.5, 4.5, { dx: 0, dz: 1 });

  pump(ctx, 121); // 12.1s → 煮好
  ok('汤煮好了', pot.phase === 'ready');
  ok('pot:ready 广播', lastEvents(ctx, 'pot:ready').length >= 1);
  ok('首波订单已生成', ctx.state.orders.length >= 1);

  act(ctx, def, 'p2', 'interact'); // 装盘
  ok('p2 端到番茄浓汤', ctx.state.players.p2.carrying?.k === 'dish' && ctx.state.players.p2.carrying.items.join('+') === 'tomato+tomato+tomato');
  ok('锅恢复空闲', pot.phase === 'idle' && pot.contents.length === 0);

  // 测试布置：确保有番茄浓汤订单（模拟 Worker 可能生成的订单）
  ctx.state.orders.push({ id: 'ox', key: 'tomato+tomato+tomato', name: '番茄浓汤', points: 20, t: 70, total: 80 });
  walkTo(ctx, def, 'p2', 11.5, 4.5);
  walkTo(ctx, def, 'p2', 11.5, 6.5);
  walkTo(ctx, def, 'p2', 7.5, 6.5);
  walkTo(ctx, def, 'p2', 7.5, 7.5, { dx: 0, dz: 1 });
  act(ctx, def, 'p2', 'interact'); // 上菜
  ok('上菜成功得分', ctx.state.score >= 20 && ctx.state.served === 1, 'score=' + ctx.state.score);
  ok('订单被移除', !ctx.state.orders.some((o) => o.id === 'ox'));
  ok('脏盘待返回', ctx.state.plates.due.length === 1);
  ok('order:served 广播', lastEvents(ctx, 'order:served').length === 1);

  pump(ctx, 81); // 8.1s → 脏盘到水槽
  ok('脏盘返回', ctx.state.plates.dirty === 1);

  // p2 洗碗（空手）
  walkTo(ctx, def, 'p2', 7.5, 6.5, { dx: 0, dz: -1 });
  act(ctx, def, 'p2', 'work', { on: true });
  pump(ctx, 42);
  act(ctx, def, 'p2', 'work', { on: false });
  ok('洗碗完成', ctx.state.plates.dirty === 0 && ctx.state.plates.clean === 4, JSON.stringify(ctx.state.plates));

  // 烧糊流程（测试布置：直接把锅设为烹饪中）
  pot.contents = ['onion', 'onion', 'onion'];
  pot.phase = 'cooking';
  pot.t = 0;
  pump(ctx, 121);
  ok('洋葱汤煮好', pot.phase === 'ready');
  pump(ctx, 121);
  ok('放置过久烧糊', pot.phase === 'burnt');
  ok('pot:burnt 广播', lastEvents(ctx, 'pot:burnt').length >= 1);
  // p1 空手倒掉
  if (ctx.state.players.host.carrying) ctx.state.players.host.carrying = null;
  walkTo(ctx, def, 'host', 10.5, 2.5);
  walkTo(ctx, def, 'host', 10.5, 4.5, { dx: 0, dz: 1 });
  act(ctx, def, 'host', 'interact');
  ok('烧糊的锅可清空', pot.phase === 'idle' && pot.contents.length === 0);

  // 新规则：生菜/黄瓜不能下锅（测试布置：直接给 p1 切碎生菜）
  ctx.state.players.host.carrying = { k: 'chopped', g: 'lettuce' };
  act(ctx, def, 'host', 'interact');
  ok('生菜被锅拒绝', pot.contents.length === 0 && ctx.state.players.host.carrying !== null);

  // 新菜谱：胡萝卜浓汤（测试布置：锅里已有 2 份胡萝卜）
  pot.contents = ['carrot', 'carrot'];
  pot.phase = 'idle';
  ctx.state.players.host.carrying = { k: 'chopped', g: 'carrot' };
  act(ctx, def, 'host', 'interact');
  ok('3 胡萝卜开煮（新菜谱）', pot.phase === 'cooking' && pot.contents.join(',') === 'carrot,carrot,carrot');
  pot.contents = [];
  pot.phase = 'idle';
  ctx.state.players.host.carrying = null;

  // 订单过期扣分
  ctx.state.score = 3;
  ctx.state.orders.push({ id: 'oy', key: 'x', name: '测试单', points: 10, t: 0.15, total: 80 });
  pump(ctx, 2);
  ok('订单过期扣分且不为负', ctx.state.expired >= 1 && ctx.state.score === 0, 'score=' + ctx.state.score);

  // 终局
  ctx.state.timeLeft = 0.25;
  pump(ctx, 3);
  ok('时间到进入 ended', ctx.state.phase === 'ended');
  ok('game:over 广播', lastEvents(ctx, 'game:over').length === 1);

  // rematch
  act(ctx, def, 'host', 'rematch');
  ok('rematch 重新开局', ctx.state.phase === 'countdown');
  pump(ctx, 31);
  ok('rematch 进入 playing', ctx.state.phase === 'playing');
  ok('rematch 盘子重置', ctx.state.plates.clean === 4 && ctx.state.score === 0);
  ctx.state.timeLeft = 0.2;
  pump(ctx, 3);
  act(ctx, def, 'host', 'toLobby');
  ok('toLobby 回大厅', ctx.state.phase === 'lobby' && ctx.state.layout === null);
}

// --- 一线天：隔墙与通道 ---
section('一线天：地图分隔与通道');
{
  const ctx = makeCtx(def);
  createRoom(def, ctx);
  join(ctx, def, 'p2', '小明');
  act(ctx, def, 'host', 'selectMap', { mapId: 'split' });
  act(ctx, def, 'host', 'start');
  pump(ctx, 31);
  ok('split 开局', ctx.state.phase === 'playing' && ctx.state.layout.w === 15);
  // 专项玩家阻挡已在移动测试覆盖；这里把同伴停到通道目标之外。
  ctx.state.players.p2.x = 13.5;
  ctx.state.players.p2.z = 4.5;

  // 直线穿越被台面墙挡住
  const arrived = walkTo(ctx, def, 'host', 11.5, 2.5, null, 300);
  ok('台面墙无法直线穿越', !arrived && ctx.state.players.host.x < 8, 'x=' + ctx.state.players.host.x);
  // 经中央通道穿越
  walkTo(ctx, def, 'host', 3.5, 4.5);
  walkTo(ctx, def, 'host', 8.5, 4.5);
  const crossed = walkTo(ctx, def, 'host', 11.5, 2.5, null, 500);
  ok('中央通道可穿越到右半区', crossed && ctx.state.players.host.x > 10.5, 'x=' + ctx.state.players.host.x);

  ctx.state.timeLeft = 0.2;
  pump(ctx, 3);
  act(ctx, def, 'host', 'toLobby');
}

// --- 环岛餐吧：全配方 + 多灶台 ---
section('环岛餐吧：全配方流程');
{
  const ctx = makeCtx(def);
  createRoom(def, ctx);
  join(ctx, def, 'p2', '小明');
  act(ctx, def, 'host', 'selectMap', { mapId: 'ring' });
  act(ctx, def, 'host', 'start');
  pump(ctx, 31);
  const L = ctx.state.layout;
  ok('ring 开局 15x11', ctx.state.phase === 'playing' && L.w === 15 && L.h === 11);
  ok('ring 盘子 5 个', ctx.state.plates.clean === 5);
  const stoves = Object.values(L.stationAt).filter((s) => s.type === 'stove');
  ok('ring 3 个灶台', stoves.length === 3);
  const crates = Object.values(L.stationAt).filter((s) => s.type === 'crate').map((s) => s.crate);
  ok('ring 七种食材箱齐备', ['tomato','onion','mushroom','lettuce','cucumber','carrot','potato'].every((g) => crates.includes(g)), crates.join(','));

  // 番茄浓汤小流程
  walkTo(ctx, def, 'host', 2.5, 2.5, { dx: -1, dz: 0 });
  act(ctx, def, 'host', 'interact');
  ok('ring 拿到番茄', ctx.state.players.host.carrying?.g === 'tomato');
  walkTo(ctx, def, 'host', 3.5, 2.5, { dx: 0, dz: 1 });
  act(ctx, def, 'host', 'interact');
  act(ctx, def, 'host', 'work', { on: true });
  pump(ctx, 32);
  act(ctx, def, 'host', 'work', { on: false });
  ok('ring 切菜完成', ctx.state.stations['3,3'].item?.k === 'chopped');

  ctx.state.timeLeft = 0.2;
  pump(ctx, 3);
  ok('ring 可正常结束', ctx.state.phase === 'ended');
}

// --- 边界：断线/离开 ---
section('玩家离开');
{
  const ctx = makeCtx(def);
  createRoom(def, ctx);
  join(ctx, def, 'p2', '小明');
  act(ctx, def, 'host', 'start');
  pump(ctx, 31);
  leave(ctx, def, 'p2');
  ok('离开的玩家被移除', !ctx.state.players.p2);
  leave(ctx, def, 'host');
  ok('全部离开回到 lobby', ctx.state.phase === 'lobby' && ctx.state.layout === null);
}

// ---------------------------------------------------------------------------
// 3.5 真实 loader 兼容（逐行复制 packages/worker-sdk/src/loader.ts）
// ---------------------------------------------------------------------------
section('真实 loader 加载（dist）');
{
  const distWorker = path.join(root, 'dist/room.worker.js');
  if (existsSync(distWorker)) {
    function transformSource(source) {
      let out = source;
      out = out.replace(/^\s*import\s+[^;]*?from\s*['"][^'"]*worker[^'"]*['"]\s*;?\s*$/gm, '');
      out = out.replace(/^\s*import\s+[^;]*?from\s*['"]@parti\/[^'"]*['"]\s*;?\s*$/gm, '');
      out = out.replace(/export\s+default\s+/g, '__parti_exports.default = ');
      return out;
    }
    try {
      const transformed = transformSource(readFileSync(distWorker, 'utf8'));
      const exportsContainer = {};
      const factory = new Function('defineRoom', '__parti_exports', 'exports', transformed);
      factory((d) => d, exportsContainer, exportsContainer);
      const d = exportsContainer.default;
      ok('真实 loader 可加载产物', !!d && typeof d.initialState === 'function');
      ok('产物 meta.minPlayers=2 maxPlayers=4', d.meta && d.meta.minPlayers === 2 && d.meta.maxPlayers === 4);
    } catch (e) {
      ok('真实 loader 可加载产物', false, String(e && e.message || e));
    }
  } else if (!SRC_ONLY) {
    ok('真实 loader 可加载产物', false, 'dist/room.worker.js 不存在，请先 npm run build');
  }
  // --src 模式且无 dist：跳过该项（源码验收不要求构建产物在场）
}

// ---------------------------------------------------------------------------
// 4. 构建产物检查
// ---------------------------------------------------------------------------
if (!SRC_ONLY) {
  section('构建产物');
  const dist = path.join(root, 'dist');
  const files = ['parti.room.json', 'index.html', 'room.worker.js'];
  for (const f of files) ok(`dist/${f} 存在`, existsSync(path.join(dist, f)));
  if (existsSync(path.join(dist, 'index.html'))) {
    const html = readFileSync(path.join(dist, 'index.html'), 'utf8');
    ok('index.html 自包含（无外部 http 资源）', !/(src|href)\s*=\s*["']https?:\/\//.test(html));
    ok('index.html 无相对模块引用', !/<script[^>]+src=/.test(html));
    ok('index.html 大小 < 20MB', html.length < 20 * 1024 * 1024, 'size=' + html.length);
  }
  if (existsSync(path.join(dist, 'room.worker.js'))) {
    workerContract(path.join(dist, 'room.worker.js'), '产物');
  }
  if (existsSync(path.join(root, 'parti.room.zip'))) {
    const listing = execSync(`unzip -l parti.room.zip`, { cwd: root }).toString();
    ok('zip 根目录含 parti.room.json', /parti\.room\.json/.test(listing));
    ok('zip 根目录含 index.html', /index\.html/.test(listing));
    ok('zip 根目录含 room.worker.js', /room\.worker\.js/.test(listing));
  }
}

// ---------------------------------------------------------------------------
// 结果与运行记录
// ---------------------------------------------------------------------------
const summary = `\n${passed} passed, ${failed} failed`;
lines.push(summary);
const out = lines.join('\n');
console.log(out);

mkdirSync(path.join(root, 'verifier/runs'), { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
appendFileSync(
  path.join(root, `verifier/runs/${stamp}-v1.log`),
  `command: node verifier/v1/run.mjs ${SRC_ONLY ? '--src' : ''}\nexit: ${failed ? 1 : 0}\n${out}\n`,
);
process.exit(failed ? 1 : 0);
