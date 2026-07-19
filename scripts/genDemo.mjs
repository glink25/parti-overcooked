// 生成演示快照：用真实 worker 逻辑跑出一帧丰富的 playing 状态，供客户端 #demo 模式使用
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRoomDefinition, makeCtx, createRoom, join, act, pump } from '../verifier/v1/harness.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const def = loadRoomDefinition(path.join(root, 'src/worker/index.js'));
const ctx = makeCtx(def);
createRoom(def, ctx);
join(ctx, def, 'p2', '小明');
join(ctx, def, 'p3', '阿花');
act(ctx, def, 'host', 'start');
pump(ctx, 31); // 进入 playing

const s = ctx.state;
// 摆拍：三名玩家各就各位
const p1 = s.players.host;
p1.x = 10.5; p1.z = 4.5; p1.face = { dx: 0, dz: 1 };
p1.carrying = { k: 'chopped', g: 'tomato', progress: 0 };
const p2 = s.players.p2;
p2.x = 7.5; p2.z = 2.5; p2.face = { dx: 0, dz: 1 };
p2.carrying = { k: 'plate', items: [] };
const p3 = s.players.p3;
p3.x = 3.5; p3.z = 4.5; p3.face = { dx: 0, dz: 1 };
p3.working = true;

// 锅在煮番茄汤；砧板上有切到一半的胡萝卜；台面上有待装盘的沙拉
s.stations['10,5'].contents = ['tomato', 'tomato', 'tomato'];
s.stations['10,5'].phase = 'cooking';
s.stations['10,5'].t = 5;
s.stations['12,5'].contents = ['carrot', 'carrot'];
s.stations['3,5'].item = { k: 'raw', g: 'carrot', progress: 1.6 };
s.stations['3,3'].item = { k: 'raw', g: 'lettuce', progress: 0 };
s.stations['11,3'].item = { k: 'dish', items: ['lettuce', 'tomato'] };

s.orders.push(
  { id: 'o1', key: 'tomato+tomato+tomato', name: '番茄浓汤', points: 20, t: 62, total: 80 },
  { id: 'o2', key: 'lettuce+tomato', name: '田园沙拉', points: 16, t: 41, total: 80 },
  { id: 'o3', key: 'carrot+carrot+carrot', name: '胡萝卜浓汤', points: 22, t: 73, total: 80 },
  { id: 'o4', key: 'carrot+lettuce', name: '爽脆沙拉', points: 18, t: 55, total: 80 },
);
s.score = 46;
s.served = 2;
s.timeLeft = 127;
s.plates.dirty = 1;
s.plates.due = [4.5];

writeFileSync(path.join(root, 'src/client/demoState.json'), JSON.stringify(s, null, 2));
console.log('demoState.json written,', JSON.stringify(s, null, 2).length, 'bytes');
