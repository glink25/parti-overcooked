import { defineRoom } from '@parti/worker-sdk';

/**
 * 胡闹厨房派对（Overcooked Party）— Parti 房间权威逻辑
 *
 * 架构约束（docs/worker-api.md）：
 *  - 单文件，仅允许 import { defineRoom }，不 import 任何第三方/相对模块
 *  - ctx.state 是唯一权威状态，直接修改，Runtime 自动快照广播
 *  - action handler 必须同步，payload 不可信，逐项校验
 *  - 本游戏无隐藏信息，全部状态均可公开广播
 */

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------
const TICK_MS = 100;                 // 权威逻辑 tick 间隔（10Hz）
const DT = TICK_MS / 1000;
const SPEED = 3.2;                   // 玩家移动速度（格/秒）
const PLAYER_R = 0.3;                // 玩家碰撞半径
const STOP_TIME = 0.1;               // 松开输入后的同方向减速时间
const DECELERATION = SPEED / STOP_TIME;
const MOVE_FIXED_STEP = 1 / 60;      // 固定子步，最大位移约 0.053 格
const MOVE_SOLVER_PASSES = 4;
const MOVE_EPSILON = 1e-9;
const CHOP_TIME = 3;                 // 切菜秒数
const WASH_TIME = 4;                 // 洗一个盘子秒数
const COOK_TIME = 12;                // 煮汤秒数
const BURN_TIME = 12;                // 煮好后多少秒烧糊
const DIRTY_DELAY = 8;               // 上菜后脏盘返回秒数
const GAME_TIME = 180;               // 单局时长
const ORDER_LIFE = 80;               // 订单存活秒数
const ORDER_FIRST = 5;               // 开局后首单延迟
const ORDER_MIN_GAP = 20;            // 订单间隔下限
const ORDER_VAR_GAP = 10;            // 订单间隔随机上浮
const MAX_ORDERS = 4;                // 同时最多订单
const COUNTDOWN_T = 3;               // 开局倒计时
const EXPIRE_PENALTY = 5;            // 订单过期扣分

const PLAYER_COLORS = ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71'];

// 食材：板条箱字母 -> 食材 id
const CRATES = { T: 'tomato', O: 'onion', M: 'mushroom', L: 'lettuce', U: 'cucumber', R: 'carrot', V: 'potato' };

// 配方：items 为切碎后的食材多重集合；cook=true 需要锅里煮
const RECIPES = [
  { id: 'tomato_soup',   name: '番茄浓汤',   items: ['tomato', 'tomato', 'tomato'],        cook: true,  points: 20 },
  { id: 'onion_soup',    name: '洋葱浓汤',   items: ['onion', 'onion', 'onion'],           cook: true,  points: 20 },
  { id: 'carrot_soup',   name: '胡萝卜浓汤', items: ['carrot', 'carrot', 'carrot'],        cook: true,  points: 22 },
  { id: 'potato_soup',   name: '土豆浓汤',   items: ['potato', 'potato', 'potato'],        cook: true,  points: 22 },
  { id: 'mushroom_soup', name: '菌菇浓汤',   items: ['mushroom', 'mushroom', 'onion'],     cook: true,  points: 24 },
  { id: 'garden_stew',   name: '田园炖菜',   items: ['carrot', 'onion', 'potato'],         cook: true,  points: 28 },
  { id: 'garden_salad',  name: '田园沙拉',   items: ['lettuce', 'tomato'],                 cook: false, points: 16 },
  { id: 'crisp_salad',   name: '爽脆沙拉',   items: ['carrot', 'lettuce'],                 cook: false, points: 18 },
  { id: 'deluxe_salad',  name: '豪华沙拉',   items: ['cucumber', 'lettuce', 'tomato'],     cook: false, points: 22 },
  { id: 'rainbow_salad', name: '彩虹沙拉',   items: ['carrot', 'cucumber', 'lettuce'],     cook: false, points: 24 },
];

// 可下锅的食材（出现在任意 cook 配方中）；生菜/黄瓜等只能做沙拉，下锅必糊
const COOKABLE = new Set();
for (const r of RECIPES) {
  if (r.cook) for (const g of r.items) COOKABLE.add(g);
}

function recipeKey(items) {
  return items.slice().sort().join('+');
}
const RECIPE_BY_KEY = {};
for (const r of RECIPES) RECIPE_BY_KEY[recipeKey(r.items)] = r;

// ---------------------------------------------------------------------------
// 地图
// 图例：# 墙  . 地板  C 台面  B 砧板  S 灶台(锅)  P 盘子架  K 水槽
//       W 出菜口  X 垃圾桶  T/O/M/L/U 食材箱  1-4 出生点
// ---------------------------------------------------------------------------
const MAPS = {
  classic: {
    name: '经典厨房',
    desc: '动线宽敞的新手厨房，订单以番茄/洋葱/胡萝卜系为主，适合磨合配合。',
    plates: 4,
    pool: ['tomato_soup', 'onion_soup', 'carrot_soup', 'garden_salad', 'crisp_salad'],
    grid: [
      '###############',
      '#T.R...C.C..O.#',
      '#..1.......2..#',
      '#C.C...P...C.C#',
      '#.....CCC.....#',
      '#B.B.X.K..S.S.#',
      '#L..3.....4..U#',
      '#C.C.......C.C#',
      '#######W#######',
    ],
  },
  split: {
    name: '一线天',
    desc: '台面高墙把厨房劈成两半，只有一条通道，记得隔空递菜！',
    plates: 4,
    pool: ['mushroom_soup', 'potato_soup', 'garden_salad', 'garden_stew', 'crisp_salad'],
    grid: [
      '########W######',
      '#T.O.L.M.R.V.X#',
      '#..1....C..2..#',
      '#B......C....B#',
      '#.......3.4...#',
      '#B......C....B#',
      '#..K....C..S..#',
      '#..S....C...P.#',
      '###############',
    ],
  },
  ring: {
    name: '环岛餐吧',
    desc: '灶台集中在中央环岛，十种菜谱全开，订单更密更考验分工。',
    plates: 5,
    pool: ['tomato_soup', 'onion_soup', 'carrot_soup', 'potato_soup', 'mushroom_soup', 'garden_stew', 'garden_salad', 'crisp_salad', 'deluxe_salad', 'rainbow_salad'],
    grid: [
      '#######W#######',
      '#....P...P....#',
      '#T.1.......2.O#',
      '#..B.......B..#',
      '#M...CSSSC...U#',
      '#....C...C....#',
      '#L...CCXCC...L#',
      '#R.3.......4.V#',
      '#..B..K.K..B..#',
      '#.............#',
      '###############',
    ],
  },
};

function parseMap(mapId) {
  const map = MAPS[mapId];
  const h = map.grid.length;
  const w = map.grid[0].length;
  const cells = new Array(w * h);
  const spawns = [];
  const stationAt = {};
  for (let z = 0; z < h; z++) {
    for (let x = 0; x < w; x++) {
      const ch = map.grid[z][x];
      let cell = '.';
      let st = null;
      if (ch === '#') cell = '#';
      else if (ch >= '1' && ch <= '4') { spawns.push({ x, z }); }
      else if (ch === 'C') { cell = 'C'; st = { x, z, type: 'counter' }; }
      else if (ch === 'B') { cell = 'B'; st = { x, z, type: 'board' }; }
      else if (ch === 'S') { cell = 'S'; st = { x, z, type: 'stove' }; }
      else if (ch === 'P') { cell = 'P'; st = { x, z, type: 'plates' }; }
      else if (ch === 'K') { cell = 'K'; st = { x, z, type: 'sink' }; }
      else if (ch === 'W') { cell = 'W'; st = { x, z, type: 'window' }; }
      else if (ch === 'X') { cell = 'X'; st = { x, z, type: 'trash' }; }
      else if (CRATES[ch]) { cell = 'G'; st = { x, z, type: 'crate', crate: CRATES[ch] }; }
      cells[z * w + x] = cell;
      if (st) stationAt[x + ',' + z] = st;
    }
  }
  spawns.sort((a, b) => (a.x + a.z * w) - (b.x + b.z * w));
  return { mapId, name: map.name, w, h, cells, spawns, stationAt };
}

// ---------------------------------------------------------------------------
// 碰撞与寻位
// ---------------------------------------------------------------------------
function isBlocked(L, cx, cz) {
  if (cx < 0 || cz < 0 || cx >= L.w || cz >= L.h) return true;
  return L.cells[cz * L.w + cx] !== '.';
}

function resolvePlayerCollision(L, p) {
  for (let pass = 0; pass < MOVE_SOLVER_PASSES; pass++) {
    let resolved = false;
    const minX = Math.floor(p.x - PLAYER_R);
    const maxX = Math.floor(p.x + PLAYER_R);
    const minZ = Math.floor(p.z - PLAYER_R);
    const maxZ = Math.floor(p.z + PLAYER_R);

    for (let j = minZ; j <= maxZ; j++) {
      for (let i = minX; i <= maxX; i++) {
        if (!isBlocked(L, i, j)) continue;
        const nearestX = Math.max(i, Math.min(p.x, i + 1));
        const nearestZ = Math.max(j, Math.min(p.z, j + 1));
        let nx = p.x - nearestX;
        let nz = p.z - nearestZ;
        const distanceSq = nx * nx + nz * nz;
        if (distanceSq >= PLAYER_R * PLAYER_R - MOVE_EPSILON) continue;

        let penetration;
        const distance = Math.sqrt(distanceSq);
        if (distance > MOVE_EPSILON) {
          nx /= distance;
          nz /= distance;
          penetration = PLAYER_R - distance;
        } else {
          const exits = [
            { d: p.x - (i - PLAYER_R), nx: -1, nz: 0 },
            { d: i + 1 + PLAYER_R - p.x, nx: 1, nz: 0 },
            { d: p.z - (j - PLAYER_R), nx: 0, nz: -1 },
            { d: j + 1 + PLAYER_R - p.z, nx: 0, nz: 1 },
          ];
          exits.sort((a, b) => a.d - b.d);
          ({ d: penetration, nx, nz } = exits[0]);
        }

        p.x += nx * penetration;
        p.z += nz * penetration;
        const intoSurface = p.vx * nx + p.vz * nz;
        if (intoSurface < 0) {
          p.vx -= intoSurface * nx;
          p.vz -= intoSurface * nz;
        }
        resolved = true;
      }
    }
    if (!resolved) break;
  }
}

function resolvePlayerBodies(p, others) {
  for (let pass = 0; pass < MOVE_SOLVER_PASSES; pass++) {
    let resolved = false;
    for (let index = 0; index < others.length; index++) {
      const other = others[index];
      let nx = p.x - other.x;
      let nz = p.z - other.z;
      const distanceSq = nx * nx + nz * nz;
      const minDistance = PLAYER_R * 2;
      if (distanceSq >= minDistance * minDistance - MOVE_EPSILON) continue;

      const distance = Math.sqrt(distanceSq);
      if (distance > MOVE_EPSILON) {
        nx /= distance;
        nz /= distance;
      } else {
        nx = index % 2 === 0 ? 1 : -1;
        nz = 0;
      }
      const penetration = minDistance - distance;
      p.x += nx * penetration;
      p.z += nz * penetration;
      const intoPlayer = p.vx * nx + p.vz * nz;
      if (intoPlayer < 0) {
        p.vx -= intoPlayer * nx;
        p.vz -= intoPlayer * nz;
      }
      resolved = true;
    }
    if (!resolved) break;
  }
}

function stepPlayerMovement(L, p, input, dt, otherPlayers) {
  const ix = Number(input && input.dx) || 0;
  const iz = Number(input && input.dz) || 0;
  const active = ix !== 0 || iz !== 0;
  const steps = Math.max(1, Math.round(dt / MOVE_FIXED_STEP));
  const stepDt = dt / steps;

  for (let step = 0; step < steps; step++) {
    let moveX;
    let moveZ;
    if (active) {
      p.vx = ix * SPEED;
      p.vz = iz * SPEED;
      moveX = p.vx * stepDt;
      moveZ = p.vz * stepDt;
    } else {
      const speed = Math.hypot(p.vx || 0, p.vz || 0);
      if (speed <= MOVE_EPSILON) {
        p.vx = 0;
        p.vz = 0;
        break;
      }
      const nextSpeed = Math.max(0, speed - DECELERATION * stepDt);
      const averageSpeed = (speed + nextSpeed) * 0.5;
      const dirX = p.vx / speed;
      const dirZ = p.vz / speed;
      moveX = dirX * averageSpeed * stepDt;
      moveZ = dirZ * averageSpeed * stepDt;
      p.vx = dirX * nextSpeed;
      p.vz = dirZ * nextSpeed;
    }

    p.x += moveX;
    p.z += moveZ;
    resolvePlayerCollision(L, p);
    resolvePlayerBodies(p, otherPlayers);
    resolvePlayerCollision(L, p);
  }
}

function targetStation(L, p) {
  const tx = Math.floor(p.x + p.face.dx * 0.95);
  const tz = Math.floor(p.z + p.face.dz * 0.95);
  return L.stationAt[tx + ',' + tz] || null;
}

// ---------------------------------------------------------------------------
// 对局流程
// ---------------------------------------------------------------------------
function armTick(ctx) {
  ctx.setTimer('tick', TICK_MS, () => tick(ctx));
}

function tick(ctx) {
  const s = ctx.state;
  if (s.phase === 'countdown') {
    s.countdown -= DT;
    if (s.countdown <= 0) {
      s.countdown = 0;
      s.phase = 'playing';
      ctx.broadcast('game:start', {});
    }
  } else if (s.phase === 'playing') {
    stepGame(ctx);
  } else {
    return; // 不再续约，定时器停止
  }
  armTick(ctx);
}

function spawnOrder(ctx) {
  const s = ctx.state;
  const pool = MAPS[s.mapId].pool;
  const rid = pool[Math.floor(ctx.random() * pool.length) % pool.length];
  const r = RECIPES.find((x) => x.id === rid);
  s.orderSeq += 1;
  s.orders.push({
    id: 'o' + s.orderSeq,
    key: recipeKey(r.items),
    name: r.name,
    points: r.points,
    t: ORDER_LIFE,
    total: ORDER_LIFE,
  });
  ctx.broadcast('order:new', { name: r.name });
}

function setupGame(ctx) {
  const s = ctx.state;
  s.gameSeq = (s.gameSeq || 0) + 1;
  const map = MAPS[s.mapId];
  const layout = parseMap(s.mapId);
  s.layout = layout;
  s.stations = {};
  for (const k in layout.stationAt) {
    const st = layout.stationAt[k];
    if (st.type === 'counter' || st.type === 'board') s.stations[k] = { item: null };
    else if (st.type === 'stove') s.stations[k] = { contents: [], phase: 'idle', t: 0 };
  }
  s.score = 0;
  s.served = 0;
  s.expired = 0;
  s.orders = [];
  s.orderSeq = 0;
  s.plates = { clean: map.plates, dirty: 0, washT: 0, due: [] };
  s.timeLeft = GAME_TIME;
  s.nextOrderIn = ORDER_FIRST;
  const ids = Object.keys(s.players);
  for (let i = 0; i < ids.length; i++) {
    const p = s.players[ids[i]];
    const sp = layout.spawns[i % layout.spawns.length];
    p.x = sp.x + 0.5;
    p.z = sp.z + 0.5;
    p.input = { dx: 0, dz: 0 };
    p.vx = 0;
    p.vz = 0;
    p.moveSeq = 0;
    p.face = { dx: 0, dz: 1 };
    p.carrying = null;
    p.working = false;
  }
  s.phase = 'countdown';
  s.countdown = COUNTDOWN_T;
  ctx.broadcast('game:countdown', { mapId: s.mapId, mapName: map.name });
  armTick(ctx);
}

function stepGame(ctx) {
  const s = ctx.state;
  const L = s.layout;
  const playerIds = Object.keys(s.players);

  // --- 玩家：工作（切菜/洗碗）与移动 ---
  for (const id of playerIds) {
    const p = s.players[id];
    if (p.working) {
      const st = targetStation(L, p);
      let didWork = false;
      if (st && st.type === 'board') {
        const dyn = s.stations[st.x + ',' + st.z];
        if (dyn && dyn.item && dyn.item.k === 'raw') {
          dyn.item.progress = (dyn.item.progress || 0) + DT;
          if (dyn.item.progress >= CHOP_TIME) {
            dyn.item = { k: 'chopped', g: dyn.item.g, progress: 0 };
          }
          didWork = true;
        }
      } else if (st && st.type === 'sink') {
        if (!p.carrying && s.plates.dirty > 0) {
          s.plates.washT += DT;
          if (s.plates.washT >= WASH_TIME) {
            s.plates.washT = 0;
            s.plates.dirty -= 1;
            s.plates.clean += 1;
          }
          didWork = true;
        }
      }
      if (didWork) {
        p.vx = 0;
        p.vz = 0;
        continue; // 工作时不能移动，也不保留减速速度
      }
    }
    const ix = p.input.dx;
    const iz = p.input.dz;
    if (ix !== 0 || iz !== 0) {
      const flen = Math.hypot(ix, iz);
      if (flen > 0.2) p.face = { dx: ix / flen, dz: iz / flen };
    }
    // 非零输入立即响应；零输入在 100ms 内沿原方向减速。
    const otherPlayers = playerIds.filter((otherId) => otherId !== id).map((otherId) => s.players[otherId]);
    stepPlayerMovement(L, p, p.input, DT, otherPlayers);
  }

  // --- 灶台：烹饪 / 烧糊 ---
  for (const k in s.stations) {
    const pot = s.stations[k];
    if (!pot.contents) continue;
    if (pot.phase === 'cooking') {
      pot.t += DT;
      if (pot.t >= COOK_TIME) {
        pot.phase = 'ready';
        pot.t = 0;
        const st = L.stationAt[k];
        ctx.broadcast('pot:ready', { x: st.x, z: st.z });
      }
    } else if (pot.phase === 'ready') {
      pot.t += DT;
      if (pot.t >= BURN_TIME) {
        pot.phase = 'burnt';
        pot.t = 0;
        const st = L.stationAt[k];
        ctx.broadcast('pot:burnt', { x: st.x, z: st.z });
      }
    }
  }

  // --- 脏盘返回 ---
  for (let i = s.plates.due.length - 1; i >= 0; i--) {
    s.plates.due[i] -= DT;
    if (s.plates.due[i] <= 0) {
      s.plates.due.splice(i, 1);
      s.plates.dirty += 1;
      ctx.broadcast('plate:dirty', {});
    }
  }

  // --- 订单生成与过期 ---
  s.nextOrderIn -= DT;
  if (s.nextOrderIn <= 0 && s.orders.length < MAX_ORDERS) {
    spawnOrder(ctx);
    s.nextOrderIn = ORDER_MIN_GAP + ctx.random() * ORDER_VAR_GAP;
  }
  for (let i = s.orders.length - 1; i >= 0; i--) {
    const o = s.orders[i];
    o.t -= DT;
    if (o.t <= 0) {
      s.orders.splice(i, 1);
      s.expired += 1;
      s.score = Math.max(0, s.score - EXPIRE_PENALTY);
      ctx.broadcast('order:expired', { name: o.name });
    }
  }

  // --- 终局 ---
  s.timeLeft -= DT;
  if (s.timeLeft <= 0) {
    s.timeLeft = 0;
    s.phase = 'ended';
    ctx.broadcast('game:over', { score: s.score, served: s.served, expired: s.expired });
  }
}

// ---------------------------------------------------------------------------
// 交互（E 键）：依目标站台与手持物分派
// ---------------------------------------------------------------------------
function doInteract(ctx, p) {
  const s = ctx.state;
  const st = targetStation(s.layout, p);
  if (!st) return;
  const key = st.x + ',' + st.z;
  const dyn = s.stations[key];
  const c = p.carrying;

  if (st.type === 'crate') {
    if (!c) p.carrying = { k: 'raw', g: st.crate, progress: 0 };
    return;
  }

  if (st.type === 'counter' || st.type === 'board') {
    if (!c && dyn && dyn.item) {
      p.carrying = dyn.item;
      dyn.item = null;
      if (p.carrying.k === 'raw') p.carrying.progress = 0;
    } else if (c && dyn && !dyn.item) {
      if (st.type === 'board' && !(c.k === 'raw' || c.k === 'chopped')) return;
      if (c.k === 'raw') c.progress = 0;
      dyn.item = c;
      p.carrying = null;
    } else if (c && dyn && dyn.item) {
      // 把切碎食材叠到台面/砧板的盘子上（组装沙拉等）
      const on = dyn.item;
      if (c.k === 'chopped' && (on.k === 'plate' || on.k === 'dish') && on.items.length < 3) {
        on.items.push(c.g);
        on.k = 'dish';
        p.carrying = null;
      }
    }
    return;
  }

  if (st.type === 'stove') {
    const pot = dyn;
    if (!pot) return;
    if (c && c.k === 'chopped' && (pot.phase === 'idle' || pot.phase === 'cooking') && pot.contents.length < 3) {
      if (!COOKABLE.has(c.g)) return; // 生菜/黄瓜等不能下锅（客户端气泡会提示）
      pot.contents.push(c.g);
      p.carrying = null;
      const r = RECIPE_BY_KEY[recipeKey(pot.contents)];
      if (r && r.cook) {
        pot.phase = 'cooking';
        pot.t = 0;
      } else if (pot.contents.length >= 3) {
        pot.phase = 'burnt';
        pot.t = 0;
        ctx.broadcast('pot:burnt', { x: st.x, z: st.z });
      }
    } else if (c && c.k === 'plate' && c.items.length === 0 && pot.phase === 'ready') {
      p.carrying = { k: 'dish', items: pot.contents.slice() };
      pot.contents = [];
      pot.phase = 'idle';
      pot.t = 0;
    } else if (!c && pot.contents.length > 0 && (pot.phase === 'idle' || pot.phase === 'burnt')) {
      // 空手清空锅里内容（倒掉）
      pot.contents = [];
      pot.phase = 'idle';
      pot.t = 0;
    }
    return;
  }

  if (st.type === 'plates') {
    if (!c && s.plates.clean > 0) {
      s.plates.clean -= 1;
      p.carrying = { k: 'plate', items: [] };
    }
    return;
  }

  if (st.type === 'window') {
    if (c && c.k === 'dish') {
      const key2 = recipeKey(c.items);
      const idx = s.orders.findIndex((o) => o.key === key2);
      if (idx >= 0) {
        const o = s.orders[idx];
        s.orders.splice(idx, 1);
        const tip = Math.round(10 * Math.max(0, o.t) / o.total);
        const gained = o.points + tip;
        s.score += gained;
        s.served += 1;
        s.plates.due.push(DIRTY_DELAY);
        p.carrying = null;
        ctx.broadcast('order:served', { name: o.name, points: o.points, tip, by: p.name });
      }
    }
    return;
  }

  if (st.type === 'trash') {
    if (c) p.carrying = null;
    return;
  }
  // sink：洗碗走 work 长按，不在此处理
}

// ---------------------------------------------------------------------------
// 房间定义
// ---------------------------------------------------------------------------
export default defineRoom({
  meta: { name: '胡闹厨房派对', minPlayers: 2, maxPlayers: 4 },

  initialState() {
    return {
      phase: 'lobby',        // lobby | countdown | playing | ended
      gameSeq: 0,            // 每开一局 +1，客户端据此重建场景
      mapId: 'classic',
      hostId: null,
      countdown: 0,
      timeLeft: 0,
      score: 0,
      served: 0,
      expired: 0,
      players: {},
      layout: null,
      stations: {},
      orders: [],
      nextOrderIn: 0,
      plates: { clean: 0, dirty: 0, washT: 0, due: [] },
      orderSeq: 0,
    };
  },

  onCreate(ctx) {
    ctx.state.hostId = ctx.host ? ctx.host.id : null;
  },

  onRestore(ctx) {
    // 房主刷新后从快照恢复：若对局仍在进行，重新挂上 tick 定时器
    if (ctx.host) ctx.state.hostId = ctx.host.id;
    for (const id in ctx.state.players || {}) {
      const p = ctx.state.players[id];
      if (!Number.isFinite(p.vx)) p.vx = 0;
      if (!Number.isFinite(p.vz)) p.vz = 0;
      if (!Number.isSafeInteger(p.moveSeq)) p.moveSeq = 0;
    }
    if (ctx.state.phase === 'playing' || ctx.state.phase === 'countdown') {
      armTick(ctx);
    }
  },

  onJoin(ctx, player) {
    const s = ctx.state;
    if (ctx.host && player.id === ctx.host.id) s.hostId = ctx.host.id;
    const count = Object.keys(s.players).length;
    const p = {
      name: (player.name || '厨师').slice(0, 12),
      color: PLAYER_COLORS[count % PLAYER_COLORS.length],
      x: 0,
      z: 0,
      input: { dx: 0, dz: 0 },
      vx: 0,
      vz: 0,
      moveSeq: 0,
      face: { dx: 0, dz: 1 },
      carrying: null,
      working: false,
    };
    s.players[player.id] = p;
    if ((s.phase === 'playing' || s.phase === 'countdown') && s.layout) {
      const sp = s.layout.spawns[count % s.layout.spawns.length];
      p.x = sp.x + 0.5;
      p.z = sp.z + 0.5;
    }
    ctx.broadcast('player:joined', { name: p.name });
  },

  onLeave(ctx, player) {
    const s = ctx.state;
    delete s.players[player.id];
    if (Object.keys(s.players).length === 0 && s.phase !== 'lobby') {
      // 所有人都走了：回到大厅，停止计时
      s.phase = 'lobby';
      s.layout = null;
      s.stations = {};
      s.orders = [];
    }
  },

  actions: {
    // 大厅：选择地图（仅房主）
    selectMap(ctx, { player, payload }) {
      const s = ctx.state;
      if (s.phase !== 'lobby') return;
      if (player.id !== ctx.host.id) return;
      const mapId = payload && payload.mapId;
      if (typeof mapId !== 'string' || !MAPS[mapId]) return;
      s.mapId = mapId;
    },

    // 大厅：开始游戏（仅房主，>=2 人）
    start(ctx, { player }) {
      const s = ctx.state;
      if (s.phase !== 'lobby') return;
      if (player.id !== ctx.host.id) return;
      if (Object.keys(s.players).length < 2) return;
      setupGame(ctx);
    },

    // 结算：同图再来一局（仅房主）
    rematch(ctx, { player }) {
      const s = ctx.state;
      if (s.phase !== 'ended') return;
      if (player.id !== ctx.host.id) return;
      if (Object.keys(s.players).length < 2) return;
      setupGame(ctx);
    },

    // 结算：返回大厅（仅房主）
    toLobby(ctx, { player }) {
      const s = ctx.state;
      if (s.phase !== 'ended') return;
      if (player.id !== ctx.host.id) return;
      s.phase = 'lobby';
      s.layout = null;
      s.stations = {};
      s.orders = [];
      for (const id in s.players) {
        const p = s.players[id];
        p.carrying = null;
        p.working = false;
        p.input = { dx: 0, dz: 0 };
        p.vx = 0;
        p.vz = 0;
      }
    },

    // 移动意图：{ dx, dz, seq }（持续状态，客户端在方向变化时发送）
    move(ctx, { player, payload }) {
      const s = ctx.state;
      if (s.phase !== 'playing') return;
      const p = s.players[player.id];
      if (!p) return;
      let dx = Number(payload && payload.dx) || 0;
      let dz = Number(payload && payload.dz) || 0;
      if (!Number.isFinite(dx)) dx = 0;
      if (!Number.isFinite(dz)) dz = 0;
      dx = Math.max(-1, Math.min(1, dx));
      dz = Math.max(-1, Math.min(1, dz));
      const len = Math.hypot(dx, dz);
      if (len > 1) {
        dx /= len;
        dz /= len;
      }
      const seq = Number(payload && payload.seq);
      if (Number.isSafeInteger(seq) && seq >= 0) {
        const currentSeq = Number.isSafeInteger(p.moveSeq) ? p.moveSeq : 0;
        if (seq < currentSeq) return; // 忽略乱序到达的旧方向
        p.moveSeq = seq;
      } else {
        // Compatibility with older clients and restored snapshots.
        p.moveSeq = (Number.isSafeInteger(p.moveSeq) ? p.moveSeq : 0) + 1;
      }
      p.input = { dx, dz };
    },

    // 工作意图（切菜/洗碗，长按）：{ on: boolean }
    work(ctx, { player, payload }) {
      const s = ctx.state;
      if (s.phase !== 'playing') return;
      const p = s.players[player.id];
      if (!p) return;
      p.working = !!(payload && payload.on);
    },

    // 交互（拿/放/装盘/上菜/倒垃圾）
    interact(ctx, { player }) {
      const s = ctx.state;
      if (s.phase !== 'playing') return;
      const p = s.players[player.id];
      if (!p || !s.layout) return;
      doInteract(ctx, p);
    },
  },
});
