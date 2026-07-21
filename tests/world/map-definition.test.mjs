import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWorker } from '../helpers/worker-runtime.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const definition=loadWorker(path.join(root,'src/worker/index.js'));
const maps=definition.__maps;
const recipes=definition.__recipes;

test('六张地图只使用全新世界模型',()=>{
  assert.deepEqual(Object.keys(maps),['classic','split','ring','snow','space','castle']);
  for(const map of Object.values(maps)){
    assert.ok(map.bounds.w>=18&&map.bounds.w<=24);
    assert.equal(map.terrain.length,map.bounds.h);
    assert.ok(map.terrain.every((row)=>row.length===map.bounds.w));
    assert.equal(map.spawns.length,4);
    assert.equal(new Set(map.spawns.map((spawn)=>spawn.slot)).size,4);
    assert.ok(map.checkpoints.length>0);
    for(const type of ['crate','board','stove','plates','sink','trash','window'])assert.ok(map.stations.some((station)=>station.type===type),`${map.id}:${type}`);
    assert.equal('grid' in map,false);
    assert.equal('cells' in map,false);
    assert.equal('stationAt' in map,false);
    assert.equal('mechanic' in map,false);
  }
});

test('六图声明预期组合机制',()=>{
  const types=(id)=>maps[id].mechanisms.map((entry)=>entry.type);
  assert.equal(types('classic').join(','),'conveyor');
  assert.ok(types('split').includes('movingPlatform')&&types('split').includes('waterHazard'));
  assert.ok(types('ring').includes('conveyor'));
  assert.ok(types('snow').includes('iceSurface')&&types('snow').includes('conveyor')&&!types('snow').includes('movingPlatform'));
  assert.ok(types('space').includes('conveyor')&&!types('space').includes('movingPlatform')&&!types('space').includes('itemTeleport'));
  assert.equal(types('castle').join(','),'gate');
});

test('移动与分离平台只在一线天使用',()=>{for(const [id,map] of Object.entries(maps))assert.equal(map.mechanisms.some((entry)=>entry.type==='movingPlatform'),id==='split',id);});

test('地图标识在工位、平台和机制之间全局唯一',()=>{
  for(const map of Object.values(maps)){const ids=[...map.stations,...map.platforms,...map.mechanisms].map((entry)=>entry.id);assert.equal(new Set(ids).size,ids.length,map.id);}
});

test('全部传送带只由正交线段和专用输入输出台组成',()=>{for(const map of Object.values(maps))for(const belt of map.mechanisms.filter((entry)=>entry.type==='conveyor')){for(let index=1;index<belt.config.path.points.length;index++){const a=belt.config.path.points[index-1],b=belt.config.path.points[index];assert.ok((a.x===b.x)!==(a.z===b.z),`${map.id}:${belt.id}`);}const ports=map.stations.filter((entry)=>entry.type==='conveyorPort'&&entry.conveyorId===belt.id);assert.ok(ports.some((entry)=>entry.portMode==='input'),`${map.id}:${belt.id}:input`);assert.ok(ports.some((entry)=>entry.portMode==='output'),`${map.id}:${belt.id}:output`);}});

test('工位、出生点和检查点全部位于有效地块',()=>{
  for(const map of Object.values(maps))for(const point of [...map.stations,...map.spawns,...map.checkpoints]){
    if(point.supportId){const platform=map.platforms.find((entry)=>entry.id===point.supportId);assert.ok(platform?.tiles.some((tile)=>tile.x===Math.floor(point.x)&&tile.z===Math.floor(point.z)),`${map.id}:${point.id||point.slot}`);}
    else assert.ok(['.','i'].includes(map.terrain[Math.floor(point.z)]?.[Math.floor(point.x)]),`${map.id}:${point.id||point.slot}`);
  }
});

test('出生点和检查点不会落在固定工位或高台传送带内',()=>{const rects=(map)=>map.mechanisms.filter((entry)=>entry.type==='conveyor').flatMap((belt)=>belt.config.path.points.slice(1).map((b,index)=>{const a=belt.config.path.points[index],half=.4;return{x:Math.min(a.x,b.x)-half,z:Math.min(a.z,b.z)-half,w:Math.abs(b.x-a.x)+.8,h:Math.abs(b.z-a.z)+.8};}));for(const map of Object.values(maps))for(const point of [...map.spawns,...map.checkpoints]){if(point.supportId)continue;assert.ok(!map.stations.some((station)=>point.x>=station.x&&point.x<=station.x+1&&point.z>=station.z&&point.z<=station.z+1),`${map.id}:${point.id||point.slot}:station`);assert.ok(!rects(map).some((rect)=>point.x>=rect.x&&point.x<=rect.x+rect.w&&point.z>=rect.z&&point.z<=rect.z+rect.h),`${map.id}:${point.id||point.slot}:belt`);}});

test('每张地图提供其菜谱池需要的全部食材箱',()=>{
  for(const map of Object.values(maps)){const available=new Set(map.stations.filter((entry)=>entry.type==='crate').map((entry)=>entry.crate));for(const recipeId of map.recipePool){const recipe=recipes.find((entry)=>entry.id===recipeId);assert.ok(recipe,`${map.id}:${recipeId}`);for(const item of recipe.items)assert.ok(available.has(item.ingredient),`${map.id}:${recipeId}:${item.ingredient}`);}}
});

test('普通边界由墙保护，只有显式危险地图保留落差开口',()=>{
  const exposed=(map)=>{let count=0;for(let z=0;z<map.bounds.h;z++)for(let x=0;x<map.bounds.w;x++)if(['.','i'].includes(map.terrain[z][x]))for(const[dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]]){const cell=map.terrain[z+dz]?.[x+dx]??' ';if(!['.','i','#'].includes(cell))count++;}return count;};
  for(const id of ['classic','space','castle'])assert.equal(exposed(maps[id]),0,id);
  assert.ok(exposed(maps.ring)>0);assert.ok(exposed(maps.snow)>0);
});

test('所有固定工位均至少有一个可站立交互面',()=>{
  for(const map of Object.values(maps))for(const station of map.stations){if(station.supportId)continue;const open=[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dz])=>['.','i'].includes(map.terrain[station.z+dz]?.[station.x+dx])&&!map.stations.some((other)=>!other.supportId&&other.x===station.x+dx&&other.z===station.z+dz));assert.ok(open,`${map.id}:${station.id}`);}
});

test('城堡四组城门完整覆盖入口并声明四种双门阵',()=>{
  const gate=maps.castle.mechanisms.find((entry)=>entry.type==='gate');assert.equal(gate.config.groups.length,4);assert.ok(gate.config.groups.every((entry)=>entry.cells.length===3));assert.equal(gate.config.presets.length,4);assert.ok(gate.config.presets.every((entry)=>entry.open.length===2));assert.equal(gate.config.switchEvery,16);assert.equal(gate.config.warning,4);
});

test('环岛装卸口保留标记，雪山裂谷使用环境化危险元数据',()=>{
  assert.equal(maps.ring.hazardMarkers.length,4);assert.equal(maps.snow.hazardMarkers,undefined);assert.equal(maps.snow.hazards.length,2);
  for(const marker of maps.ring.hazardMarkers)assert.ok(!['.','i','#'].includes(maps.ring.terrain[Math.floor(marker.z)]?.[Math.floor(marker.x)]));
  for(const hazard of maps.snow.hazards){assert.equal(hazard.type,'iceCrevasse');assert.equal(hazard.guardEdges.join(','),'north,south');for(const cell of hazard.cells)assert.ok(!['.','i','#'].includes(maps.snow.terrain[cell.z]?.[cell.x]));}
});
