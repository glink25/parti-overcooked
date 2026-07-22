import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { advanceDeadZoneCenter, cameraPoses, nextCameraFollowMode } from '../../src/client/visual/camera.js';
import { conveyorArrowQuaternion, conveyorPathMetrics, conveyorPathRects, conveyorPointAtDistance, conveyorSegment } from '../../src/client/visual/conveyor.js';
import { createEnvironmentController } from '../../src/client/visual/environment.js';
import { footprintArea, footprintExtents, mapEdgeFootprints, platformEdgeFootprints, sceneStageFootprints } from '../../src/client/visual/map-edges.js';
import { ingredientBadge } from '../../src/client/visual/orders.js';
import { MAP_THEMES } from '../../src/client/visual/themes.js';
import { stepMovement, terrainAt, worldStation } from '../../src/client/movement.js';
import { phaseCapabilities, sceneIdentity } from '../../src/client/phase.js';

const layout={bounds:{w:20,h:14},terrain:Array.from({length:14},(_,z)=>Array.from({length:20},(_,x)=>x>0&&x<19&&z>0&&z<13?'.':' ').join('')),platforms:[{id:'p',origin:{x:3,z:3},tiles:[{x:0,z:0,kind:'.'}]}],stations:[{id:'s',type:'counter',x:0,z:0,supportId:'p'}],mechanisms:[],_runtime:{platforms:{p:{x:1,z:2}},mechanisms:{}}};

test('阶段能力在结算仅开放移动与摇杆',()=>{
  for(const phase of ['lobby','countdown','roundResult','ended'])assert.deepEqual(phaseCapabilities(phase),{move:false,interact:false,work:false,touchControls:false,actionButtons:false,gestureLocked:phase==='countdown'});
  assert.deepEqual(phaseCapabilities('playing'),{move:true,interact:true,work:true,touchControls:true,actionButtons:true,gestureLocked:true});
  assert.deepEqual(phaseCapabilities('awards'),{move:true,interact:false,work:false,touchControls:true,actionButtons:false,gestureLocked:false});
});
test('场景身份同时绑定 gameSeq 与 mapId，结算拒绝复用最后一局布局',()=>{
  assert.equal(sceneIdentity({phase:'playing',gameSeq:3,layout:{mapId:'castle'}}),'3:castle');
  assert.equal(sceneIdentity({phase:'awards',gameSeq:4,layout:{mapId:'awards'}}),'4:awards');
  assert.equal(sceneIdentity({phase:'awards',gameSeq:4,layout:{mapId:'castle'}}),null);
  assert.equal(sceneIdentity({phase:'lobby',gameSeq:4,layout:null}),null);
});

test('客户端使用 bounds 计算放大的游戏镜头并保留倒计时全景',()=>{const aspect=16/9,poses=cameraPoses(layout,aspect),distance=Math.max((layout.bounds.w/2+2.2)/Math.tan(Math.PI*24/180)/aspect,(layout.bounds.h+2)*1.02,8.5);assert.equal(poses.target.x,10);assert.equal(poses.target.z,7.2);assert.ok(Math.abs(poses.playing.y-distance*.86)<1e-9);assert.ok(Math.abs(poses.overview.y-distance*1.55*.86)<1e-9);assert.ok(poses.overview.y>poses.playing.y);});
test('装饰底座范围不参与镜头取景计算',()=>{const staged={...layout,_visualBounds:{minX:-4,maxX:24,minZ:-3,maxZ:18,w:28,h:21}};assert.deepEqual(cameraPoses(staged,16/9),cameraPoses(layout,16/9));});
test('镜头跟随使用宽迟滞和移动死区',()=>{assert.equal(nextCameraFollowMode(false,37,44),false);assert.equal(nextCameraFollowMode(false,35,44),true);assert.equal(nextCameraFollowMode(true,55,44),true);assert.equal(nextCameraFollowMode(true,57,44),false);const still=advanceDeadZoneCenter({x:5,z:5},{x:6,z:5},2.1,.5);assert.deepEqual(still,{x:5,z:5});const moved=advanceDeadZoneCenter(still,{x:9,z:5},2.1,.5);assert.ok(moved.x>5&&moved.x<9);});
test('传送带水平、纵向及反向箭头变换均保持有限值',()=>{for(const [a,b] of [[{x:0,z:0},{x:4,z:0}],[{x:2,z:1},{x:2,z:5}]]){const segment=conveyorSegment(a,b),forward=conveyorArrowQuaternion(segment),reverse=conveyorArrowQuaternion(segment,true);assert.ok(segment.length>0);assert.ok([forward.x,forward.y,forward.z,forward.w,reverse.x,reverse.y,reverse.z,reverse.w].every(Number.isFinite));assert.ok(Math.abs(forward.dot(reverse))<1e-6);}});
test('传送带拒绝斜线并生成与服务端一致的实体带体',()=>{assert.throws(()=>conveyorSegment({x:0,z:0},{x:1,z:1}),/horizontal or vertical/);assert.deepEqual(conveyorPathRects([{x:1,z:2},{x:4,z:2}],.8),[{x:.6,z:1.6,w:3.8,h:.8,kind:'conveyor'}]);});
test('传送带路径采样覆盖转角、开放端夹取和循环取模',()=>{
  const points=[{x:0,z:0},{x:3,z:0},{x:3,z:4}],metrics=conveyorPathMetrics(points);assert.equal(metrics.total,7);assert.equal(metrics.segments.length,2);
  assert.deepEqual(conveyorPointAtDistance(points,2),{x:2,z:0,dx:1,dz:0,distance:2,segmentIndex:0});
  assert.deepEqual(conveyorPointAtDistance(points,4),{x:3,z:1,dx:0,dz:1,distance:4,segmentIndex:1});
  assert.deepEqual(conveyorPointAtDistance(points,99),{x:3,z:4,dx:0,dz:1,distance:7,segmentIndex:1});
  assert.deepEqual(conveyorPointAtDistance(points,-1,{loop:true}),{x:3,z:3,dx:0,dz:1,distance:6,segmentIndex:1});
});
test('订单食材展示稳定区分完整与已切并提供无障碍文案',()=>{
  const ingredients={tomato:{color:0xe53935,name:'番茄'}};
  assert.deepEqual(ingredientBadge(ingredients,'tomato','whole'),{color:'#e53935',label:'番',name:'番茄',prep:'whole',ariaLabel:'完整番茄'});
  assert.equal(ingredientBadge(ingredients,'tomato','chopped').ariaLabel,'切碎番茄');
  assert.deepEqual(ingredientBadge(ingredients,'missing','raw'),{color:'#999999',label:'?',name:'未知食材',prep:'whole',ariaLabel:'完整未知食材'});
});
test('六张地图声明独立、有限且非退化的视觉外缘',()=>{
  const bounds={classic:{w:18,h:13},split:{w:22,h:14},ring:{w:21,h:17},snow:{w:23,h:14},space:{w:24,h:16},castle:{w:23,h:17}};
  assert.equal(new Set(Object.keys(bounds).map((id)=>MAP_THEMES[id].edgeProfile.id)).size,6);
  for(const [id,size] of Object.entries(bounds)){
    const profile=MAP_THEMES[id].edgeProfile;
    const footprints=id==='split'?platformEdgeFootprints({id:'west',tiles:Array.from({length:54},(_,index)=>({x:index%6,z:Math.floor(index/6)}))},profile):mapEdgeFootprints({bounds:size},profile);
    assert.ok(footprints.length>0,id);
    for(const points of footprints){assert.ok(points.length>=12,id);assert.ok(points.every((point)=>Number.isFinite(point.x)&&Number.isFinite(point.z)),id);assert.ok(footprintArea(points)>4,id);}
  }
});
test('六张地图的总场景底座形状各异并包围玩法区域',()=>{
  const bounds={classic:{w:18,h:13},split:{w:22,h:14},ring:{w:21,h:17},snow:{w:23,h:14},space:{w:24,h:16},castle:{w:23,h:17}};
  assert.equal(new Set(Object.keys(bounds).map((id)=>MAP_THEMES[id].stageProfile.id)).size,6);
  for(const [id,size] of Object.entries(bounds)){
    const footprints=sceneStageFootprints({bounds:size},MAP_THEMES[id].stageProfile),extents=footprintExtents(footprints);
    assert.ok(footprints.length>0,id);assert.ok(extents.w>size.w&&extents.h>size.h,id);
    for(const points of footprints){assert.ok(points.length>=12,id);assert.ok(points.every((point)=>Number.isFinite(point.x)&&Number.isFinite(point.z)),id);assert.ok(footprintArea(points)>size.w*size.h,id);}
  }
});
test('移动平台本地坐标转换为世界坐标',()=>{const station=worldStation(layout,layout.stations[0]);assert.deepEqual({x:station.x,z:station.z},{x:4,z:5});assert.equal(terrainAt(layout,4.5,5.5),'.');});
test('新地形上的移动保持固定步长',()=>{const player={x:5,z:5,vx:0,vz:0};for(let i=0;i<60;i++)stepMovement(layout,player,{dx:1,dz:0},1/60);assert.ok(player.x>7);});
test('wall 阻挡移动，void 与 water 不会被解释为地板',()=>{const walls={bounds:{w:5,h:3},terrain:['.....','..#~.','.....'],platforms:[],stations:[],mechanisms:[],_runtime:{mechanisms:{},platforms:{}}},player={x:1.5,z:1.5,vx:0,vz:0};for(let i=0;i<90;i++)stepMovement(walls,player,{dx:1,dz:0},1/60);assert.ok(player.x<=1.7+1e-6);assert.equal(terrainAt(walls,3.5,1.5),'~');assert.equal(terrainAt(walls,-1,1),' ');});
test('客户端预测把关闭的多格城门视为完整碰撞墙',()=>{const gated={bounds:{w:5,h:3},terrain:['.....','.....','.....'],platforms:[],stations:[],mechanisms:[],_runtime:{platforms:{},mechanisms:{royal:{type:'gate',gates:[{id:'east',open:false,cells:[{x:2,z:0},{x:2,z:1},{x:2,z:2}]}]}}}},player={x:1.5,z:1.5,vx:0,vz:0};for(let i=0;i<90;i++)stepMovement(gated,player,{dx:1,dz:0},1/60);assert.ok(player.x<=1.7+1e-6);});
test('客户端预测把高台传送带和裂谷护栏视为实体碰撞',()=>{const belt={bounds:{w:8,h:5},terrain:Array(5).fill('.'.repeat(8)),platforms:[],stations:[],mechanisms:[{id:'belt',type:'conveyor',config:{path:{points:[{x:3.5,z:.5},{x:3.5,z:4.5}]}}}],hazards:[],_runtime:{platforms:{},mechanisms:{}}},player={x:2.5,z:2.5,vx:0,vz:0};for(let i=0;i<90;i++)stepMovement(belt,player,{dx:1,dz:0},1/60);assert.ok(player.x<=2.8+1e-6);const guarded={bounds:{w:3,h:3},terrain:['...','.~.','...'],platforms:[],stations:[],mechanisms:[],hazards:[{cells:[{x:1,z:1}],guardEdges:['north']}],_runtime:{platforms:{},mechanisms:{}}},north={x:1.5,z:.5,vx:0,vz:0};for(let i=0;i<45;i++)stepMovement(guarded,north,{dx:0,dz:1},1/60);assert.ok(north.z<.72);});
test('六张地图环境可构建主题外缘且不依赖 cells',()=>{
  const scene=new THREE.Scene();scene.background=new THREE.Color();scene.fog=new THREE.FogExp2(0xffffff,.01);
  const parent=new THREE.Group();scene.add(parent);const hemi=new THREE.HemisphereLight(),sun=new THREE.DirectionalLight();scene.add(hemi,sun,sun.target);
  const material=(color,options={})=>{const allowed={};for(const key of ['roughness','metalness','transparent','opacity','emissive','emissiveIntensity'])if(key in options)allowed[key]=options[key];return new THREE.MeshStandardMaterial({color,...allowed});};
  const box=(w,h,d,color,options)=>new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material(color,options));
  const cyl=(top,bottom,h,color,segments=8,options)=>new THREE.Mesh(new THREE.CylinderGeometry(top,bottom,h,segments),material(color,options));
  const sph=(radius,color,width=8,height=6)=>new THREE.Mesh(new THREE.SphereGeometry(radius,width,height),material(color));
  const controller=createEnvironmentController({scene,hemi,sun,mat:material,box,cyl,sph,qualityTier:'low'});
  for(const [id,size] of Object.entries({classic:{w:18,h:13},split:{w:22,h:14},ring:{w:21,h:17},snow:{w:23,h:14},space:{w:24,h:16},castle:{w:23,h:17}})){
    const terrain=Array(size.h).fill(' '.repeat(size.w));
    const built=controller.buildEnvironment(parent,{...size,bounds:size,terrain,platforms:[],stations:[],mechanisms:[]},MAP_THEMES[id]);
    assert.equal(built.userData.edgeProfileId,MAP_THEMES[id].edgeProfile.id,id);
    assert.equal(built.userData.stageProfileId,MAP_THEMES[id].stageProfile.id,id);
  }
  controller.dispose();
});
