import { defineRoom } from '@parti/worker-sdk';

/**
 * 新手上厨 — Parti 房间权威逻辑
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
const ROUND_RESULT_T = 8;
const RAGE_MAX = 100;
const RAGE_EXPIRED = 25;
const RAGE_SERVED = 5;
const BUFF_TYPES = ['fast_hands', 'master_chef', 'swift_feet', 'fire_overdrive'];
const BUFF_WEIGHTS = [2, 2, 2, 1];
const BUFF_DURATION = 15;
const BUFF_LIFETIME = 18;
const FIRE_OVERDRIVE_DURATION = 10;

const PLAYER_COLORS = ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71'];
const STAT_KEYS = ['chops', 'washes', 'assembles', 'potAdds', 'potPickups', 'deliveries', 'fastServes', 'clutchServes', 'burnClears', 'discards'];

function emptyStats() {
  const out = {};
  for (const key of STAT_KEYS) out[key] = 0;
  return out;
}
function normalizeStats(value) {
  const out = emptyStats();
  for (const key of STAT_KEYS) if (Number.isFinite(value && value[key])) out[key] = Math.max(0, Math.floor(value[key]));
  return out;
}
function bumpStat(p, key) {
  if (!p || !STAT_KEYS.includes(key)) return;
  if (!p.stats) p.stats = emptyStats();
  if (!p.roundStats) p.roundStats = emptyStats();
  p.stats[key] = (p.stats[key] || 0) + 1;
  p.roundStats[key] = (p.roundStats[key] || 0) + 1;
}

const TEAM_COPY = {
  perfect: [
    ['满汉全席，准时开席', '零单超时，宾主尽欢。'], ['零单超时，宾主尽欢', '今天的订单，句句有回应。'],
    ['这不是出餐，这是行云流水', '食客甚至来不及催单。'], ['炉火纯青，分秒不差', '每一道菜都赶上了最佳时辰。'],
    ['一鼓作气，满席生香', '订单清清爽爽，食客心满意足。'],
  ],
  efficient: [
    ['炉火纯青', '有条不紊，锅铲生风。'], ['流水的订单，铁打的厨师', '厨房虽小，效率很大。'],
    ['八方来单，四面出菜', '忙而不乱，稳稳当当。'], ['今日出餐：一路绿灯', '灶台与砧板都很给面子。'],
    ['快马加鞭，热菜先行', '速度与温度一个都没落下。'],
  ],
  expired: [
    ['食客饥肠辘辘', '菜单看了三遍，菜还在成长。'], ['食客怒气冲天', '厨房也很着急，锅可以作证。'],
    ['订单走完了它短暂的一生', '愿下一张单据得偿所愿。'], ['菜还在路上，食客已看淡人生', '本店暂时主打耐心。'],
    ['厨房很忙，主要忙着忙', '锅碗瓢盆都参与了讨论。'],
  ],
  hectic: [
    ['焦头烂额，尚能开席', '过程惊心动魄，结果还能上桌。'], ['兵荒马乱，饭倒是熟了', '这就叫乱中有序，大概。'],
    ['锅碗瓢盆各有各的想法', '好在最后达成了基本共识。'], ['过程像灾难片，结局像美食片', '剪辑师功不可没。'],
    ['手忙脚乱，锅稳菜香', '忙乱只是表象，上桌才是答案。'],
  ],
  teamwork: [
    ['三头六臂', '你递我接，配合得像排练过。'], ['众人拾柴火焰高', '每把锅铲都有姓名。'],
    ['各司其职，八方来菜', '没有孤胆英雄，只有黄金搭档。'], ['厨房命运共同体', '今日份默契已成功装盘。'],
    ['心有灵犀一点通', '一个眼神，一盘菜。'],
  ],
  burnt: [
    ['炊烟袅袅，可能不全是炊烟', '锅底拥有了自己的故事。'], ['本店招牌：外焦里也焦', '火候是一门奔放的艺术。'],
    ['消防意识深入锅心', '下一锅一定温柔以待。'], ['锅比食客先吃饱了', '焦香虽浓，斗志更浓。'],
    ['星星之火，可以燎锅', '好在救火的人一直都在。'],
  ],
  idle: [
    ['万事俱备，只差出菜', '厨房完成了充分的热身运动。'], ['食材见过了世面', '食客还没见到菜。'],
    ['一切都在计划之中', '只是计划暂未包含上菜。'], ['今日菜单：稍后揭晓', '锅铲们仍在酝酿灵感。'],
    ['蓄势待发，尚未发出', '下一局争取让菜先走一步。'],
  ],
  middling: [
    ['有惊无险，勉强优雅', '几张订单与时间擦肩而过。'], ['菜上了一些，悬念留了一些', '食客与厨师都收获了成长。'],
    ['半是烟火，半是等待', '厨房故事仍未完待续。'], ['稳中带忙，忙中带忘', '至少端出去的都是好菜。'],
    ['一半从容，一半匆忙', '这大概就是厨房的阴阳调和。'],
  ],
  generic: [
    ['厨房不会说话，但锅看起来有意见', '辛苦各位，围裙知道一切。'], ['今日份默契已成功装盘', '能端出去的，都是好菜。'],
    ['锅铲一响，好戏开场', '这一局的滋味叫并肩作战。'], ['人间烟火气，最抚厨师心', '收拾心情，下一局继续开火。'],
    ['厨房虽乱，友谊不散', '每一次碰撞都算团队交流。'],
  ],
};

const FINAL_COPY = {
  allPerfect: [
    ['此宴只应天上有', '三战三捷，满堂喝彩。'], ['三局全优，完美收官', '准时，是今晚最香的调味料。'],
    ['米其林路过都想记笔记', '这支队伍把默契做成了招牌菜。'], ['一席无憾，尽兴而归', '所有订单都找到了归宿。'],
  ],
  comeback: [
    ['力挽狂澜，扶锅于将倾', '前菜略苦，收官回甘。'], ['绝地翻盘', '最后一道菜没有放弃。'],
    ['逆风开灶，顺风上菜', '真正的主厨从不怕开局不利。'], ['好戏压轴，热菜收官', '厨房把悬念留到了最后。'],
  ],
  improving: [
    ['后来居上，灶见真章', '越战越勇，越炒越香。'], ['渐入佳境', '第一局找锅，最后一局找不到对手。'],
    ['一路升温，恰到好处', '配合和汤一样越炖越浓。'], ['每一局都比上一局更香', '成长已经端上桌了。'],
  ],
  perfect: [
    ['全场零超时，宾主尽欢', '这场派对没有留下遗憾订单。'], ['从开火到打烊，一路准点', '时间管理大师集体出道。'],
    ['有始有终，有菜有汤', '完美二字已经写在围裙上。'], ['全席无缺', '食客满意得忘了催单。'],
  ],
  efficient: [
    ['今日厨房，盛况空前', '订单如潮，出菜如风。'], ['金牌后厨，圆满打烊', '效率与锅气双双在线。'],
    ['一桌好菜，一群好搭档', '今晚的招牌叫配合。'], ['炉火不息，佳肴不止', '忙碌最终都有了分数。'],
  ],
  chaotic: [
    ['焦头烂额，仍然值得鼓掌', '厨房留下了故事，也留下了几口锅。'], ['食客等到了故事的结局', '虽然中间插播了几次超时。'],
    ['烟火很旺，悬念更旺', '打烊了，锅终于可以冷静一下。'], ['一场很有参与感的晚餐', '每张订单都见证过努力。'],
  ],
  generic: [
    ['曲终人未散，锅凉情还热', '辛苦各位，今日顺利打烊。'], ['一餐一饭，皆是团队作战', '围裙可以脱下，默契继续保留。'],
    ['锅碗暂歇，江湖再见', '这桌回忆已经打包完毕。'], ['打烊不是结束，是下一次开火的预告', '感谢每一位厨房合伙人。'],
    ['今晚不论名次，只论香气', '排行榜记分，食客记味。'],
  ],
};

const TITLE_COPY = {
  champion: [['👑','厨神之神'],['👑','食神在逃'],['👑','掌勺扛把子']],
  clutch: [['🌊','力挽狂澜'],['🪨','中流砥柱'],['⚓','定海神针']],
  chops: [['🔪','刀工如神'],['🔪','庖丁再世'],['🔪','砧板艺术家']],
  washes: [['🫧','净盘使者'],['🫧','碗事如意'],['🫧','后勤之光']],
  potAdds: [['🔥','炉火纯青'],['🔥','锅气掌门'],['🔥','灶台守护者']],
  assembles: [['🍽️','妙手成盘'],['🍽️','摆盘魔法师'],['🍽️','细节控场王']],
  deliveries: [['🏃','传菜如风'],['🏃','使命必达'],['🏃','最后一公里']],
  fastServes: [['⚡','风驰电掣'],['⚡','闪电出餐'],['⚡','未催先达']],
  clutchServes: [['⏳','极限救单'],['⏳','压哨大师'],['⏳','最后十秒战神']],
  burnClears: [['🧯','救火队长'],['🧯','焦香终结者'],['🧯','厨房消防员']],
  teamwork: [['🤝','三头六臂'],['⚙️','黄金齿轮'],['🤝','团队黏合剂']],
  allrounder: [['⬡','六边形战士'],['🧰','哪里需要哪里搬'],['🥄','厨房万金油']],
  backstage: [['🌟','无名英雄'],['🎬','幕后大厨'],['🌙','深藏功与名']],
  improving: [['📈','后来居上'],['📈','渐入佳境'],['🌱','逆风生长']],
  noWaste: [['♻️','物尽其用'],['♻️','勤俭持厨'],['📦','食材管理大师']],
  fallback: [['👍','靠谱厨友'],['✨','锅铲新星'],['🎖️','今日有功'],['🦸','围裙侠'],['🎉','厨房气氛组']],
};

function stableIndex(seed, length) {
  let hash = 2166136261;
  for (const ch of String(seed)) { hash ^= ch.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0) % length;
}
function stablePick(pool, seed) { return pool[stableIndex(seed, pool.length)]; }
function commentFrom(pool, seed, rare = false) {
  const picked = stablePick(pool, seed);
  return { title: picked[0], subtitle: picked[1], rare };
}

// 食材：板条箱字母 -> 食材 id
const CRATES = { T: 'tomato', O: 'onion', M: 'mushroom', L: 'lettuce', U: 'cucumber', R: 'carrot', V: 'potato', A: 'meat', H: 'cheese', I: 'rice' };
const INGREDIENTS = {
  tomato: { choppable: true }, onion: { choppable: true }, mushroom: { choppable: true },
  lettuce: { choppable: true }, cucumber: { choppable: true }, carrot: { choppable: true },
  potato: { choppable: true }, meat: { choppable: true }, cheese: { choppable: true },
  rice: { choppable: false },
};
const whole = (ingredient) => ({ ingredient, prep: 'whole' });
const chopped = (ingredient) => ({ ingredient, prep: 'chopped' });

// 配方：items 同时声明食材与处理状态；cook=true 需要锅里煮
const RECIPES = [
  { id: 'tomato_soup', name: '番茄浓汤', items: [chopped('tomato'),chopped('tomato'),chopped('tomato')], cook: true, points: 20, difficulty: 1, weight: 5 },
  { id: 'onion_soup', name: '洋葱浓汤', items: [chopped('onion'),chopped('onion'),chopped('onion')], cook: true, points: 20, difficulty: 1, weight: 5 },
  { id: 'carrot_soup', name: '胡萝卜浓汤', items: [chopped('carrot'),chopped('carrot'),chopped('carrot')], cook: true, points: 22, difficulty: 1, weight: 4 },
  { id: 'potato_soup', name: '土豆浓汤', items: [chopped('potato'),chopped('potato'),chopped('potato')], cook: true, points: 22, difficulty: 1, weight: 4 },
  { id: 'mushroom_soup', name: '菌菇浓汤', items: [chopped('mushroom'),chopped('mushroom'),chopped('onion')], cook: true, points: 24, difficulty: 2, weight: 3 },
  { id: 'garden_stew', name: '田园炖菜', items: [whole('carrot'),chopped('onion'),chopped('potato')], cook: true, points: 28, difficulty: 2, weight: 3 },
  { id: 'garden_salad', name: '田园沙拉', items: [chopped('lettuce'),whole('tomato')], cook: false, points: 16, difficulty: 1, weight: 5 },
  { id: 'crisp_salad', name: '爽脆沙拉', items: [chopped('carrot'),whole('lettuce')], cook: false, points: 18, difficulty: 1, weight: 4 },
  { id: 'deluxe_salad', name: '豪华沙拉', items: [chopped('cucumber'),chopped('lettuce'),whole('tomato')], cook: false, points: 22, difficulty: 2, weight: 3 },
  { id: 'rainbow_salad', name: '彩虹沙拉', items: [chopped('carrot'),chopped('cucumber'),whole('lettuce')], cook: false, points: 24, difficulty: 2, weight: 3 },
  { id: 'meat_sauce_soup', name: '肉酱浓汤', items: [chopped('meat'),chopped('tomato'),chopped('onion')], cook: true, points: 30, difficulty: 3, weight: 2 },
  { id: 'cheese_potato_soup', name: '芝士土豆汤', items: [whole('cheese'),chopped('potato'),chopped('onion')], cook: true, points: 30, difficulty: 3, weight: 2 },
  { id: 'mushroom_meat_soup', name: '蘑菇肉汤', items: [chopped('meat'),chopped('mushroom'),whole('onion')], cook: true, points: 32, difficulty: 3, weight: 2 },
  { id: 'golden_risotto', name: '黄金烩饭', items: [whole('rice'),chopped('carrot'),chopped('onion')], cook: true, points: 32, difficulty: 3, weight: 2 },
  { id: 'mushroom_risotto', name: '菌菇烩饭', items: [whole('rice'),chopped('mushroom'),chopped('onion')], cook: true, points: 32, difficulty: 3, weight: 2 },
  { id: 'cheese_salad', name: '芝士沙拉', items: [whole('cheese'),chopped('lettuce'),whole('tomato')], cook: false, points: 26, difficulty: 2, weight: 3 },
  { id: 'power_salad', name: '能量沙拉', items: [chopped('meat'),whole('lettuce'),chopped('cucumber')], cook: false, points: 30, difficulty: 3, weight: 2 },
  { id: 'party_platter', name: '派对拼盘', items: [whole('cheese'),chopped('meat'),whole('rice')], cook: false, points: 34, difficulty: 3, weight: 1 },
];

// 可下锅的食材（出现在任意 cook 配方中）；生菜/黄瓜等只能做沙拉，下锅必糊
const COOKABLE = new Set();
for (const r of RECIPES) if (r.cook) for (const item of r.items) COOKABLE.add(item.ingredient);

function recipeKey(items) {
  return items.map((item) => typeof item === 'string' ? `${item}:chopped` : `${item.ingredient || item.g}:${item.prep || (item.k === 'chopped' ? 'chopped' : 'whole')}`).sort().join('+');
}
function itemRequirement(item) { return { ingredient: item.g, prep: item.k === 'chopped' ? 'chopped' : 'whole' }; }
function validItemPrep(item) { return item.k !== 'chopped' || INGREDIENTS[item.g]?.choppable; }
function isRecipePrefix(items, recipe) {
  const have = new Map();
  for (const item of items) { const key = recipeKey([item]); have.set(key, (have.get(key) || 0) + 1); }
  const need = new Map();
  for (const item of recipe.items) { const key = recipeKey([item]); need.set(key, (need.get(key) || 0) + 1); }
  for (const [key, count] of have) if ((need.get(key) || 0) < count) return false;
  return true;
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
      '######W########',
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
  snow: {
    name: '雪山餐车', desc: '冰面惯性延长刹车距离，干活可立即停稳。', plates: 5,
    movementProfile: { speed: SPEED, stopTime: 0.65, turnTime: 0.25 }, mechanic: { type: 'ice' },
    pool: ['potato_soup','mushroom_soup','cheese_potato_soup','mushroom_meat_soup','cheese_salad'],
    grid: [
      '#######W#######', '#V.M.H...L.TAO#', '#.1..C....2...#', '#B.B...C..B.B.#',
      '#.....CCC.....#', '#S.S...X..S.S.#', '#.3...C....4..#', '#K...P.C.P..K.#', '###############',
    ],
  },
  space: {
    name: '太空厨房', desc: '台面食材会被预告并随机漂移。', plates: 5,
    mechanic: { type: 'floating_food', interval: 25, warning: 3 },
    pool: ['golden_risotto','mushroom_risotto','meat_sauce_soup','power_salad','party_platter'],
    grid: [
      '#######W#######', '#I...P...P...A#', '#.1.........3.#', '#T.B..CCCCC..B#',
      '#O...CS.2.SC.M#', '#....C.SXS.C..#', '#L.B..CCCCC..B#', '#.4...........#', '#U.R.K...K...H#', '###############',
    ],
  },
  castle: {
    name: '城堡宴会厅', desc: '上下城门交替开放，随时改变左右半场路线。', plates: 5,
    mechanic: { type: 'gate', gates: [{ id: 'top', x: 7, z: 3 }, { id: 'bottom', x: 7, z: 7 }], switchTime: 15, warning: 3 },
    pool: ['garden_stew','deluxe_salad','meat_sauce_soup','cheese_potato_soup','golden_risotto','cheese_salad','party_platter'],
    grid: [
      '##W#########W##', '#T.O.H.#I.MA..#', '#..1...#...2..#', '#B.C...D...C.B#',
      '#..P.C.#.C.P..#', '#K...S.#.S...K#', '#.3X.C.#.C.X4.#', '#B.C...D...C.B#', '#L.U.R.#..V...#', '###############',
    ],
  },
};

for (const mapId in MAPS) {
  const rows = MAPS[mapId].grid;
  if (!rows.length || rows.some((row) => row.length !== rows[0].length)) throw new Error(`Invalid map width: ${mapId}`);
  const slots = rows.join('').match(/[1-4]/g) || [];
  if (slots.length !== 4 || new Set(slots).size !== 4) throw new Error(`Invalid spawn slots: ${mapId}`);
}

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
      else if (ch >= '1' && ch <= '4') { spawns.push({ x, z, slot: Number(ch) }); }
      else if (ch === 'C') { cell = 'C'; st = { x, z, type: 'counter' }; }
      else if (ch === 'B') { cell = 'B'; st = { x, z, type: 'board' }; }
      else if (ch === 'S') { cell = 'S'; st = { x, z, type: 'stove' }; }
      else if (ch === 'P') { cell = 'P'; st = { x, z, type: 'plates' }; }
      else if (ch === 'K') { cell = 'K'; st = { x, z, type: 'sink' }; }
      else if (ch === 'W') { cell = 'W'; st = { x, z, type: 'window' }; }
      else if (ch === 'X') { cell = 'X'; st = { x, z, type: 'trash' }; }
      else if (ch === 'D') { cell = '.'; }
      else if (CRATES[ch]) { cell = 'G'; st = { x, z, type: 'crate', crate: CRATES[ch] }; }
      cells[z * w + x] = cell;
      if (st) stationAt[x + ',' + z] = st;
    }
  }
  spawns.sort((a, b) => a.slot - b.slot);
  return { mapId, name: map.name, w, h, cells, spawns, stationAt, movementProfile: map.movementProfile || null, mechanic: map.mechanic || null, dynamicBlocked: {} };
}

// ---------------------------------------------------------------------------
// 碰撞与寻位
// ---------------------------------------------------------------------------
function isBlocked(L, cx, cz) {
  if (cx < 0 || cz < 0 || cx >= L.w || cz >= L.h) return true;
  if (L.dynamicBlocked && L.dynamicBlocked[cx + ',' + cz]) return true;
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
  const profile = L.movementProfile || {};
  const speedLimit = (profile.speed || SPEED) * (p.activeBuff && p.activeBuff.type === 'swift_feet' ? 1.25 : 1);
  const deceleration = speedLimit / (profile.stopTime || STOP_TIME);
  const turnTime = profile.turnTime || 0;
  const steps = Math.max(1, Math.round(dt / MOVE_FIXED_STEP));
  const stepDt = dt / steps;

  for (let step = 0; step < steps; step++) {
    let moveX;
    let moveZ;
    if (active) {
      const targetVx = ix * speedLimit;
      const targetVz = iz * speedLimit;
      const blend = turnTime ? Math.min(1, stepDt / turnTime) : 1;
      p.vx = (p.vx || 0) + (targetVx - (p.vx || 0)) * blend;
      p.vz = (p.vz || 0) + (targetVz - (p.vz || 0)) * blend;
      moveX = p.vx * stepDt;
      moveZ = p.vz * stepDt;
    } else {
      const speed = Math.hypot(p.vx || 0, p.vz || 0);
      if (speed <= MOVE_EPSILON) {
        p.vx = 0;
        p.vz = 0;
        break;
      }
      const nextSpeed = Math.max(0, speed - deceleration * stepDt);
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
  } else if (s.phase === 'roundResult') {
    s.roundResultTime -= DT;
    if (s.roundResultTime <= 0) setupRound(ctx);
  } else if (s.phase === 'awards') {
    const ids = Object.keys(s.players);
    for (const id of ids) {
      const p = s.players[id];
      if (p.input.dx || p.input.dz) { const len = Math.hypot(p.input.dx, p.input.dz); if (len > 0.2) p.face = { dx: p.input.dx / len, dz: p.input.dz / len }; }
      stepPlayerMovement(s.layout, p, p.input, DT, ids.filter((other) => other !== id).map((other) => s.players[other]));
    }
  } else {
    return; // 不再续约，定时器停止
  }
  armTick(ctx);
}

function spawnOrder(ctx) {
  const s = ctx.state;
  const pool = MAPS[s.mapId].pool;
  const candidates = pool.map((id) => RECIPES.find((r) => r.id === id)).filter(Boolean);
  const weighted = candidates.map((r) => ({ r, w: r.difficulty > s.difficultyLevel ? 1 : r.weight + r.difficulty * Math.max(0, s.difficultyLevel - 1) * 2 }));
  const totalWeight = weighted.reduce((sum, x) => sum + x.w, 0);
  let pick = ctx.random() * totalWeight;
  let r = weighted[weighted.length - 1].r;
  for (const entry of weighted) { pick -= entry.w; if (pick <= 0) { r = entry.r; break; } }
  s.orderSeq += 1;
  s.orders.push({
    id: 'o' + s.orderSeq,
    recipeId: r.id,
    difficulty: r.difficulty,
    key: recipeKey(r.items),
    items: r.items.map((item) => ({ ...item })),
    name: r.name,
    points: r.points,
    t: ORDER_LIFE,
    total: ORDER_LIFE,
  });
  ctx.broadcast('order:new', { name: r.name });
}

function shuffleMaps(ctx, previous) {
  const ids = Object.keys(MAPS);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(ctx.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  if (ids.length > 1 && ids[0] === previous) [ids[0], ids[1]] = [ids[1], ids[0]];
  return ids;
}

function takeNextMap(ctx) {
  const s = ctx.state;
  if (!s.mapQueue.length) s.mapQueue = shuffleMaps(ctx, s.mapId);
  return s.mapQueue.shift();
}

function resetPlayerForLayout(p, sp) {
  p.x = sp.x + 0.5; p.z = sp.z + 0.5;
  p.input = { dx: 0, dz: 0 }; p.vx = 0; p.vz = 0; p.moveSeq = 0;
  p.face = { dx: 0, dz: 1 }; p.carrying = null; p.working = false;
  p.activeBuff = null;
  p.roundContributionScore = 0; p.roundServed = 0; p.roundPublicEvents = 0; p.roundStats = emptyStats();
}

function teamComment(s, summary, final = false) {
  const closed = summary.served + summary.expired;
  const expiredRate = closed ? summary.expired / closed : 0;
  const seed = `${s.gameSeq}:${summary.round || 'final'}:${summary.score}:${summary.served}:${summary.expired}`;
  if (final) {
    const history = s.roundHistory || [];
    const first = history[0]; const last = history[history.length - 1];
    if (history.length >= 3 && history.every((r) => r.served > 0 && r.expired === 0)) return commentFrom(FINAL_COPY.allPerfect, seed, true);
    if (first && last && first.expired > 0 && last.expired === 0 && last.score >= first.score * 1.5) return commentFrom(FINAL_COPY.comeback, seed, true);
    if (first && last && history.length > 1 && last.score >= first.score * 1.5 && last.score > first.score) return commentFrom(FINAL_COPY.improving, seed, true);
    if (summary.served > 0 && summary.expired === 0) return commentFrom(FINAL_COPY.perfect, seed, true);
    if (summary.served >= 8 && expiredRate <= 0.15) return commentFrom(FINAL_COPY.efficient, seed);
    if (summary.expired >= 3 || expiredRate >= 0.5 || summary.burns >= 3) return commentFrom(FINAL_COPY.chaotic, seed);
    return commentFrom(FINAL_COPY.generic, seed);
  }
  const active = Object.values(s.players || {}).filter((p) => (p.roundContributionScore || 0) > 0);
  const values = active.map((p) => p.roundContributionScore || 0);
  const balanced = active.length === Object.keys(s.players || {}).length && active.every((p) => (p.roundPublicEvents || 0) > 0)
    && values.length > 1 && Math.max(...values) / Math.max(1, Math.min(...values)) <= 1.5;
  if (summary.served > 0 && summary.expired === 0) return commentFrom(TEAM_COPY.perfect, seed, true);
  if (summary.served >= 4 && expiredRate <= 0.15) return commentFrom(TEAM_COPY.efficient, seed);
  if (summary.served >= 3 && (summary.expired >= 2 || summary.burns >= 2)) return commentFrom(TEAM_COPY.hectic, seed);
  if (summary.burns >= 2) return commentFrom(TEAM_COPY.burnt, seed);
  if (summary.expired >= 3 || expiredRate >= 0.5) return commentFrom(TEAM_COPY.expired, seed);
  if (balanced) return commentFrom(TEAM_COPY.teamwork, seed, true);
  if (summary.served === 0) return commentFrom(TEAM_COPY.idle, seed);
  if (expiredRate >= 0.25) return commentFrom(TEAM_COPY.middling, seed);
  return commentFrom(TEAM_COPY.generic, seed);
}

function playerMetric(p, key, round) {
  if (key === 'contribution') return round ? (p.roundContributionScore || 0) : (p.contributionScore || 0);
  if (key === 'teamwork') return round ? (p.roundPublicEvents || 0) : (p.publicEvents || 0);
  return ((round ? p.roundStats : p.stats) || {})[key] || 0;
}
function makePlayerTitles(entries, round, seed) {
  const out = {}; const used = new Set();
  const maxima = {};
  for (const key of [...STAT_KEYS, 'teamwork', 'contribution']) maxima[key] = Math.max(0, ...entries.map((p) => playerMetric(p, key, round)));
  const sorted = [...entries].sort((a, b) => playerMetric(b, 'contribution', round) - playerMetric(a, 'contribution', round) || (a.joinOrder || 0) - (b.joinOrder || 0));
  for (let rankIndex = 0; rankIndex < sorted.length; rankIndex++) {
    const p = sorted[rankIndex]; const stats = round ? (p.roundStats || emptyStats()) : (p.stats || emptyStats());
    const candidates = [];
    const specialPriority = { clutchServes: 5, burnClears: 5, fastServes: 4, teamwork: 3, backstage: 3, allrounder: 3, noWaste: 2, clutch: 4, improving: 4, champion: 1 };
    const add = (kind, value, min, reason) => { if (value >= min && value === maxima[kind]) candidates.push({ kind, value, reason, priority: specialPriority[kind] || 4 }); };
    add('clutchServes', stats.clutchServes, 1, `${stats.clutchServes} 次压线上菜`);
    add('burnClears', stats.burnClears, 1, `${stats.burnClears} 次清理焦锅`);
    add('fastServes', stats.fastServes, 2, `${stats.fastServes} 次闪电出餐`);
    add('chops', stats.chops, 3, `完成 ${stats.chops} 次切配`);
    add('washes', stats.washes, 2, `洗净 ${stats.washes} 个盘子`);
    add('assembles', stats.assembles, 3, `完成 ${stats.assembles} 次装盘`);
    add('potAdds', stats.potAdds, 3, `${stats.potAdds} 次精准下锅`);
    add('deliveries', stats.deliveries, 2, `送出 ${stats.deliveries} 道菜`);
    const teamwork = playerMetric(p, 'teamwork', round);
    if (teamwork >= 3 && teamwork === maxima.teamwork) candidates.push({ kind: 'teamwork', value: teamwork, reason: `${teamwork} 次关键协作`, priority: specialPriority.teamwork });
    const basics = stats.chops + stats.washes + stats.assembles + stats.potAdds + stats.potPickups;
    if (stats.deliveries === 0 && basics >= 5) candidates.push({ kind: 'backstage', value: basics, reason: `${basics} 次幕后支援`, priority: specialPriority.backstage });
    const varied = ['chops','washes','assembles','potAdds','deliveries'].filter((key) => stats[key] > 0).length;
    if (varied >= 4) candidates.push({ kind: 'allrounder', value: varied, reason: `涉猎 ${varied} 类工作`, priority: specialPriority.allrounder });
    if (stats.discards === 0 && playerMetric(p, 'contribution', round) >= 8) candidates.push({ kind: 'noWaste', value: 1, reason: '全程零浪费', priority: specialPriority.noWaste });
    if (!round && rankIndex > 0 && playerMetric(p, 'contribution', false) >= maxima.contribution * 0.85) candidates.push({ kind: 'clutch', value: 1, reason: '关键贡献紧追榜首', priority: specialPriority.clutch });
    if (!round && p.roundContributionScore >= Math.max(8, (p.contributionScore || 0) * 0.45)) candidates.push({ kind: 'improving', value: p.roundContributionScore, reason: '收官阶段火力全开', priority: specialPriority.improving });
    if (rankIndex === 0 && playerMetric(p, 'contribution', round) > 0) candidates.push({ kind: 'champion', value: 0, reason: round ? '本局贡献榜首' : '全场贡献榜首', priority: specialPriority.champion });
    candidates.sort((a, b) => (b.priority || 0) - (a.priority || 0) || b.value - a.value);
    let chosen = candidates.find((c) => !used.has(c.kind)) || candidates[0] || { kind: 'fallback', reason: '认真完成每一次配合' };
    const pool = TITLE_COPY[chosen.kind] || TITLE_COPY.fallback;
    let title = stablePick(pool, `${seed}:${p.id || p.name}:${chosen.kind}`);
    if (used.has(title[1])) title = pool.find((item) => !used.has(item[1])) || title;
    used.add(chosen.kind); used.add(title[1]);
    out[p.id] = { icon: title[0], title: title[1], reason: chosen.reason, rare: ['champion','clutchServes','burnClears','clutch','improving'].includes(chosen.kind) };
  }
  return out;
}

function captureRoundResult(s) {
  if ((s.roundHistory || []).some((r) => r.round === s.roundIndex)) return;
  const summary = { round: s.roundIndex, score: s.roundScore || 0, served: s.roundServed || 0, expired: s.roundExpired || 0, burns: s.roundBurns || 0 };
  const closed = summary.served + summary.expired;
  summary.serveRate = closed ? Math.round(100 * summary.served / closed) : 0;
  s.roundHistory.push(summary);
  s.roundComment = teamComment(s, summary, false);
  const entries = Object.keys(s.players).map((id) => ({ id, ...s.players[id] }));
  s.roundTitles = makePlayerTitles(entries, true, `${s.gameSeq}:${s.roundIndex}:round`);
}

function setupRound(ctx) {
  const s = ctx.state;
  s.roundIndex += 1;
  s.difficultyLevel = s.mode === 'party' ? Math.min(3, s.roundIndex) : s.roundIndex;
  s.mapId = s.nextMapId || takeNextMap(ctx);
  s.nextMapId = null;
  s.gameSeq = (s.gameSeq || 0) + 1;
  const map = MAPS[s.mapId];
  const layout = parseMap(s.mapId);
  s.layout = layout;
  s.stations = {};
  for (const k in layout.stationAt) {
    const st = layout.stationAt[k];
    if (st.type === 'counter' || st.type === 'board') s.stations[k] = { item: null };
    else if (st.type === 'stove') s.stations[k] = { contents: [], credits: [], phase: 'idle', t: 0, masterChef: false };
  }
  s.roundScore = 0;
  s.roundServed = 0;
  s.roundExpired = 0;
  s.roundBurns = 0;
  s.roundComment = null;
  s.roundTitles = {};
  s.orders = [];
  s.orderSeq = 0;
  s.plates = { clean: map.plates, dirty: 0, washT: 0, due: [], cleanCredits: [] };
  s.timeLeft = GAME_TIME;
  s.nextOrderIn = ORDER_FIRST;
  s.groundBuff = null;
  s.nextBuffIn = 25;
  s.fireOverdriveRemaining = 0;
  s.spaceEvent = { nextIn: map.mechanic?.type === 'floating_food' ? map.mechanic.interval : 0, warning: null };
  s.gate = map.mechanic?.type === 'gate' ? { active: 'top', remaining: map.mechanic.switchTime, warning: false } : null;
  if (s.gate) {
    const closed = map.mechanic.gates.find((gate) => gate.id !== s.gate.active);
    layout.dynamicBlocked[closed.x + ',' + closed.z] = true;
  }
  const ids = Object.keys(s.players);
  for (let i = 0; i < ids.length; i++) {
    const p = s.players[ids[i]];
    resetPlayerForLayout(p, layout.spawns[i % layout.spawns.length]);
  }
  s.phase = 'countdown';
  s.countdown = COUNTDOWN_T;
  ctx.broadcast('game:countdown', { mapId: s.mapId, mapName: map.name });
  armTick(ctx);
}

function setupSession(ctx) {
  const s = ctx.state;
  const legacyMap = s.legacySingle ? s.mapId : null;
  s.roundIndex = 0; s.difficultyLevel = 1; s.mapQueue = shuffleMaps(ctx, null); s.mapId = null; s.nextMapId = legacyMap;
  s.sessionScore = 0; s.score = 0; s.served = 0; s.expired = 0; s.rage = 0; s.standings = [];
  s.burns = 0; s.roundBurns = 0; s.roundHistory = []; s.roundComment = null; s.finalComment = null; s.roundTitles = {}; s.finalTitles = {};
  s.playerRecords = {};
  for (const id in s.players) {
    const p = s.players[id];
    p.contributionScore = 0; p.roundContributionScore = 0; p.servedCount = 0; p.publicEvents = 0; p.roundServed = 0; p.roundPublicEvents = 0; p.stats = emptyStats(); p.roundStats = emptyStats();
    syncPlayerRecord(s, id);
  }
  setupRound(ctx);
}

function buildStandings(s) {
  return Object.keys(s.playerRecords).map((id) => ({ id, ...s.playerRecords[id] }))
    .sort((a, b) => b.contributionScore - a.contributionScore || b.servedCount - a.servedCount || b.publicEvents - a.publicEvents || a.joinOrder - b.joinOrder)
    .map((p, index) => ({ ...p, rank: index + 1 }));
}

function syncPlayerRecord(s, id) {
  const p = s.players[id]; if (!p) return;
  s.playerRecords[id] = { name: p.name, color: p.color, contributionScore: p.contributionScore, servedCount: p.servedCount, publicEvents: p.publicEvents, joinOrder: p.joinOrder, stats: normalizeStats(p.stats) };
}

function finishSession(ctx) {
  const s = ctx.state;
  captureRoundResult(s);
  for (const id in s.players) syncPlayerRecord(s, id);
  s.standings = buildStandings(s);
  const finalSummary = { score: s.sessionScore || 0, served: s.served || 0, expired: s.expired || 0, burns: s.burns || 0 };
  s.finalComment = teamComment(s, finalSummary, true);
  s.finalTitles = makePlayerTitles(s.standings, false, `${s.gameSeq}:final`);
  s.phase = 'awards'; s.layout = makeAwardsLayout(); s.stations = {}; s.orders = [];
  s.gameSeq += 1;
  const ids = Object.keys(s.players);
  const spots = [{x:7,z:3},{x:5,z:4},{x:9,z:4},{x:7,z:6}];
  ids.forEach((id, i) => resetPlayerForLayout(s.players[id], spots[i] || spots[3]));
  ctx.broadcast('game:over', { score: s.sessionScore, served: s.served, expired: s.expired });
  armTick(ctx);
}

function makeAwardsLayout() {
  const grid = ['###############','#.............#','#.............#','#.............#','#.............#','#.............#','#.............#','#.............#','###############'];
  return { mapId: 'awards', name: '颁奖广场', w: 15, h: 9, cells: grid.join('').split(''), spawns: [{x:7,z:3},{x:5,z:4},{x:9,z:4},{x:7,z:6}], stationAt: {} };
}

function finishRound(ctx) {
  const s = ctx.state;
  captureRoundResult(s);
  if (s.legacySingle) return finishSession(ctx);
  if (s.mode === 'party' && s.roundIndex >= 3) return finishSession(ctx);
  s.nextMapId = takeNextMap(ctx); s.roundResultTime = ROUND_RESULT_T; s.phase = 'roundResult';
  s.orders = [];
  for (const id in s.players) { const p = s.players[id]; p.input = { dx: 0, dz: 0 }; p.vx = p.vz = 0; p.working = false; }
  ctx.broadcast('round:over', { round: s.roundIndex, nextMapId: s.nextMapId, nextMapName: MAPS[s.nextMapId].name });
}

function weightedBuff(ctx) {
  let pick = ctx.random() * BUFF_WEIGHTS.reduce((a, b) => a + b, 0);
  for (let i = 0; i < BUFF_TYPES.length; i++) { pick -= BUFF_WEIGHTS[i]; if (pick <= 0) return BUFF_TYPES[i]; }
  return BUFF_TYPES[0];
}

function spawnGroundBuff(ctx) {
  const s = ctx.state; const L = s.layout; const candidates = [];
  for (let z = 1; z < L.h - 1; z++) for (let x = 1; x < L.w - 1; x++) {
    if (isBlocked(L, x, z)) continue;
    if (L.spawns.some((sp) => Math.hypot(x - sp.x, z - sp.z) < 1.5)) continue;
    if (Object.values(s.players).some((p) => Math.hypot(x + 0.5 - p.x, z + 0.5 - p.z) < 2)) continue;
    const exits = [[1,0],[-1,0],[0,1],[0,-1]].filter(([dx,dz]) => !isBlocked(L, x + dx, z + dz)).length;
    if (exits < 2) continue;
    candidates.push({ x: x + 0.5, z: z + 0.5 });
  }
  if (!candidates.length) { s.nextBuffIn = 10; return; }
  const pos = candidates[Math.floor(ctx.random() * candidates.length)];
  s.groundBuff = { type: weightedBuff(ctx), ...pos, remaining: BUFF_LIFETIME };
  ctx.broadcast('buff:spawn', { type: s.groundBuff.type });
}

function stepBuffs(ctx) {
  const s = ctx.state;
  for (const p of Object.values(s.players)) {
    if (p.activeBuff) { p.activeBuff.remaining = Math.max(0, p.activeBuff.remaining - DT); if (!p.activeBuff.remaining) p.activeBuff = null; }
  }
  if (s.fireOverdriveRemaining > 0) s.fireOverdriveRemaining = Math.max(0, s.fireOverdriveRemaining - DT);
  if (s.groundBuff) {
    s.groundBuff.remaining -= DT;
    const picker = Object.values(s.players).find((p) => Math.hypot(p.x - s.groundBuff.x, p.z - s.groundBuff.z) <= 0.55);
    if (picker) {
      const type = s.groundBuff.type;
      picker.activeBuff = { type, remaining: type === 'fire_overdrive' ? FIRE_OVERDRIVE_DURATION : BUFF_DURATION };
      if (type === 'fire_overdrive') s.fireOverdriveRemaining = FIRE_OVERDRIVE_DURATION;
      s.groundBuff = null; s.nextBuffIn = 35 + ctx.random() * 15;
      ctx.broadcast('buff:picked', { type, by: picker.name });
    } else if (s.groundBuff.remaining <= 0) { s.groundBuff = null; s.nextBuffIn = 35 + ctx.random() * 15; }
  } else {
    s.nextBuffIn -= DT;
    if (s.nextBuffIn <= 0) spawnGroundBuff(ctx);
  }
}

function stepMapMechanic(ctx) {
  const s = ctx.state; const mechanic = s.layout.mechanic;
  if (!mechanic) return;
  if (mechanic.type === 'floating_food') {
    if (s.spaceEvent.warning) {
      s.spaceEvent.warning.remaining -= DT;
      const key = s.spaceEvent.warning.key; const dyn = s.stations[key];
      if (!dyn || !dyn.item || dyn.item !== s.spaceEvent.warning.item) s.spaceEvent.warning = null;
      else if (s.spaceEvent.warning.remaining <= 0) {
        const empty = Object.keys(s.layout.stationAt).filter((k) => s.layout.stationAt[k].type === 'counter' && k !== key && s.stations[k] && !s.stations[k].item);
        if (empty.length) { const dest = empty[Math.floor(ctx.random() * empty.length)]; s.stations[dest].item = dyn.item; dyn.item = null; ctx.broadcast('space:teleport', {}); }
        s.spaceEvent.warning = null;
      }
    } else {
      s.spaceEvent.nextIn -= DT;
      if (s.spaceEvent.nextIn <= 0) {
        const eligible = Object.keys(s.layout.stationAt).filter((k) => s.layout.stationAt[k].type === 'counter' && s.stations[k]?.item && ['raw','chopped'].includes(s.stations[k].item.k));
        if (eligible.length) { const key = eligible[Math.floor(ctx.random() * eligible.length)]; s.spaceEvent.warning = { key, remaining: mechanic.warning, item: s.stations[key].item }; ctx.broadcast('space:warning', { key }); }
        s.spaceEvent.nextIn = mechanic.interval;
      }
    }
  } else if (mechanic.type === 'gate') {
    const gate = s.gate; gate.remaining -= DT;
    gate.warning = gate.remaining <= mechanic.warning;
    if (gate.remaining <= 0) {
      const closing = mechanic.gates.find((entry) => entry.id === gate.active);
      const occupied = Object.values(s.players).some((p) => Math.hypot(p.x - (closing.x + 0.5), p.z - (closing.z + 0.5)) < 0.9);
      if (occupied) gate.remaining = 0.5;
      else {
        const opening = mechanic.gates.find((entry) => entry.id !== gate.active);
        s.layout.dynamicBlocked[closing.x + ',' + closing.z] = true;
        delete s.layout.dynamicBlocked[opening.x + ',' + opening.z];
        gate.active = opening.id; gate.remaining = mechanic.switchTime; gate.warning = false;
        ctx.broadcast('gate:switch', { open: opening.id, closed: closing.id });
      }
    }
  }
}

function stepGame(ctx) {
  const s = ctx.state;
  const L = s.layout;
  const playerIds = Object.keys(s.players);
  stepBuffs(ctx);
  stepMapMechanic(ctx);

  // --- 玩家：工作（切菜/洗碗）与移动 ---
  for (const id of playerIds) {
    const p = s.players[id];
    if (p.working) {
      const st = targetStation(L, p);
      let didWork = false;
      if (st && st.type === 'board') {
        const dyn = s.stations[st.x + ',' + st.z];
        if (dyn && dyn.item && dyn.item.k === 'raw' && INGREDIENTS[dyn.item.g]?.choppable) {
          const rate = p.activeBuff && p.activeBuff.type === 'fast_hands' ? 1.5 : 1;
          dyn.item.progress = (dyn.item.progress || 0) + DT * rate;
          if (dyn.item.progress >= CHOP_TIME) {
            dyn.item = { ...dyn.item, k: 'chopped', progress: 0 };
            addCredit(dyn.item, id, 1, false);
            bumpStat(p, 'chops');
          }
          didWork = true;
        }
      } else if (st && st.type === 'sink') {
        if (!p.carrying && s.plates.dirty > 0) {
          const rate = p.activeBuff && p.activeBuff.type === 'fast_hands' ? 1.5 : 1;
          s.plates.washT += DT * rate;
          if (s.plates.washT >= WASH_TIME) {
            s.plates.washT = 0;
            s.plates.dirty -= 1;
            s.plates.clean += 1;
            s.plates.cleanCredits.push([credit(id, 2, true)]);
            bumpStat(p, 'washes');
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
      const heat = s.fireOverdriveRemaining > 0 ? 2 : 1;
      pot.t += DT * heat * (pot.masterChef ? 1.4 : 1);
      if (pot.t >= COOK_TIME) {
        pot.phase = 'ready';
        pot.t = 0;
        const st = L.stationAt[k];
        ctx.broadcast('pot:ready', { x: st.x, z: st.z });
      }
    } else if (pot.phase === 'ready') {
      pot.t += DT * (s.fireOverdriveRemaining > 0 ? 2 : 1);
      if (pot.t >= BURN_TIME) {
        pot.phase = 'burnt';
        pot.t = 0;
        pot.masterChef = false;
        s.burns = (s.burns || 0) + 1;
        s.roundBurns = (s.roundBurns || 0) + 1;
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
    const pressure = Math.max(0.4, 1 - 0.15 * Math.max(0, s.difficultyLevel - 1));
    s.nextOrderIn = Math.max(8, (ORDER_MIN_GAP + ctx.random() * ORDER_VAR_GAP) * pressure);
  }
  for (let i = s.orders.length - 1; i >= 0; i--) {
    const o = s.orders[i];
    o.t -= DT;
    if (o.t <= 0) {
      s.orders.splice(i, 1);
      s.expired += 1;
      s.roundExpired += 1;
      s.score = Math.max(0, s.score - EXPIRE_PENALTY);
      s.sessionScore = Math.max(0, s.sessionScore - EXPIRE_PENALTY);
      s.roundScore = Math.max(0, s.roundScore - EXPIRE_PENALTY);
      if (s.mode === 'endless') s.rage = Math.min(RAGE_MAX, s.rage + RAGE_EXPIRED);
      ctx.broadcast('order:expired', { name: o.name });
      if (s.mode === 'endless' && s.rage >= RAGE_MAX) { finishSession(ctx); return; }
    }
  }

  // --- 终局 ---
  s.timeLeft -= DT;
  if (s.timeLeft <= 0) {
    s.timeLeft = 0;
    finishRound(ctx);
  }
}

function credit(playerId, points, publicEvent) { return { playerId, points, publicEvent: !!publicEvent }; }
function addCredit(item, playerId, points, publicEvent) {
  if (!item.credits) item.credits = [];
  item.credits.push(credit(playerId, points, publicEvent));
}
function mergeCredits(...items) {
  const out = [];
  for (const item of items) if (item && item.credits) out.push(...item.credits);
  return out;
}
function awardCredits(s, credits) {
  for (const c of credits || []) {
    const p = s.players[c.playerId];
    if (!p) continue;
    p.contributionScore += c.points; p.roundContributionScore += c.points;
    if (c.publicEvent) { p.publicEvents += 1; p.roundPublicEvents += 1; }
    syncPlayerRecord(s, c.playerId);
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
    if (!c) p.carrying = { k: 'raw', g: st.crate, progress: 0, credits: [credit(playerIdFor(s, p), 1, false)] };
    return;
  }

  if (st.type === 'counter' || st.type === 'board') {
    if (!c && dyn && dyn.item) {
      p.carrying = dyn.item;
      dyn.item = null;
      if (p.carrying.k === 'raw') p.carrying.progress = 0;
    } else if (c && dyn && !dyn.item) {
      if (st.type === 'board' && (!(c.k === 'raw' || c.k === 'chopped') || (c.k === 'raw' && !INGREDIENTS[c.g]?.choppable))) return;
      if (c.k === 'raw') c.progress = 0;
      dyn.item = c;
      p.carrying = null;
    } else if (c && dyn && dyn.item) {
      // 把符合配方的完整/切碎食材叠到盘子上（组装沙拉等）
      const on = dyn.item;
      if ((c.k === 'raw' || c.k === 'chopped') && validItemPrep(c) && (on.k === 'plate' || on.k === 'dish') && on.items.length < 3) {
        on.items.push(itemRequirement(c));
        on.k = 'dish';
        on.credits = mergeCredits(on, c);
        addCredit(on, playerIdFor(s, p), 2, true);
        bumpStat(p, 'assembles');
        p.carrying = null;
      }
    }
    return;
  }

  if (st.type === 'stove') {
    const pot = dyn;
    if (!pot) return;
    if (c && (c.k === 'raw' || c.k === 'chopped') && validItemPrep(c) && (pot.phase === 'idle' || pot.phase === 'cooking') && pot.contents.length < 3) {
      if (!COOKABLE.has(c.g)) return; // 生菜/黄瓜等不能下锅（客户端气泡会提示）
      pot.contents.push(itemRequirement(c));
      pot.credits.push(...mergeCredits(c));
      if (p.activeBuff && p.activeBuff.type === 'master_chef') pot.masterChef = true;
      addCredit(pot, playerIdFor(s, p), 2, true);
      bumpStat(p, 'potAdds');
      p.carrying = null;
      const r = RECIPE_BY_KEY[recipeKey(pot.contents)];
      if (r && r.cook) {
        pot.phase = 'cooking';
        pot.t = 0;
      } else if (pot.contents.length >= 3) {
        pot.phase = 'burnt';
        pot.t = 0;
        pot.masterChef = false;
        s.burns = (s.burns || 0) + 1;
        s.roundBurns = (s.roundBurns || 0) + 1;
        ctx.broadcast('pot:burnt', { x: st.x, z: st.z });
      }
    } else if (c && c.k === 'plate' && c.items.length === 0 && pot.phase === 'ready') {
      p.carrying = { k: 'dish', items: pot.contents.map((item) => ({ ...item })), credits: mergeCredits(pot) };
      addCredit(p.carrying, playerIdFor(s, p), 2, true);
      bumpStat(p, 'potPickups');
      pot.contents = [];
      pot.credits = [];
      pot.masterChef = false;
      pot.phase = 'idle';
      pot.t = 0;
    } else if (!c && pot.contents.length > 0 && (pot.phase === 'idle' || pot.phase === 'burnt')) {
      // 空手清空锅里内容（倒掉）
      if (pot.phase === 'burnt') bumpStat(p, 'burnClears');
      pot.contents = [];
      pot.credits = [];
      pot.masterChef = false;
      pot.phase = 'idle';
      pot.t = 0;
    }
    return;
  }

  if (st.type === 'plates') {
    if (!c && s.plates.clean > 0) {
      s.plates.clean -= 1;
      p.carrying = { k: 'plate', items: [], credits: s.plates.cleanCredits.shift() || [] };
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
        s.sessionScore += gained; s.roundScore += gained;
        s.served += 1;
        s.roundServed += 1;
        addCredit(c, playerIdFor(s, p), 2, true);
        awardCredits(s, c.credits);
        p.servedCount += 1; p.roundServed += 1; syncPlayerRecord(s, playerIdFor(s, p));
        bumpStat(p, 'deliveries');
        if (o.t / o.total >= 0.7) bumpStat(p, 'fastServes');
        if (o.t <= 10) bumpStat(p, 'clutchServes');
        syncPlayerRecord(s, playerIdFor(s, p));
        if (s.mode === 'endless') s.rage = Math.max(0, s.rage - RAGE_SERVED);
        s.plates.due.push(DIRTY_DELAY);
        p.carrying = null;
        ctx.broadcast('order:served', { name: o.name, points: o.points, tip, by: p.name });
      }
    }
    return;
  }

  if (st.type === 'trash') {
    if (c) { bumpStat(p, 'discards'); p.carrying = null; }
    return;
  }
  // sink：洗碗走 work 长按，不在此处理
}

function playerIdFor(s, player) {
  for (const id in s.players) if (s.players[id] === player) return id;
  return '';
}

// ---------------------------------------------------------------------------
// 房间定义
// ---------------------------------------------------------------------------
export default defineRoom({
  meta: { name: '新手上厨', minPlayers: 2, maxPlayers: 4 },

  initialState() {
    return {
      phase: 'lobby',        // lobby | countdown | playing | roundResult | awards
      mode: 'party',
      roundIndex: 0,
      difficultyLevel: 1,
      mapQueue: [],
      nextMapId: null,
      roundResultTime: 0,
      gameSeq: 0,            // 每开一局 +1，客户端据此重建场景
      mapId: 'classic',
      hostId: null,
      countdown: 0,
      timeLeft: 0,
      score: 0,
      sessionScore: 0,
      roundScore: 0,
      served: 0,
      roundServed: 0,
      expired: 0,
      roundExpired: 0,
      burns: 0,
      roundBurns: 0,
      roundHistory: [],
      roundComment: null,
      finalComment: null,
      roundTitles: {},
      finalTitles: {},
      rage: 0,
      rageMax: RAGE_MAX,
      standings: [],
      playerRecords: {},
      joinSeq: 0,
      players: {},
      layout: null,
      stations: {},
      orders: [],
      nextOrderIn: 0,
      plates: { clean: 0, dirty: 0, washT: 0, due: [], cleanCredits: [] },
      orderSeq: 0,
      groundBuff: null,
      nextBuffIn: 25,
      fireOverdriveRemaining: 0,
      spaceEvent: { nextIn: 0, warning: null },
      gate: null,
    };
  },

  onCreate(ctx) {
    ctx.state.hostId = ctx.host ? ctx.host.id : null;
  },

  onRestore(ctx) {
    // 房主刷新后从快照恢复：若对局仍在进行，重新挂上 tick 定时器
    if (ctx.host) ctx.state.hostId = ctx.host.id;
    const s = ctx.state;
    if (!Array.isArray(s.roundHistory)) s.roundHistory = [];
    if (!s.roundTitles) s.roundTitles = {};
    if (!s.finalTitles) s.finalTitles = {};
    if (!Number.isFinite(s.burns)) s.burns = 0;
    if (!Number.isFinite(s.roundBurns)) s.roundBurns = 0;
    if (!Number.isFinite(s.nextBuffIn)) s.nextBuffIn = 25;
    if (!Number.isFinite(s.fireOverdriveRemaining)) s.fireOverdriveRemaining = 0;
    if (!s.spaceEvent) s.spaceEvent = { nextIn: 0, warning: null };
    if (s.layout) {
      if (!s.layout.dynamicBlocked) s.layout.dynamicBlocked = {};
      const map = MAPS[s.mapId];
      if (!s.layout.movementProfile) s.layout.movementProfile = map?.movementProfile || null;
      if (!s.layout.mechanic) s.layout.mechanic = map?.mechanic || null;
      if (s.layout.mechanic?.type === 'gate') {
        if (!s.gate || !['top', 'bottom'].includes(s.gate.active)) s.gate = { active: 'top', remaining: s.layout.mechanic.switchTime, warning: false };
        for (const entry of s.layout.mechanic.gates) {
          if (entry.id === s.gate.active) delete s.layout.dynamicBlocked[entry.x + ',' + entry.z];
          else s.layout.dynamicBlocked[entry.x + ',' + entry.z] = true;
        }
      }
    }
    for (const pot of Object.values(s.stations || {})) if (pot.contents && typeof pot.masterChef !== 'boolean') pot.masterChef = false;
    for (const id in ctx.state.players || {}) {
      const p = ctx.state.players[id];
      if (!Number.isFinite(p.vx)) p.vx = 0;
      if (!Number.isFinite(p.vz)) p.vz = 0;
      if (!Number.isSafeInteger(p.moveSeq)) p.moveSeq = 0;
      if (!p.activeBuff || !BUFF_TYPES.includes(p.activeBuff.type) || !Number.isFinite(p.activeBuff.remaining)) p.activeBuff = null;
      p.stats = normalizeStats(p.stats || ctx.state.playerRecords?.[id]?.stats);
      p.roundStats = normalizeStats(p.roundStats);
    }
    if (ctx.state.phase === 'playing' || ctx.state.phase === 'countdown' || ctx.state.phase === 'roundResult' || ctx.state.phase === 'awards') {
      armTick(ctx);
    }
  },

  onJoin(ctx, player) {
    const s = ctx.state;
    if (ctx.host && player.id === ctx.host.id) s.hostId = ctx.host.id;
    const count = Object.keys(s.players).length;
    s.joinSeq = (s.joinSeq || 0) + 1;
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
      activeBuff: null,
      contributionScore: s.playerRecords[player.id]?.contributionScore || 0,
      roundContributionScore: 0,
      servedCount: s.playerRecords[player.id]?.servedCount || 0,
      publicEvents: s.playerRecords[player.id]?.publicEvents || 0,
      roundServed: 0,
      roundPublicEvents: 0,
      stats: normalizeStats(s.playerRecords[player.id]?.stats),
      roundStats: emptyStats(),
      joinOrder: s.playerRecords[player.id]?.joinOrder || s.joinSeq,
    };
    s.players[player.id] = p;
    syncPlayerRecord(s, player.id);
    if ((s.phase === 'playing' || s.phase === 'countdown' || s.phase === 'awards') && s.layout) {
      const sp = s.layout.spawns[count % s.layout.spawns.length];
      p.x = sp.x + 0.5;
      p.z = sp.z + 0.5;
    }
    ctx.broadcast('player:joined', { name: p.name });
  },

  onLeave(ctx, player) {
    const s = ctx.state;
    syncPlayerRecord(s, player.id);
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
    // 旧版客户兼容；新 manifest 不再公开此动作。
    selectMap(ctx, { player, payload }) {
      const s = ctx.state;
      if (s.phase !== 'lobby' || player.id !== ctx.host.id || !payload || !MAPS[payload.mapId]) return;
      s.mapId = payload.mapId; s.legacySingle = true;
    },

    selectMode(ctx, { player, payload }) {
      const s = ctx.state;
      if (s.phase !== 'lobby' || player.id !== ctx.host.id) return;
      if (payload && (payload.mode === 'party' || payload.mode === 'endless')) { s.mode = payload.mode; s.legacySingle = false; }
    },

    // 大厅：开始游戏（仅房主，>=2 人）
    start(ctx, { player }) {
      const s = ctx.state;
      if (s.phase !== 'lobby') return;
      if (player.id !== ctx.host.id) return;
      if (Object.keys(s.players).length < 2) return;
      setupSession(ctx);
    },

    // 结算：同图再来一局（仅房主）
    rematch(ctx, { player }) {
      const s = ctx.state;
      if (s.phase !== 'awards') return;
      if (player.id !== ctx.host.id) return;
      if (Object.keys(s.players).length < 2) return;
      setupSession(ctx);
    },

    // 结算：返回大厅（仅房主）
    toLobby(ctx, { player }) {
      const s = ctx.state;
      if (s.phase !== 'awards') return;
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
      if (s.phase !== 'playing' && s.phase !== 'awards') return;
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
