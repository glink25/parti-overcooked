import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { action, faceStation, join, loadWorker, makeContext, pump, startPlaying, worldPosition } from '../helpers/worker-runtime.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const definition=loadWorker(path.join(root,'src/worker/index.js'));

function room(){const ctx=makeContext(definition,11);join(ctx,definition);startPlaying(ctx,definition);return ctx;}
function roomFor(mapId){for(let seed=1;seed<400;seed++){const ctx=makeContext(definition,seed);join(ctx,definition);startPlaying(ctx,definition);if(ctx.state.mapId===mapId)return ctx;}throw new Error(`seed not found: ${mapId}`);}
function roomForFour(mapId){for(let seed=1;seed<400;seed++){const ctx=makeContext(definition,seed);join(ctx,definition);join(ctx,definition,'p3','三号');join(ctx,definition,'p4','四号');startPlaying(ctx,definition);if(ctx.state.mapId===mapId)return ctx;}throw new Error(`seed not found: ${mapId}`);}

test('新 interact 协议支持短按取物、落地和长按投掷',()=>{
  const ctx=roomFor('classic'),state=ctx.state,player=state.players.host;
  const crate=state.layout.stations.find((entry)=>entry.type==='crate');faceStation(state,player,crate);
  action(ctx,definition,'host','interact',{phase:'start',seq:1});assert.equal(player.carrying?.k,'raw');
  pump(ctx,2);
  player.x=4.5;player.z=6.5;player.face={dx:0,dz:-1};
  action(ctx,definition,'host','interact',{phase:'start',seq:2});action(ctx,definition,'host','interact',{phase:'release',seq:2});
  assert.equal(player.carrying,null);assert.equal(Object.values(state.worldItems).filter((entry)=>entry.mode==='ground').length,1);
  pump(ctx,2);const crate2=state.layout.stations.find((entry)=>entry.type==='crate');faceStation(state,player,crate2);action(ctx,definition,'host','interact',{phase:'start',seq:3});
  pump(ctx,2);player.x=4.5;player.z=6.5;player.face={dx:0,dz:-1};action(ctx,definition,'host','interact',{phase:'start',seq:4});pump(ctx,4);action(ctx,definition,'host','interact',{phase:'release',seq:4});
  assert.equal(player.carrying,null);assert.ok(Object.values(state.worldItems).some((entry)=>entry.mode==='airborne'));assert.equal(player.stats.throws,1);
});

test('cancel 和错误 seq 不会投掷',()=>{
  const ctx=room(),state=ctx.state,player=state.players.host,crate=state.layout.stations.find((entry)=>entry.type==='crate');faceStation(state,player,crate);action(ctx,definition,'host','interact',{phase:'start',seq:1});
  action(ctx,definition,'host','interact',{phase:'start',seq:2});pump(ctx,5);action(ctx,definition,'host','interact',{phase:'cancel',seq:99});assert.ok(player.carrying);action(ctx,definition,'host','interact',{phase:'cancel',seq:2});assert.ok(player.carrying);assert.equal(player.stats.throws,0);
});

test('世界物品到期会清理且空盘回库存',()=>{
  const ctx=room(),state=ctx.state;state.worldItems.test={id:'test',content:{k:'plate',items:[]},mode:'ground',x:10,z:7,createdAt:0,expiresAt:state.elapsed+0.1};const before=state.plates.clean;pump(ctx,2);assert.equal(state.worldItems.test,undefined);assert.equal(state.plates.clean,before+1);
});

test('无地面支撑会触发落水并复位',()=>{
  const ctx=room(),state=ctx.state,player=state.players.host,spawn=state.layout.spawns.find((entry)=>entry.slot===player.roundSpawnSlot),expected=worldPosition(state,spawn);player.x=-2;player.z=-2;pump(ctx,1);assert.ok(player.fall);pump(ctx,9);assert.equal(player.fall,null);assert.ok(Math.hypot(player.x-expected.x,player.z-expected.z)<1e-6);assert.equal(player.stats.falls,1);
});

test('四名玩家坠落后分别返回本轮出生槽，环岛内外分工不混淆',()=>{const ctx=roomForFour('ring'),state=ctx.state,expected={};for(const[id,player]of Object.entries(state.players)){const spawn=state.layout.spawns.find((entry)=>entry.slot===player.roundSpawnSlot);expected[id]=worldPosition(state,spawn);player.x=-2;player.z=-2;}pump(ctx,1);pump(ctx,9);for(const[id,player]of Object.entries(state.players))assert.ok(Math.hypot(player.x-expected[id].x,player.z-expected[id].z)<1e-6,id);assert.ok(state.players.host.x<8);assert.ok(state.players.p2.x>=8&&state.players.p2.x<=13);assert.ok(state.players.p3.x>13);assert.ok(state.players.p4.x>=8&&state.players.p4.x<=13);});

test('移动平台复活点使用平台当前偏移，断线重连恢复原槽',()=>{const ctx=roomFor('split'),state=ctx.state,player=state.players.host,slot=player.roundSpawnSlot;pump(ctx,20);player.x=-2;player.z=-2;pump(ctx,1);pump(ctx,9);const spawn=state.layout.spawns.find((entry)=>entry.slot===slot),expected=worldPosition(state,spawn);assert.ok(Math.hypot(player.x-expected.x,player.z-expected.z)<1e-6);const partner=ctx.players.find((entry)=>entry.id==='p2'),partnerSlot=state.players.p2.roundSpawnSlot;definition.onLeave(ctx,partner);ctx.players=ctx.players.filter((entry)=>entry.id!=='p2');join(ctx,definition,'p2','搭档归队');assert.equal(state.players.p2.roundSpawnSlot,partnerSlot);});

test('普通外墙阻止坠落，雪山显式裂谷仍会触发坠落',()=>{
  const classic=roomFor('classic'),safe=classic.state.players.host;safe.x=1.5;safe.z=3.5;action(classic,definition,'host','move',{dx:-1,dz:0,seq:1});pump(classic,12);assert.equal(safe.fall,null);assert.ok(safe.x>=1.29);
  const snow=roomFor('snow'),risky=snow.state.players.host;risky.x=6.5;risky.z=6.5;action(snow,definition,'host','move',{dx:1,dz:0,seq:1});pump(snow,4);assert.ok(risky.fall);
});

test('一线天按 24 秒四阶段运行并携带岛上玩家',()=>{
  const ctx=roomFor('split'),state=ctx.state,player=state.players.host,islands=state.mechanisms.islands;assert.equal(islands.phase,'separated');assert.equal(islands.merged,false);
  pump(ctx,80);assert.equal(islands.phase,'merging');const before={x:player.x,platformX:state.platforms.west.x};pump(ctx,20);assert.ok(state.platforms.west.x>before.platformX);assert.ok(Math.abs((player.x-before.x)-(state.platforms.west.x-before.platformX))<1e-6);
  pump(ctx,20);assert.equal(islands.phase,'merged');assert.equal(islands.merged,true);pump(ctx,80);assert.equal(islands.phase,'separating');pump(ctx,40);assert.equal(islands.phase,'separated');
});

test('一线天从合并状态分离时接缝玩家会被安全内推',()=>{const ctx=roomFor('split'),state=ctx.state,player=state.players.host;pump(ctx,120);assert.equal(state.mechanisms.islands.phase,'merged');player.x=9.95;player.z=6;player.supportId='west';pump(ctx,80);assert.equal(state.mechanisms.islands.phase,'separating');assert.equal(player.fall,null);assert.equal(player.supportId,'west');assert.ok(player.x<10);});

test('传送带可挂载在单一移动平台并保持相对坐标',()=>{
  const ctx=roomFor('split'),state=ctx.state,def={id:'deck_belt',type:'conveyor',config:{supportId:'west',path:{points:[{x:1,z:5},{x:5,z:5}],speed:1}}};state.layout.mechanisms.push(def);state.mechanisms.deck_belt={type:'conveyor',direction:1,reverseIn:0,warning:false};
  const platform=state.layout.platforms.find((entry)=>entry.id==='west');state.worldItems.deck_item={id:'deck_item',content:{k:'raw',g:'tomato'},mode:'conveyor',conveyorId:'deck_belt',pathDistance:0,x:platform.origin.x+1,z:platform.origin.z+5,supportId:'west',createdAt:state.elapsed,expiresAt:state.elapsed+20};pump(ctx,5);
  const item=state.worldItems.deck_item;assert.ok(Math.abs(item.x-(platform.origin.x+state.platforms.west.x+1.5))<1e-6);assert.ok(Math.abs(item.z-(platform.origin.z+state.platforms.west.z+5))<1e-6);
});

test('环岛东西短线独立运输，单侧出口阻塞不影响另一侧',()=>{
  const ctx=roomFor('ring'),state=ctx.state,westIn=state.layout.stations.find((entry)=>entry.id==='ring_in_w'),westOut=state.layout.stations.find((entry)=>entry.id==='ring_out_w'),eastIn=state.layout.stations.find((entry)=>entry.id==='ring_in_e'),eastOut=state.layout.stations.find((entry)=>entry.id==='ring_out_e');
  state.stations[westOut.id].item={k:'raw',g:'carrot'};state.stations[westIn.id].item={k:'raw',g:'tomato'};state.stations[eastIn.id].item={k:'raw',g:'onion'};pump(ctx,35);
  assert.equal(state.stations[westOut.id].item?.g,'carrot');assert.equal(state.stations[eastOut.id].item?.g,'onion');assert.ok(Object.values(state.worldItems).some((entry)=>entry.conveyorId==='ring_belt_w'&&entry.content.g==='tomato'));assert.ok(!Object.values(state.mechanisms).some((entry)=>entry.reverseIn>0));
});

test('太空地图保持稳定且食物不会自动漂移',()=>{
  const ctx=roomFor('space'),state=ctx.state,output=state.layout.stations.find((entry)=>entry.type==='conveyorPort'&&entry.portMode==='output');state.stations[output.id].item={k:'raw',g:'rice'};pump(ctx,400);assert.equal(state.stations[output.id].item?.g,'rice');assert.equal(state.layout.platforms.length,0);assert.ok(!state.layout.mechanisms.some((entry)=>entry.type==='itemTeleport'||entry.type==='movingPlatform'));
});

test('城门使用无连续重复的四门阵洗牌袋',()=>{
  const ctx=roomFor('castle'),gate=ctx.state.mechanisms.royal_gates,seen=[gate.activePresetId];assert.equal(gate.gates.filter((entry)=>entry.open).length,2);
  for(let index=0;index<3;index++){const before=gate.activePresetId;pump(ctx,161);assert.notEqual(gate.activePresetId,before);assert.equal(gate.gates.filter((entry)=>entry.open).length,2);seen.push(gate.activePresetId);}
  assert.equal(new Set(seen).size,4);
});

test('正面空手队友可自动接住投掷物',()=>{
  const ctx=roomFor('classic'),state=ctx.state,a=state.players.host,b=state.players.p2;a.x=8;a.z=7;a.face={dx:1,dz:0};a.carrying={k:'raw',g:'tomato'};b.x=10;b.z=7;b.face={dx:-1,dz:0};b.carrying=null;
  action(ctx,definition,'host','interact',{phase:'start',seq:1});pump(ctx,4);action(ctx,definition,'host','interact',{phase:'release',seq:1});pump(ctx,7);assert.equal(b.carrying?.g,'tomato');assert.equal(b.stats.catches,1);
});

test('高抛越过普通台面，但关闭城门会截停投掷物',()=>{
  const classic=roomFor('classic'),chef=classic.state.players.host;
  chef.x=5.5;chef.z=4.5;chef.face={dx:1,dz:0};chef.carrying={k:'raw',g:'tomato'};
  action(classic,definition,'host','interact',{phase:'start',seq:1});pump(classic,12);action(classic,definition,'host','interact',{phase:'release',seq:1});pump(classic,12);
  const cleared=Object.values(classic.state.worldItems).find((entry)=>entry.content?.g==='tomato');
  assert.ok(cleared?.x>8,'投掷物应越过 x=7 的普通台面');

  const castle=roomFor('castle'),royalChef=castle.state.players.host,closed=castle.state.mechanisms.royal_gates.gates.find((entry)=>!entry.open),cell=closed.cells[1];
  const approach=closed.orientation==='x'?(closed.id==='north'?{x:cell.x+.5,z:cell.z+1.5,dx:0,dz:-1}:{x:cell.x+.5,z:cell.z-.5,dx:0,dz:1}):(closed.id==='west'?{x:cell.x+1.5,z:cell.z+.5,dx:-1,dz:0}:{x:cell.x-.5,z:cell.z+.5,dx:1,dz:0});
  royalChef.x=approach.x;royalChef.z=approach.z;royalChef.face={dx:approach.dx,dz:approach.dz};royalChef.carrying={k:'raw',g:'rice'};
  action(castle,definition,'host','interact',{phase:'start',seq:1});pump(castle,12);action(castle,definition,'host','interact',{phase:'release',seq:1});pump(castle,12);
  const stopped=Object.values(castle.state.worldItems).find((entry)=>entry.content?.g==='rice');
  assert.ok(stopped,'关闭城门前应留下被截停的投掷物');
  const signed=(stopped.x-(cell.x+.5))*approach.dx+(stopped.z-(cell.z+.5))*approach.dz;assert.ok(signed<=.05,'关闭的三格城门应阻挡投掷物');
});

test('蓄力超时自动取消，重复 move seq 被去重',()=>{
  const ctx=roomFor('classic'),player=ctx.state.players.host;player.carrying={k:'raw',g:'tomato'};
  action(ctx,definition,'host','interact',{phase:'start',seq:1});pump(ctx,31);action(ctx,definition,'host','interact',{phase:'release',seq:1});assert.equal(player.carrying?.g,'tomato');assert.equal(player.stats.throws,0);
  action(ctx,definition,'host','move',{dx:1,dz:0,seq:1});action(ctx,definition,'host','move',{dx:-1,dz:0,seq:1});assert.equal(player.input.dx,1);
});

test('玩家不能直接从运行中的传送带拾取或向带面放货',()=>{
  const ctx=roomFor('classic'),state=ctx.state,player=state.players.host;player.x=8;player.z=6.5;player.face={dx:1,dz:0};player.carrying=null;
  state.worldItems.belt_pick={id:'belt_pick',content:{k:'raw',g:'carrot'},mode:'conveyor',conveyorId:'prep_belt',pathDistance:2.15,x:8.65,z:6.5,createdAt:state.elapsed,expiresAt:state.elapsed+20};
  action(ctx,definition,'host','interact',{phase:'start',seq:1});assert.equal(player.carrying,null);assert.equal(state.worldItems.belt_pick.content.g,'carrot');player.carrying={k:'raw',g:'onion'};action(ctx,definition,'host','interact',{phase:'start',seq:2});action(ctx,definition,'host','interact',{phase:'release',seq:2});assert.equal(player.carrying?.g,'onion');
});

test('专用输入台自动装载并在输出台阻塞时排队',()=>{const ctx=roomFor('classic'),state=ctx.state,input=state.layout.stations.find((entry)=>entry.id==='prep_in'),output=state.layout.stations.find((entry)=>entry.id==='prep_out');state.stations[input.id].item={k:'raw',g:'carrot'};state.stations[input.id].lastOwnerId='host';state.stations[output.id].item={k:'raw',g:'onion'};pump(ctx,1);assert.equal(state.stations[input.id].item,null);assert.ok(Object.values(state.worldItems).some((entry)=>entry.mode==='conveyor'&&entry.content.g==='carrot'));pump(ctx,80);assert.ok(Object.values(state.worldItems).some((entry)=>entry.content.g==='carrot'));state.stations[output.id].item=null;pump(ctx,1);assert.equal(state.stations[output.id].item?.g,'carrot');assert.equal(state.players.host.stats.conveyorTransfers,1);});

test('输入台允许放入和取回，输出台只允许取货',()=>{
  const ctx=roomFor('classic'),state=ctx.state,player=state.players.host,input=state.layout.stations.find((entry)=>entry.id==='prep_in'),output=state.layout.stations.find((entry)=>entry.id==='prep_out');
  state.worldItems.port_blocker={id:'port_blocker',content:{k:'raw',g:'carrot'},mode:'conveyor',conveyorId:'prep_belt',pathDistance:0,x:5.5,z:6.5,createdAt:state.elapsed,expiresAt:state.elapsed+20};
  player.carrying={k:'raw',g:'tomato'};faceStation(state,player,input);action(ctx,definition,'host','interact',{phase:'start',seq:1});action(ctx,definition,'host','interact',{phase:'release',seq:1});assert.equal(state.stations[input.id].item?.g,'tomato');assert.equal(player.carrying,null);
  pump(ctx,2);action(ctx,definition,'host','interact',{phase:'start',seq:2});assert.equal(player.carrying?.g,'tomato');assert.equal(state.stations[input.id].item,null);delete state.worldItems.port_blocker;
  pump(ctx,2);player.carrying=null;state.stations[output.id].item={k:'raw',g:'carrot'};faceStation(state,player,output);action(ctx,definition,'host','interact',{phase:'start',seq:3});assert.equal(player.carrying?.g,'carrot');
  pump(ctx,2);state.stations[output.id].item=null;player.carrying={k:'raw',g:'onion'};faceStation(state,player,output);action(ctx,definition,'host','interact',{phase:'start',seq:4});action(ctx,definition,'host','interact',{phase:'release',seq:4});assert.equal(state.stations[output.id].item,null);assert.equal(player.carrying?.g,'onion');
});

test('环岛双短线提供各自输入和输出接口',()=>{const ctx=roomFor('ring'),state=ctx.state,inputs=state.layout.stations.filter((entry)=>entry.type==='conveyorPort'&&entry.portMode==='input'),outputs=state.layout.stations.filter((entry)=>entry.type==='conveyorPort'&&entry.portMode==='output');assert.equal(inputs.length,2);assert.equal(outputs.length,2);state.stations[inputs[0].id].item={k:'raw',g:'tomato'};state.stations[inputs[1].id].item={k:'raw',g:'onion'};pump(ctx,1);assert.equal(Object.values(state.worldItems).filter((entry)=>entry.mode==='conveyor').length,2);pump(ctx,35);assert.ok(outputs.every((entry)=>state.stations[entry.id].item));});

test('世界物品上限回收最旧物品，所有盘子销毁路径保持守恒',()=>{
  const ctx=roomFor('classic'),state=ctx.state,player=state.players.host;
  for(let index=0;index<48;index++)state.worldItems[`old_${index}`]={id:`old_${index}`,content:{k:'raw',g:'onion'},mode:'ground',x:2,z:3,createdAt:index,expiresAt:state.elapsed+100};
  player.x=10.5;player.z=7.5;player.face={dx:1,dz:0};player.carrying={k:'raw',g:'tomato'};action(ctx,definition,'host','interact',{phase:'start',seq:1});action(ctx,definition,'host','interact',{phase:'release',seq:1});
  assert.equal(Object.keys(state.worldItems).length,48);assert.equal(state.worldItems.old_0,undefined);
  pump(ctx,2);const trash=state.layout.stations.find((entry)=>entry.type==='trash'),clean=state.plates.clean;player.carrying={k:'plate',items:[]};faceStation(state,player,trash);action(ctx,definition,'host','interact',{phase:'start',seq:2});action(ctx,definition,'host','interact',{phase:'release',seq:2});assert.equal(state.plates.clean,clean+1);
  pump(ctx,2);const due=state.plates.due.length;player.carrying={k:'dish',items:[{ingredient:'tomato',prep:'whole'}]};action(ctx,definition,'host','interact',{phase:'start',seq:3});action(ctx,definition,'host','interact',{phase:'release',seq:3});assert.equal(state.plates.due.length,due+1);
});

test('城门口有人时延迟关闭',()=>{
  const ctx=roomFor('castle'),state=ctx.state,gate=state.mechanisms.royal_gates,player=state.players.host;pump(ctx,121);const closing=gate.gates.find((entry)=>entry.willClose),cell=closing.cells[1],active=gate.activePresetId;player.x=cell.x+.5;player.z=cell.z+.5;
  pump(ctx,41);assert.equal(gate.activePresetId,active);assert.equal(gate.nextPresetId!==null,true);assert.ok(gate.remaining<=.5);
});
