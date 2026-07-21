import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { advanceDeadZoneCenter, cameraPoses, nextCameraFollowMode } from '../../src/client/visual/camera.js';
import { conveyorArrowQuaternion, conveyorPathRects, conveyorSegment } from '../../src/client/visual/conveyor.js';
import { createEnvironmentController } from '../../src/client/visual/environment.js';
import { MAP_THEMES } from '../../src/client/visual/themes.js';
import { stepMovement, terrainAt, worldStation } from '../../src/client/movement.js';

const layout={bounds:{w:20,h:14},terrain:Array.from({length:14},(_,z)=>Array.from({length:20},(_,x)=>x>0&&x<19&&z>0&&z<13?'.':' ').join('')),platforms:[{id:'p',origin:{x:3,z:3},tiles:[{x:0,z:0,kind:'.'}]}],stations:[{id:'s',type:'counter',x:0,z:0,supportId:'p'}],mechanisms:[],_runtime:{platforms:{p:{x:1,z:2}},mechanisms:{}}};

test('客户端使用 bounds 计算新地图镜头',()=>{const poses=cameraPoses(layout,16/9);assert.equal(poses.target.x,10);assert.equal(poses.target.z,7.2);assert.ok(poses.overview.y>poses.playing.y);});
test('镜头跟随使用宽迟滞和移动死区',()=>{assert.equal(nextCameraFollowMode(false,37,44),false);assert.equal(nextCameraFollowMode(false,35,44),true);assert.equal(nextCameraFollowMode(true,55,44),true);assert.equal(nextCameraFollowMode(true,57,44),false);const still=advanceDeadZoneCenter({x:5,z:5},{x:6,z:5},2.1,.5);assert.deepEqual(still,{x:5,z:5});const moved=advanceDeadZoneCenter(still,{x:9,z:5},2.1,.5);assert.ok(moved.x>5&&moved.x<9);});
test('传送带水平、纵向及反向箭头变换均保持有限值',()=>{for(const [a,b] of [[{x:0,z:0},{x:4,z:0}],[{x:2,z:1},{x:2,z:5}]]){const segment=conveyorSegment(a,b),forward=conveyorArrowQuaternion(segment),reverse=conveyorArrowQuaternion(segment,true);assert.ok(segment.length>0);assert.ok([forward.x,forward.y,forward.z,forward.w,reverse.x,reverse.y,reverse.z,reverse.w].every(Number.isFinite));assert.ok(Math.abs(forward.dot(reverse))<1e-6);}});
test('传送带拒绝斜线并生成与服务端一致的实体带体',()=>{assert.throws(()=>conveyorSegment({x:0,z:0},{x:1,z:1}),/horizontal or vertical/);assert.deepEqual(conveyorPathRects([{x:1,z:2},{x:4,z:2}],.8),[{x:.6,z:1.6,w:3.8,h:.8,kind:'conveyor'}]);});
test('移动平台本地坐标转换为世界坐标',()=>{const station=worldStation(layout,layout.stations[0]);assert.deepEqual({x:station.x,z:station.z},{x:4,z:5});assert.equal(terrainAt(layout,4.5,5.5),'.');});
test('新地形上的移动保持固定步长',()=>{const player={x:5,z:5,vx:0,vz:0};for(let i=0;i<60;i++)stepMovement(layout,player,{dx:1,dz:0},1/60);assert.ok(player.x>7);});
test('wall 阻挡移动，void 与 water 不会被解释为地板',()=>{const walls={bounds:{w:5,h:3},terrain:['.....','..#~.','.....'],platforms:[],stations:[],mechanisms:[],_runtime:{mechanisms:{},platforms:{}}},player={x:1.5,z:1.5,vx:0,vz:0};for(let i=0;i<90;i++)stepMovement(walls,player,{dx:1,dz:0},1/60);assert.ok(player.x<=1.7+1e-6);assert.equal(terrainAt(walls,3.5,1.5),'~');assert.equal(terrainAt(walls,-1,1),' ');});
test('客户端预测把关闭的多格城门视为完整碰撞墙',()=>{const gated={bounds:{w:5,h:3},terrain:['.....','.....','.....'],platforms:[],stations:[],mechanisms:[],_runtime:{platforms:{},mechanisms:{royal:{type:'gate',gates:[{id:'east',open:false,cells:[{x:2,z:0},{x:2,z:1},{x:2,z:2}]}]}}}},player={x:1.5,z:1.5,vx:0,vz:0};for(let i=0;i<90;i++)stepMovement(gated,player,{dx:1,dz:0},1/60);assert.ok(player.x<=1.7+1e-6);});
test('客户端预测把高台传送带和裂谷护栏视为实体碰撞',()=>{const belt={bounds:{w:8,h:5},terrain:Array(5).fill('.'.repeat(8)),platforms:[],stations:[],mechanisms:[{id:'belt',type:'conveyor',config:{path:{points:[{x:3.5,z:.5},{x:3.5,z:4.5}]}}}],hazards:[],_runtime:{platforms:{},mechanisms:{}}},player={x:2.5,z:2.5,vx:0,vz:0};for(let i=0;i<90;i++)stepMovement(belt,player,{dx:1,dz:0},1/60);assert.ok(player.x<=2.8+1e-6);const guarded={bounds:{w:3,h:3},terrain:['...','.~.','...'],platforms:[],stations:[],mechanisms:[],hazards:[{cells:[{x:1,z:1}],guardEdges:['north']}],_runtime:{platforms:{},mechanisms:{}}},north={x:1.5,z:.5,vx:0,vz:0};for(let i=0;i<45;i++)stepMovement(guarded,north,{dx:0,dz:1},1/60);assert.ok(north.z<.72);});
test('一线天环境直接消费新地图布局且不依赖 cells',()=>{
  const scene=new THREE.Scene();scene.background=new THREE.Color();scene.fog=new THREE.FogExp2(0xffffff,.01);
  const parent=new THREE.Group();scene.add(parent);const hemi=new THREE.HemisphereLight(),sun=new THREE.DirectionalLight();scene.add(hemi,sun,sun.target);
  const material=(color,options={})=>{const allowed={};for(const key of ['roughness','metalness','transparent','opacity','emissive','emissiveIntensity'])if(key in options)allowed[key]=options[key];return new THREE.MeshStandardMaterial({color,...allowed});};
  const box=(w,h,d,color,options)=>new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material(color,options));
  const cyl=(top,bottom,h,color,segments=8,options)=>new THREE.Mesh(new THREE.CylinderGeometry(top,bottom,h,segments),material(color,options));
  const sph=(radius,color,width=8,height=6)=>new THREE.Mesh(new THREE.SphereGeometry(radius,width,height),material(color));
  const controller=createEnvironmentController({scene,hemi,sun,mat:material,box,cyl,sph,qualityTier:'low'});
  assert.doesNotThrow(()=>controller.buildEnvironment(parent,{w:22,h:14,bounds:{w:22,h:14},terrain:Array(14).fill('~'.repeat(22)),platforms:[],stations:[],mechanisms:[]},MAP_THEMES.split));
  controller.dispose();
});
