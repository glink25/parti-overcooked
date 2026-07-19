// 胡闹厨房派对 — Parti 房间 UI（low-poly 3D）
// 约束（docs/client-api.md）：
//  - 不 import 任何 SDK，全局 parti 由 Runtime 注入
//  - onState 整体驱动渲染；onEvent 处理瞬时反馈；action 只提交意图
//  - 交互 DOM 节点保持稳定，不在快照回调里重建（docs/room-dev-harness.md）
import * as THREE from 'three';
import demoStateJson from './demoState.json';

// ---------------------------------------------------------------------------
// 常量（与 worker 约定的展示层数据）
// ---------------------------------------------------------------------------
const PLAYER_R = 0.3;
const SPEED = 3.2;

const ING = {
  tomato:   { color: 0xe53935, name: '番茄' },
  onion:    { color: 0xd9a7d8, name: '洋葱' },
  mushroom: { color: 0xc8a582, name: '菌菇' },
  lettuce:  { color: 0x7cb342, name: '生菜' },
  cucumber: { color: 0x2e7d32, name: '黄瓜' },
  carrot:   { color: 0xf57c00, name: '胡萝卜' },
  potato:   { color: 0xd9b382, name: '土豆' },
};

// 配方目录（与 worker 一致，仅用于展示与交互预演）
const RECIPES = [
  { id: 'tomato_soup',   name: '番茄浓汤',   items: ['tomato', 'tomato', 'tomato'],    cook: true,  points: 20 },
  { id: 'onion_soup',    name: '洋葱浓汤',   items: ['onion', 'onion', 'onion'],       cook: true,  points: 20 },
  { id: 'carrot_soup',   name: '胡萝卜浓汤', items: ['carrot', 'carrot', 'carrot'],    cook: true,  points: 22 },
  { id: 'potato_soup',   name: '土豆浓汤',   items: ['potato', 'potato', 'potato'],    cook: true,  points: 22 },
  { id: 'mushroom_soup', name: '菌菇浓汤',   items: ['mushroom', 'mushroom', 'onion'], cook: true,  points: 24 },
  { id: 'garden_stew',   name: '田园炖菜',   items: ['carrot', 'onion', 'potato'],     cook: true,  points: 28 },
  { id: 'garden_salad',  name: '田园沙拉',   items: ['lettuce', 'tomato'],             cook: false, points: 16 },
  { id: 'crisp_salad',   name: '爽脆沙拉',   items: ['carrot', 'lettuce'],             cook: false, points: 18 },
  { id: 'deluxe_salad',  name: '豪华沙拉',   items: ['cucumber', 'lettuce', 'tomato'], cook: false, points: 22 },
  { id: 'rainbow_salad', name: '彩虹沙拉',   items: ['carrot', 'cucumber', 'lettuce'], cook: false, points: 24 },
];
const COOKABLE = new Set();
for (const r of RECIPES) if (r.cook) for (const g of r.items) COOKABLE.add(g);
function recipeKey(items) { return items.slice().sort().join('+'); }
// 多重集合工具：have 是否为 need 的子集 / need 比 have 多哪些
function countMap(arr) { const m = {}; for (const x of arr) m[x] = (m[x] || 0) + 1; return m; }
function isSubset(have, need) {
  const h = countMap(have); const n = countMap(need);
  for (const k in h) if ((n[k] || 0) < h[k]) return false;
  return true;
}
function missingItems(have, need) {
  const h = countMap(have); const out = [];
  for (const g of need) {
    if ((h[g] || 0) > 0) h[g] -= 1;
    else out.push(g);
  }
  return out;
}

const MAP_META = [
  { id: 'classic', name: '经典厨房', ico: '🍳', desc: '左右对称的新手厨房，动线宽敞，适合磨合配合。' },
  { id: 'split',   name: '一线天',   ico: '🧱', desc: '台面高墙把厨房劈成两半，只有一条通道，记得隔空递菜！' },
  { id: 'ring',    name: '环岛餐吧', ico: '🎡', desc: '灶台集中在中央环岛，菜谱齐备，订单更密更考验分工。' },
];

const IS_TOUCH = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

// ---------------------------------------------------------------------------
// parti 接入（含浏览器直开时的演示/降级模式）
// ---------------------------------------------------------------------------
const DEMO = location.hash === '#demo';
let parti;
if (DEMO) {
  const demoState = demoStateJson;
  parti = {
    playerId: 'host',
    getState: () => demoState,
    onState: (h) => { setTimeout(() => h(demoState), 30); return () => {}; },
    onEvent: () => () => {},
    action: () => Promise.resolve({ ok: true }),
    ready: () => {},
    leave: () => {},
    log: (...a) => console.log('[parti]', ...a),
  };
} else if (window.parti) {
  parti = window.parti;
} else {
  // 兜底：无 Runtime 环境（vite dev），展示静态大厅
  const stub = { phase: 'lobby', mapId: 'classic', hostId: 'x', players: {}, orders: [], plates: { clean: 0, dirty: 0 }, score: 0, served: 0, expired: 0, timeLeft: 0 };
  parti = {
    playerId: 'x',
    getState: () => stub,
    onState: (h) => { setTimeout(() => h(stub), 30); return () => {}; },
    onEvent: () => () => {},
    action: () => Promise.resolve({ ok: true }),
    ready: () => {},
    leave: () => {},
    log: (...a) => console.log('[parti]', ...a),
  };
}

// ---------------------------------------------------------------------------
// DOM 引用（全部只创建一次，保持稳定）
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const el = {
  sceneHost: $('scene-host'),
  hud: $('hud'),
  timeVal: $('time-val'), timeChip: $('time-chip'),
  scoreVal: $('score-val'), servedVal: $('served-val'), expiredVal: $('expired-val'),
  orders: $('orders'),
  carryChip: $('carry-chip'),
  hint: $('hint'),
  countdown: $('countdown'), countdownNum: $('countdown-num'),
  lobby: $('lobby'), mapCards: $('map-cards'), lobbyPlayers: $('lobby-players'),
  startBtn: $('start-btn'), lobbyNote: $('lobby-note'),
  ended: $('ended'), endStats: $('end-stats'), endNote: $('end-note'),
  rematchBtn: $('rematch-btn'), tolobbyBtn: $('tolobby-btn'),
  touchUi: $('touch-ui'), joy: $('joy'), joyKnob: $('joy-knob'),
  btnInteract: $('btn-interact'), btnWork: $('btn-work'),
  bubble: $('bubble'), bubbleE: $('bubble-e'), bubbleQ: $('bubble-q'), bubbleInfo: $('bubble-info'),
  toasts: $('toasts'),
};

// 触屏设备气泡里显示按钮名而非键位
el.bubbleE.querySelector('kbd').textContent = IS_TOUCH ? '互动' : 'E';
el.bubbleQ.querySelector('kbd').textContent = IS_TOUCH ? '切/洗' : 'Q';

el.hint.innerHTML = IS_TOUCH
  ? '摇杆移动 · 「互动」拿/放/上菜 · 长按「切/洗」干活'
  : 'WASD/方向键 移动 · <b>E</b> 拿取/放下/上菜 · 按住 <b>Q</b> 切菜/洗碗';

function toast(text, kind = '') {
  const d = document.createElement('div');
  d.className = 'toast ' + kind;
  d.textContent = text;
  el.toasts.appendChild(d);
  setTimeout(() => d.classList.add('out'), 1900);
  setTimeout(() => d.remove(), 2350);
  while (el.toasts.children.length > 4) el.toasts.firstChild.remove();
}

// ---------------------------------------------------------------------------
// 音效（WebAudio 程序化合成，无外部资源）
// ---------------------------------------------------------------------------
let audioCtx = null;
function ac() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* ignore */ }
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
function beep(freq, dur = 0.12, type = 'sine', vol = 0.16, delay = 0) {
  const ctx = ac();
  if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}
const SFX = {
  orderNew: () => { beep(880, .1, 'triangle'); beep(1318, .14, 'triangle', .16, .1); },
  served: () => { beep(660, .09, 'triangle'); beep(880, .09, 'triangle', .16, .08); beep(1320, .18, 'triangle', .18, .16); },
  expired: () => { beep(196, .3, 'sawtooth', .12); beep(147, .35, 'sawtooth', .12, .12); },
  potReady: () => { beep(988, .12, 'sine'); beep(1319, .2, 'sine', .14, .1); },
  burnt: () => { for (let i = 0; i < 3; i++) beep(233, .14, 'square', .13, i * .18); },
  dirty: () => { beep(320, .07, 'square', .1); beep(260, .08, 'square', .1, .07); },
  pickup: () => beep(520, .06, 'triangle', .1),
  start: () => { beep(523, .1, 'triangle'); beep(784, .1, 'triangle', .16, .09); beep(1047, .22, 'triangle', .18, .18); },
  over: () => { [523, 659, 784, 1047].forEach((f, i) => beep(f, .18, 'triangle', .16, i * .15)); },
  join: () => beep(700, .08, 'sine', .1),
};
window.addEventListener('pointerdown', () => ac(), { once: true });
window.addEventListener('keydown', () => ac(), { once: true });

// ---------------------------------------------------------------------------
// three.js 基础
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
el.sceneHost.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x3a2418);

const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 200);

const hemi = new THREE.HemisphereLight(0xfff4e0, 0x8a6a55, 1.05);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe8c0, 1.6);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.bias = -0.002;
scene.add(sun);
scene.add(sun.target);

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  fitCamera();
}
window.addEventListener('resize', resize);

// ---------------------------------------------------------------------------
// 低多边形建模
// ---------------------------------------------------------------------------
const matCache = new Map();
function mat(color) {
  if (!matCache.has(color)) {
    matCache.set(color, new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.92, metalness: 0 }));
  }
  return matCache.get(color);
}
function box(w, h, d, color) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.castShadow = true;
  return m;
}
function cyl(rt, rb, h, color, seg = 12) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color));
  m.castShadow = true;
  return m;
}
function sph(r, color, ws = 10, hs = 8) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), mat(color));
  m.castShadow = true;
  return m;
}

// 食材小模型
function makeIngredientMesh(g, chopped) {
  const grp = new THREE.Group();
  const c = ING[g] ? ING[g].color : 0xffffff;
  if (chopped) {
    for (let i = 0; i < 3; i++) {
      const p = box(0.11, 0.09, 0.11, c);
      p.position.set((i - 1) * 0.13, 0.05, (i % 2) * 0.1 - 0.05);
      p.rotation.y = i * 0.7;
      grp.add(p);
    }
    return grp;
  }
  let m;
  switch (g) {
    case 'tomato': {
      m = sph(0.15, c);
      m.position.y = 0.15;
      const stem = box(0.05, 0.07, 0.05, 0x2e7d32);
      stem.position.y = 0.3;
      grp.add(m, stem);
      break;
    }
    case 'onion': {
      m = sph(0.15, c);
      m.scale.y = 1.15;
      m.position.y = 0.16;
      const tip = cyl(0.01, 0.04, 0.1, 0x8d6e63, 6);
      tip.position.y = 0.36;
      grp.add(m, tip);
      break;
    }
    case 'mushroom': {
      const stem = cyl(0.06, 0.08, 0.14, 0xf5f0e1, 8);
      stem.position.y = 0.07;
      const cap = sph(0.15, c);
      cap.scale.y = 0.62;
      cap.position.y = 0.17;
      grp.add(stem, cap);
      break;
    }
    case 'lettuce': {
      m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), mat(c));
      m.castShadow = true;
      m.position.y = 0.15;
      grp.add(m);
      break;
    }
    case 'cucumber': {
      m = cyl(0.07, 0.07, 0.34, c, 8);
      m.rotation.z = Math.PI / 2;
      m.position.y = 0.08;
      grp.add(m);
      break;
    }
    case 'carrot': {
      const bodyM = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.32, 8), mat(c));
      bodyM.castShadow = true;
      bodyM.rotation.z = Math.PI / 2.3;
      bodyM.position.y = 0.1;
      const leaf = box(0.05, 0.14, 0.05, 0x43a047);
      leaf.position.set(0.16, 0.2, 0);
      leaf.rotation.z = -0.4;
      grp.add(bodyM, leaf);
      break;
    }
    case 'potato': {
      m = sph(0.14, c, 9, 7);
      m.scale.set(1.2, 0.85, 0.95);
      m.position.y = 0.12;
      grp.add(m);
      break;
    }
    default: {
      m = sph(0.13, c);
      m.position.y = 0.13;
      grp.add(m);
    }
  }
  return grp;
}

// 盘子（可带菜）
function makePlateMesh(items) {
  const grp = new THREE.Group();
  const plate = cyl(0.22, 0.17, 0.05, 0xfafafa, 16);
  plate.position.y = 0.03;
  grp.add(plate);
  if (items && items.length) {
    items.forEach((g, i) => {
      const blob = sph(0.09, ING[g] ? ING[g].color : 0xcccccc, 8, 6);
      blob.scale.y = 0.6;
      const a = (i / items.length) * Math.PI * 2;
      blob.position.set(Math.cos(a) * 0.09, 0.08, Math.sin(a) * 0.09);
      grp.add(blob);
    });
  }
  return grp;
}

// 任意手持/台面物品
function makeItemMesh(item) {
  if (!item) return null;
  if (item.k === 'raw') return makeIngredientMesh(item.g, false);
  if (item.k === 'chopped') return makeIngredientMesh(item.g, true);
  if (item.k === 'plate') return makePlateMesh(item.items);
  if (item.k === 'dish') return makePlateMesh(item.items);
  return null;
}

// 厨师
function makeChef(colorHex) {
  const g = new THREE.Group();
  const color = new THREE.Color(colorHex).getHex();

  const body = cyl(0.26, 0.33, 0.6, color, 12);
  body.position.y = 0.44;
  const belly = box(0.3, 0.34, 0.05, 0xfafafa);
  belly.position.set(0, 0.42, 0.27);
  const head = sph(0.21, 0xffd2a1, 14, 10);
  head.position.y = 0.92;
  const hatBrim = cyl(0.23, 0.23, 0.07, 0xffffff, 14);
  hatBrim.position.y = 1.1;
  const hatTop = cyl(0.16, 0.19, 0.2, 0xffffff, 12);
  hatTop.position.y = 1.22;
  const eyeL = sph(0.028, 0x263238, 6, 5);
  eyeL.position.set(-0.075, 0.96, 0.185);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.075;
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 8), mat(0xf0b183));
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 0.9, 0.23);
  nose.castShadow = true;

  const armL = cyl(0.06, 0.06, 0.3, color, 8);
  armL.position.set(-0.32, 0.55, 0.05);
  armL.rotation.z = 0.5;
  const armR = armL.clone();
  armR.position.x = 0.32;
  armR.rotation.z = -0.5;

  const carryAnchor = new THREE.Group();
  carryAnchor.position.set(0, 1.52, 0.1);

  g.add(body, belly, head, hatBrim, hatTop, eyeL, eyeR, nose, armL, armR, carryAnchor);
  g.userData = { body, head, hatTop, carryAnchor, carryingJson: '__none__', carryNode: null };
  return g;
}

// 名字牌
function makeNameSprite(name, colorHex) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 72;
  const c = canvas.getContext('2d');
  c.fillStyle = 'rgba(43,29,22,0.72)';
  c.beginPath();
  c.roundRect(44, 8, 168, 52, 22);
  c.fill();
  c.fillStyle = colorHex;
  c.beginPath();
  c.arc(72, 34, 13, 0, Math.PI * 2);
  c.fill();
  c.lineWidth = 4;
  c.strokeStyle = 'rgba(255,255,255,.85)';
  c.stroke();
  c.fillStyle = '#fff8ec';
  c.font = 'bold 30px sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const short = String(name || '厨师').slice(0, 5);
  c.fillText(short, 148, 35);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(1.35, 0.38, 1);
  sp.position.y = 1.95;
  return sp;
}

// 状态图标（✓ 煮好 / ✕ 烧糊）
function makeIconSprite(text, colorHex) {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  const c = canvas.getContext('2d');
  c.fillStyle = colorHex;
  c.beginPath();
  c.arc(48, 48, 42, 0, Math.PI * 2);
  c.fill();
  c.lineWidth = 7;
  c.strokeStyle = '#fff';
  c.stroke();
  c.fillStyle = '#fff';
  c.font = 'bold 46px sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(text, 48, 51);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.renderOrder = 10;
  return sp;
}

// 进度条（双 sprite，fg 从左生长）
function makeProgressBar(width = 0.86) {
  const grp = new THREE.Group();
  const bg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x2b1d16, transparent: true, opacity: 0.85, depthTest: false }));
  bg.scale.set(width + 0.06, 0.13, 1);
  const fg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x66bb6a, transparent: true, opacity: 0.95, depthTest: false }));
  fg.center.set(0, 0.5);
  fg.position.set(-width / 2, 0, 0.001);
  fg.scale.set(0.001, 0.09, 1);
  grp.add(bg, fg);
  grp.userData = { fg, width };
  grp.visible = false;
  grp.renderOrder = 10;
  return grp;
}
function setBar(barGrp, frac, color) {
  if (frac == null) { barGrp.visible = false; return; }
  barGrp.visible = true;
  const { fg, width } = barGrp.userData;
  fg.scale.x = Math.max(0.001, width * Math.min(1, frac));
  if (color != null) fg.material.color.setHex(color);
}

// ---------------------------------------------------------------------------
// 地图场景构建（每局 gameSeq 变化时重建一次）
// ---------------------------------------------------------------------------
let mapGroup = null;
let builtGameSeq = -1;
let builtLayout = null;
const stationNodes = new Map(); // key 'x,z' -> { group, dyn… }

const FLOOR_A = 0xe9d9b8;
const FLOOR_B = 0xdfcda6;

function buildStation(st) {
  const g = new THREE.Group();
  g.position.set(st.x + 0.5, 0, st.z + 0.5);
  const node = { group: g, type: st.type };

  if (st.type === 'counter') {
    const body = box(0.96, 0.82, 0.96, 0x9c6b4f);
    body.position.y = 0.41;
    const top = box(1.02, 0.09, 1.02, 0xd7ccc8);
    top.position.y = 0.86;
    g.add(body, top);
    node.itemAnchor = new THREE.Group();
    node.itemAnchor.position.y = 0.95;
    g.add(node.itemAnchor);
  } else if (st.type === 'board') {
    const body = box(0.96, 0.82, 0.96, 0x8d5a3b);
    body.position.y = 0.41;
    const top = box(0.9, 0.07, 0.7, 0xf3e5c0);
    top.position.y = 0.87;
    const knife = box(0.2, 0.03, 0.06, 0xb0bec5);
    knife.position.set(0.28, 0.92, 0.24);
    knife.rotation.y = 0.5;
    const handle = box(0.09, 0.035, 0.05, 0x4e342e);
    handle.position.set(0.4, 0.92, 0.17);
    handle.rotation.y = 0.5;
    g.add(body, top, knife, handle);
    node.itemAnchor = new THREE.Group();
    node.itemAnchor.position.y = 0.93;
    g.add(node.itemAnchor);
    node.bar = makeProgressBar();
    node.bar.position.set(0, 1.45, 0);
    g.add(node.bar);
  } else if (st.type === 'stove') {
    const body = box(0.96, 0.82, 0.96, 0x546e7a);
    body.position.y = 0.41;
    const top = box(0.9, 0.06, 0.9, 0x263238);
    top.position.y = 0.86;
    const pot = cyl(0.32, 0.28, 0.3, 0xb0bec5, 16);
    pot.position.y = 1.04;
    const rim = cyl(0.34, 0.34, 0.05, 0x90a4ae, 16);
    rim.position.y = 1.2;
    const contents = cyl(0.27, 0.27, 0.06, 0xe53935, 16);
    contents.position.y = 1.16;
    contents.visible = false;
    g.add(body, top, pot, rim, contents);
    node.contentsMesh = contents;
    // 锅里食材的浮动展示（解决"不知道锅里有什么"）
    node.floaters = new THREE.Group();
    node.floaters.position.set(0, 1.62, 0);
    g.add(node.floaters);
    node.floatKey = '';
    node.iconReady = makeIconSprite('✓', '#43a047');
    node.iconReady.position.set(0, 1.86, 0);
    node.iconReady.visible = false;
    node.iconBurnt = makeIconSprite('✕', '#212121');
    node.iconBurnt.position.set(0, 1.86, 0);
    node.iconBurnt.visible = false;
    g.add(node.iconReady, node.iconBurnt);
    node.bar = makeProgressBar();
    node.bar.position.set(0, 1.5, 0);
    g.add(node.bar);
  } else if (st.type === 'sink') {
    const body = box(0.96, 0.82, 0.96, 0x78909c);
    body.position.y = 0.41;
    const basin = box(0.72, 0.1, 0.6, 0x4fc3f7);
    basin.position.y = 0.86;
    const tap = cyl(0.04, 0.04, 0.34, 0xb0bec5, 8);
    tap.position.set(-0.32, 1.02, -0.28);
    g.add(body, basin, tap);
    node.dirtyAnchor = new THREE.Group();
    node.dirtyAnchor.position.set(0.1, 0.92, 0);
    g.add(node.dirtyAnchor);
    node.bar = makeProgressBar();
    node.bar.position.set(0, 1.45, 0);
    g.add(node.bar);
  } else if (st.type === 'plates') {
    const body = box(0.96, 0.82, 0.96, 0x7d5a46);
    body.position.y = 0.41;
    const top = box(1.02, 0.08, 1.02, 0xc8b8a8);
    top.position.y = 0.86;
    g.add(body, top);
    node.stackAnchor = new THREE.Group();
    node.stackAnchor.position.y = 0.9;
    g.add(node.stackAnchor);
  } else if (st.type === 'window') {
    const body = box(1.0, 0.82, 0.9, 0xa5694f);
    body.position.y = 0.41;
    const top = box(1.06, 0.09, 0.96, 0xffe082);
    top.position.y = 0.86;
    const bell = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.16, 12), mat(0xffc107));
    bell.position.set(0.25, 0.98, 0);
    bell.castShadow = true;
    const bellBase = cyl(0.17, 0.17, 0.03, 0xffd54f, 12);
    bellBase.position.set(0.25, 0.92, 0);
    g.add(body, top, bell, bellBase);
    node.glow = new THREE.PointLight(0xffc107, 0, 3);
    node.glow.position.set(0, 1.3, 0);
    g.add(node.glow);
  } else if (st.type === 'trash') {
    const bin = cyl(0.34, 0.28, 0.78, 0x37474f, 14);
    bin.position.y = 0.39;
    const lid = cyl(0.37, 0.37, 0.07, 0x263238, 14);
    lid.position.y = 0.82;
    const knob = sph(0.06, 0x90a4ae, 8, 6);
    knob.position.y = 0.9;
    g.add(bin, lid, knob);
  } else if (st.type === 'crate') {
    const frame = box(0.96, 0.62, 0.96, 0x8d6e63);
    frame.position.y = 0.31;
    const inner = box(0.8, 0.5, 0.8, 0x6d4c41);
    inner.position.y = 0.4;
    g.add(frame, inner);
    const c = ING[st.crate] ? ING[st.crate].color : 0xffffff;
    for (let i = 0; i < 3; i++) {
      const item = sph(0.16, c, 8, 6);
      const a = (i / 3) * Math.PI * 2;
      item.position.set(Math.cos(a) * 0.2, 0.62, Math.sin(a) * 0.2);
      g.add(item);
    }
    const one = makeIngredientMesh(st.crate, false);
    one.position.set(0, 0.68, 0);
    one.scale.setScalar(1.25);
    g.add(one);
  }
  return node;
}

function buildMap(layout) {
  if (mapGroup) {
    scene.remove(mapGroup);
    mapGroup.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material && o.material.map) o.material.map.dispose();
    });
  }
  stationNodes.clear();
  mapGroup = new THREE.Group();
  builtLayout = layout;

  const { w, h, cells } = layout;
  for (let z = 0; z < h; z++) {
    for (let x = 0; x < w; x++) {
      const cell = cells[z * w + x];
      // 地板（所有格子都铺）
      const tile = box(0.995, 0.1, 0.995, (x + z) % 2 === 0 ? FLOOR_A : FLOOR_B);
      tile.position.set(x + 0.5, -0.05, z + 0.5);
      tile.receiveShadow = true;
      tile.castShadow = false;
      mapGroup.add(tile);
      if (cell === '#') {
        const wall = box(1, 1.15, 1, 0xb0613c);
        wall.position.set(x + 0.5, 0.575, z + 0.5);
        const trim = box(1.02, 0.1, 1.02, 0x8f4a2c);
        trim.position.set(x + 0.5, 1.18, z + 0.5);
        mapGroup.add(wall, trim);
      }
    }
  }
  // 外围大地面
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), mat(0x6b4a35));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(w / 2, -0.11, h / 2);
  ground.receiveShadow = true;
  mapGroup.add(ground);

  // 站台
  for (const key in layout.stationAt) {
    const st = layout.stationAt[key];
    const node = buildStation(st);
    stationNodes.set(key, node);
    mapGroup.add(node.group);
  }

  // 灯光跟随地图
  sun.position.set(w / 2 + 6, 14, h / 2 - 8);
  sun.target.position.set(w / 2, 0, h / 2);
  const R = Math.max(w, h);
  sun.shadow.camera.left = -R * 0.75;
  sun.shadow.camera.right = R * 0.75;
  sun.shadow.camera.top = R * 0.75;
  sun.shadow.camera.bottom = -R * 0.75;
  sun.shadow.camera.far = 40;
  sun.shadow.camera.updateProjectionMatrix();

  scene.add(mapGroup);
  fitCamera();
}

function fitCamera() {
  if (!builtLayout) {
    camera.position.set(8, 10, 12);
    camera.lookAt(6.5, 0, 4.5);
    return;
  }
  const { w, h } = builtLayout;
  const aspect = camera.aspect || 1;
  // 保证宽度方向完整可见：D 随地图宽与屏幕宽高比放大
  const fitW = (w / 2 + 1.2) / Math.tan(THREE.MathUtils.degToRad(24)) / Math.max(0.55, aspect);
  const fitH = h * 1.05;
  const D = Math.max(fitW, fitH, 8.5);
  camera.position.set(w / 2, D * 0.86, h / 2 + D * 0.6);
  camera.lookAt(w / 2, 0, h / 2 + 0.2);
}

// ---------------------------------------------------------------------------
// 快照应用：站台动态
// ---------------------------------------------------------------------------
function applyStations(state) {
  if (!state.stations) return;
  for (const key in state.stations) {
    const dyn = state.stations[key];
    const node = stationNodes.get(key);
    if (!node) continue;

    // 台面 / 砧板物品
    if (node.itemAnchor) {
      const json = dyn.item ? JSON.stringify(dyn.item) : '';
      if (json !== node.itemJson) {
        node.itemJson = json;
        while (node.itemAnchor.children.length) node.itemAnchor.remove(node.itemAnchor.children[0]);
        const mesh = makeItemMesh(dyn.item);
        if (mesh) node.itemAnchor.add(mesh);
        node.itemKind = dyn.item ? dyn.item.k : null;
      }
      // 砧板进度条
      if (node.type === 'board') {
        if (dyn.item && dyn.item.k === 'raw' && dyn.item.progress > 0) {
          setBar(node.bar, dyn.item.progress / 3, 0x66bb6a);
        } else {
          setBar(node.bar, null);
        }
      }
    }

    // 灶台
    if (node.type === 'stove') {
      const has = dyn.contents && dyn.contents.length > 0;
      node.contentsMesh.visible = has;
      if (has) {
        const col = dyn.phase === 'burnt' ? 0x1b1b1b : (ING[dyn.contents[0]] ? ING[dyn.contents[0]].color : 0xaaaaaa);
        node.contentsMesh.material = mat(col);
        node.contentsMesh.position.y = 1.16 + Math.sin(perfNow * 3 + node.group.position.x) * 0.008;
      }
      // 浮动食材展示
      const fkey = has ? dyn.contents.join(',') : '';
      if (fkey !== node.floatKey) {
        node.floatKey = fkey;
        while (node.floaters.children.length) node.floaters.remove(node.floaters.children[0]);
        (dyn.contents || []).forEach((g, i) => {
          const im = makeIngredientMesh(g, false);
          im.scale.setScalar(0.72);
          im.position.set((i - (dyn.contents.length - 1) / 2) * 0.34, 0, 0);
          node.floaters.add(im);
        });
      }
      node.floaters.visible = has;
      if (has) {
        node.floaters.children.forEach((ch, i) => { ch.position.y = Math.sin(perfNow * 2.2 + i * 1.7) * 0.045; });
      }
      if (dyn.phase === 'cooking') {
        setBar(node.bar, dyn.t / 12, 0xffb300);
        node.iconReady.visible = false;
        node.iconBurnt.visible = false;
      } else if (dyn.phase === 'ready') {
        setBar(node.bar, dyn.t / 12, 0xef5350);
        node.iconReady.visible = true;
        node.iconBurnt.visible = false;
        const ps = 0.42 + Math.sin(perfNow * 5) * 0.07;
        node.iconReady.scale.set(ps, ps, 1);
      } else if (dyn.phase === 'burnt') {
        setBar(node.bar, null);
        node.iconReady.visible = false;
        node.iconBurnt.visible = true;
        node.iconBurnt.scale.set(0.42, 0.42, 1);
      } else {
        setBar(node.bar, null);
        node.iconReady.visible = false;
        node.iconBurnt.visible = false;
      }
    }

    // 水槽：脏盘堆 + 洗碗进度
    if (node.type === 'sink') {
      const dirty = state.plates ? state.plates.dirty : 0;
      if (dirty !== node.dirtyCount) {
        node.dirtyCount = dirty;
        while (node.dirtyAnchor.children.length) node.dirtyAnchor.remove(node.dirtyAnchor.children[0]);
        for (let i = 0; i < Math.min(dirty, 6); i++) {
          const p = cyl(0.18, 0.14, 0.035, 0x9e9e9e, 12);
          p.position.y = i * 0.045;
          node.dirtyAnchor.add(p);
        }
      }
      if (state.plates && state.plates.washT > 0 && dirty > 0) {
        setBar(node.bar, state.plates.washT / 4, 0x4fc3f7);
      } else {
        setBar(node.bar, null);
      }
    }

    // 盘子架：干净盘堆
    if (node.type === 'plates') {
      const clean = state.plates ? state.plates.clean : 0;
      if (clean !== node.cleanCount) {
        node.cleanCount = clean;
        while (node.stackAnchor.children.length) node.stackAnchor.remove(node.stackAnchor.children[0]);
        for (let i = 0; i < Math.min(clean, 6); i++) {
          const p = cyl(0.2, 0.16, 0.035, 0xfafafa, 14);
          p.position.y = i * 0.045;
          node.stackAnchor.add(p);
        }
      }
    }

    // 出菜口：有订单时亮灯
    if (node.type === 'window') {
      node.glow.intensity = state.orders && state.orders.length ? 1.6 + Math.sin(perfNow * 4) * 0.5 : 0;
    }
  }
}

// ---------------------------------------------------------------------------
// 快照应用：玩家
// ---------------------------------------------------------------------------
const playerNodes = new Map(); // id -> { group, label, render:{x,z}, target:{x,z} }
let selfPos = null;      // 本地预测位置
let serverSelf = null;   // 权威位置
let selfInput = { dx: 0, dz: 0 };

function applyPlayers(state, dt) {
  const seen = new Set();
  const myId = parti.playerId;
  for (const id in state.players) {
    const p = state.players[id];
    seen.add(id);
    let node = playerNodes.get(id);
    if (!node) {
      const group = makeChef(p.color);
      const label = makeNameSprite(p.name, p.color);
      group.add(label);
      scene.add(group);
      node = { group, render: { x: p.x, z: p.z }, target: { x: p.x, z: p.z }, label };
      playerNodes.set(id, node);
    }
    node.target.x = p.x;
    node.target.z = p.z;

    // 手持物
    const cJson = p.carrying ? JSON.stringify(p.carrying) : '';
    if (cJson !== node.group.userData.carryingJson) {
      node.group.userData.carryingJson = cJson;
      const anchor = node.group.userData.carryAnchor;
      while (anchor.children.length) anchor.remove(anchor.children[0]);
      const mesh = makeItemMesh(p.carrying);
      if (mesh) {
        mesh.scale.setScalar(1.15);
        anchor.add(mesh);
      }
      if (id === myId && cJson) SFX.pickup();
    }

    // 朝向
    if (p.face && (p.face.dx || p.face.dz)) {
      node.group.rotation.y = Math.atan2(p.face.dx, p.face.dz);
    }

    // 工作动画（切菜/洗碗时身体起伏）
    const ud = node.group.userData;
    if (p.working) {
      ud.body.position.y = 0.44 + Math.abs(Math.sin(perfNow * 9)) * 0.09;
      ud.hatTop.position.y = 1.22 + Math.abs(Math.sin(perfNow * 9)) * 0.05;
    } else {
      ud.body.position.y = 0.44;
      ud.hatTop.position.y = 1.22;
    }
  }
  // 移除离开的玩家
  for (const [id, node] of playerNodes) {
    if (!seen.has(id)) {
      scene.remove(node.group);
      playerNodes.delete(id);
    }
  }

  // 本机预测位置跟踪
  const me = myId && state.players[myId];
  if (me) {
    serverSelf = { x: me.x, z: me.z };
    if (!selfPos) selfPos = { x: me.x, z: me.z };
  } else {
    serverSelf = null;
    selfPos = null;
  }
}

// 与 worker 一致的碰撞（客户端预测用）
function cellBlocked(layout, cx, cz) {
  if (cx < 0 || cz < 0 || cx >= layout.w || cz >= layout.h) return true;
  return layout.cells[cz * layout.w + cx] !== '.';
}
function collides(layout, x, z, r) {
  const cx = Math.floor(x);
  const cz = Math.floor(z);
  for (let j = cz - 1; j <= cz + 1; j++) {
    for (let i = cx - 1; i <= cx + 1; i++) {
      if (!cellBlocked(layout, i, j)) continue;
      const nx = Math.max(i, Math.min(x, i + 1));
      const nz = Math.max(j, Math.min(z, j + 1));
      const dx = x - nx;
      const dz = z - nz;
      if (dx * dx + dz * dz < r * r) return true;
    }
  }
  return false;
}

function stepPrediction(dt) {
  if (!selfPos || !builtLayout || !latestState || latestState.phase !== 'playing') return;
  const ix = selfInput.dx;
  const iz = selfInput.dz;
  if (ix || iz) {
    const nx = selfPos.x + ix * SPEED * dt;
    if (!collides(builtLayout, nx, selfPos.z, PLAYER_R)) selfPos.x = nx;
    const nz = selfPos.z + iz * SPEED * dt;
    if (!collides(builtLayout, selfPos.x, nz, PLAYER_R)) selfPos.z = nz;
  }
  if (serverSelf) {
    const ex = serverSelf.x - selfPos.x;
    const ez = serverSelf.z - selfPos.z;
    const err = Math.hypot(ex, ez);
    if (err > 1.5) {
      selfPos.x = serverSelf.x;
      selfPos.z = serverSelf.z;
    } else if (err > 0.001) {
      const k = Math.min(1, dt * 2.2);
      selfPos.x += ex * k;
      selfPos.z += ez * k;
    }
  }
}

function interpolatePlayers(dt) {
  const myId = parti.playerId;
  for (const [id, node] of playerNodes) {
    if (id === myId && selfPos && latestState && latestState.phase === 'playing') {
      node.render.x = selfPos.x;
      node.render.z = selfPos.z;
    } else {
      const dx = node.target.x - node.render.x;
      const dz = node.target.z - node.render.z;
      if (Math.hypot(dx, dz) > 2) {
        node.render.x = node.target.x;
        node.render.z = node.target.z;
      } else {
        const k = Math.min(1, dt * 13);
        node.render.x += dx * k;
        node.render.z += dz * k;
      }
    }
    node.group.position.set(node.render.x, 0, node.render.z);
    // 手持物轻微浮动
    const anchor = node.group.userData.carryAnchor;
    if (anchor.children.length) anchor.position.y = 1.52 + Math.sin(perfNow * 2.4 + node.render.x) * 0.03;
  }
}

// ---------------------------------------------------------------------------
// 站台操作气泡与目标高亮（与 worker 规则一致的客户端交互预演）
// ---------------------------------------------------------------------------
const targetRing = new THREE.Mesh(
  new THREE.TorusGeometry(0.56, 0.05, 8, 28),
  new THREE.MeshBasicMaterial({ color: 0xffd54f, transparent: true, opacity: 0.85, depthWrite: false }),
);
targetRing.rotation.x = -Math.PI / 2;
targetRing.visible = false;
scene.add(targetRing);

function itemLabel(item) {
  if (!item) return '';
  if (item.k === 'raw') return ING[item.g].name + '（未切）';
  if (item.k === 'chopped') return ING[item.g].name + '（已切）';
  if (item.k === 'plate') return '空盘子';
  if (item.k === 'dish') return item.items.map((g) => ING[g].name).join('+');
  return '';
}

// 计算当前站台可执行的操作：{ e, q, info, warn }
function stationHint(st, dyn, me, state) {
  const c = me.carrying;
  if (st.type === 'crate') {
    return c ? { info: '手上拿满了，先放下' } : { e: '拿取' + ING[st.crate].name };
  }
  if (st.type === 'counter' || st.type === 'board') {
    const item = dyn && dyn.item;
    if (!c && item) {
      const h = { e: '拿起' + itemLabel(item) };
      if (st.type === 'board' && item.k === 'raw') h.q = '切菜（按住）';
      return h;
    }
    if (c && !item) {
      if (st.type === 'board' && !(c.k === 'raw' || c.k === 'chopped')) return { info: '砧板只能放食材' };
      return { e: '放下' + itemLabel(c) };
    }
    if (c && item) {
      if (c.k === 'chopped' && (item.k === 'plate' || item.k === 'dish') && item.items.length < 3) {
        return { e: '把' + ING[c.g].name + '放上盘子' };
      }
      return { info: '被占用了' };
    }
    return { info: st.type === 'board' ? '砧板：放食材后按住切菜' : '台面：临时放东西' };
  }
  if (st.type === 'stove') {
    const pot = dyn;
    if (!pot) return null;
    const names = pot.contents.map((g) => ING[g].name);
    if (pot.phase === 'cooking') {
      return { info: `🔥 炖煮中 ${Math.round((pot.t / 12) * 100)}%｜${names.join('+')}` };
    }
    if (pot.phase === 'ready') {
      if (c && c.k === 'plate' && c.items.length === 0) return { e: `装盘出锅｜${names.join('+')}` };
      return { info: `汤好了！带空盘子来装｜${names.join('+')}`, warn: true };
    }
    if (pot.phase === 'burnt') {
      return c ? { info: '锅烧糊了，空手来清理', warn: true } : { e: '倒掉糊锅', warn: true };
    }
    // idle
    if (c && c.k === 'chopped') {
      if (!COOKABLE.has(c.g)) return { info: `${ING[c.g].name}不能下锅，只能做沙拉` };
      if (pot.contents.length >= 3) return { info: '锅满了' };
      const after = pot.contents.concat([c.g]);
      const exact = RECIPES.find((r) => r.cook && recipeKey(r.items) === recipeKey(after));
      if (exact) return { e: `下锅（即可开煮${exact.name}）` };
      const cand = RECIPES.find((r) => r.cook && isSubset(after, r.items));
      if (cand) {
        const need = missingItems(after, cand.items);
        return { e: `下锅｜还需${need.map((g) => ING[g].name).join('+')}开煮`, info: pot.contents.length ? `锅里：${names.join('+')}` : null };
      }
      return { e: '下锅', info: '⚠️ 这个组合会煮糊！', warn: true };
    }
    if (c && c.k === 'raw') return { info: '生的不能下锅，先去砧板切碎' };
    if (c && c.k === 'plate') {
      return { info: pot.contents.length ? `还没煮好｜锅里：${names.join('+')}` : '锅是空的，先放切碎的食材' };
    }
    if (c && c.k === 'dish') return { info: '这道菜已经装好了，端去出菜口' };
    if (!c && pot.contents.length) {
      const cand = RECIPES.find((r) => r.cook && isSubset(pot.contents, r.items));
      if (cand) {
        const need = missingItems(pot.contents, cand.items);
        return { info: `锅里：${names.join('+')}｜还需${need.map((g) => ING[g].name).join('+')}开煮` };
      }
      return { e: '倒掉', info: '组合不对，已无法成汤', warn: true };
    }
    return { info: '把切碎的食材放进来煮' };
  }
  if (st.type === 'plates') {
    if (c) return { info: '先放下手上的东西' };
    return state.plates.clean > 0 ? { e: `拿盘子（剩${state.plates.clean}）` } : { info: '盘子用完了，去水槽洗', warn: true };
  }
  if (st.type === 'window') {
    if (c && c.k === 'dish') {
      const key = recipeKey(c.items);
      const o = (state.orders || []).find((x) => x.key === key);
      return o ? { e: `上菜｜${o.name} +${o.points}分` } : { info: '没有这道菜品的订单', warn: true };
    }
    if (c) return { info: '上菜需要装好盘的菜品' };
    return { info: '出菜口：把装好盘的菜端来' };
  }
  if (st.type === 'trash') {
    return c ? { e: '扔掉' + itemLabel(c) } : { info: '垃圾桶：扔手上的东西' };
  }
  if (st.type === 'sink') {
    if (state.plates.dirty > 0 && !c) return { q: '洗碗（按住）', info: `脏盘子 ×${state.plates.dirty}` };
    if (state.plates.dirty > 0) return { info: '洗碗需要空手' };
    return { info: '水槽很干净' };
  }
  return null;
}

const bubbleVec = new THREE.Vector3();
let bubbleLastKey = '';
function updateBubble() {
  let target = null;
  if (latestState && latestState.phase === 'playing' && builtLayout) {
    const me = latestState.players[parti.playerId];
    if (me) {
      const face = me.face || { dx: 0, dz: 1 };
      const px = selfPos ? selfPos.x : me.x;
      const pz = selfPos ? selfPos.z : me.z;
      const tx = Math.floor(px + face.dx * 0.95);
      const tz = Math.floor(pz + face.dz * 0.95);
      const st = builtLayout.stationAt[tx + ',' + tz];
      if (st) target = { st, key: tx + ',' + tz, me };
    }
  }

  if (!target) {
    targetRing.visible = false;
    el.bubble.classList.add('hidden');
    bubbleLastKey = '';
    return;
  }

  // 高亮环
  targetRing.visible = true;
  targetRing.position.set(target.st.x + 0.5, 0.06, target.st.z + 0.5);
  targetRing.material.opacity = 0.65 + Math.sin(perfNow * 5) * 0.25;

  // 气泡内容（仅在变化时写 DOM）
  const hint = stationHint(target.st, latestState.stations[target.key], target.me, latestState);
  const contentKey = hint ? `${hint.e}|${hint.q}|${hint.info}|${hint.warn}` : '';
  if (contentKey !== bubbleLastKey) {
    bubbleLastKey = contentKey;
    if (!hint || (!hint.e && !hint.q && !hint.info)) {
      el.bubble.classList.add('hidden');
    } else {
      el.bubble.classList.remove('hidden');
      el.bubbleE.classList.toggle('hidden', !hint.e);
      el.bubbleQ.classList.toggle('hidden', !hint.q);
      el.bubbleInfo.classList.toggle('hidden', !hint.info);
      if (hint.e) el.bubbleE.querySelector('span').textContent = hint.e;
      if (hint.q) el.bubbleQ.querySelector('span').textContent = hint.q;
      if (hint.info) el.bubbleInfo.querySelector('span').textContent = hint.info;
      el.bubbleInfo.classList.toggle('warn', !!hint.warn);
    }
  }
  if (hint && (hint.e || hint.q || hint.info)) {
    // 投影到屏幕坐标
    bubbleVec.set(target.st.x + 0.5, 2.05, target.st.z + 0.5).project(camera);
    if (bubbleVec.z > 1) {
      el.bubble.classList.add('hidden');
    } else {
      el.bubble.classList.remove('hidden');
      const x = (bubbleVec.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-bubbleVec.y * 0.5 + 0.5) * window.innerHeight;
      el.bubble.style.left = Math.round(x) + 'px';
      el.bubble.style.top = Math.round(y) + 'px';
    }
  }
}

// ---------------------------------------------------------------------------
// 快照应用：HUD 与覆盖层
// ---------------------------------------------------------------------------
let currentPhase = null;
const orderCards = new Map(); // orderId -> { card, barFill }

function fmtTime(sec) {
  const s = Math.max(0, Math.ceil(sec));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

function ingDotsHtml(key) {
  return key.split('+').map((g) => {
    const c = ING[g] ? '#' + ING[g].color.toString(16).padStart(6, '0') : '#999';
    return `<i style="background:${c}"></i>`;
  }).join('');
}

function applyOrders(state) {
  const seen = new Set();
  for (const o of state.orders || []) {
    seen.add(o.id);
    let card = orderCards.get(o.id);
    if (!card) {
      const d = document.createElement('div');
      d.className = 'order-card';
      d.innerHTML = `<div class="o-name">${o.name} · ${o.points}分</div>
        <div class="o-dots">${ingDotsHtml(o.key)}</div>
        <div class="o-bar"><i></i></div>`;
      el.orders.appendChild(d);
      card = { el: d, fill: d.querySelector('.o-bar i') };
      orderCards.set(o.id, card);
    }
    const frac = Math.max(0, o.t / o.total);
    card.fill.style.width = (frac * 100).toFixed(1) + '%';
    card.el.classList.toggle('urgent', o.t < 20);
  }
  for (const [id, card] of orderCards) {
    if (!seen.has(id)) {
      card.el.remove();
      orderCards.delete(id);
    }
  }
}

function applyHud(state) {
  el.timeVal.textContent = fmtTime(state.timeLeft || 0);
  el.timeChip.classList.toggle('low', (state.timeLeft || 0) < 30);
  el.scoreVal.textContent = String(state.score || 0);
  el.servedVal.textContent = String(state.served || 0);
  el.expiredVal.textContent = String(state.expired || 0);
  applyOrders(state);

  // 手持提示
  const me = parti.playerId && state.players ? state.players[parti.playerId] : null;
  if (me && me.carrying) {
    const c = me.carrying;
    let text = '';
    if (c.k === 'raw') text = `手上：${ING[c.g].name}（未切）`;
    else if (c.k === 'chopped') text = `手上：${ING[c.g].name}（已切）`;
    else if (c.k === 'plate') text = '手上：空盘子';
    else if (c.k === 'dish') text = `手上：${c.items.map((g) => ING[g].name).join('+')}`;
    el.carryChip.textContent = text;
    el.carryChip.classList.remove('hidden');
  } else {
    el.carryChip.classList.add('hidden');
  }
}

// ---- 大厅 ----
const mapCardEls = new Map();
function buildLobbyOnce() {
  for (const m of MAP_META) {
    const btn = document.createElement('button');
    btn.className = 'map-card';
    btn.innerHTML = `<div class="m-ico">${m.ico}</div><div class="m-name">${m.name}</div><div class="m-desc">${m.desc}</div>`;
    btn.onclick = () => parti.action('selectMap', { mapId: m.id });
    el.mapCards.appendChild(btn);
    mapCardEls.set(m.id, btn);
  }
  el.startBtn.onclick = () => parti.action('start');
  el.rematchBtn.onclick = () => parti.action('rematch');
  el.tolobbyBtn.onclick = () => parti.action('toLobby');
}
buildLobbyOnce();

const lobbyPlayerRows = new Map();
function applyLobby(state) {
  const isHost = parti.playerId && state.hostId === parti.playerId;
  const count = Object.keys(state.players || {}).length;

  for (const m of MAP_META) {
    const card = mapCardEls.get(m.id);
    card.classList.toggle('sel', state.mapId === m.id);
    card.classList.toggle('locked', !isHost);
  }

  const seen = new Set();
  for (const id in state.players || {}) {
    seen.add(id);
    let row = lobbyPlayerRows.get(id);
    const p = state.players[id];
    if (!row) {
      row = document.createElement('span');
      row.className = 'p-row';
      el.lobbyPlayers.appendChild(row);
      lobbyPlayerRows.set(id, row);
    }
    row.innerHTML = `<i style="background:${p.color}"></i>${p.name}${id === state.hostId ? '<span class="crown">👑</span>' : ''}`;
  }
  for (const [id, row] of lobbyPlayerRows) {
    if (!seen.has(id)) {
      row.remove();
      lobbyPlayerRows.delete(id);
    }
  }

  el.startBtn.classList.toggle('hidden', !isHost);
  el.startBtn.disabled = count < 2;
  el.lobbyNote.textContent = isHost
    ? (count < 2 ? '至少需要 2 名玩家才能开火（分享邀请链接给朋友吧）' : `${count} 名厨师就位，选择地图后开火！`)
    : '等待房主选择地图并开始…（2-4 人）';
}

// ---- 结算 ----
function applyEnded(state) {
  const isHost = parti.playerId && state.hostId === parti.playerId;
  el.endStats.innerHTML = '';
  const stats = [
    { k: '最终得分', v: state.score || 0, hero: true },
    { k: '成功上菜', v: state.served || 0 },
    { k: '超时订单', v: state.expired || 0 },
    { k: '出餐率', v: (state.served || 0) + (state.expired || 0) > 0 ? Math.round(100 * (state.served || 0) / ((state.served || 0) + (state.expired || 0))) + '%' : '—' },
  ];
  for (const st of stats) {
    const d = document.createElement('div');
    d.className = 'stat' + (st.hero ? ' hero' : '');
    d.innerHTML = `<div class="v">${st.v}</div><div class="k">${st.k}</div>`;
    el.endStats.appendChild(d);
  }
  el.rematchBtn.classList.toggle('hidden', !isHost);
  el.tolobbyBtn.classList.toggle('hidden', !isHost);
  el.endNote.textContent = isHost ? '' : '等待房主选择…';
}

function setPhase(phase, state) {
  if (phase === currentPhase) return;
  currentPhase = phase;
  el.lobby.classList.toggle('hidden', phase !== 'lobby');
  el.ended.classList.toggle('hidden', phase !== 'ended');
  el.hud.classList.toggle('hidden', !(phase === 'playing' || phase === 'countdown'));
  el.countdown.classList.toggle('hidden', phase !== 'countdown');
  el.touchUi.classList.toggle('hidden', !(IS_TOUCH && phase === 'playing'));
  if (phase === 'ended') applyEnded(state);
  if (phase === 'lobby') {
    // 离开对局时清掉 3D 场景以外的杂项
    orderCards.forEach((c) => c.el.remove());
    orderCards.clear();
  }
}

// ---------------------------------------------------------------------------
// parti 接线
// ---------------------------------------------------------------------------
let latestState = null;

parti.onState((state) => {
  latestState = state;
  if (state.layout && state.gameSeq !== builtGameSeq) {
    builtGameSeq = state.gameSeq;
    buildMap(state.layout);
    selfPos = null;
    serverSelf = null;
  }
  if (!state.layout && builtLayout) {
    builtLayout = null;
    builtGameSeq = -1;
    if (mapGroup) { scene.remove(mapGroup); mapGroup = null; }
    stationNodes.clear();
  }
  setPhase(state.phase, state);
  if (state.phase === 'lobby') applyLobby(state);
  if (state.phase === 'countdown') {
    el.countdownNum.textContent = String(Math.max(1, Math.ceil(state.countdown || 0)));
  }
  if (state.phase === 'playing' || state.phase === 'countdown') {
    applyHud(state);
    applyPlayers(state);
    applyStations(state);
  }
});

parti.onEvent('game:countdown', (p) => { toast(`地图：${p.mapName || ''}，各就各位！`); SFX.join(); });
parti.onEvent('game:start', () => { toast('开工！🍳', 'good'); SFX.start(); });
parti.onEvent('order:new', (p) => { toast(`新订单：${p.name}`); SFX.orderNew(); });
parti.onEvent('order:served', (p) => { toast(`上菜成功 +${p.points + p.tip}（含小费 ${p.tip}）`, 'good'); SFX.served(); });
parti.onEvent('order:expired', (p) => { toast(`订单超时：${p.name}`, 'bad'); SFX.expired(); });
parti.onEvent('pot:ready', () => { toast('汤煮好了，快装盘！', 'good'); SFX.potReady(); });
parti.onEvent('pot:burnt', () => { toast('锅烧糊了！空手去倒掉', 'bad'); SFX.burnt(); });
parti.onEvent('plate:dirty', () => { toast('脏盘子回到水槽了'); SFX.dirty(); });
parti.onEvent('game:over', (p) => { SFX.over(); });
parti.onEvent('player:joined', (p) => { toast(`${p.name} 加入了厨房`); SFX.join(); });
parti.onEvent('__error', (p) => { parti.log('room error', p); });

// ---------------------------------------------------------------------------
// 输入：键盘
// ---------------------------------------------------------------------------
const keysDown = new Set();
let lastSentMove = { dx: 0, dz: 0 };
let workHeld = false;

const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const INTERACT_KEYS = new Set(['KeyE', 'Space', 'KeyJ']);
const WORK_KEYS = new Set(['KeyQ', 'KeyF', 'KeyK']);

function keyboardVector() {
  let dx = 0;
  let dz = 0;
  if (keysDown.has('KeyW') || keysDown.has('ArrowUp')) dz -= 1;
  if (keysDown.has('KeyS') || keysDown.has('ArrowDown')) dz += 1;
  if (keysDown.has('KeyA') || keysDown.has('ArrowLeft')) dx -= 1;
  if (keysDown.has('KeyD') || keysDown.has('ArrowRight')) dx += 1;
  const len = Math.hypot(dx, dz);
  if (len > 0) { dx /= len; dz /= len; }
  return { dx, dz };
}

function setWork(on) {
  if (workHeld === on) return;
  workHeld = on;
  parti.action('work', { on });
  el.btnWork.classList.toggle('on', on);
}

function sendMove(v) {
  if (Math.abs(v.dx - lastSentMove.dx) < 0.001 && Math.abs(v.dz - lastSentMove.dz) < 0.001) return;
  lastSentMove = { dx: v.dx, dz: v.dz };
  parti.action('move', { dx: v.dx, dz: v.dz });
}

window.addEventListener('keydown', (e) => {
  if (e.repeat) {
    if (MOVE_KEYS.has(e.code) || e.code === 'Space') e.preventDefault();
    return;
  }
  if (MOVE_KEYS.has(e.code) || INTERACT_KEYS.has(e.code) || WORK_KEYS.has(e.code)) e.preventDefault();
  if (MOVE_KEYS.has(e.code)) keysDown.add(e.code);
  else if (INTERACT_KEYS.has(e.code)) parti.action('interact');
  else if (WORK_KEYS.has(e.code)) setWork(true);
});
window.addEventListener('keyup', (e) => {
  if (MOVE_KEYS.has(e.code)) keysDown.delete(e.code);
  else if (WORK_KEYS.has(e.code)) {
    // 还有其他工作键按着则保持
    for (const k of WORK_KEYS) if (k !== e.code && keysDown.has(k)) return;
    setWork(false);
  }
});
function releaseAllInput() {
  keysDown.clear();
  setWork(false);
  sendMove({ dx: 0, dz: 0 });
  selfInput = { dx: 0, dz: 0 };
  resetJoystick();
}
window.addEventListener('blur', releaseAllInput);
document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAllInput(); });

// ---------------------------------------------------------------------------
// 输入：触屏摇杆 + 按钮（节点稳定，妥善处理 pointer 释放）
// ---------------------------------------------------------------------------
let joyPointerId = null;
let joyVec = { dx: 0, dz: 0 };
const JOY_R = 40;

function resetJoystick() {
  joyPointerId = null;
  joyVec = { dx: 0, dz: 0 };
  el.joyKnob.style.transform = 'translate(-50%,-50%)';
}

function updateJoystick(e) {
  const rect = el.joy.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  let dx = e.clientX - cx;
  let dy = e.clientY - cy;
  const len = Math.hypot(dx, dy);
  if (len > JOY_R) { dx = dx / len * JOY_R; dy = dy / len * JOY_R; }
  el.joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  const mag = Math.min(1, len / JOY_R);
  if (mag < 0.18) {
    joyVec = { dx: 0, dz: 0 };
  } else {
    const n = Math.hypot(dx, dy) || 1;
    joyVec = { dx: dx / n * mag, dz: dy / n * mag };
  }
}

el.joy.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  joyPointerId = e.pointerId;
  el.joy.setPointerCapture(e.pointerId);
  updateJoystick(e);
});
el.joy.addEventListener('pointermove', (e) => {
  if (e.pointerId !== joyPointerId) return;
  e.preventDefault();
  updateJoystick(e);
});
function joyRelease(e) {
  if (e.pointerId !== joyPointerId) return;
  resetJoystick();
}
el.joy.addEventListener('pointerup', joyRelease);
el.joy.addEventListener('pointercancel', joyRelease);
el.joy.addEventListener('lostpointercapture', joyRelease);

el.btnInteract.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  parti.action('interact');
});
el.btnWork.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  el.btnWork.setPointerCapture(e.pointerId);
  setWork(true);
});
function workRelease() { setWork(false); }
el.btnWork.addEventListener('pointerup', workRelease);
el.btnWork.addEventListener('pointercancel', workRelease);
el.btnWork.addEventListener('lostpointercapture', workRelease);

// ---------------------------------------------------------------------------
// 主循环
// ---------------------------------------------------------------------------
let perfNow = 0;
let lastTs = 0;

function frame(ts) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0.016);
  lastTs = ts;
  perfNow = ts / 1000;

  // 输入合成：键盘优先，其次摇杆
  const kb = keyboardVector();
  const v = (kb.dx || kb.dz) ? kb : joyVec;
  selfInput = v;
  if (latestState && latestState.phase === 'playing') {
    sendMove(v);
  }

  stepPrediction(dt);
  interpolatePlayers(dt);
  updateBubble();

  // 灶台汤水翻滚等时间动画在 applyStations 中用 perfNow 驱动
  if (latestState && (latestState.phase === 'playing' || latestState.phase === 'countdown') && stationNodes.size) {
    applyStations(latestState);
  }

  renderer.render(scene, camera);
}

resize();
requestAnimationFrame(frame);
parti.ready();
