import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { join, loadWorker, makeContext, pump, startPlaying } from '../helpers/worker-runtime.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const definition=loadWorker(path.join(root,'src/worker/index.js'));

test('开局状态使用稳定工位 ID 和独立机制状态',()=>{
  const ctx=makeContext(definition,23);join(ctx,definition);const state=startPlaying(ctx,definition);
  assert.ok(state.layout&&state.layout.bounds);
  assert.equal('stationAt' in state.layout,false);
  for(const station of state.layout.stations)if(['counter','board','stove'].includes(station.type))assert.ok(station.id in state.stations);
  for(const mechanism of state.layout.mechanisms)assert.equal(state.mechanisms[mechanism.id].type,mechanism.type);
});

test('四种人数使用同一地图结构，订单压力仅改变运行节奏',()=>{
  const maps=[];
  for(const count of [2,3,4]){const ctx=makeContext(definition,31);for(let i=2;i<=count;i++)join(ctx,definition,`p${i}`);const state=startPlaying(ctx,definition);maps.push(JSON.stringify(state.layout));}
  assert.equal(maps[0],maps[1]);assert.equal(maps[1],maps[2]);
});

test('六张地图均可由两人和四人启动并持续运行',()=>{
  for(const mapId of Object.keys(definition.__maps))for(const count of [2,4]){
    let matched=null;
    for(let seed=1;seed<400;seed++){const ctx=makeContext(definition,seed);for(let i=2;i<=count;i++)join(ctx,definition,`p${i}`);startPlaying(ctx,definition);if(ctx.state.mapId===mapId){matched=ctx;break;}}
    assert.ok(matched,`${mapId}:${count}`);pump(matched,240);assert.equal(matched.state.phase,'playing',`${mapId}:${count}`);assert.equal(Object.keys(matched.state.players).length,count);
  }
});

test('一线天所有运动相位的核心跨岛投掷距离不超过 5.5 格',()=>{
  const map=definition.__maps.split,west=map.stations.find((entry)=>entry.id==='counter_w'),east=map.stations.find((entry)=>entry.id==='counter_e');
  for(let tick=0;tick<160;tick++){
    const time=tick/10;
    const point=(station)=>{const platform=map.platforms.find((entry)=>entry.id===station.supportId),motion=platform.motion,wave=Math.sin(((time/motion.period)+motion.phase)*Math.PI*2)*motion.amplitude;return{x:platform.origin.x+station.x+.5+motion.axis.x*wave,z:platform.origin.z+station.z+.5+motion.axis.z*wave};};
    const a=point(west),b=point(east);assert.ok(Math.hypot(a.x-b.x,a.z-b.z)<=5.5+1e-9,`tick ${tick}`);
  }
});

test('太空两人局提供外围舱之间的固定勤务通道',()=>{const map=definition.__maps.space;assert.ok([...Array(12)].every((_,index)=>map.terrain[12][index+6]==='.'));});

test('城堡所有门阵均保留外围通路且中央捷径确实改变距离',()=>{
  const map=definition.__maps.castle,gate=map.mechanisms.find((entry)=>entry.type==='gate'),key=(x,z)=>`${x},${z}`,dirs=[[1,0],[-1,0],[0,1],[0,-1]],stations=new Set(map.stations.map((entry)=>key(entry.x,entry.z)));
  const distances={};
  for(const preset of gate.config.presets){
    const open=new Set(preset.open),blocked=new Set([...stations,...gate.config.groups.filter((entry)=>!open.has(entry.id)).flatMap((entry)=>entry.cells.map((cell)=>key(cell.x,cell.z)))]),start=[5,8],target=key(17,8),queue=[[...start,0]],seen=new Set([key(...start)]);let distance=-1;
    while(queue.length){const[x,z,d]=queue.shift();if(key(x,z)===target){distance=d;break;}for(const[dx,dz]of dirs){const next=key(x+dx,z+dz);if(!seen.has(next)&&!blocked.has(next)&&['.','i'].includes(map.terrain[z+dz]?.[x+dx])){seen.add(next);queue.push([x+dx,z+dz,d+1]);}}}
    assert.ok(distance>0,preset.id);distances[preset.id]=distance;
  }
  assert.ok(distances.east_west<distances.north_south);
});
