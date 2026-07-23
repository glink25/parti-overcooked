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
const ORDER_LIFE = 95;               // 订单存活秒数
const ORDER_MIN_GAP = 25;            // 订单间隔下限
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
const THROW_THRESHOLD = 0.3;
const THROW_FULL_TIME = 1.2;
const THROW_MIN_RANGE = 1.5;
const THROW_MAX_RANGE = 5.5;
const THROW_TIMEOUT = 3;
const WORLD_ITEM_LIFETIME = 20;
const WORLD_ITEM_LIMIT = 48;
const FALL_TIME = 0.8;
const RESPAWN_GRACE = 0.6;
const INTERACT_COOLDOWN = 0.12;

const PLAYER_COLORS = ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71'];
const STAT_KEYS = ['chops', 'washes', 'assembles', 'potAdds', 'potPickups', 'deliveries', 'fastServes', 'clutchServes', 'burnClears', 'discards', 'throws', 'catches', 'groundPickups', 'falls', 'conveyorTransfers'];

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
  throws: [['🎯','隔空传菜王'],['🏹','厨房神投手'],['🛫','飞菜航线员']],
  catches: [['🙌','神接球'],['🧤','稳稳接住'],['🤹','空中接菜师']],
  conveyorTransfers: [['⚙️','物流总管'],['📦','传送带专家'],['🚚','厨房调度员']],
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
// 全新地图定义：运行时只暴露 bounds / terrain / platforms / stations /
// mechanisms / checkpoints / spawns，不保留旧网格协议。
// ---------------------------------------------------------------------------
function terrain(w, h, floor, ice = () => false, empty = '~') {
  const rows = [];
  for (let z = 0; z < h; z++) {
    let row = '';
    for (let x = 0; x < w; x++) row += floor(x, z) ? (ice(x, z) ? 'i' : '.') : empty;
    rows.push(row);
  }
  return rows;
}
function terrainWithWalls(w, h, kindAt, { empty = ' ', openings = [] } = {}) {
  const openingSet = new Set(openings.map((entry) => `${entry.x},${entry.z}`));
  const cells = Array.from({ length:h }, (_, z) => Array.from({ length:w }, (_, x) => kindAt(x,z) || empty));
  const safe = (cell) => cell === '.' || cell === 'i';
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
    if (cells[z][x] !== empty || openingSet.has(`${x},${z}`)) continue;
    const bordersFloor = [[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dz]) => safe(cells[z+dz]?.[x+dx]));
    if (bordersFloor) cells[z][x] = '#';
  }
  return cells.map((row) => row.join(''));
}
function st(id, type, x, z, extra = {}) { return { id, type, x, z, ...extra }; }
function crate(id, ingredient, x, z, extra = {}) { return st(id, 'crate', x, z, { crate: ingredient, ...extra }); }
function conveyorPort(id, x, z, conveyorId, portMode, pathPoint, extra = {}) {
  return st(id, 'conveyorPort', x, z, { conveyorId, portMode, pathPoint, ...extra });
}
function rectTiles(w, h, kind = '.') {
  const out = [];
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) out.push({ x, z, kind });
  return out;
}
function path(points, speed = 1, extra = {}) { return { points, speed, ...extra }; }

const MAPS = {
  classic: {
    id: 'classic', name: '经典厨房', desc: '围墙花园厨房以双环动线和短传送带教授分工。', bounds: { w: 18, h: 13 }, plateCount: 4,
    recipePool: ['tomato_soup','onion_soup','carrot_soup','garden_salad','crisp_salad'],
    terrain: terrainWithWalls(18,13,(x,z)=>x>=1&&x<=16&&z>=1&&z<=11?'.':' '),
    platforms: [],
    stations: [crate('tomato','tomato',1,2),crate('onion','onion',4,1),crate('carrot','carrot',8,1),crate('lettuce','lettuce',12,1),crate('cucumber','cucumber',16,2),
      st('board_a','board',3,4),st('board_b','board',3,8),st('counter_a','counter',6,4),st('counter_b','counter',9,4),st('counter_c','counter',6,8),st('counter_d','counter',9,8),
      conveyorPort('prep_in',5,6,'prep_belt','input',{x:5.5,z:6.5}),conveyorPort('prep_out',12,6,'prep_belt','output',{x:12.5,z:6.5}),
      st('stove_a','stove',7,10),st('stove_b','stove',10,10),st('plates','plates',15,9),st('sink','sink',1,9),st('trash','trash',13,10),st('window','window',16,6)],
    mechanisms: [{ id:'prep_belt', type:'conveyor', config:{ path:path([{x:5.5,z:6.5},{x:12.5,z:6.5}],1) } }],
    checkpoints: [{id:'garden',x:8.5,z:5.5}], spawns: [{slot:1,x:4.5,z:6.5},{slot:2,x:14.5,z:6.5},{slot:3,x:5.5,z:9.5},{slot:4,x:12.5,z:9.5}], camera:{minPixelsPerTile:44},
  },
  split: {
    id:'split', name:'一线天', desc:'两座浮岛周期合并；分离时投掷交接，合并时安全换区。', bounds:{w:22,h:14}, plateCount:4,
    recipePool:['mushroom_soup','potato_soup','garden_salad','garden_stew','crisp_salad'],
    terrain: terrain(22,14,()=>false),
    platforms:[
      {id:'west',origin:{x:2,z:2},tiles:rectTiles(6,9)},
      {id:'east',origin:{x:12,z:2},tiles:rectTiles(6,9)},
    ],
    stations:[crate('tomato','tomato',0,1,{supportId:'west'}),crate('onion','onion',0,3,{supportId:'west'}),crate('lettuce','lettuce',0,5,{supportId:'west'}),crate('carrot','carrot',0,7,{supportId:'west'}),crate('mushroom','mushroom',2,0,{supportId:'west'}),crate('potato','potato',4,0,{supportId:'west'}),
      st('board_w','board',2,2,{supportId:'west'}),st('board_w2','board',4,2,{supportId:'west'}),st('sink','sink',2,8,{supportId:'west'}),st('trash','trash',0,8,{supportId:'west'}),st('counter_w','counter',5,4,{supportId:'west'}),
      st('stove_a','stove',2,5,{supportId:'east'}),st('stove_b','stove',4,5,{supportId:'east'}),st('plates','plates',4,8,{supportId:'east'}),st('window','window',5,4,{supportId:'east'}),st('counter_e','counter',0,4,{supportId:'east'}),st('counter_e2','counter',2,8,{supportId:'east'}),st('counter_e3','counter',5,7,{supportId:'east'})],
    mechanisms:[{id:'islands',type:'movingPlatform',config:{mode:'dock',platformIds:['west','east'],cycle:24,separatedHold:8,mergeDuration:4,mergedHold:8,separateDuration:4,offsets:{west:{x:2,z:0},east:{x:-2,z:0}}}},{id:'river',type:'waterHazard',config:{}}],
    checkpoints:[{id:'west_safe',x:3.5,z:4.5,supportId:'west'},{id:'east_safe',x:3.5,z:4.5,supportId:'east'}],
    spawns:[{slot:1,x:3.5,z:4.5,supportId:'west'},{slot:2,x:3.5,z:4.5,supportId:'east'},{slot:3,x:4.5,z:7.5,supportId:'west'},{slot:4,x:1.5,z:7.5,supportId:'east'}],camera:{minPixelsPerTile:44},
  },
  ring: {
    id:'ring',name:'环岛餐吧',desc:'外环切配、中央出餐，东西双短线将食材送入可行走中央岛。',bounds:{w:21,h:17},plateCount:5,
    recipePool:['tomato_soup','onion_soup','carrot_soup','potato_soup','mushroom_soup','garden_stew','garden_salad','crisp_salad','deluxe_salad','rainbow_salad'],
    terrain:terrainWithWalls(21,17,(x,z)=>{const dx=(x-10)/9,dz=(z-8)/7;const outer=dx*dx+dz*dz<=1&&z<=14;const inner=(x-10)*(x-10)/25+(z-8)*(z-8)/16<=1;const center=x>=8&&x<=12&&z>=6&&z<=10;return outer&&(!inner||center)?'.':'~';},{empty:'~',openings:[{x:9,z:4},{x:10,z:4},{x:9,z:5},{x:10,z:5},{x:11,z:11},{x:12,z:11},{x:11,z:12},{x:12,z:12},{x:5,z:7},{x:6,z:7},{x:7,z:7},{x:5,z:8},{x:6,z:8},{x:7,z:8},{x:13,z:8},{x:14,z:8},{x:15,z:8},{x:13,z:9},{x:14,z:9},{x:15,z:9}]}),platforms:[],
    stations:[crate('tomato','tomato',2,6),crate('onion','onion',4,3),crate('mushroom','mushroom',8,2),crate('lettuce','lettuce',15,3),crate('cucumber','cucumber',18,6),crate('carrot','carrot',17,11),crate('potato','potato',10,14),
      st('board_n','board',6,3),st('board_s','board',15,13),st('sink','sink',6,13),st('counter_outer_n','counter',7,3),st('counter_outer_s','counter',14,13),
      conveyorPort('ring_in_w',4,8,'ring_belt_w','input',{x:5.5,z:8.5}),conveyorPort('ring_out_w',8,8,'ring_belt_w','output',{x:8.5,z:8.5}),
      conveyorPort('ring_in_e',16,8,'ring_belt_e','input',{x:15.5,z:8.5}),conveyorPort('ring_out_e',12,8,'ring_belt_e','output',{x:12.5,z:8.5}),
      st('stove_a','stove',9,7),st('trash','trash',10,7),st('stove_b','stove',11,7),st('counter_center_n','counter',8,6),st('plates','plates',9,9),st('stove_c','stove',10,9),st('window','window',11,9),st('counter_center_s','counter',12,10)],
    mechanisms:[{id:'ring_belt_w',type:'conveyor',config:{path:path([{x:5.5,z:8.5},{x:8.5,z:8.5}],1)}},{id:'ring_belt_e',type:'conveyor',config:{path:path([{x:15.5,z:8.5},{x:12.5,z:8.5}],1)}}],
    hazardMarkers:[{x:6.5,z:8.5},{x:14.5,z:8.5}],
    checkpoints:[{id:'outer',x:4.5,z:9.5},{id:'center',x:10.5,z:8.5}],spawns:[{slot:1,x:4.5,z:9.5},{slot:2,x:9.5,z:8.5},{slot:3,x:16.5,z:9.5},{slot:4,x:11.5,z:8.5}],camera:{minPixelsPerTile:44},
  },
  snow: {
    id:'snow',name:'雪山餐车',desc:'三座有护墙的餐车以冰桥、石道和缆车跨越裂谷。',bounds:{w:23,h:14},plateCount:5,
    recipePool:['potato_soup','mushroom_soup','cheese_potato_soup','mushroom_meat_soup','cheese_salad'],
    terrain:terrainWithWalls(23,14,(x,z)=>{const west=x>=1&&x<=6&&z>=2&&z<=8,east=x>=16&&x<=21&&z>=2&&z<=8,center=x>=8&&x<=14&&z>=4&&z<=12,iceBridge=(x===7||x===15)&&(z===4||z===5),stoneBridge=(x===7||x===15)&&(z===7||z===8);return west||east||center||iceBridge||stoneBridge?(iceBridge?'i':'.'):'~';},{empty:'~',openings:[{x:7,z:6},{x:15,z:6}]}),
    platforms:[],
    stations:[crate('potato','potato',1,3),crate('mushroom','mushroom',3,2),crate('cheese','cheese',5,2),crate('meat','meat',21,3),crate('onion','onion',19,2),crate('lettuce','lettuce',17,2),crate('tomato','tomato',21,6),
      st('board_a','board',3,7),st('board_b','board',19,7),st('stove_a','stove',9,10),st('stove_b','stove',12,10),st('plates','plates',14,8),st('sink','sink',8,11),st('trash','trash',10,4),st('window','window',12,12),st('counter_w1','counter',5,7),st('counter_w2','counter',5,8),st('counter_e1','counter',17,7),st('counter_center','counter',13,7),
      conveyorPort('lift_in',5,5,'ski_lift','input',{x:5.5,z:5.5}),conveyorPort('lift_out',14,5,'ski_lift','output',{x:14.5,z:5.5})],
    mechanisms:[{id:'ice',type:'iceSurface',config:{stopTime:0.65,turnTime:0.25}},{id:'ski_lift',type:'conveyor',config:{path:path([{x:5.5,z:5.5},{x:14.5,z:5.5}],1)}},{id:'ravine',type:'waterHazard',config:{}}],
    hazards:[
      {id:'west_crevasse',type:'iceCrevasse',cells:[{x:7,z:6}],guardEdges:['north','south']},
      {id:'east_crevasse',type:'iceCrevasse',cells:[{x:15,z:6}],guardEdges:['north','south']},
    ],
    checkpoints:[{id:'lower',x:11.5,z:8.5},{id:'west',x:4.5,z:6.5},{id:'east',x:17.5,z:5.5}],spawns:[{slot:1,x:4.5,z:6.5},{slot:2,x:17.5,z:5.5},{slot:3,x:9.5,z:8.5},{slot:4,x:13.5,z:8.5}],camera:{minPixelsPerTile:44},
  },
  space: {
    id:'space',name:'太空厨房',desc:'三座封闭舱室以货运气闸和底部勤务道协作。',bounds:{w:24,h:16},plateCount:5,
    recipePool:['mushroom_risotto','meat_sauce_soup','power_salad','deluxe_salad','party_platter'],
    terrain:terrainWithWalls(24,16,(x,z)=>(x>=1&&x<=6&&z>=3&&z<=11)||(x>=17&&x<=22&&z>=3&&z<=11)||(x>=9&&x<=14&&z>=5&&z<=10)||(x>=6&&x<=17&&z>=11&&z<=12)?'.':' '),
    platforms:[],
    stations:[crate('rice','rice',1,4),crate('onion','onion',1,6),crate('tomato','tomato',1,8),crate('cucumber','cucumber',1,10),st('board_w','board',4,4),st('sink','sink',4,10),conveyorPort('airlock_w',6,7,'airlock_w_belt','input',{x:6.5,z:7.5}),
      crate('mushroom','mushroom',22,4),crate('meat','meat',22,6),crate('lettuce','lettuce',22,8),crate('cheese','cheese',22,10),st('board_e','board',19,4),st('plates','plates',19,10),conveyorPort('airlock_e',17,7,'airlock_e_belt','input',{x:17.5,z:7.5}),
      st('stove_a','stove',10,6),st('stove_b','stove',13,6),st('stove_c','stove',11,9),st('trash','trash',13,9),st('window','window',11,5),st('counter_core_a','counter',9,9),st('counter_core_b','counter',14,9),st('counter_w','counter',5,9),st('counter_e','counter',18,9),conveyorPort('counter_core_w',9,8,'airlock_w_belt','output',{x:9.5,z:8.5}),conveyorPort('counter_core_e',14,8,'airlock_e_belt','output',{x:14.5,z:8.5})],
    mechanisms:[{id:'airlock_w_belt',type:'conveyor',config:{path:path([{x:6.5,z:7.5},{x:9.5,z:7.5},{x:9.5,z:8.5}],1)}},{id:'airlock_e_belt',type:'conveyor',config:{path:path([{x:17.5,z:7.5},{x:14.5,z:7.5},{x:14.5,z:8.5}],1)}},{id:'void',type:'waterHazard',config:{}}],
    checkpoints:[{id:'core',x:11.5,z:8.5},{id:'outer_link',x:11.5,z:12.5},{id:'west',x:4,z:7},{id:'east',x:20,z:7}],spawns:[{slot:1,x:4,z:7},{slot:2,x:11.5,z:8.5},{slot:3,x:20,z:7},{slot:4,x:5.5,z:10.5}],camera:{minPixelsPerTile:44},
  },
  castle: {
    id:'castle',name:'城堡宴会厅',desc:'四翼宴会厅以随机门阵改变中央捷径，外围勤务道始终开放。',bounds:{w:23,h:17},plateCount:5,
    recipePool:['garden_stew','deluxe_salad','meat_sauce_soup','cheese_potato_soup','golden_risotto','cheese_salad','party_platter'],
    terrain:terrainWithWalls(23,17,(x,z)=>{const hall=x>=9&&x<=13&&z>=6&&z<=10,north=x>=9&&x<=13&&z>=1&&z<=4,south=x>=9&&x<=13&&z>=12&&z<=15,west=x>=1&&x<=7&&z>=6&&z<=10,east=x>=15&&x<=21&&z>=6&&z<=10,necks=(z===5&&x>=10&&x<=12)||(z===11&&x>=10&&x<=12)||(x===8&&z>=7&&z<=9)||(x===14&&z>=7&&z<=9),ring=(x>=4&&x<=18&&(z===3||z===4||z===12||z===13))||((x===4||x===5||x===17||x===18)&&z>=3&&z<=13);return hall||north||south||west||east||necks||ring?'.':' ';}),platforms:[],
    stations:[crate('tomato','tomato',1,7),crate('onion','onion',1,9),crate('cheese','cheese',3,6),crate('rice','rice',9,2),crate('mushroom','mushroom',13,2),crate('meat','meat',19,6),crate('lettuce','lettuce',21,7),crate('cucumber','cucumber',21,9),crate('carrot','carrot',9,12),crate('potato','potato',13,12),
      st('board_w','board',6,8),st('board_e','board',16,8),st('stove_a','stove',10,7),st('stove_b','stove',12,7),st('stove_c','stove',11,9),st('plates','plates',10,15),st('sink','sink',12,15),st('trash','trash',12,13),st('window','window',11,1),st('counter_w','counter',9,9),st('counter_e','counter',13,9),st('counter_n','counter',10,3),st('counter_s','counter',10,13)],
    mechanisms:[{id:'royal_gates',type:'gate',config:{groups:[
      {id:'north',label:'北门',orientation:'x',cells:[{x:10,z:5},{x:11,z:5},{x:12,z:5}]},
      {id:'east',label:'东门',orientation:'z',cells:[{x:14,z:7},{x:14,z:8},{x:14,z:9}]},
      {id:'south',label:'南门',orientation:'x',cells:[{x:10,z:11},{x:11,z:11},{x:12,z:11}]},
      {id:'west',label:'西门',orientation:'z',cells:[{x:8,z:7},{x:8,z:8},{x:8,z:9}]},
    ],presets:[
      {id:'north_south',label:'南北通路',open:['north','south']},{id:'east_west',label:'东西通路',open:['east','west']},
      {id:'north_east',label:'北东通路',open:['north','east']},{id:'south_west',label:'南西通路',open:['south','west']},
    ],switchEvery:16,warning:4}}],
    checkpoints:[{id:'hall',x:11.5,z:8.5},{id:'north_safe',x:11.5,z:3.5},{id:'south_safe',x:11.5,z:13.5},{id:'west_safe',x:5.5,z:8.5},{id:'east_safe',x:17.5,z:8.5}],spawns:[{slot:1,x:5.5,z:8.5},{slot:2,x:17.5,z:8.5},{slot:3,x:11.5,z:13.5},{slot:4,x:11.5,z:3.5}],camera:{minPixelsPerTile:44},
  },
};

function cloneLayout(map) {
  return {
    mapId: map.id, name: map.name, bounds: map.bounds, terrain: map.terrain,
    platforms: map.platforms.map((p) => ({ ...p, origin:{...p.origin}, tiles:p.tiles.map((t)=>({...t})), motion:p.motion&&{...p.motion,axis:{...p.motion.axis}} })),
    stations: map.stations.map((entry)=>({...entry})), mechanisms: map.mechanisms.map((m)=>({id:m.id,type:m.type,config:JSON.parse(JSON.stringify(m.config))})),
    checkpoints: map.checkpoints.map((c)=>({...c})), spawns: map.spawns.map((spawn)=>({...spawn})),
    hazardMarkers:(map.hazardMarkers||[]).map((entry)=>({...entry})), hazards:(map.hazards||[]).map((entry)=>({...entry,cells:entry.cells.map((cell)=>({...cell})),guardEdges:[...(entry.guardEdges||[])]})), camera:{...map.camera},
  };
}

for (const map of Object.values(MAPS)) {
  if (map.terrain.length !== map.bounds.h || map.terrain.some((row)=>row.length !== map.bounds.w)) throw new Error(`Invalid terrain: ${map.id}`);
  if (map.spawns.length !== 4 || new Set(map.spawns.map((spawn)=>spawn.slot)).size !== 4) throw new Error(`Invalid spawns: ${map.id}`);
  const ids = [...map.stations,...map.platforms,...map.mechanisms].map((entry)=>entry.id);
  if (new Set(ids).size !== ids.length) throw new Error(`Duplicate map id: ${map.id}`);
  for (const mechanism of map.mechanisms.filter((entry)=>entry.type==='conveyor')) {
    const points=mechanism.config.path.points;
    if(points.length<2)throw new Error(`Invalid conveyor path: ${map.id}:${mechanism.id}`);
    for(let index=1;index<points.length;index++){
      const dx=points[index].x-points[index-1].x,dz=points[index].z-points[index-1].z;
      if((Math.abs(dx)<1e-9&&Math.abs(dz)<1e-9)||(Math.abs(dx)>1e-9&&Math.abs(dz)>1e-9))throw new Error(`Conveyor segments must be orthogonal: ${map.id}:${mechanism.id}`);
    }
    const ports=map.stations.filter((entry)=>entry.type==='conveyorPort'&&entry.conveyorId===mechanism.id);
    if(!ports.some((entry)=>entry.portMode==='input')||!ports.some((entry)=>entry.portMode==='output'))throw new Error(`Conveyor ports missing: ${map.id}:${mechanism.id}`);
    for(const port of ports){
      if(!['input','output'].includes(port.portMode))throw new Error(`Invalid conveyor port mode: ${map.id}:${port.id}`);
      let nearest=Infinity;for(let index=1;index<points.length;index++){const a=points[index-1],b=points[index],vx=b.x-a.x,vz=b.z-a.z,len2=vx*vx+vz*vz,t=Math.max(0,Math.min(1,((port.pathPoint.x-a.x)*vx+(port.pathPoint.z-a.z)*vz)/len2)),px=a.x+vx*t,pz=a.z+vz*t;nearest=Math.min(nearest,Math.hypot(port.pathPoint.x-px,port.pathPoint.z-pz));}
      if(nearest>1e-6)throw new Error(`Conveyor port is not on path: ${map.id}:${port.id}`);
    }
  }
  for(const port of map.stations.filter((entry)=>entry.type==='conveyorPort'))if(!map.mechanisms.some((entry)=>entry.type==='conveyor'&&entry.id===port.conveyorId))throw new Error(`Unknown conveyor port target: ${map.id}:${port.id}`);
}

// ---------------------------------------------------------------------------
// 碰撞与寻位
// ---------------------------------------------------------------------------
function platformOrigin(L, runtime, supportId) {
  const def = L.platforms.find((entry) => entry.id === supportId);
  const state = runtime?.platforms?.[supportId];
  return def ? { x:def.origin.x + (state?.x || 0), z:def.origin.z + (state?.z || 0) } : { x:0, z:0 };
}
function worldPoint(L, runtime, value) {
  const origin = value.supportId ? platformOrigin(L, runtime, value.supportId) : {x:0,z:0};
  return { x:value.x + origin.x, z:value.z + origin.z };
}
function terrainAt(L, runtime, x, z) {
  for (const platform of L.platforms) {
    const origin = platformOrigin(L, runtime, platform.id);
    for (const tile of platform.tiles) {
      if (x >= origin.x + tile.x && x < origin.x + tile.x + 1 && z >= origin.z + tile.z && z < origin.z + tile.z + 1) return { kind:tile.kind, supportId:platform.id };
    }
  }
  const cx = Math.floor(x), cz = Math.floor(z);
  if (cx < 0 || cz < 0 || cx >= L.bounds.w || cz >= L.bounds.h) return {kind:' '};
  return {kind:L.terrain[cz][cx]};
}
function stationWorld(L, runtime, station) {
  const point = worldPoint(L, runtime, station);
  return {...station,x:point.x,z:point.z};
}
function conveyorRects(L, runtime, width=.8) {
  const rects=[];
  for(const def of L.mechanisms.filter((entry)=>entry.type==='conveyor')){
    const origin=def.config.supportId?platformOrigin(L,runtime,def.config.supportId):{x:0,z:0};
    const points=def.config.path.points.map((point)=>({x:point.x+origin.x,z:point.z+origin.z}));
    for(let index=1;index<points.length;index++){
      const a=points[index-1],b=points[index],half=width/2;
      rects.push({x:Math.min(a.x,b.x)-half,z:Math.min(a.z,b.z)-half,w:Math.abs(b.x-a.x)+width,h:Math.abs(b.z-a.z)+width,kind:'conveyor'});
    }
  }
  return rects;
}
function hazardGuardRects(L) {
  const rects=[],thickness=.16;
  for(const hazard of L.hazards||[])for(const cell of hazard.cells||[])for(const edge of hazard.guardEdges||[]){
    if(edge==='north')rects.push({x:cell.x,z:cell.z-thickness/2,w:1,h:thickness,kind:'hazardGuard'});
    if(edge==='south')rects.push({x:cell.x,z:cell.z+1-thickness/2,w:1,h:thickness,kind:'hazardGuard'});
    if(edge==='west')rects.push({x:cell.x-thickness/2,z:cell.z,w:thickness,h:1,kind:'hazardGuard'});
    if(edge==='east')rects.push({x:cell.x+1-thickness/2,z:cell.z,w:thickness,h:1,kind:'hazardGuard'});
  }
  return rects;
}
function blockingRects(L, runtime) {
  const rects = [];
  for (let z=0;z<L.bounds.h;z++) for (let x=0;x<L.bounds.w;x++) if (L.terrain[z][x] === '#') rects.push({x,z,w:1,h:1});
  for (const station of L.stations) { const p=stationWorld(L,runtime,station); rects.push({x:p.x,z:p.z,w:1,h:1}); }
  rects.push(...conveyorRects(L,runtime),...hazardGuardRects(L));
  for (const state of Object.values(runtime?.mechanisms || {})) if (state?.type === 'gate') for (const gate of state.gates || []) if (!gate.open) for (const cell of gate.cells || [gate]) rects.push({x:cell.x,z:cell.z,w:1,h:1});
  return rects;
}
function projectileBlockingRects(L, runtime) {
  const rects = [];
  for (let z=0;z<L.bounds.h;z++) for (let x=0;x<L.bounds.w;x++) if (L.terrain[z][x] === '#') rects.push({x,z,w:1,h:1});
  for (const state of Object.values(runtime?.mechanisms || {})) if (state?.type === 'gate') for (const gate of state.gates || []) if (!gate.open) for (const cell of gate.cells || [gate]) rects.push({x:cell.x,z:cell.z,w:1,h:1});
  return rects;
}
function segmentHitsRect(from, to, rect) {
  const dx=to.x-from.x,dz=to.z-from.z;
  let near=0,far=1;
  for(const [start,delta,min,max] of [[from.x,dx,rect.x,rect.x+rect.w],[from.z,dz,rect.z,rect.z+rect.h]]){
    if(Math.abs(delta)<1e-9){if(start<min||start>max)return false;continue;}
    let a=(min-start)/delta,b=(max-start)/delta;if(a>b)[a,b]=[b,a];near=Math.max(near,a);far=Math.min(far,b);if(near>far)return false;
  }
  return far>=0&&near<=1;
}

function resolvePlayerCollision(L, runtime, p) {
  const rects = blockingRects(L,runtime);
  for (let pass = 0; pass < MOVE_SOLVER_PASSES; pass++) {
    let resolved = false;
    for (const rect of rects) {
        const nearestX = Math.max(rect.x, Math.min(p.x, rect.x + rect.w));
        const nearestZ = Math.max(rect.z, Math.min(p.z, rect.z + rect.h));
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
            { d: p.x - (rect.x - PLAYER_R), nx: -1, nz: 0 },
            { d: rect.x + rect.w + PLAYER_R - p.x, nx: 1, nz: 0 },
            { d: p.z - (rect.z - PLAYER_R), nx: 0, nz: -1 },
            { d: rect.z + rect.h + PLAYER_R - p.z, nx: 0, nz: 1 },
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

function movementProfileAt(L, runtime, p) {
  const kind = terrainAt(L,runtime,p.x,p.z).kind;
  const ice = L.mechanisms.find((entry)=>entry.type==='iceSurface');
  return kind === 'i' && ice ? {speed:SPEED,stopTime:ice.config.stopTime,turnTime:ice.config.turnTime} : {};
}
function stepPlayerMovement(L, runtime, p, input, dt, otherPlayers) {
  const ix = Number(input && input.dx) || 0;
  const iz = Number(input && input.dz) || 0;
  const active = ix !== 0 || iz !== 0;
  const profile = movementProfileAt(L,runtime,p);
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
    resolvePlayerCollision(L, runtime, p);
    resolvePlayerBodies(p, otherPlayers);
    resolvePlayerCollision(L, runtime, p);
  }
}

function targetStation(L, runtime, p) {
  const tx = p.x + p.face.dx * 0.95;
  const tz = p.z + p.face.dz * 0.95;
  let best = null;
  for (const station of L.stations) {
    const world = stationWorld(L,runtime,station);
    const distance = Math.hypot(tx-(world.x+0.5),tz-(world.z+0.5));
    if (distance < 0.72 && (!best || distance < best.distance)) best={...world,distance};
  }
  return best;
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
    s.elapsed += DT;
    for(const def of s.layout.mechanisms.filter((entry)=>entry.type==='movingPlatform'))MECHANISM_REGISTRY.movingPlatform.tick(ctx,def,s.mechanisms[def.id]);
    s.countdown -= DT;
    if (s.countdown <= 0) {
      s.countdown = 0;
      s.phase = 'playing';
      spawnOrder(ctx);
      resetNextOrderIn(ctx);
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
      stepPlayerMovement(s.layout, {platforms:s.platforms,mechanisms:s.mechanisms}, p, p.input, DT, ids.filter((other) => other !== id).map((other) => s.players[other]));
      const podium=AWARDS_PODIUMS.find((entry)=>entry.rank===p.awardsPodiumRank);
      if(podium&&p.awardsPodiumHeight>0&&(Math.abs(p.x-podium.x)>.725||Math.abs(p.z-podium.z)>.675)){p.awardsPodiumHeight=0;p.awardsPodiumRank=0;}
    }
  } else {
    return; // 不再续约，定时器停止
  }
  if (s.phase === 'countdown' || s.phase === 'playing' || s.phase === 'roundResult' || s.phase === 'awards') armTick(ctx);
}

function spawnOrder(ctx) {
  const s = ctx.state;
  const pool = MAPS[s.mapId].recipePool;
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

function resetNextOrderIn(ctx) {
  const s = ctx.state;
  const pressure = Math.max(0.4, 1 - 0.15 * Math.max(0, s.difficultyLevel - 1));
  const players = Math.max(2, Math.min(4, Object.keys(s.players).length));
  const playerMultiplier = players === 4 ? 0.72 : players === 3 ? 0.85 : 1;
  s.nextOrderIn = Math.max(8, (ORDER_MIN_GAP + ctx.random() * ORDER_VAR_GAP) * pressure * playerMultiplier);
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

function clearPlayerRuntime(p) {
  p.input = { dx: 0, dz: 0 }; p.vx = 0; p.vz = 0; p.moveSeq = 0;
  p.face = { dx: 0, dz: 1 }; p.carrying = null; p.working = false;
  p.charge = null; p.fall = null; p.respawnGrace = 0; p.interactSeq = 0; p.workSeq = 0;
  p.nextInteractAt = 0; p.nextCrateAt = 0;
  p.awardsPodiumHeight = 0;
  p.awardsPodiumRank = 0;
  p.activeBuff = null;
}

function resetPlayerForLayout(p, sp, layout = null, runtime = null) {
  const point = layout ? worldPoint(layout,runtime,sp) : sp;
  p.x = point.x; p.z = point.z; p.supportId = sp.supportId || null;
  if(Number.isInteger(sp.slot))p.roundSpawnSlot=sp.slot;
  clearPlayerRuntime(p);
  p.roundContributionScore = 0; p.roundServed = 0; p.roundPublicEvents = 0; p.roundStats = emptyStats();
}

function spawnForPlayer(s,p,playerId='') {
  const used=new Set(Object.entries(s.players).filter(([id,other])=>id!==playerId&&Number.isInteger(other.roundSpawnSlot)).map(([,other])=>other.roundSpawnSlot));
  return s.layout.spawns.find((spawn)=>spawn.slot===p.roundSpawnSlot)||s.layout.spawns.find((spawn)=>!used.has(spawn.slot))||s.layout.spawns[0];
}
function respawnAtRoundSpawn(s,p,playerId) {
  const spawn=spawnForPlayer(s,p,playerId);if(!spawn)return;
  p.roundSpawnSlot=spawn.slot;const point=worldPoint(s.layout,runtimeOf(s),spawn);
  p.x=point.x;p.z=point.z;p.supportId=spawn.supportId||null;p.input={dx:0,dz:0};p.vx=0;p.vz=0;p.working=false;p.charge=null;p.fall=null;p.respawnGrace=RESPAWN_GRACE;
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
    const specialPriority = { clutchServes: 5, burnClears: 5, fastServes: 4, throws:4, catches:5, conveyorTransfers:4, teamwork: 3, backstage: 3, allrounder: 3, noWaste: 2, clutch: 4, improving: 4, champion: 1 };
    const add = (kind, value, min, reason) => { if (value >= min && value === maxima[kind]) candidates.push({ kind, value, reason, priority: specialPriority[kind] || 4 }); };
    add('clutchServes', stats.clutchServes, 1, `${stats.clutchServes} 次压线上菜`);
    add('burnClears', stats.burnClears, 1, `${stats.burnClears} 次清理焦锅`);
    add('fastServes', stats.fastServes, 2, `${stats.fastServes} 次闪电出餐`);
    add('chops', stats.chops, 3, `完成 ${stats.chops} 次切配`);
    add('washes', stats.washes, 2, `洗净 ${stats.washes} 个盘子`);
    add('assembles', stats.assembles, 3, `完成 ${stats.assembles} 次装盘`);
    add('potAdds', stats.potAdds, 3, `${stats.potAdds} 次精准下锅`);
    add('deliveries', stats.deliveries, 2, `送出 ${stats.deliveries} 道菜`);
    add('throws', stats.throws, 3, `${stats.throws} 次精准投掷`);
    add('catches', stats.catches, 2, `${stats.catches} 次空中接取`);
    add('conveyorTransfers', stats.conveyorTransfers, 3, `${stats.conveyorTransfers} 次物流转运`);
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
  const layout = cloneLayout(map);
  s.layout = layout;
  s.stations = {};
  for (const station of layout.stations) {
    if (station.type === 'counter' || station.type === 'board' || station.type === 'conveyorPort') s.stations[station.id] = { item: null };
    else if (station.type === 'stove') s.stations[station.id] = { contents: [], credits: [], phase: 'idle', t: 0, masterChef: false };
    else s.stations[station.id] = {};
  }
  s.platforms = {};
  for (const platform of layout.platforms) s.platforms[platform.id] = {x:0,z:0,previousX:0,previousZ:0};
  s.mechanisms = {};
  for (const mechanism of layout.mechanisms) s.mechanisms[mechanism.id] = createMechanismState(mechanism,ctx);
  s.worldItems = {};
  s.worldItemSeq = 0;
  s.elapsed = 0;
  s.roundScore = 0;
  s.roundServed = 0;
  s.roundExpired = 0;
  s.roundBurns = 0;
  s.roundComment = null;
  s.roundTitles = {};
  s.orders = [];
  s.orderSeq = 0;
  s.plates = { clean: map.plateCount, dirty: 0, washT: 0, due: [], cleanCredits: [] };
  s.timeLeft = GAME_TIME;
  s.nextOrderIn = 0;
  s.groundBuff = null;
  s.nextBuffIn = 25;
  s.fireOverdriveRemaining = 0;
  const ids = Object.keys(s.players);
  const runtime={platforms:s.platforms,mechanisms:s.mechanisms};
  for (let i = 0; i < ids.length; i++) {
    const p = s.players[ids[i]];
    resetPlayerForLayout(p, layout.spawns[i % layout.spawns.length],layout,runtime);
    syncPlayerRecord(s,ids[i]);
  }
  s.phase = 'countdown';
  s.countdown = COUNTDOWN_T;
  ctx.broadcast('game:countdown', { mapId: s.mapId, mapName: map.name });
  armTick(ctx);
}

function setupSession(ctx) {
  const s = ctx.state;
  s.roundIndex = 0; s.difficultyLevel = 1; s.mapQueue = shuffleMaps(ctx, null); s.mapId = null; s.nextMapId = null;
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
  s.playerRecords[id] = { name: p.name, color: p.color, contributionScore: p.contributionScore, servedCount: p.servedCount, publicEvents: p.publicEvents, joinOrder: p.joinOrder, stats: normalizeStats(p.stats), roundSpawnSlot:p.roundSpawnSlot, roundSpawnGameSeq:s.gameSeq, roundSpawnMapId:s.mapId };
}

const AWARDS_PODIUMS = [
  {rank:1,x:7.5,z:2.4,height:1.5,label:'1',color:0xffd23f},
  {rank:2,x:5.8,z:2.7,height:1.05,label:'2',color:0xcbd3dc},
  {rank:3,x:9.2,z:2.8,height:.78,label:'3',color:0xc88755},
];
const AWARDS_FLOOR_SPOTS = [{x:7.5,z:5.8},{x:5.5,z:5.8},{x:9.5,z:5.8},{x:7.5,z:6.6}];

function placePlayerForAwards(s,id,index) {
  const standing=s.standings.find((entry)=>entry.id===id);
  const podium=AWARDS_PODIUMS.find((entry)=>entry.rank===standing?.rank);
  const spot=podium||AWARDS_FLOOR_SPOTS[index%AWARDS_FLOOR_SPOTS.length];
  resetPlayerForLayout(s.players[id],spot);
  s.players[id].awardsPodiumHeight=podium?.height||0;
  s.players[id].awardsPodiumRank=podium?.rank||0;
}

function finishSession(ctx) {
  const s = ctx.state;
  captureRoundResult(s);
  for (const id in s.players) syncPlayerRecord(s, id);
  s.standings = buildStandings(s);
  const finalSummary = { score: s.sessionScore || 0, served: s.served || 0, expired: s.expired || 0, burns: s.burns || 0 };
  s.finalComment = teamComment(s, finalSummary, true);
  s.finalTitles = makePlayerTitles(s.standings, false, `${s.gameSeq}:final`);
  s.phase = 'awards'; s.layout = makeAwardsLayout(); s.stations = {}; s.platforms={}; s.mechanisms={}; s.worldItems={}; s.orders = [];
  s.gameSeq += 1;
  const ids = Object.keys(s.players);
  ids.forEach((id, i) => placePlayerForAwards(s,id,i));
  ctx.broadcast('game:over', { score: s.sessionScore, served: s.served, expired: s.expired });
  armTick(ctx);
}

function makeAwardsLayout() {
  return {mapId:'awards',name:'颁奖广场',bounds:{w:15,h:9},terrain:terrain(15,9,(x,z)=>x>=1&&x<=13&&z>=1&&z<=7,()=>false,' '),platforms:[],stations:[],mechanisms:[],podiums:AWARDS_PODIUMS.map((entry)=>({...entry})),checkpoints:[{id:'awards',x:7,z:4}],spawns:[{slot:1,x:7.5,z:2.4},{slot:2,x:5.8,z:2.7},{slot:3,x:9.2,z:2.8},{slot:4,x:7.5,z:5.8}],camera:{minPixelsPerTile:44}};
}

function finishRound(ctx) {
  const s = ctx.state;
  captureRoundResult(s);
  if (s.mode === 'party' && s.roundIndex >= 3) return finishSession(ctx);
  s.nextMapId = takeNextMap(ctx); s.roundResultTime = ROUND_RESULT_T; s.phase = 'roundResult';
  s.orders = [];
  for (const id in s.players) clearPlayerRuntime(s.players[id]);
  ctx.broadcast('round:over', { round: s.roundIndex, nextMapId: s.nextMapId, nextMapName: MAPS[s.nextMapId].name });
}

function weightedBuff(ctx) {
  let pick = ctx.random() * BUFF_WEIGHTS.reduce((a, b) => a + b, 0);
  for (let i = 0; i < BUFF_TYPES.length; i++) { pick -= BUFF_WEIGHTS[i]; if (pick <= 0) return BUFF_TYPES[i]; }
  return BUFF_TYPES[0];
}

function spawnGroundBuff(ctx) {
  const s = ctx.state; const L = s.layout; const candidates = [];
  const runtime={platforms:s.platforms,mechanisms:s.mechanisms};
  for (let z = 1; z < L.bounds.h - 1; z++) for (let x = 1; x < L.bounds.w - 1; x++) {
    if (!['.','i'].includes(terrainAt(L,runtime,x+0.5,z+0.5).kind)) continue;
    if (blockingRects(L,runtime).some((r)=>x+0.5>=r.x&&x+0.5<=r.x+r.w&&z+0.5>=r.z&&z+0.5<=r.z+r.h)) continue;
    if (L.spawns.some((sp) => {const wp=worldPoint(L,runtime,sp);return Math.hypot(x+0.5-wp.x,z+0.5-wp.z)<1.5;})) continue;
    if (Object.values(s.players).some((p) => Math.hypot(x + 0.5 - p.x, z + 0.5 - p.z) < 2)) continue;
    const exits = [[1,0],[-1,0],[0,1],[0,-1]].filter(([dx,dz]) => ['.','i'].includes(terrainAt(L,runtime,x+dx+0.5,z+dz+0.5).kind)).length;
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

function createMechanismState(def,ctx) {
  return MECHANISM_REGISTRY[def.type]?.create(def,ctx) || {type:def.type};
}
function runtimeOf(s) { return {platforms:s.platforms,mechanisms:s.mechanisms}; }
function itemHasPlate(content) { return content && (content.k === 'plate' || content.k === 'dish'); }
function recycleContent(s, content) {
  if (!itemHasPlate(content)) return;
  if (content.k === 'plate' && (!content.items || content.items.length === 0)) s.plates.clean += 1;
  else s.plates.due.push(DIRTY_DELAY);
}
function removeWorldItem(s, id, recycle = true) {
  const entity=s.worldItems[id]; if (!entity) return;
  if (recycle) recycleContent(s,entity.content);
  delete s.worldItems[id];
}
function ensureWorldLimit(s) {
  const entries=Object.values(s.worldItems);
  if (entries.length < WORLD_ITEM_LIMIT) return true;
  const victim=entries.filter((entry)=>entry.mode!=='airborne').sort((a,b)=>a.createdAt-b.createdAt)[0];
  if (victim) {removeWorldItem(s,victim.id,true);return true;}
  return false;
}
function createWorldItem(s, content, position, mode='ground', extra={}) {
  if(!ensureWorldLimit(s))return null;
  const id=`wi${++s.worldItemSeq}`;
  s.worldItems[id]={id,content,mode,x:position.x,z:position.z,supportId:position.supportId||null,createdAt:s.elapsed,expiresAt:s.elapsed+WORLD_ITEM_LIFETIME,...extra};
  return s.worldItems[id];
}
function pathMetrics(points) {
  const segments=[]; let total=0;
  for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],length=Math.hypot(b.x-a.x,b.z-a.z);segments.push({a,b,length,start:total});total+=length;}
  return {segments,total};
}
function distanceOnPath(points,point) {
  const metrics=pathMetrics(points);let best=null;
  for(const seg of metrics.segments){const vx=seg.b.x-seg.a.x,vz=seg.b.z-seg.a.z,len2=vx*vx+vz*vz,t=len2?Math.max(0,Math.min(1,((point.x-seg.a.x)*vx+(point.z-seg.a.z)*vz)/len2)):0,px=seg.a.x+vx*t,pz=seg.a.z+vz*t,d=Math.hypot(point.x-px,point.z-pz),distance=seg.start+seg.length*t;if(!best||d<best.d)best={d,distance};}
  return best?.distance||0;
}
function pointOnPath(points,distance) {
  const metrics=pathMetrics(points); const d=Math.max(0,Math.min(metrics.total,distance));
  const seg=metrics.segments.find((entry)=>d<=entry.start+entry.length)||metrics.segments[metrics.segments.length-1];
  if(!seg)return points[0]||{x:0,z:0}; const t=seg.length?(d-seg.start)/seg.length:0;
  return {x:seg.a.x+(seg.b.x-seg.a.x)*t,z:seg.a.z+(seg.b.z-seg.a.z)*t};
}
function startFall(ctx,id,p) {
  if(p.fall||p.respawnGrace>0)return;
  recycleContent(ctx.state,p.carrying); p.carrying=null; p.vx=p.vz=0;p.input={dx:0,dz:0};p.working=false;p.charge=null;p.fall={remaining:FALL_TIME};bumpStat(p,'falls');ctx.broadcast('player:fall',{id,name:p.name});
}
function carryPlatformDelta(s, def, dx, dz) {
  if(!dx&&!dz)return;
  for(const p of Object.values(s.players))if(p.supportId===def.id&&!p.fall){p.x+=dx;p.z+=dz;}
  for(const item of Object.values(s.worldItems))if(item.supportId===def.id&&item.mode!=='airborne'){item.x+=dx;item.z+=dz;}
}
function secureDockSeam(s, def, offset) {
  const xs=def.tiles.map((tile)=>tile.x),minX=def.origin.x+offset.x+Math.min(...xs),maxX=def.origin.x+offset.x+Math.max(...xs)+1;
  const margin=PLAYER_R+.02;
  for(const p of Object.values(s.players))if(p.supportId===def.id&&!p.fall){p.x=Math.max(minX+margin,Math.min(maxX-margin,p.x));}
  for(const item of Object.values(s.worldItems))if(item.supportId===def.id&&item.mode==='ground'){item.x=Math.max(minX+.08,Math.min(maxX-.08,item.x));}
}
function dockMotionAt(config,elapsed) {
  const separatedEnd=config.separatedHold,mergeEnd=separatedEnd+config.mergeDuration,mergedEnd=mergeEnd+config.mergedHold;
  const t=((elapsed%config.cycle)+config.cycle)%config.cycle;
  if(t<separatedEnd)return{phase:'separated',remaining:separatedEnd-t,progress:0,merged:false};
  if(t<mergeEnd){const linear=(t-separatedEnd)/config.mergeDuration;return{phase:'merging',remaining:mergeEnd-t,progress:(1-Math.cos(Math.PI*linear))/2,merged:false};}
  if(t<mergedEnd)return{phase:'merged',remaining:mergedEnd-t,progress:1,merged:true};
  const linear=(t-mergedEnd)/config.separateDuration;return{phase:'separating',remaining:config.cycle-t,progress:(1+Math.cos(Math.PI*linear))/2,merged:false};
}
function stepPlatforms(s, def, mechanismState) {
  const runtime=runtimeOf(s);
  const dock=def.config.mode==='dock'?dockMotionAt(def.config,s.elapsed):null;
  if(dock&&mechanismState.phase==='merged'&&dock.phase==='separating')for(const platform of s.layout.platforms.filter((entry)=>def.config.platformIds.includes(entry.id)))secureDockSeam(s,platform,def.config.offsets[platform.id]);
  for(const platform of s.layout.platforms.filter((entry)=>def.config.platformIds.includes(entry.id))){
    const state=s.platforms[platform.id];state.previousX=state.x;state.previousZ=state.z;
    if(dock){const target=def.config.offsets[platform.id]||{x:0,z:0};state.x=target.x*dock.progress;state.z=target.z*dock.progress;}
    else if(platform.motion){const angle=((s.elapsed/platform.motion.period)+platform.motion.phase)*Math.PI*2;const wave=Math.sin(angle)*platform.motion.amplitude;state.x=platform.motion.axis.x*wave;state.z=platform.motion.axis.z*wave;}
    carryPlatformDelta(s,platform,state.x-state.previousX,state.z-state.previousZ);
  }
  for(const p of Object.values(s.players))if(!p.fall){const support=terrainAt(s.layout,runtime,p.x,p.z).supportId||null;p.supportId=support;}
  if(dock){mechanismState.phase=dock.phase;mechanismState.remaining=dock.remaining;mechanismState.merged=dock.merged;}
}
function stepConveyor(ctx,def,state) {
  const s=ctx.state,config=def.config,origin=config.supportId?platformOrigin(s.layout,runtimeOf(s),config.supportId):{x:0,z:0},points=config.path.points.map((point)=>({x:point.x+origin.x,z:point.z+origin.z})),metrics=pathMetrics(points);
  if(config.reverseEvery){state.reverseIn-=DT;state.warning=state.reverseIn<=config.warning;if(state.reverseIn<=0){state.direction*=-1;state.reverseIn=config.reverseEvery;state.warning=false;ctx.broadcast('conveyor:reverse',{id:def.id,direction:state.direction});}}
  const ports=s.layout.stations.filter((entry)=>entry.type==='conveyorPort'&&entry.conveyorId===def.id).map((entry)=>({def:entry,state:s.stations[entry.id],distance:distanceOnPath(points,{x:entry.pathPoint.x+origin.x,z:entry.pathPoint.z+origin.z})}));
  for(const port of ports.filter((entry)=>entry.def.portMode==='input'&&entry.state?.item)){
    const occupied=Object.values(s.worldItems).some((item)=>item.mode==='conveyor'&&item.conveyorId===def.id&&Math.min(Math.abs(item.pathDistance-port.distance),config.path.loop?metrics.total-Math.abs(item.pathDistance-port.distance):Infinity)<.7);
    if(occupied)continue;
    const position=pointOnPath(points,port.distance),item=createWorldItem(s,port.state.item,{...position,supportId:config.supportId||null},'conveyor',{conveyorId:def.id,pathDistance:port.distance,lastOwnerId:port.state.lastOwnerId||''});
    if(item){port.state.item=null;port.state.lastOwnerId=null;}
  }
  const items=Object.values(s.worldItems).filter((entry)=>entry.mode==='conveyor'&&entry.conveyorId===def.id).sort((a,b)=>state.direction*(b.pathDistance-a.pathDistance));
  let ahead=null;
  for(const item of items){const previous=item.pathDistance;let next=previous+state.direction*config.path.speed*DT;if(config.path.loop)next=(next%metrics.total+metrics.total)%metrics.total;else{if(ahead!==null)next=state.direction>0?Math.min(next,ahead-0.7):Math.max(next,ahead+0.7);next=Math.max(0,Math.min(metrics.total,next));}item.pathDistance=next;const pos=pointOnPath(points,next);item.x=pos.x;item.z=pos.z;item.supportId=config.supportId||null;ahead=next;
    const travelled=state.direction>0?(config.path.loop?(next-previous+metrics.total)%metrics.total:next-previous):(config.path.loop?(previous-next+metrics.total)%metrics.total:previous-next);
    const output=ports.filter((entry)=>entry.def.portMode==='output'&&entry.state&&!entry.state.item).map((entry)=>({entry,delta:state.direction>0?(config.path.loop?(entry.distance-previous+metrics.total)%metrics.total:entry.distance-previous):(config.path.loop?(previous-entry.distance+metrics.total)%metrics.total:previous-entry.distance)})).filter(({delta})=>delta>=-1e-6&&delta<=travelled+1e-6).sort((a,b)=>a.delta-b.delta)[0]?.entry;
    if(output){output.state.item=item.content;delete s.worldItems[item.id];const owner=s.players[item.lastOwnerId];if(owner)bumpStat(owner,'conveyorTransfers');}
  }
}
function shuffleGatePresets(ctx,ids,avoid=null) {
  const bag=[...ids];
  for(let index=bag.length-1;index>0;index--){const other=Math.floor(ctx.random()*(index+1));[bag[index],bag[other]]=[bag[other],bag[index]];}
  if(bag.length>1&&bag[0]===avoid)[bag[0],bag[1]]=[bag[1],bag[0]];
  return bag;
}
function gatePreset(def,id) { return def.config.presets.find((entry)=>entry.id===id); }
function setGatePreview(state,nextOpenIds=[]) {
  const next=new Set(nextOpenIds);
  for(const gate of state.gates){gate.willOpen=!gate.open&&next.has(gate.id);gate.willClose=gate.open&&!next.has(gate.id);}
}
function takeGatePreset(ctx,def,state) {
  if(!state.bag.length)state.bag=shuffleGatePresets(ctx,def.config.presets.map((entry)=>entry.id),state.activePresetId);
  return state.bag.shift();
}
function createGateState(def,ctx) {
  const presetIds=def.config.presets.map((entry)=>entry.id),bag=shuffleGatePresets(ctx,presetIds),activePresetId=bag.shift(),active=gatePreset(def,activePresetId),open=new Set(active.open);
  return {type:def.type,remaining:def.config.switchEvery,warning:false,activePresetId,nextPresetId:null,bag,gates:def.config.groups.map((gate)=>({...gate,cells:gate.cells.map((cell)=>({...cell})),open:open.has(gate.id),willOpen:false,willClose:false}))};
}
function stepGate(ctx,def,state) {
  state.remaining-=DT;
  if(state.remaining<=def.config.warning&&!state.nextPresetId){
    state.nextPresetId=takeGatePreset(ctx,def,state);
    setGatePreview(state,gatePreset(def,state.nextPresetId).open);
  }
  state.warning=!!state.nextPresetId;
  if(state.remaining>0)return;
  const closing=state.gates.filter((gate)=>gate.willClose);
  const occupied=Object.values(ctx.state.players).some((p)=>closing.some((gate)=>gate.cells.some((cell)=>Math.hypot(p.x-(cell.x+.5),p.z-(cell.z+.5))<.9)));
  if(occupied){state.remaining=.5;return;}
  const next=gatePreset(def,state.nextPresetId),open=new Set(next.open),previousOpen=state.gates.filter((gate)=>gate.open).map((gate)=>gate.id);
  for(const gate of state.gates){gate.open=open.has(gate.id);gate.willOpen=false;gate.willClose=false;}
  state.activePresetId=next.id;state.nextPresetId=null;state.remaining=def.config.switchEvery;state.warning=false;
  ctx.broadcast('gate:switch',{presetId:next.id,label:next.label,open:[...next.open],closed:previousOpen.filter((id)=>!open.has(id))});
}
const noopMechanism=()=>{};
const MECHANISM_REGISTRY={
  movingPlatform:{create:(def)=>({type:def.type,phase:def.config.mode==='dock'?'separated':null,remaining:def.config.separatedHold||0,merged:false}),tick:(ctx,def,state)=>stepPlatforms(ctx.state,def,state),getCollision:noopMechanism,getInteractions:noopMechanism,getRenderState:noopMechanism,destroy:noopMechanism},
  conveyor:{create:(def)=>({type:def.type,direction:1,reverseIn:def.config.reverseEvery||0,warning:false}),tick:stepConveyor,getCollision:noopMechanism,getInteractions:noopMechanism,getRenderState:noopMechanism,destroy:noopMechanism},
  gate:{create:createGateState,tick:stepGate,getCollision:noopMechanism,getInteractions:noopMechanism,getRenderState:noopMechanism,destroy:noopMechanism},
  iceSurface:{create:(def)=>({type:def.type}),tick:noopMechanism,getCollision:noopMechanism,getInteractions:noopMechanism,getRenderState:noopMechanism,destroy:noopMechanism},
  waterHazard:{create:(def)=>({type:def.type}),tick:noopMechanism,getCollision:noopMechanism,getInteractions:noopMechanism,getRenderState:noopMechanism,destroy:noopMechanism},
};
function stepMapMechanisms(ctx) {
  const s=ctx.state;
  for(const def of s.layout.mechanisms){const handler=MECHANISM_REGISTRY[def.type];handler?.tick(ctx,def,s.mechanisms[def.id]);}
}
function finishAirborne(ctx,item) {
  const s=ctx.state,runtime=runtimeOf(s);
  const receivers=Object.entries(s.players).filter(([id,p])=>id!==item.ownerId&&!p.carrying&&!p.fall&&!p.working).map(([id,p])=>({id,p,d:Math.hypot(p.x-item.x,p.z-item.z)})).filter((entry)=>entry.d<0.55&&entry.p.face.dx*(item.x-entry.p.x)+entry.p.face.dz*(item.z-entry.p.z)>0).sort((a,b)=>a.d-b.d);
  if(receivers.length){const receiver=receivers[0];receiver.p.carrying=item.content;bumpStat(receiver.p,'catches');delete s.worldItems[item.id];ctx.broadcast('item:caught',{by:receiver.p.name});return;}
  let landing=null;
  for(const stationDef of s.layout.stations.filter((entry)=>entry.type==='counter'||entry.type==='board')){const pos=stationWorld(s.layout,runtime,stationDef);const dyn=s.stations[stationDef.id];if(Math.hypot(item.x-(pos.x+0.5),item.z-(pos.z+0.5))<0.7&&dyn&&!dyn.item){if(stationDef.type==='board'&&(!(item.content.k==='raw'||item.content.k==='chopped')||(item.content.k==='raw'&&!INGREDIENTS[item.content.g]?.choppable)))continue;landing={stationDef,dyn};break;}}
  if(landing){landing.dyn.item=item.content;delete s.worldItems[item.id];return;}
  const dx=item.motion?item.motion.toX-item.motion.fromX:0,dz=item.motion?item.motion.toZ-item.motion.fromZ:0,length=Math.hypot(dx,dz)||1;
  const candidates=[0,.55,1,1.45].map((offset)=>({x:item.x-dx/length*offset,z:item.z-dz/length*offset}));
  const safe=candidates.map((position)=>safeLooseItemPosition(s,position)).find(Boolean);
  if(safe){item.mode='ground';item.x=safe.x;item.z=safe.z;item.supportId=safe.supportId||null;item.expiresAt=s.elapsed+WORLD_ITEM_LIFETIME;delete item.motion;return;}
  removeWorldItem(s,item.id,true);ctx.broadcast('item:lost',{});
}
function stepWorldItems(ctx) {
  const s=ctx.state;
  for(const item of Object.values(s.worldItems)){
    if(item.mode==='airborne'){
      const previous={x:item.x,z:item.z};item.motion.elapsed+=DT;const t=Math.min(1,item.motion.elapsed/item.motion.duration);item.x=item.motion.fromX+(item.motion.toX-item.motion.fromX)*t;item.z=item.motion.fromZ+(item.motion.toZ-item.motion.fromZ)*t;
      const receiver=Object.entries(s.players).filter(([id,p])=>id!==item.ownerId&&!p.carrying&&!p.fall&&!p.working).find(([,p])=>Math.hypot(p.x-item.x,p.z-item.z)<0.55&&p.face.dx*(item.x-p.x)+p.face.dz*(item.z-p.z)>0);
      if(receiver){receiver[1].carrying=item.content;bumpStat(receiver[1],'catches');delete s.worldItems[item.id];ctx.broadcast('item:caught',{by:receiver[1].name});continue;}
      const blocked=projectileBlockingRects(s.layout,runtimeOf(s)).some((rect)=>segmentHitsRect(previous,item,rect));
      if(blocked){item.x=previous.x;item.z=previous.z;finishAirborne(ctx,item);}else if(t>=1)finishAirborne(ctx,item);
    }
    else if(s.elapsed>=item.expiresAt)removeWorldItem(s,item.id,true);
  }
}

function stepGame(ctx) {
  const s = ctx.state;
  const L = s.layout;
  const playerIds = Object.keys(s.players);
  s.elapsed += DT;
  stepBuffs(ctx);
  stepMapMechanisms(ctx);
  stepWorldItems(ctx);
  const runtime=runtimeOf(s);

  // --- 玩家：工作（切菜/洗碗）与移动 ---
  for (const id of playerIds) {
    const p = s.players[id];
    if(p.respawnGrace>0)p.respawnGrace=Math.max(0,p.respawnGrace-DT);
    if(p.charge){p.charge.held+=DT;if(p.charge.held>=THROW_TIMEOUT)p.charge=null;}
    if(p.fall){p.fall.remaining-=DT;if(p.fall.remaining<=0)respawnAtRoundSpawn(s,p,id);continue;}
    if (p.working) {
      const st = targetStation(L, runtime, p);
      let didWork = false;
      if (st && st.type === 'board') {
        const dyn = s.stations[st.id];
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
    stepPlayerMovement(L, runtime, p, p.input, DT, otherPlayers);
    const ground=terrainAt(L,runtime,p.x,p.z);
    if(!['.','i'].includes(ground.kind))startFall(ctx,id,p);
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
        const st = L.stations.find((entry)=>entry.id===k);
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
        const st = L.stations.find((entry)=>entry.id===k);
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
    resetNextOrderIn(ctx);
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
  if (s.orders.length === 0) {
    spawnOrder(ctx);
    resetNextOrderIn(ctx);
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
// 交互：工位优先，其次世界物品与地面放置
// ---------------------------------------------------------------------------
function nearestGroundItem(s,p) {
  const tx=p.x+p.face.dx*0.65,tz=p.z+p.face.dz*0.65;
  return Object.values(s.worldItems).filter((item)=>item.mode==='ground').map((item)=>({item,d:Math.hypot(item.x-tx,item.z-tz)})).filter((entry)=>entry.d<=0.85).sort((a,b)=>a.d-b.d)[0]?.item||null;
}
function canUseStation(s,p,st) {
  const c=p.carrying,dyn=s.stations[st.id];
  if(st.type==='crate')return !c&&s.elapsed>=(p.nextCrateAt||0);
  if(st.type==='counter'||st.type==='board'){
    if(!c)return !!dyn?.item;
    if(!dyn?.item)return st.type==='counter'||((c.k==='raw'||c.k==='chopped')&&(c.k!=='raw'||INGREDIENTS[c.g]?.choppable));
    const on=dyn.item;return (c.k==='raw'||c.k==='chopped')&&validItemPrep(c)&&(on.k==='plate'||on.k==='dish')&&on.items.length<3;
  }
  if(st.type==='conveyorPort')return st.portMode==='input'?(!c?!!dyn?.item:!dyn?.item):(!c&&!!dyn?.item);
  if(st.type==='stove'){
    if(!dyn)return false;
    if(c&&(c.k==='raw'||c.k==='chopped'))return validItemPrep(c)&&COOKABLE.has(c.g)&&(dyn.phase==='idle'||dyn.phase==='cooking')&&dyn.contents.length<3;
    if(c?.k==='plate')return c.items.length===0&&dyn.phase==='ready';
    return !c&&dyn.contents.length>0&&(dyn.phase==='idle'||dyn.phase==='burnt');
  }
  if(st.type==='plates')return !c&&s.plates.clean>0;
  if(st.type==='window')return c?.k==='dish'&&s.orders.some((order)=>order.key===recipeKey(c.items));
  if(st.type==='trash')return !!c;
  return false;
}
function safeItemPosition(s,p,position) {
  const terrain=terrainAt(s.layout,runtimeOf(s),position.x,position.z);
  if(!['.','i'].includes(terrain.kind))return null;
  if(blockingRects(s.layout,runtimeOf(s)).some((rect)=>position.x>=rect.x-.18&&position.x<=rect.x+rect.w+.18&&position.z>=rect.z-.18&&position.z<=rect.z+rect.h+.18))return null;
  if(Object.values(s.worldItems).some((item)=>item.mode!=='airborne'&&Math.hypot(item.x-position.x,item.z-position.z)<.55))return null;
  if(Object.values(s.players).some((other)=>other!==p&&Math.hypot(other.x-position.x,other.z-position.z)<.4))return null;
  return {...position,supportId:terrain.supportId||null};
}
function safeLooseItemPosition(s,position) {
  const terrain=terrainAt(s.layout,runtimeOf(s),position.x,position.z);
  if(!['.','i'].includes(terrain.kind))return null;
  if(blockingRects(s.layout,runtimeOf(s)).some((rect)=>position.x>=rect.x-.18&&position.x<=rect.x+rect.w+.18&&position.z>=rect.z-.18&&position.z<=rect.z+rect.h+.18))return null;
  if(Object.values(s.worldItems).some((item)=>item.mode!=='airborne'&&Math.hypot(item.x-position.x,item.z-position.z)<.55))return null;
  return {...position,supportId:terrain.supportId||null};
}
function dropCarrying(ctx,p) {
  const s=ctx.state;const candidates=[{x:p.x+p.face.dx*0.8,z:p.z+p.face.dz*0.8},{x:p.x,z:p.z}];
  for(const position of candidates){const safe=safeItemPosition(s,p,position);if(safe){const entity=createWorldItem(s,p.carrying,safe,'ground',{lastOwnerId:playerIdFor(s,p)});if(!entity)return false;p.carrying=null;return true;}}
  return false;
}
function doInteract(ctx, p) {
  const s = ctx.state;
  const target = targetStation(s.layout, runtimeOf(s), p);
  const st = target&&(canUseStation(s,p,target)||target.type==='conveyorPort')?target:null;
  if (!st) {
    if(!p.carrying){const item=nearestGroundItem(s,p);if(item){p.carrying=item.content;delete s.worldItems[item.id];bumpStat(p,'groundPickups');}}
    else dropCarrying(ctx,p);
    return;
  }
  const dyn = s.stations[st.id];
  const c = p.carrying;

  if (st.type === 'crate') {
    if (!c && s.elapsed >= (p.nextCrateAt||0)) {p.carrying = { k: 'raw', g: st.crate, progress: 0, credits: [credit(playerIdFor(s, p), 1, false)] };p.nextCrateAt=s.elapsed+INTERACT_COOLDOWN;}
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

  if(st.type==='conveyorPort'){
    if(!c&&dyn?.item){p.carrying=dyn.item;dyn.item=null;dyn.lastOwnerId=null;if(p.carrying.k==='raw')p.carrying.progress=0;}
    else if(c&&st.portMode==='input'&&dyn&&!dyn.item){if(c.k==='raw')c.progress=0;dyn.item=c;dyn.lastOwnerId=playerIdFor(s,p);p.carrying=null;}
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
        if (s.orders.length === 0) {
          spawnOrder(ctx);
          resetNextOrderIn(ctx);
        }
      }
    }
    return;
  }

  if (st.type === 'trash') {
    if (c) { bumpStat(p, 'discards'); recycleContent(s,c);p.carrying = null; }
    return;
  }
  // sink：洗碗走 work 长按，不在此处理
}

function throwCarrying(ctx,p,held) {
  if(!p.carrying)return;
  const charge=Math.max(0,Math.min(1,(held-THROW_THRESHOLD)/(THROW_FULL_TIME-THROW_THRESHOLD)));
  const range=THROW_MIN_RANGE+(THROW_MAX_RANGE-THROW_MIN_RANGE)*charge;
  const fromX=p.x+p.face.dx*0.45,fromZ=p.z+p.face.dz*0.45;
  const entity=createWorldItem(ctx.state,p.carrying,{x:fromX,z:fromZ},'airborne',{ownerId:playerIdFor(ctx.state,p),lastOwnerId:playerIdFor(ctx.state,p),motion:{fromX,fromZ,toX:fromX+p.face.dx*range,toZ:fromZ+p.face.dz*range,elapsed:0,duration:0.45+range*0.07}});
  if(!entity)return;p.carrying=null;bumpStat(p,'throws');ctx.broadcast('item:thrown',{id:entity.id,by:p.name,range});
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
      platforms: {},
      mechanisms: {},
      worldItems: {},
      worldItemSeq: 0,
      elapsed: 0,
      orders: [],
      nextOrderIn: 0,
      plates: { clean: 0, dirty: 0, washT: 0, due: [], cleanCredits: [] },
      orderSeq: 0,
      groundBuff: null,
      nextBuffIn: 25,
      fireOverdriveRemaining: 0,
    };
  },

  onCreate(ctx) {
    ctx.state.hostId = ctx.host ? ctx.host.id : null;
  },

  onRestore(ctx) {
    // 仅恢复当前全新模型产生的快照；不存在旧状态迁移路径。
    if (ctx.host) ctx.state.hostId = ctx.host.id;
    if (ctx.state.phase === 'playing' || ctx.state.phase === 'countdown' || ctx.state.phase === 'roundResult' || ctx.state.phase === 'awards') {
      armTick(ctx);
    }
  },

  onJoin(ctx, player) {
    const s = ctx.state;
    const previousRecord=s.playerRecords[player.id];
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
      supportId: null,
      roundSpawnSlot: null,
      charge: null,
      fall: null,
      respawnGrace: 0,
      interactSeq: 0,
      workSeq: 0,
      nextInteractAt: 0,
      nextCrateAt: 0,
      awardsPodiumHeight: 0,
      awardsPodiumRank: 0,
      activeBuff: null,
      contributionScore: previousRecord?.contributionScore || 0,
      roundContributionScore: 0,
      servedCount: previousRecord?.servedCount || 0,
      publicEvents: previousRecord?.publicEvents || 0,
      roundServed: 0,
      roundPublicEvents: 0,
      stats: normalizeStats(previousRecord?.stats),
      roundStats: emptyStats(),
      joinOrder: previousRecord?.joinOrder || s.joinSeq,
    };
    s.players[player.id] = p;
    syncPlayerRecord(s, player.id);
    if (s.phase === 'awards' && s.layout) {
      placePlayerForAwards(s,player.id,count);
      syncPlayerRecord(s,player.id);
    } else if ((s.phase === 'playing' || s.phase === 'countdown') && s.layout) {
      const used=new Set(Object.entries(s.players).filter(([id])=>id!==player.id).map(([,other])=>other.roundSpawnSlot).filter(Number.isInteger));
      const remembered=previousRecord?.roundSpawnGameSeq===s.gameSeq&&previousRecord?.roundSpawnMapId===s.mapId?previousRecord.roundSpawnSlot:null;
      const sp=s.layout.spawns.find((entry)=>entry.slot===remembered&&!used.has(entry.slot))||s.layout.spawns.find((entry)=>!used.has(entry.slot))||s.layout.spawns[count%s.layout.spawns.length];
      resetPlayerForLayout(p,sp,s.layout,runtimeOf(s));
      syncPlayerRecord(s,player.id);
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
      s.platforms = {};
      s.mechanisms = {};
      s.worldItems = {};
      s.orders = [];
      ctx.clearTimer('tick');
    }
  },

  actions: {
    selectMode(ctx, { player, payload }) {
      const s = ctx.state;
      if (s.phase !== 'lobby' || player.id !== ctx.host.id) return;
      if (payload && (payload.mode === 'party' || payload.mode === 'endless')) s.mode = payload.mode;
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
      s.platforms = {};
      s.mechanisms = {};
      s.worldItems = {};
      s.orders = [];
      for (const id in s.players) {
        clearPlayerRuntime(s.players[id]);
      }
      ctx.clearTimer('tick');
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
      if (!Number.isSafeInteger(seq) || seq <= p.moveSeq) return;
      p.moveSeq = seq;
      p.input = { dx, dz };
    },

    // 工作意图（切菜/洗碗，长按）：{ active: boolean, seq: number }
    work(ctx, { player, payload }) {
      const s = ctx.state;
      if (s.phase !== 'playing') return;
      const p = s.players[player.id];
      if (!p) return;
      const seq=Number(payload?.seq);if(!Number.isSafeInteger(seq)||seq<=p.workSeq)return;p.workSeq=seq;
      p.working = !!payload.active;
    },

    // 全新按下/松开协议：短按互动，长按投掷。
    interact(ctx, { player, payload }) {
      const s = ctx.state;
      if (s.phase !== 'playing') return;
      const p = s.players[player.id];
      if (!p || !s.layout) return;
      const phase=payload?.phase,seq=Number(payload?.seq);if(!['start','release','cancel'].includes(phase)||!Number.isSafeInteger(seq))return;
      if(phase==='start'){
        if(seq<=p.interactSeq||s.elapsed<(p.nextInteractAt||0))return;p.interactSeq=seq;p.nextInteractAt=s.elapsed+INTERACT_COOLDOWN;
        if(!p.carrying)doInteract(ctx,p);else p.charge={seq,held:0};
        return;
      }
      if(!p.charge||p.charge.seq!==seq)return;
      const held=p.charge.held;p.charge=null;
      if(phase==='cancel')return;
      if(held<=THROW_THRESHOLD+1e-6)doInteract(ctx,p);else throwCarrying(ctx,p,held);
    },
  },
});
