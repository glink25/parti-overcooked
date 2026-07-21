import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { action, faceStation, join, loadWorker, makeContext, pump, startPlaying } from '../helpers/worker-runtime.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const definition=loadWorker(path.join(root,'src/worker/index.js'));
function classic(){for(let seed=1;seed<400;seed++){const ctx=makeContext(definition,seed);join(ctx,definition);startPlaying(ctx,definition);if(ctx.state.mapId==='classic')return ctx;}throw new Error('classic seed');}

test('新世界模型中可完成取菜、切菜、烹饪、装盘与上菜',()=>{
  const ctx=classic(),state=ctx.state,p=state.players.host;
  const tomato=state.layout.stations.find((entry)=>entry.id==='tomato'),board=state.layout.stations.find((entry)=>entry.id==='board_a'),stove=state.layout.stations.find((entry)=>entry.id==='stove_a');
  let interactSeq=0,workSeq=0;
  const tap=()=>{const seq=++interactSeq;action(ctx,definition,'host','interact',{phase:'start',seq});action(ctx,definition,'host','interact',{phase:'release',seq});pump(ctx,2);};
  const press=()=>{action(ctx,definition,'host','interact',{phase:'start',seq:++interactSeq});pump(ctx,2);};
  for(let count=0;count<3;count++){
    faceStation(state,p,tomato);press();assert.equal(p.carrying?.g,'tomato');
    faceStation(state,p,board);tap();assert.equal(state.stations.board_a.item?.k,'raw');
    action(ctx,definition,'host','work',{active:true,seq:++workSeq});pump(ctx,31);action(ctx,definition,'host','work',{active:false,seq:++workSeq});assert.equal(state.stations.board_a.item?.k,'chopped');
    press();assert.equal(p.carrying?.k,'chopped');faceStation(state,p,stove);tap();
  }
  assert.equal(state.stations.stove_a.phase,'cooking');pump(ctx,121);assert.equal(state.stations.stove_a.phase,'ready');
  state.orders=[{id:'manual',key:'tomato:chopped+tomato:chopped+tomato:chopped',name:'番茄浓汤',points:20,t:80,total:80}];
  const plates=state.layout.stations.find((entry)=>entry.id==='plates');faceStation(state,p,plates);press();assert.equal(p.carrying?.k,'plate');
  faceStation(state,p,stove);tap();assert.equal(p.carrying?.k,'dish');
  const window=state.layout.stations.find((entry)=>entry.id==='window');faceStation(state,p,window);tap();
  assert.equal(state.orders.length,0);assert.equal(state.served,1);assert.ok(state.score>=20);
});

test('四人派对模式完成三轮换图并进入贡献结算',()=>{
  const ctx=makeContext(definition,91);join(ctx,definition);join(ctx,definition,'p3');join(ctx,definition,'p4');startPlaying(ctx,definition);
  const visited=[ctx.state.mapId];
  for(let round=1;round<=3;round++){
    ctx.state.timeLeft=.05;pump(ctx,1);
    if(round===3)break;
    assert.equal(ctx.state.phase,'roundResult');ctx.state.roundResultTime=.05;pump(ctx,1);assert.equal(ctx.state.phase,'countdown');visited.push(ctx.state.mapId);ctx.state.countdown=.05;pump(ctx,1);assert.equal(ctx.state.phase,'playing');
  }
  assert.equal(ctx.state.phase,'awards');assert.equal(ctx.state.standings.length,4);assert.equal(new Set(visited).size,3);assert.ok(ctx.state.finalTitles);
});

test('无尽模式订单超时累积怒气并触发最终结算',()=>{
  const ctx=makeContext(definition,37);join(ctx,definition);action(ctx,definition,'host','selectMode',{mode:'endless'});startPlaying(ctx,definition);
  ctx.state.rage=75;ctx.state.orders=[{id:'doomed',key:'none',name:'测试订单',points:20,t:.05,total:80}];pump(ctx,1);
  assert.equal(ctx.state.phase,'awards');assert.equal(ctx.state.expired,1);assert.ok(ctx.state.finalComment);
});

test('烧糊清理、脏盘返回和洗碗使用新 action 协议',()=>{
  const ctx=classic(),state=ctx.state,player=state.players.host,stove=state.layout.stations.find((entry)=>entry.id==='stove_a');
  Object.assign(state.stations.stove_a,{contents:[{ingredient:'tomato',prep:'chopped'}],phase:'ready',t:11.95});pump(ctx,1);assert.equal(state.stations.stove_a.phase,'burnt');
  faceStation(state,player,stove);action(ctx,definition,'host','interact',{phase:'start',seq:1});assert.equal(state.stations.stove_a.phase,'idle');
  state.plates.due=[.05];pump(ctx,1);assert.equal(state.plates.dirty,1);const clean=state.plates.clean,sink=state.layout.stations.find((entry)=>entry.type==='sink');faceStation(state,player,sink);action(ctx,definition,'host','work',{active:true,seq:1});pump(ctx,41);action(ctx,definition,'host','work',{active:false,seq:2});assert.equal(state.plates.dirty,0);assert.equal(state.plates.clean,clean+1);
});

test('地图 Buff 可生成、拾取并进入玩家权威状态',()=>{
  const ctx=classic(),state=ctx.state,player=state.players.host;state.nextBuffIn=.05;pump(ctx,1);assert.ok(state.groundBuff);player.x=state.groundBuff.x;player.z=state.groundBuff.z;pump(ctx,1);assert.ok(player.activeBuff);assert.equal(state.groundBuff,null);
});
