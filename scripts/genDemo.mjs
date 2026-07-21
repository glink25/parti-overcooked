// 生成演示快照：用真实 worker 逻辑跑出一帧丰富的 playing 状态，供客户端 #demo 模式使用
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWorker, makeContext, join, action, pump, worldPosition } from '../tests/helpers/worker-runtime.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const def = loadWorker(path.join(root, 'src/worker/index.js'));
const ctx = makeContext(def, 19);
join(ctx, def, 'p2', '小明');
join(ctx, def, 'p3', '阿花');
action(ctx, def, 'host', 'start');
pump(ctx, 31); // 进入 playing

const s = ctx.state;
// 摆拍：三名玩家各就各位
const spawnAt=(index)=>worldPosition(s,s.layout.spawns[index]);
const p1 = s.players.host; Object.assign(p1,spawnAt(0));
p1.face = { dx: 0, dz: 1 };
p1.carrying = { k: 'chopped', g: 'tomato', progress: 0 };
const p2 = s.players.p2;
Object.assign(p2,spawnAt(1)); p2.face = { dx: 0, dz: 1 };
p2.carrying = { k: 'plate', items: [] };
const p3 = s.players.p3;
Object.assign(p3,spawnAt(2)); p3.face = { dx: 0, dz: 1 };
p3.working = true;

// 锅在煮番茄汤；砧板上有切到一半的胡萝卜；台面上有待装盘的沙拉
const stoves=s.layout.stations.filter((entry)=>entry.type==='stove');
if(stoves[0])Object.assign(s.stations[stoves[0].id],{contents:[{ingredient:'tomato',prep:'chopped'},{ingredient:'tomato',prep:'chopped'},{ingredient:'tomato',prep:'chopped'}],phase:'cooking',t:5});
if(stoves[1])Object.assign(s.stations[stoves[1].id],{contents:[{ingredient:'carrot',prep:'chopped'}],phase:'idle'});
const boards=s.layout.stations.filter((entry)=>entry.type==='board');if(boards[0])s.stations[boards[0].id].item={k:'raw',g:'carrot',progress:1.6};
const surfaces=s.layout.stations.filter((entry)=>entry.type==='counter'||(entry.type==='conveyorPort'&&entry.portMode==='output'));if(surfaces[0])s.stations[surfaces[0].id].item={k:'dish',items:[{ingredient:'lettuce',prep:'chopped'},{ingredient:'tomato',prep:'whole'}]};
const beltInput=s.layout.stations.find((entry)=>entry.type==='conveyorPort'&&entry.portMode==='input');if(beltInput){s.stations[beltInput.id].item={k:'raw',g:'carrot',progress:0};s.stations[beltInput.id].lastOwnerId='host';pump(ctx,1);}

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
