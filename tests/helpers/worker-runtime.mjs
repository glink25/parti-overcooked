import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export function loadWorker(file) {
  let source=readFileSync(file,'utf8');
  source=source.replace(/import\s*\{[^}]*\}\s*from\s*['"]@parti\/[^'"]*['"];?/g,'');
  source=source.replace(/export\s+default\s+/,'module.exports = ');
  source+='\nmodule.exports.__maps = MAPS; module.exports.__recipes = RECIPES;';
  const module={exports:{}};
  new vm.Script(source,{filename:file}).runInNewContext({module,exports:module.exports,defineRoom:(definition)=>definition,console});
  return module.exports;
}

export function makeContext(definition,seed=7){
  let value=seed>>>0;
  const ctx={state:null,players:[],host:null,events:[],timers:new Map(),random(){value=(Math.imul(value,1664525)+1013904223)>>>0;return value/4294967296;},broadcast(event,payload){ctx.events.push({event,payload});},setTimer(name,ms,callback){ctx.timers.set(name,{ms,callback});},clearTimer(name){ctx.timers.delete(name);},now:()=>Date.now(),send(){},kick(){},log(){}};
  const host={id:'host',name:'房主',role:'host'};ctx.players.push(host);ctx.host=host;ctx.state=definition.initialState(ctx);definition.onCreate?.(ctx);definition.onJoin(ctx,host);return ctx;
}

export function join(ctx,definition,id='p2',name='搭档') { const player={id,name,role:'player'};ctx.players.push(player);definition.onJoin(ctx,player);return player; }
export function action(ctx,definition,id,name,payload={}) { const player=ctx.players.find((entry)=>entry.id===id);definition.actions[name](ctx,{player,payload}); }
export function pump(ctx,count=1){for(let i=0;i<count;i++){const timer=ctx.timers.get('tick');if(!timer)return false;timer.callback();}return true;}
export function startPlaying(ctx,definition){action(ctx,definition,'host','start');pump(ctx,31);return ctx.state;}

export function worldPosition(state,value){
  if(!value.supportId)return{x:value.x,z:value.z};const def=state.layout.platforms.find((entry)=>entry.id===value.supportId);const runtime=state.platforms[value.supportId];return{x:value.x+def.origin.x+(runtime?.x||0),z:value.z+def.origin.z+(runtime?.z||0)};
}

export function faceStation(state,player,station){const point=worldPosition(state,station);player.x=point.x+0.5;player.z=point.z+1.5;player.face={dx:0,dz:-1};player.vx=player.vz=0;return point;}
