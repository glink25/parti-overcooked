import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { action, faceStation, join, loadWorker, makeContext, pump, startPlaying } from '../helpers/worker-runtime.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const definition=loadWorker(path.join(root,'src/worker/index.js'));
function classic(){for(let seed=1;seed<400;seed++){const ctx=makeContext(definition,seed);join(ctx,definition);startPlaying(ctx,definition);if(ctx.state.mapId==='classic')return ctx;}throw new Error('classic seed');}
function finishParty(ctx){for(let round=1;round<=3;round++){ctx.state.timeLeft=.05;pump(ctx,1);if(round===3)break;ctx.state.roundResultTime=.05;pump(ctx,1);ctx.state.countdown=.05;pump(ctx,1);}return ctx.state;}

test('倒计时结束时立即生成 95 秒首单并使用放宽后的间隔',()=>{
  const ctx=makeContext(definition,17);join(ctx,definition);action(ctx,definition,'host','start');
  assert.equal(ctx.state.phase,'countdown');assert.equal(ctx.state.orders.length,0);
  while(ctx.state.phase==='countdown'){pump(ctx,1);if(ctx.state.phase==='countdown')assert.equal(ctx.state.orders.length,0);}
  assert.equal(ctx.state.phase,'playing');assert.equal(ctx.state.orders.length,1);assert.equal(ctx.state.orders[0].t,95);assert.equal(ctx.state.orders[0].total,95);assert.ok(ctx.state.nextOrderIn>=25&&ctx.state.nextOrderIn<=35);
});

test('四人局订单间隔继续应用人数压力系数',()=>{
  const ctx=makeContext(definition,19);join(ctx,definition);join(ctx,definition,'p3');join(ctx,definition,'p4');const state=startPlaying(ctx,definition);
  assert.equal(state.orders.length,1);assert.ok(state.nextOrderIn>=25*.72&&state.nextOrderIn<=35*.72);
});

test('交付唯一订单后立即补单并重置生成间隔',()=>{
  const ctx=classic(),state=ctx.state,p=state.players.host,window=state.layout.stations.find((entry)=>entry.id==='window');
  state.orders=[{id:'only',key:'tomato:chopped',name:'测试菜',points:20,t:80,total:95}];state.nextOrderIn=.01;p.carrying={k:'dish',items:[{ingredient:'tomato',prep:'chopped'}],credits:[]};faceStation(state,p,window);
  action(ctx,definition,'host','interact',{phase:'start',seq:1});action(ctx,definition,'host','interact',{phase:'release',seq:1});
  assert.equal(state.served,1);assert.equal(state.orders.length,1);assert.notEqual(state.orders[0].id,'only');assert.equal(state.orders[0].total,95);assert.ok(state.nextOrderIn>=25&&state.nextOrderIn<=35);
});

test('唯一订单超时后立即补单并保留超时惩罚',()=>{
  const ctx=makeContext(definition,37);join(ctx,definition);const state=startPlaying(ctx,definition);state.score=20;state.sessionScore=20;state.roundScore=20;state.nextOrderIn=100;state.orders=[{id:'doomed',key:'none',name:'测试订单',points:20,t:.05,total:95}];pump(ctx,1);
  assert.equal(state.phase,'playing');assert.equal(state.expired,1);assert.equal(state.score,15);assert.equal(state.orders.length,1);assert.notEqual(state.orders[0].id,'doomed');assert.equal(state.orders[0].total,95);assert.ok(state.nextOrderIn>=25&&state.nextOrderIn<=35);
});

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
  assert.equal(state.orders.length,1);assert.notEqual(state.orders[0].id,'manual');assert.equal(state.served,1);assert.ok(state.score>=20);
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

test('跨局清理绝对冷却和所有瞬时状态，第二局第一次操作立即生效',()=>{
  const ctx=makeContext(definition,23);join(ctx,definition);startPlaying(ctx,definition);const state=ctx.state,p=state.players.host;
  const firstCrate=state.layout.stations.find((entry)=>entry.type==='crate');state.elapsed=179;faceStation(state,p,firstCrate);action(ctx,definition,'host','interact',{phase:'start',seq:1});
  assert.ok(p.carrying);assert.ok(p.nextInteractAt>179);assert.ok(p.nextCrateAt>179);
  p.working=true;p.charge={seq:1,held:.5};p.fall={remaining:.4};p.activeBuff={type:'fast_hands',remaining:8};p.input={dx:1,dz:0};p.vx=2;p.vz=1;
  state.timeLeft=.05;pump(ctx,1);assert.equal(state.phase,'roundResult');
  assert.equal(p.carrying,null);assert.equal(p.working,false);assert.equal(p.charge,null);assert.equal(p.fall,null);assert.equal(p.activeBuff,null);assert.equal(p.input.dx,0);assert.equal(p.input.dz,0);assert.equal(p.vx,0);assert.equal(p.vz,0);assert.equal(p.nextInteractAt,0);assert.equal(p.nextCrateAt,0);
  state.roundResultTime=.05;pump(ctx,1);state.countdown=.05;pump(ctx,1);assert.equal(state.phase,'playing');
  const secondCrate=state.layout.stations.find((entry)=>entry.type==='crate');faceStation(state,p,secondCrate);action(ctx,definition,'host','interact',{phase:'start',seq:2});assert.ok(p.carrying);
  action(ctx,definition,'host','move',{dx:1,dz:0,seq:2});assert.equal(p.input.dx,1);assert.equal(p.input.dz,0);
  action(ctx,definition,'host','work',{active:true,seq:2});assert.equal(p.working,true);
});

test('最终结算按排名站上不同高度领奖台，仅开放自由移动',()=>{
  const ctx=makeContext(definition,91);join(ctx,definition);join(ctx,definition,'p3','三号');startPlaying(ctx,definition);finishParty(ctx);const state=ctx.state,p=state.players.host;
  assert.equal(state.phase,'awards');assert.equal(state.layout.mapId,'awards');assert.equal(ctx.timers.has('tick'),true);assert.equal(state.layout.podiums.length,3);
  assert.ok(state.layout.podiums[0].height>state.layout.podiums[1].height&&state.layout.podiums[1].height>state.layout.podiums[2].height);
  for(const podium of state.layout.podiums){const standing=state.standings.find((entry)=>entry.rank===podium.rank),player=state.players[standing.id];assert.equal(player.x,podium.x);assert.equal(player.z,podium.z);assert.equal(player.awardsPodiumHeight,podium.height);}
  const before={working:p.working,carrying:p.carrying,interactSeq:p.interactSeq,workSeq:p.workSeq};
  action(ctx,definition,'host','work',{active:true,seq:99});action(ctx,definition,'host','interact',{phase:'start',seq:99});assert.equal(JSON.stringify({working:p.working,carrying:p.carrying,interactSeq:p.interactSeq,workSeq:p.workSeq}),JSON.stringify(before));
  const beforeX=p.x,startingHeight=p.awardsPodiumHeight;action(ctx,definition,'host','move',{dx:1,dz:0,seq:99});assert.equal(p.input.dx,1);pump(ctx,1);assert.equal(p.awardsPodiumHeight,startingHeight);pump(ctx,4);assert.ok(p.x>beforeX);assert.equal(p.awardsPodiumHeight,0);assert.equal(p.awardsPodiumRank,0);
  action(ctx,definition,'p2','rematch');action(ctx,definition,'p2','toLobby');assert.equal(state.phase,'awards');
  action(ctx,definition,'host','toLobby');assert.equal(state.phase,'lobby');assert.equal(state.layout,null);assert.equal(ctx.timers.has('tick'),false);
});

test('房主可从结算大厅开始全新对局',()=>{
  const ctx=makeContext(definition,37);join(ctx,definition);startPlaying(ctx,definition);finishParty(ctx);const previousGameSeq=ctx.state.gameSeq;action(ctx,definition,'host','rematch');
  assert.equal(ctx.state.phase,'countdown');assert.ok(ctx.state.gameSeq>previousGameSeq);assert.equal(ctx.state.players.host.nextInteractAt,0);assert.equal(ctx.state.players.host.nextCrateAt,0);assert.equal(ctx.timers.has('tick'),true);
});

test('无尽模式订单超时累积怒气并触发最终结算',()=>{
  const ctx=makeContext(definition,37);join(ctx,definition);action(ctx,definition,'host','selectMode',{mode:'endless'});startPlaying(ctx,definition);
  ctx.state.rage=75;ctx.state.orders=[{id:'doomed',key:'none',name:'测试订单',points:20,t:.05,total:80}];pump(ctx,1);
  assert.equal(ctx.state.phase,'awards');assert.equal(ctx.state.expired,1);assert.equal(ctx.state.orders.length,0);assert.ok(ctx.state.finalComment);
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
