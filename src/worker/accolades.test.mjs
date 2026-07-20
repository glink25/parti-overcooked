import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8')
  .replace("import { defineRoom } from '@parti/worker-sdk';", '')
  .replace('export default defineRoom({', 'const room = defineRoom({')
  + '\nreturn { teamComment, makePlayerTitles, emptyStats };';
const { teamComment, makePlayerTitles, emptyStats } = new Function('defineRoom', source)((definition) => definition);

function state(players = {}) {
  return { gameSeq: 7, players, roundHistory: [] };
}
function player(id, contribution = 10, overrides = {}) {
  return {
    id, name: id, joinOrder: Number(id.slice(1)) || 1,
    contributionScore: contribution, roundContributionScore: contribution,
    publicEvents: 3, roundPublicEvents: 3, stats: emptyStats(), roundStats: emptyStats(),
    ...overrides,
  };
}

test('完美、高超时、烧糊与高协作命中不同团队评语池', () => {
  const players = { p1: player('p1'), p2: player('p2') };
  assert.equal(teamComment(state(players), { round: 1, score: 80, served: 4, expired: 0, burns: 0 }).rare, true);
  assert.match(teamComment(state(players), { round: 1, score: 5, served: 1, expired: 4, burns: 0 }).title, /食客|订单|厨房|菜还/);
  assert.match(teamComment(state(players), { round: 1, score: 10, served: 1, expired: 1, burns: 3 }).title, /炊烟|招牌|消防|锅比/);
  assert.match(teamComment(state(players), { round: 1, score: 30, served: 2, expired: 1, burns: 0 }).title, /三头六臂|众人拾柴|各司其职|共同体|心有灵犀/);
});

test('三局完美、逆风翻盘和渐入佳境优先触发最终彩蛋', () => {
  const allPerfect = state();
  allPerfect.roundHistory = [1, 2, 3].map((round) => ({ round, score: 30, served: 2, expired: 0 }));
  assert.match(teamComment(allPerfect, { score: 90, served: 6, expired: 0, burns: 0 }, true).title, /天上|三局|米其林|无憾/);

  const comeback = state();
  comeback.roundHistory = [{ round: 1, score: 10, served: 1, expired: 2 }, { round: 2, score: 12, served: 1, expired: 1 }, { round: 3, score: 20, served: 2, expired: 0 }];
  assert.match(teamComment(comeback, { score: 42, served: 4, expired: 3, burns: 0 }, true).title, /力挽狂澜|绝地翻盘|逆风开灶|好戏压轴/);

  const improving = state();
  improving.roundHistory = [{ round: 1, score: 10, served: 1, expired: 0 }, { round: 2, score: 12, served: 1, expired: 0 }, { round: 3, score: 16, served: 1, expired: 1 }];
  assert.match(teamComment(improving, { score: 38, served: 3, expired: 1, burns: 0 }, true).title, /后来居上|渐入佳境|一路升温|每一局/);
});

test('头衔稳定、尽量去重并尊重最低次数', () => {
  const p1 = player('p1', 20); p1.roundStats.chops = 5;
  const p2 = player('p2', 15); p2.roundStats.washes = 3;
  const p3 = player('p3', 8, { roundPublicEvents: 0 });
  const entries = [p1, p2, p3];
  const first = makePlayerTitles(entries, true, 'fixed-seed');
  const second = makePlayerTitles(entries, true, 'fixed-seed');
  assert.deepEqual(first, second);
  assert.match(first.p1.reason, /切配/);
  assert.match(first.p2.reason, /盘子/);
  assert.equal(new Set(Object.values(first).map((award) => award.title)).size, 3);
  assert.ok(first.p3.title);
});
