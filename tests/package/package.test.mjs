import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWorker } from '../helpers/worker-runtime.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
test('manifest 公开全新 action 协议',()=>{const manifest=JSON.parse(readFileSync(path.join(root,'public/parti.room.json'),'utf8'));assert.match(manifest.actions.interact.payload,/start/);assert.match(manifest.actions.work.payload,/active/);assert.match(manifest.actions.move.payload,/seq/);});
test('构建产物自包含且整个包低于 20MB',()=>{for(const file of ['index.html','room.worker.js','parti.room.json'])assert.ok(existsSync(path.join(root,'dist',file)));const html=readFileSync(path.join(root,'dist/index.html'),'utf8');assert.doesNotMatch(html,/<(?:script|link|img)[^>]+(?:src|href)=["']https?:\/\//i);const packageBytes=readdirSync(path.join(root,'dist'),{withFileTypes:true}).filter((entry)=>entry.isFile()).reduce((total,entry)=>total+statSync(path.join(root,'dist',entry.name)).size,0);assert.ok(packageBytes<20*1024*1024);});
test('Worker action 与 Manifest 同步且只使用允许的 SDK import',()=>{const manifest=JSON.parse(readFileSync(path.join(root,'public/parti.room.json'),'utf8')),definition=loadWorker(path.join(root,'src/worker/index.js')),source=readFileSync(path.join(root,'dist/room.worker.js'),'utf8');assert.deepEqual(Object.keys(manifest.actions),Object.keys(definition.actions));const imports=[...source.matchAll(/^import\s+.+?from\s+["'](.+?)["'];?/gm)].map((match)=>match[1]);assert.deepEqual(imports,['@parti/worker-sdk']);});
