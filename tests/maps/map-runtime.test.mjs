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

test('一线天分离时交接台在投掷距离内，合并时两岛无缝相接',()=>{
  const map=definition.__maps.split,mechanism=map.mechanisms.find((entry)=>entry.id==='islands'),west=map.platforms.find((entry)=>entry.id==='west'),east=map.platforms.find((entry)=>entry.id==='east');
  assert.equal(map.platforms.map((entry)=>entry.id).join(','),'west,east');assert.equal(mechanism.config.cycle,24);
  const westCounter=map.stations.find((entry)=>entry.id==='counter_w'),eastCounter=map.stations.find((entry)=>entry.id==='counter_e');
  const point=(station,progress)=>{const platform=map.platforms.find((entry)=>entry.id===station.supportId),offset=mechanism.config.offsets[platform.id];return{x:platform.origin.x+station.x+.5+offset.x*progress,z:platform.origin.z+station.z+.5};};
  const separated=[point(westCounter,0),point(eastCounter,0)];assert.ok(Math.hypot(separated[0].x-separated[1].x,separated[0].z-separated[1].z)<=5.5);
  const westEdge=west.origin.x+6+mechanism.config.offsets.west.x,eastEdge=east.origin.x+mechanism.config.offsets.east.x;assert.equal(westEdge,eastEdge);
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
