import { conveyorPathRects } from './visual/conveyor.js';

export const PLAYER_R = 0.3;
export const SPEED = 3.2;
export const STOP_TIME = 0.1;
const FIXED_STEP = 1 / 60;
const EPSILON = 1e-9;

function platformOrigin(layout, supportId) {
  const def = layout.platforms?.find((entry) => entry.id === supportId);
  const state = layout._runtime?.platforms?.[supportId];
  return def ? { x:def.origin.x+(state?.x||0), z:def.origin.z+(state?.z||0) } : {x:0,z:0};
}

export function worldStation(layout, station) {
  const origin=station.supportId?platformOrigin(layout,station.supportId):{x:0,z:0};
  return {...station,x:station.x+origin.x,z:station.z+origin.z};
}

export function terrainAt(layout,x,z) {
  for(const platform of layout.platforms||[]){const origin=platformOrigin(layout,platform.id);for(const tile of platform.tiles||[])if(x>=origin.x+tile.x&&x<origin.x+tile.x+1&&z>=origin.z+tile.z&&z<origin.z+tile.z+1)return tile.kind;}
  const cx=Math.floor(x),cz=Math.floor(z),bounds=layout.bounds||{w:0,h:0};
  if(cx<0||cz<0||cx>=bounds.w||cz>=bounds.h)return ' ';
  return layout.terrain?.[cz]?.[cx]||' ';
}

function blockingRects(layout){
  const rects=[],bounds=layout.bounds||{w:0,h:0};
  for(let z=0;z<bounds.h;z++)for(let x=0;x<bounds.w;x++)if(layout.terrain[z][x]==='#')rects.push({x,z,w:1,h:1});
  for(const station of layout.stations||[]){const p=worldStation(layout,station);rects.push({x:p.x,z:p.z,w:1,h:1});}
  for(const mechanism of (layout.mechanisms||[]).filter((entry)=>entry.type==='conveyor')){const origin=mechanism.config.supportId?platformOrigin(layout,mechanism.config.supportId):{x:0,z:0};rects.push(...conveyorPathRects(mechanism.config.path.points,.8,origin));}
  const thickness=.16;for(const hazard of layout.hazards||[])for(const cell of hazard.cells||[])for(const edge of hazard.guardEdges||[]){if(edge==='north')rects.push({x:cell.x,z:cell.z-thickness/2,w:1,h:thickness});if(edge==='south')rects.push({x:cell.x,z:cell.z+1-thickness/2,w:1,h:thickness});if(edge==='west')rects.push({x:cell.x-thickness/2,z:cell.z,w:thickness,h:1});if(edge==='east')rects.push({x:cell.x+1-thickness/2,z:cell.z,w:thickness,h:1});}
  for(const state of Object.values(layout._runtime?.mechanisms||{}))if(state?.type==='gate')for(const gate of state.gates||[])if(!gate.open)for(const cell of gate.cells||[gate])rects.push({x:cell.x,z:cell.z,w:1,h:1});
  return rects;
}

function resolveCircle(layout,state,radius){
  for(let pass=0;pass<4;pass++){
    let changed=false;
    for(const rect of blockingRects(layout)){
      const nearestX=Math.max(rect.x,Math.min(state.x,rect.x+rect.w));
      const nearestZ=Math.max(rect.z,Math.min(state.z,rect.z+rect.h));
      let nx=state.x-nearestX,nz=state.z-nearestZ;const d2=nx*nx+nz*nz;
      if(d2>=radius*radius-EPSILON)continue;
      const d=Math.sqrt(d2);let penetration;
      if(d>EPSILON){nx/=d;nz/=d;penetration=radius-d;}else{const exits=[{d:state.x-(rect.x-radius),nx:-1,nz:0},{d:rect.x+rect.w+radius-state.x,nx:1,nz:0},{d:state.z-(rect.z-radius),nx:0,nz:-1},{d:rect.z+rect.h+radius-state.z,nx:0,nz:1}].sort((a,b)=>a.d-b.d);({d:penetration,nx,nz}=exits[0]);}
      state.x+=nx*penetration;state.z+=nz*penetration;const into=(state.vx||0)*nx+(state.vz||0)*nz;if(into<0){state.vx-=into*nx;state.vz-=into*nz;}changed=true;
    }
    if(!changed)break;
  }
}

function resolvePlayers(state,others,radius){
  for(const other of others||[]){let nx=state.x-other.x,nz=state.z-other.z;const min=radius+(other.radius||radius),d=Math.hypot(nx,nz);if(d>=min-EPSILON)continue;if(d>EPSILON){nx/=d;nz/=d;}else{nx=1;nz=0;}const push=min-d;state.x+=nx*push;state.z+=nz*push;}
}

function normalise(input){let dx=Number(input?.dx)||0,dz=Number(input?.dz)||0;const length=Math.hypot(dx,dz);if(length>1){dx/=length;dz/=length;}return{dx,dz,active:length>0};}

export function collides(layout,x,z,radius=PLAYER_R){const state={x,z,vx:0,vz:0};const before={x,z};resolveCircle(layout,state,radius);return Math.hypot(state.x-before.x,state.z-before.z)>EPSILON;}

export function stepMovement(layout,state,input,dt,radius=PLAYER_R,others=[],modifiers={}){
  if(!layout||!state||!(dt>0))return state;const command=normalise(input);const ice=terrainAt(layout,state.x,state.z)==='i';const iceDef=layout.mechanisms?.find((entry)=>entry.type==='iceSurface');const stopTime=ice?(iceDef?.config.stopTime||0.65):STOP_TIME;const turnTime=ice?(iceDef?.config.turnTime||0.25):0;const limit=SPEED*(modifiers.speedMultiplier||1);const decel=limit/stopTime;
  state._movementRemainder=(state._movementRemainder||0)+dt;
  while(state._movementRemainder+EPSILON>=FIXED_STEP){state._movementRemainder-=FIXED_STEP;let mx=0,mz=0;if(command.active){const blend=turnTime?Math.min(1,FIXED_STEP/turnTime):1;state.vx=(state.vx||0)+(command.dx*limit-(state.vx||0))*blend;state.vz=(state.vz||0)+(command.dz*limit-(state.vz||0))*blend;mx=state.vx*FIXED_STEP;mz=state.vz*FIXED_STEP;}else{const speed=Math.hypot(state.vx||0,state.vz||0);if(speed<=EPSILON){state.vx=state.vz=0;break;}const next=Math.max(0,speed-decel*FIXED_STEP),avg=(speed+next)*0.5,dx=state.vx/speed,dz=state.vz/speed;mx=dx*avg*FIXED_STEP;mz=dz*avg*FIXED_STEP;state.vx=dx*next;state.vz=dz*next;}
    state.x+=mx;state.z+=mz;resolveCircle(layout,state,radius);resolvePlayers(state,others,radius);resolveCircle(layout,state,radius);
  }
  return state;
}

export function reconcilePrediction(layout,predicted,server,input,lastDirection,sentSeq,dt,radius=PLAYER_R){
  if(!layout||!predicted||!server)return predicted;const ex=server.x-predicted.x,ez=server.z-predicted.z,error=Math.hypot(ex,ez);if(error>1.5){Object.assign(predicted,{x:server.x,z:server.z,vx:server.vx||0,vz:server.vz||0,_movementRemainder:0});return predicted;}if(error<0.001)return predicted;const active=Math.hypot(input?.dx||0,input?.dz||0)>0;if(active){const k=Math.min(1,dt*4);predicted.x+=ex*k;predicted.z+=ez*k;resolveCircle(layout,predicted,radius);return predicted;}if((server.moveSeq||0)>=sentSeq){const k=Math.min(1,dt*8);predicted.x+=ex*k;predicted.z+=ez*k;resolveCircle(layout,predicted,radius);}return predicted;
}
