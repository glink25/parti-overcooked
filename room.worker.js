// src/worker/index.js
import { defineRoom } from "@parti/worker-sdk";
var TICK_MS = 100;
var DT = TICK_MS / 1e3;
var SPEED = 3.2;
var PLAYER_R = 0.3;
var STOP_TIME = 0.1;
var DECELERATION = SPEED / STOP_TIME;
var MOVE_FIXED_STEP = 1 / 60;
var MOVE_SOLVER_PASSES = 4;
var MOVE_EPSILON = 1e-9;
var CHOP_TIME = 3;
var WASH_TIME = 4;
var COOK_TIME = 12;
var BURN_TIME = 12;
var DIRTY_DELAY = 8;
var GAME_TIME = 180;
var ORDER_LIFE = 95;
var ORDER_MIN_GAP = 25;
var ORDER_VAR_GAP = 10;
var MAX_ORDERS = 4;
var COUNTDOWN_T = 3;
var EXPIRE_PENALTY = 5;
var ROUND_RESULT_T = 8;
var RAGE_MAX = 100;
var RAGE_EXPIRED = 25;
var RAGE_SERVED = 5;
var BUFF_TYPES = ["fast_hands", "master_chef", "swift_feet", "fire_overdrive"];
var BUFF_WEIGHTS = [2, 2, 2, 1];
var BUFF_DURATION = 15;
var BUFF_LIFETIME = 18;
var FIRE_OVERDRIVE_DURATION = 10;
var THROW_THRESHOLD = 0.3;
var THROW_FULL_TIME = 1.2;
var THROW_MIN_RANGE = 1.5;
var THROW_MAX_RANGE = 5.5;
var THROW_TIMEOUT = 3;
var WORLD_ITEM_LIFETIME = 20;
var WORLD_ITEM_LIMIT = 48;
var FALL_TIME = 0.8;
var RESPAWN_GRACE = 0.6;
var INTERACT_COOLDOWN = 0.12;
var PLAYER_COLORS = ["#e74c3c", "#3498db", "#f1c40f", "#2ecc71"];
var STAT_KEYS = ["chops", "washes", "assembles", "potAdds", "potPickups", "deliveries", "fastServes", "clutchServes", "burnClears", "discards", "throws", "catches", "groundPickups", "falls", "conveyorTransfers"];
function emptyStats() {
  const out = {};
  for (const key of STAT_KEYS) out[key] = 0;
  return out;
}
function normalizeStats(value) {
  const out = emptyStats();
  for (const key of STAT_KEYS) if (Number.isFinite(value && value[key])) out[key] = Math.max(0, Math.floor(value[key]));
  return out;
}
function bumpStat(p, key) {
  if (!p || !STAT_KEYS.includes(key)) return;
  if (!p.stats) p.stats = emptyStats();
  if (!p.roundStats) p.roundStats = emptyStats();
  p.stats[key] = (p.stats[key] || 0) + 1;
  p.roundStats[key] = (p.roundStats[key] || 0) + 1;
}
var TEAM_COPY = {
  perfect: [
    ["\u6EE1\u6C49\u5168\u5E2D\uFF0C\u51C6\u65F6\u5F00\u5E2D", "\u96F6\u5355\u8D85\u65F6\uFF0C\u5BBE\u4E3B\u5C3D\u6B22\u3002"],
    ["\u96F6\u5355\u8D85\u65F6\uFF0C\u5BBE\u4E3B\u5C3D\u6B22", "\u4ECA\u5929\u7684\u8BA2\u5355\uFF0C\u53E5\u53E5\u6709\u56DE\u5E94\u3002"],
    ["\u8FD9\u4E0D\u662F\u51FA\u9910\uFF0C\u8FD9\u662F\u884C\u4E91\u6D41\u6C34", "\u98DF\u5BA2\u751A\u81F3\u6765\u4E0D\u53CA\u50AC\u5355\u3002"],
    ["\u7089\u706B\u7EAF\u9752\uFF0C\u5206\u79D2\u4E0D\u5DEE", "\u6BCF\u4E00\u9053\u83DC\u90FD\u8D76\u4E0A\u4E86\u6700\u4F73\u65F6\u8FB0\u3002"],
    ["\u4E00\u9F13\u4F5C\u6C14\uFF0C\u6EE1\u5E2D\u751F\u9999", "\u8BA2\u5355\u6E05\u6E05\u723D\u723D\uFF0C\u98DF\u5BA2\u5FC3\u6EE1\u610F\u8DB3\u3002"]
  ],
  efficient: [
    ["\u7089\u706B\u7EAF\u9752", "\u6709\u6761\u4E0D\u7D0A\uFF0C\u9505\u94F2\u751F\u98CE\u3002"],
    ["\u6D41\u6C34\u7684\u8BA2\u5355\uFF0C\u94C1\u6253\u7684\u53A8\u5E08", "\u53A8\u623F\u867D\u5C0F\uFF0C\u6548\u7387\u5F88\u5927\u3002"],
    ["\u516B\u65B9\u6765\u5355\uFF0C\u56DB\u9762\u51FA\u83DC", "\u5FD9\u800C\u4E0D\u4E71\uFF0C\u7A33\u7A33\u5F53\u5F53\u3002"],
    ["\u4ECA\u65E5\u51FA\u9910\uFF1A\u4E00\u8DEF\u7EFF\u706F", "\u7076\u53F0\u4E0E\u7827\u677F\u90FD\u5F88\u7ED9\u9762\u5B50\u3002"],
    ["\u5FEB\u9A6C\u52A0\u97AD\uFF0C\u70ED\u83DC\u5148\u884C", "\u901F\u5EA6\u4E0E\u6E29\u5EA6\u4E00\u4E2A\u90FD\u6CA1\u843D\u4E0B\u3002"]
  ],
  expired: [
    ["\u98DF\u5BA2\u9965\u80A0\u8F98\u8F98", "\u83DC\u5355\u770B\u4E86\u4E09\u904D\uFF0C\u83DC\u8FD8\u5728\u6210\u957F\u3002"],
    ["\u98DF\u5BA2\u6012\u6C14\u51B2\u5929", "\u53A8\u623F\u4E5F\u5F88\u7740\u6025\uFF0C\u9505\u53EF\u4EE5\u4F5C\u8BC1\u3002"],
    ["\u8BA2\u5355\u8D70\u5B8C\u4E86\u5B83\u77ED\u6682\u7684\u4E00\u751F", "\u613F\u4E0B\u4E00\u5F20\u5355\u636E\u5F97\u507F\u6240\u613F\u3002"],
    ["\u83DC\u8FD8\u5728\u8DEF\u4E0A\uFF0C\u98DF\u5BA2\u5DF2\u770B\u6DE1\u4EBA\u751F", "\u672C\u5E97\u6682\u65F6\u4E3B\u6253\u8010\u5FC3\u3002"],
    ["\u53A8\u623F\u5F88\u5FD9\uFF0C\u4E3B\u8981\u5FD9\u7740\u5FD9", "\u9505\u7897\u74E2\u76C6\u90FD\u53C2\u4E0E\u4E86\u8BA8\u8BBA\u3002"]
  ],
  hectic: [
    ["\u7126\u5934\u70C2\u989D\uFF0C\u5C1A\u80FD\u5F00\u5E2D", "\u8FC7\u7A0B\u60CA\u5FC3\u52A8\u9B44\uFF0C\u7ED3\u679C\u8FD8\u80FD\u4E0A\u684C\u3002"],
    ["\u5175\u8352\u9A6C\u4E71\uFF0C\u996D\u5012\u662F\u719F\u4E86", "\u8FD9\u5C31\u53EB\u4E71\u4E2D\u6709\u5E8F\uFF0C\u5927\u6982\u3002"],
    ["\u9505\u7897\u74E2\u76C6\u5404\u6709\u5404\u7684\u60F3\u6CD5", "\u597D\u5728\u6700\u540E\u8FBE\u6210\u4E86\u57FA\u672C\u5171\u8BC6\u3002"],
    ["\u8FC7\u7A0B\u50CF\u707E\u96BE\u7247\uFF0C\u7ED3\u5C40\u50CF\u7F8E\u98DF\u7247", "\u526A\u8F91\u5E08\u529F\u4E0D\u53EF\u6CA1\u3002"],
    ["\u624B\u5FD9\u811A\u4E71\uFF0C\u9505\u7A33\u83DC\u9999", "\u5FD9\u4E71\u53EA\u662F\u8868\u8C61\uFF0C\u4E0A\u684C\u624D\u662F\u7B54\u6848\u3002"]
  ],
  teamwork: [
    ["\u4E09\u5934\u516D\u81C2", "\u4F60\u9012\u6211\u63A5\uFF0C\u914D\u5408\u5F97\u50CF\u6392\u7EC3\u8FC7\u3002"],
    ["\u4F17\u4EBA\u62FE\u67F4\u706B\u7130\u9AD8", "\u6BCF\u628A\u9505\u94F2\u90FD\u6709\u59D3\u540D\u3002"],
    ["\u5404\u53F8\u5176\u804C\uFF0C\u516B\u65B9\u6765\u83DC", "\u6CA1\u6709\u5B64\u80C6\u82F1\u96C4\uFF0C\u53EA\u6709\u9EC4\u91D1\u642D\u6863\u3002"],
    ["\u53A8\u623F\u547D\u8FD0\u5171\u540C\u4F53", "\u4ECA\u65E5\u4EFD\u9ED8\u5951\u5DF2\u6210\u529F\u88C5\u76D8\u3002"],
    ["\u5FC3\u6709\u7075\u7280\u4E00\u70B9\u901A", "\u4E00\u4E2A\u773C\u795E\uFF0C\u4E00\u76D8\u83DC\u3002"]
  ],
  burnt: [
    ["\u708A\u70DF\u8885\u8885\uFF0C\u53EF\u80FD\u4E0D\u5168\u662F\u708A\u70DF", "\u9505\u5E95\u62E5\u6709\u4E86\u81EA\u5DF1\u7684\u6545\u4E8B\u3002"],
    ["\u672C\u5E97\u62DB\u724C\uFF1A\u5916\u7126\u91CC\u4E5F\u7126", "\u706B\u5019\u662F\u4E00\u95E8\u5954\u653E\u7684\u827A\u672F\u3002"],
    ["\u6D88\u9632\u610F\u8BC6\u6DF1\u5165\u9505\u5FC3", "\u4E0B\u4E00\u9505\u4E00\u5B9A\u6E29\u67D4\u4EE5\u5F85\u3002"],
    ["\u9505\u6BD4\u98DF\u5BA2\u5148\u5403\u9971\u4E86", "\u7126\u9999\u867D\u6D53\uFF0C\u6597\u5FD7\u66F4\u6D53\u3002"],
    ["\u661F\u661F\u4E4B\u706B\uFF0C\u53EF\u4EE5\u71CE\u9505", "\u597D\u5728\u6551\u706B\u7684\u4EBA\u4E00\u76F4\u90FD\u5728\u3002"]
  ],
  idle: [
    ["\u4E07\u4E8B\u4FF1\u5907\uFF0C\u53EA\u5DEE\u51FA\u83DC", "\u53A8\u623F\u5B8C\u6210\u4E86\u5145\u5206\u7684\u70ED\u8EAB\u8FD0\u52A8\u3002"],
    ["\u98DF\u6750\u89C1\u8FC7\u4E86\u4E16\u9762", "\u98DF\u5BA2\u8FD8\u6CA1\u89C1\u5230\u83DC\u3002"],
    ["\u4E00\u5207\u90FD\u5728\u8BA1\u5212\u4E4B\u4E2D", "\u53EA\u662F\u8BA1\u5212\u6682\u672A\u5305\u542B\u4E0A\u83DC\u3002"],
    ["\u4ECA\u65E5\u83DC\u5355\uFF1A\u7A0D\u540E\u63ED\u6653", "\u9505\u94F2\u4EEC\u4ECD\u5728\u915D\u917F\u7075\u611F\u3002"],
    ["\u84C4\u52BF\u5F85\u53D1\uFF0C\u5C1A\u672A\u53D1\u51FA", "\u4E0B\u4E00\u5C40\u4E89\u53D6\u8BA9\u83DC\u5148\u8D70\u4E00\u6B65\u3002"]
  ],
  middling: [
    ["\u6709\u60CA\u65E0\u9669\uFF0C\u52C9\u5F3A\u4F18\u96C5", "\u51E0\u5F20\u8BA2\u5355\u4E0E\u65F6\u95F4\u64E6\u80A9\u800C\u8FC7\u3002"],
    ["\u83DC\u4E0A\u4E86\u4E00\u4E9B\uFF0C\u60AC\u5FF5\u7559\u4E86\u4E00\u4E9B", "\u98DF\u5BA2\u4E0E\u53A8\u5E08\u90FD\u6536\u83B7\u4E86\u6210\u957F\u3002"],
    ["\u534A\u662F\u70DF\u706B\uFF0C\u534A\u662F\u7B49\u5F85", "\u53A8\u623F\u6545\u4E8B\u4ECD\u672A\u5B8C\u5F85\u7EED\u3002"],
    ["\u7A33\u4E2D\u5E26\u5FD9\uFF0C\u5FD9\u4E2D\u5E26\u5FD8", "\u81F3\u5C11\u7AEF\u51FA\u53BB\u7684\u90FD\u662F\u597D\u83DC\u3002"],
    ["\u4E00\u534A\u4ECE\u5BB9\uFF0C\u4E00\u534A\u5306\u5FD9", "\u8FD9\u5927\u6982\u5C31\u662F\u53A8\u623F\u7684\u9634\u9633\u8C03\u548C\u3002"]
  ],
  generic: [
    ["\u53A8\u623F\u4E0D\u4F1A\u8BF4\u8BDD\uFF0C\u4F46\u9505\u770B\u8D77\u6765\u6709\u610F\u89C1", "\u8F9B\u82E6\u5404\u4F4D\uFF0C\u56F4\u88D9\u77E5\u9053\u4E00\u5207\u3002"],
    ["\u4ECA\u65E5\u4EFD\u9ED8\u5951\u5DF2\u6210\u529F\u88C5\u76D8", "\u80FD\u7AEF\u51FA\u53BB\u7684\uFF0C\u90FD\u662F\u597D\u83DC\u3002"],
    ["\u9505\u94F2\u4E00\u54CD\uFF0C\u597D\u620F\u5F00\u573A", "\u8FD9\u4E00\u5C40\u7684\u6ECB\u5473\u53EB\u5E76\u80A9\u4F5C\u6218\u3002"],
    ["\u4EBA\u95F4\u70DF\u706B\u6C14\uFF0C\u6700\u629A\u53A8\u5E08\u5FC3", "\u6536\u62FE\u5FC3\u60C5\uFF0C\u4E0B\u4E00\u5C40\u7EE7\u7EED\u5F00\u706B\u3002"],
    ["\u53A8\u623F\u867D\u4E71\uFF0C\u53CB\u8C0A\u4E0D\u6563", "\u6BCF\u4E00\u6B21\u78B0\u649E\u90FD\u7B97\u56E2\u961F\u4EA4\u6D41\u3002"]
  ]
};
var FINAL_COPY = {
  allPerfect: [
    ["\u6B64\u5BB4\u53EA\u5E94\u5929\u4E0A\u6709", "\u4E09\u6218\u4E09\u6377\uFF0C\u6EE1\u5802\u559D\u5F69\u3002"],
    ["\u4E09\u5C40\u5168\u4F18\uFF0C\u5B8C\u7F8E\u6536\u5B98", "\u51C6\u65F6\uFF0C\u662F\u4ECA\u665A\u6700\u9999\u7684\u8C03\u5473\u6599\u3002"],
    ["\u7C73\u5176\u6797\u8DEF\u8FC7\u90FD\u60F3\u8BB0\u7B14\u8BB0", "\u8FD9\u652F\u961F\u4F0D\u628A\u9ED8\u5951\u505A\u6210\u4E86\u62DB\u724C\u83DC\u3002"],
    ["\u4E00\u5E2D\u65E0\u61BE\uFF0C\u5C3D\u5174\u800C\u5F52", "\u6240\u6709\u8BA2\u5355\u90FD\u627E\u5230\u4E86\u5F52\u5BBF\u3002"]
  ],
  comeback: [
    ["\u529B\u633D\u72C2\u6F9C\uFF0C\u6276\u9505\u4E8E\u5C06\u503E", "\u524D\u83DC\u7565\u82E6\uFF0C\u6536\u5B98\u56DE\u7518\u3002"],
    ["\u7EDD\u5730\u7FFB\u76D8", "\u6700\u540E\u4E00\u9053\u83DC\u6CA1\u6709\u653E\u5F03\u3002"],
    ["\u9006\u98CE\u5F00\u7076\uFF0C\u987A\u98CE\u4E0A\u83DC", "\u771F\u6B63\u7684\u4E3B\u53A8\u4ECE\u4E0D\u6015\u5F00\u5C40\u4E0D\u5229\u3002"],
    ["\u597D\u620F\u538B\u8F74\uFF0C\u70ED\u83DC\u6536\u5B98", "\u53A8\u623F\u628A\u60AC\u5FF5\u7559\u5230\u4E86\u6700\u540E\u3002"]
  ],
  improving: [
    ["\u540E\u6765\u5C45\u4E0A\uFF0C\u7076\u89C1\u771F\u7AE0", "\u8D8A\u6218\u8D8A\u52C7\uFF0C\u8D8A\u7092\u8D8A\u9999\u3002"],
    ["\u6E10\u5165\u4F73\u5883", "\u7B2C\u4E00\u5C40\u627E\u9505\uFF0C\u6700\u540E\u4E00\u5C40\u627E\u4E0D\u5230\u5BF9\u624B\u3002"],
    ["\u4E00\u8DEF\u5347\u6E29\uFF0C\u6070\u5230\u597D\u5904", "\u914D\u5408\u548C\u6C64\u4E00\u6837\u8D8A\u7096\u8D8A\u6D53\u3002"],
    ["\u6BCF\u4E00\u5C40\u90FD\u6BD4\u4E0A\u4E00\u5C40\u66F4\u9999", "\u6210\u957F\u5DF2\u7ECF\u7AEF\u4E0A\u684C\u4E86\u3002"]
  ],
  perfect: [
    ["\u5168\u573A\u96F6\u8D85\u65F6\uFF0C\u5BBE\u4E3B\u5C3D\u6B22", "\u8FD9\u573A\u6D3E\u5BF9\u6CA1\u6709\u7559\u4E0B\u9057\u61BE\u8BA2\u5355\u3002"],
    ["\u4ECE\u5F00\u706B\u5230\u6253\u70CA\uFF0C\u4E00\u8DEF\u51C6\u70B9", "\u65F6\u95F4\u7BA1\u7406\u5927\u5E08\u96C6\u4F53\u51FA\u9053\u3002"],
    ["\u6709\u59CB\u6709\u7EC8\uFF0C\u6709\u83DC\u6709\u6C64", "\u5B8C\u7F8E\u4E8C\u5B57\u5DF2\u7ECF\u5199\u5728\u56F4\u88D9\u4E0A\u3002"],
    ["\u5168\u5E2D\u65E0\u7F3A", "\u98DF\u5BA2\u6EE1\u610F\u5F97\u5FD8\u4E86\u50AC\u5355\u3002"]
  ],
  efficient: [
    ["\u4ECA\u65E5\u53A8\u623F\uFF0C\u76DB\u51B5\u7A7A\u524D", "\u8BA2\u5355\u5982\u6F6E\uFF0C\u51FA\u83DC\u5982\u98CE\u3002"],
    ["\u91D1\u724C\u540E\u53A8\uFF0C\u5706\u6EE1\u6253\u70CA", "\u6548\u7387\u4E0E\u9505\u6C14\u53CC\u53CC\u5728\u7EBF\u3002"],
    ["\u4E00\u684C\u597D\u83DC\uFF0C\u4E00\u7FA4\u597D\u642D\u6863", "\u4ECA\u665A\u7684\u62DB\u724C\u53EB\u914D\u5408\u3002"],
    ["\u7089\u706B\u4E0D\u606F\uFF0C\u4F73\u80B4\u4E0D\u6B62", "\u5FD9\u788C\u6700\u7EC8\u90FD\u6709\u4E86\u5206\u6570\u3002"]
  ],
  chaotic: [
    ["\u7126\u5934\u70C2\u989D\uFF0C\u4ECD\u7136\u503C\u5F97\u9F13\u638C", "\u53A8\u623F\u7559\u4E0B\u4E86\u6545\u4E8B\uFF0C\u4E5F\u7559\u4E0B\u4E86\u51E0\u53E3\u9505\u3002"],
    ["\u98DF\u5BA2\u7B49\u5230\u4E86\u6545\u4E8B\u7684\u7ED3\u5C40", "\u867D\u7136\u4E2D\u95F4\u63D2\u64AD\u4E86\u51E0\u6B21\u8D85\u65F6\u3002"],
    ["\u70DF\u706B\u5F88\u65FA\uFF0C\u60AC\u5FF5\u66F4\u65FA", "\u6253\u70CA\u4E86\uFF0C\u9505\u7EC8\u4E8E\u53EF\u4EE5\u51B7\u9759\u4E00\u4E0B\u3002"],
    ["\u4E00\u573A\u5F88\u6709\u53C2\u4E0E\u611F\u7684\u665A\u9910", "\u6BCF\u5F20\u8BA2\u5355\u90FD\u89C1\u8BC1\u8FC7\u52AA\u529B\u3002"]
  ],
  generic: [
    ["\u66F2\u7EC8\u4EBA\u672A\u6563\uFF0C\u9505\u51C9\u60C5\u8FD8\u70ED", "\u8F9B\u82E6\u5404\u4F4D\uFF0C\u4ECA\u65E5\u987A\u5229\u6253\u70CA\u3002"],
    ["\u4E00\u9910\u4E00\u996D\uFF0C\u7686\u662F\u56E2\u961F\u4F5C\u6218", "\u56F4\u88D9\u53EF\u4EE5\u8131\u4E0B\uFF0C\u9ED8\u5951\u7EE7\u7EED\u4FDD\u7559\u3002"],
    ["\u9505\u7897\u6682\u6B47\uFF0C\u6C5F\u6E56\u518D\u89C1", "\u8FD9\u684C\u56DE\u5FC6\u5DF2\u7ECF\u6253\u5305\u5B8C\u6BD5\u3002"],
    ["\u6253\u70CA\u4E0D\u662F\u7ED3\u675F\uFF0C\u662F\u4E0B\u4E00\u6B21\u5F00\u706B\u7684\u9884\u544A", "\u611F\u8C22\u6BCF\u4E00\u4F4D\u53A8\u623F\u5408\u4F19\u4EBA\u3002"],
    ["\u4ECA\u665A\u4E0D\u8BBA\u540D\u6B21\uFF0C\u53EA\u8BBA\u9999\u6C14", "\u6392\u884C\u699C\u8BB0\u5206\uFF0C\u98DF\u5BA2\u8BB0\u5473\u3002"]
  ]
};
var TITLE_COPY = {
  champion: [["\u{1F451}", "\u53A8\u795E\u4E4B\u795E"], ["\u{1F451}", "\u98DF\u795E\u5728\u9003"], ["\u{1F451}", "\u638C\u52FA\u625B\u628A\u5B50"]],
  clutch: [["\u{1F30A}", "\u529B\u633D\u72C2\u6F9C"], ["\u{1FAA8}", "\u4E2D\u6D41\u7825\u67F1"], ["\u2693", "\u5B9A\u6D77\u795E\u9488"]],
  chops: [["\u{1F52A}", "\u5200\u5DE5\u5982\u795E"], ["\u{1F52A}", "\u5E96\u4E01\u518D\u4E16"], ["\u{1F52A}", "\u7827\u677F\u827A\u672F\u5BB6"]],
  washes: [["\u{1FAE7}", "\u51C0\u76D8\u4F7F\u8005"], ["\u{1FAE7}", "\u7897\u4E8B\u5982\u610F"], ["\u{1FAE7}", "\u540E\u52E4\u4E4B\u5149"]],
  potAdds: [["\u{1F525}", "\u7089\u706B\u7EAF\u9752"], ["\u{1F525}", "\u9505\u6C14\u638C\u95E8"], ["\u{1F525}", "\u7076\u53F0\u5B88\u62A4\u8005"]],
  assembles: [["\u{1F37D}\uFE0F", "\u5999\u624B\u6210\u76D8"], ["\u{1F37D}\uFE0F", "\u6446\u76D8\u9B54\u6CD5\u5E08"], ["\u{1F37D}\uFE0F", "\u7EC6\u8282\u63A7\u573A\u738B"]],
  deliveries: [["\u{1F3C3}", "\u4F20\u83DC\u5982\u98CE"], ["\u{1F3C3}", "\u4F7F\u547D\u5FC5\u8FBE"], ["\u{1F3C3}", "\u6700\u540E\u4E00\u516C\u91CC"]],
  fastServes: [["\u26A1", "\u98CE\u9A70\u7535\u63A3"], ["\u26A1", "\u95EA\u7535\u51FA\u9910"], ["\u26A1", "\u672A\u50AC\u5148\u8FBE"]],
  clutchServes: [["\u23F3", "\u6781\u9650\u6551\u5355"], ["\u23F3", "\u538B\u54E8\u5927\u5E08"], ["\u23F3", "\u6700\u540E\u5341\u79D2\u6218\u795E"]],
  burnClears: [["\u{1F9EF}", "\u6551\u706B\u961F\u957F"], ["\u{1F9EF}", "\u7126\u9999\u7EC8\u7ED3\u8005"], ["\u{1F9EF}", "\u53A8\u623F\u6D88\u9632\u5458"]],
  teamwork: [["\u{1F91D}", "\u4E09\u5934\u516D\u81C2"], ["\u2699\uFE0F", "\u9EC4\u91D1\u9F7F\u8F6E"], ["\u{1F91D}", "\u56E2\u961F\u9ECF\u5408\u5242"]],
  allrounder: [["\u2B21", "\u516D\u8FB9\u5F62\u6218\u58EB"], ["\u{1F9F0}", "\u54EA\u91CC\u9700\u8981\u54EA\u91CC\u642C"], ["\u{1F944}", "\u53A8\u623F\u4E07\u91D1\u6CB9"]],
  backstage: [["\u{1F31F}", "\u65E0\u540D\u82F1\u96C4"], ["\u{1F3AC}", "\u5E55\u540E\u5927\u53A8"], ["\u{1F319}", "\u6DF1\u85CF\u529F\u4E0E\u540D"]],
  improving: [["\u{1F4C8}", "\u540E\u6765\u5C45\u4E0A"], ["\u{1F4C8}", "\u6E10\u5165\u4F73\u5883"], ["\u{1F331}", "\u9006\u98CE\u751F\u957F"]],
  noWaste: [["\u267B\uFE0F", "\u7269\u5C3D\u5176\u7528"], ["\u267B\uFE0F", "\u52E4\u4FED\u6301\u53A8"], ["\u{1F4E6}", "\u98DF\u6750\u7BA1\u7406\u5927\u5E08"]],
  throws: [["\u{1F3AF}", "\u9694\u7A7A\u4F20\u83DC\u738B"], ["\u{1F3F9}", "\u53A8\u623F\u795E\u6295\u624B"], ["\u{1F6EB}", "\u98DE\u83DC\u822A\u7EBF\u5458"]],
  catches: [["\u{1F64C}", "\u795E\u63A5\u7403"], ["\u{1F9E4}", "\u7A33\u7A33\u63A5\u4F4F"], ["\u{1F939}", "\u7A7A\u4E2D\u63A5\u83DC\u5E08"]],
  conveyorTransfers: [["\u2699\uFE0F", "\u7269\u6D41\u603B\u7BA1"], ["\u{1F4E6}", "\u4F20\u9001\u5E26\u4E13\u5BB6"], ["\u{1F69A}", "\u53A8\u623F\u8C03\u5EA6\u5458"]],
  fallback: [["\u{1F44D}", "\u9760\u8C31\u53A8\u53CB"], ["\u2728", "\u9505\u94F2\u65B0\u661F"], ["\u{1F396}\uFE0F", "\u4ECA\u65E5\u6709\u529F"], ["\u{1F9B8}", "\u56F4\u88D9\u4FA0"], ["\u{1F389}", "\u53A8\u623F\u6C14\u6C1B\u7EC4"]]
};
function stableIndex(seed, length) {
  let hash = 2166136261;
  for (const ch of String(seed)) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % length;
}
function stablePick(pool, seed) {
  return pool[stableIndex(seed, pool.length)];
}
function commentFrom(pool, seed, rare = false) {
  const picked = stablePick(pool, seed);
  return { title: picked[0], subtitle: picked[1], rare };
}
var INGREDIENTS = {
  tomato: { choppable: true },
  onion: { choppable: true },
  mushroom: { choppable: true },
  lettuce: { choppable: true },
  cucumber: { choppable: true },
  carrot: { choppable: true },
  potato: { choppable: true },
  meat: { choppable: true },
  cheese: { choppable: true },
  rice: { choppable: false }
};
var whole = (ingredient) => ({ ingredient, prep: "whole" });
var chopped = (ingredient) => ({ ingredient, prep: "chopped" });
var RECIPES = [
  { id: "tomato_soup", name: "\u756A\u8304\u6D53\u6C64", items: [chopped("tomato"), chopped("tomato"), chopped("tomato")], cook: true, points: 20, difficulty: 1, weight: 5 },
  { id: "onion_soup", name: "\u6D0B\u8471\u6D53\u6C64", items: [chopped("onion"), chopped("onion"), chopped("onion")], cook: true, points: 20, difficulty: 1, weight: 5 },
  { id: "carrot_soup", name: "\u80E1\u841D\u535C\u6D53\u6C64", items: [chopped("carrot"), chopped("carrot"), chopped("carrot")], cook: true, points: 22, difficulty: 1, weight: 4 },
  { id: "potato_soup", name: "\u571F\u8C46\u6D53\u6C64", items: [chopped("potato"), chopped("potato"), chopped("potato")], cook: true, points: 22, difficulty: 1, weight: 4 },
  { id: "mushroom_soup", name: "\u83CC\u83C7\u6D53\u6C64", items: [chopped("mushroom"), chopped("mushroom"), chopped("onion")], cook: true, points: 24, difficulty: 2, weight: 3 },
  { id: "garden_stew", name: "\u7530\u56ED\u7096\u83DC", items: [whole("carrot"), chopped("onion"), chopped("potato")], cook: true, points: 28, difficulty: 2, weight: 3 },
  { id: "garden_salad", name: "\u7530\u56ED\u6C99\u62C9", items: [chopped("lettuce"), whole("tomato")], cook: false, points: 16, difficulty: 1, weight: 5 },
  { id: "crisp_salad", name: "\u723D\u8106\u6C99\u62C9", items: [chopped("carrot"), whole("lettuce")], cook: false, points: 18, difficulty: 1, weight: 4 },
  { id: "deluxe_salad", name: "\u8C6A\u534E\u6C99\u62C9", items: [chopped("cucumber"), chopped("lettuce"), whole("tomato")], cook: false, points: 22, difficulty: 2, weight: 3 },
  { id: "rainbow_salad", name: "\u5F69\u8679\u6C99\u62C9", items: [chopped("carrot"), chopped("cucumber"), whole("lettuce")], cook: false, points: 24, difficulty: 2, weight: 3 },
  { id: "meat_sauce_soup", name: "\u8089\u9171\u6D53\u6C64", items: [chopped("meat"), chopped("tomato"), chopped("onion")], cook: true, points: 30, difficulty: 3, weight: 2 },
  { id: "cheese_potato_soup", name: "\u829D\u58EB\u571F\u8C46\u6C64", items: [whole("cheese"), chopped("potato"), chopped("onion")], cook: true, points: 30, difficulty: 3, weight: 2 },
  { id: "mushroom_meat_soup", name: "\u8611\u83C7\u8089\u6C64", items: [chopped("meat"), chopped("mushroom"), whole("onion")], cook: true, points: 32, difficulty: 3, weight: 2 },
  { id: "golden_risotto", name: "\u9EC4\u91D1\u70E9\u996D", items: [whole("rice"), chopped("carrot"), chopped("onion")], cook: true, points: 32, difficulty: 3, weight: 2 },
  { id: "mushroom_risotto", name: "\u83CC\u83C7\u70E9\u996D", items: [whole("rice"), chopped("mushroom"), chopped("onion")], cook: true, points: 32, difficulty: 3, weight: 2 },
  { id: "cheese_salad", name: "\u829D\u58EB\u6C99\u62C9", items: [whole("cheese"), chopped("lettuce"), whole("tomato")], cook: false, points: 26, difficulty: 2, weight: 3 },
  { id: "power_salad", name: "\u80FD\u91CF\u6C99\u62C9", items: [chopped("meat"), whole("lettuce"), chopped("cucumber")], cook: false, points: 30, difficulty: 3, weight: 2 },
  { id: "party_platter", name: "\u6D3E\u5BF9\u62FC\u76D8", items: [whole("cheese"), chopped("meat"), whole("rice")], cook: false, points: 34, difficulty: 3, weight: 1 }
];
var COOKABLE = /* @__PURE__ */ new Set();
for (const r of RECIPES) if (r.cook) for (const item of r.items) COOKABLE.add(item.ingredient);
function recipeKey(items) {
  return items.map((item) => typeof item === "string" ? `${item}:chopped` : `${item.ingredient || item.g}:${item.prep || (item.k === "chopped" ? "chopped" : "whole")}`).sort().join("+");
}
function itemRequirement(item) {
  return { ingredient: item.g, prep: item.k === "chopped" ? "chopped" : "whole" };
}
function validItemPrep(item) {
  return item.k !== "chopped" || INGREDIENTS[item.g]?.choppable;
}
var RECIPE_BY_KEY = {};
for (const r of RECIPES) RECIPE_BY_KEY[recipeKey(r.items)] = r;
function terrain(w, h, floor, ice = () => false, empty = "~") {
  const rows = [];
  for (let z = 0; z < h; z++) {
    let row = "";
    for (let x = 0; x < w; x++) row += floor(x, z) ? ice(x, z) ? "i" : "." : empty;
    rows.push(row);
  }
  return rows;
}
function terrainWithWalls(w, h, kindAt, { empty = " ", openings = [] } = {}) {
  const openingSet = new Set(openings.map((entry) => `${entry.x},${entry.z}`));
  const cells = Array.from({ length: h }, (_, z) => Array.from({ length: w }, (_2, x) => kindAt(x, z) || empty));
  const safe = (cell) => cell === "." || cell === "i";
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
    if (cells[z][x] !== empty || openingSet.has(`${x},${z}`)) continue;
    const bordersFloor = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => safe(cells[z + dz]?.[x + dx]));
    if (bordersFloor) cells[z][x] = "#";
  }
  return cells.map((row) => row.join(""));
}
function st(id, type, x, z, extra = {}) {
  return { id, type, x, z, ...extra };
}
function crate(id, ingredient, x, z, extra = {}) {
  return st(id, "crate", x, z, { crate: ingredient, ...extra });
}
function conveyorPort(id, x, z, conveyorId, portMode, pathPoint, extra = {}) {
  return st(id, "conveyorPort", x, z, { conveyorId, portMode, pathPoint, ...extra });
}
function rectTiles(w, h, kind = ".") {
  const out = [];
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) out.push({ x, z, kind });
  return out;
}
function path(points, speed = 1, extra = {}) {
  return { points, speed, ...extra };
}
var MAPS = {
  classic: {
    id: "classic",
    name: "\u7ECF\u5178\u53A8\u623F",
    desc: "\u56F4\u5899\u82B1\u56ED\u53A8\u623F\u4EE5\u53CC\u73AF\u52A8\u7EBF\u548C\u77ED\u4F20\u9001\u5E26\u6559\u6388\u5206\u5DE5\u3002",
    bounds: { w: 18, h: 13 },
    plateCount: 4,
    recipePool: ["tomato_soup", "onion_soup", "carrot_soup", "garden_salad", "crisp_salad"],
    terrain: terrainWithWalls(18, 13, (x, z) => x >= 1 && x <= 16 && z >= 1 && z <= 11 ? "." : " "),
    platforms: [],
    stations: [
      crate("tomato", "tomato", 1, 2),
      crate("onion", "onion", 4, 1),
      crate("carrot", "carrot", 8, 1),
      crate("lettuce", "lettuce", 12, 1),
      crate("cucumber", "cucumber", 16, 2),
      st("board_a", "board", 3, 4),
      st("board_b", "board", 3, 8),
      st("counter_a", "counter", 6, 4),
      st("counter_b", "counter", 9, 4),
      st("counter_c", "counter", 6, 8),
      st("counter_d", "counter", 9, 8),
      conveyorPort("prep_in", 5, 6, "prep_belt", "input", { x: 5.5, z: 6.5 }),
      conveyorPort("prep_out", 12, 6, "prep_belt", "output", { x: 12.5, z: 6.5 }),
      st("stove_a", "stove", 7, 10),
      st("stove_b", "stove", 10, 10),
      st("plates", "plates", 15, 9),
      st("sink", "sink", 1, 9),
      st("trash", "trash", 13, 10),
      st("window", "window", 16, 6)
    ],
    mechanisms: [{ id: "prep_belt", type: "conveyor", config: { path: path([{ x: 5.5, z: 6.5 }, { x: 12.5, z: 6.5 }], 1) } }],
    checkpoints: [{ id: "garden", x: 8.5, z: 5.5 }],
    spawns: [{ slot: 1, x: 4.5, z: 6.5 }, { slot: 2, x: 14.5, z: 6.5 }, { slot: 3, x: 5.5, z: 9.5 }, { slot: 4, x: 12.5, z: 9.5 }],
    camera: { minPixelsPerTile: 44 }
  },
  split: {
    id: "split",
    name: "\u4E00\u7EBF\u5929",
    desc: "\u4E24\u5EA7\u6D6E\u5C9B\u5468\u671F\u5408\u5E76\uFF1B\u5206\u79BB\u65F6\u6295\u63B7\u4EA4\u63A5\uFF0C\u5408\u5E76\u65F6\u5B89\u5168\u6362\u533A\u3002",
    bounds: { w: 22, h: 14 },
    plateCount: 4,
    recipePool: ["mushroom_soup", "potato_soup", "garden_salad", "garden_stew", "crisp_salad"],
    terrain: terrain(22, 14, () => false),
    platforms: [
      { id: "west", origin: { x: 2, z: 2 }, tiles: rectTiles(6, 9) },
      { id: "east", origin: { x: 12, z: 2 }, tiles: rectTiles(6, 9) }
    ],
    stations: [
      crate("tomato", "tomato", 0, 1, { supportId: "west" }),
      crate("onion", "onion", 0, 3, { supportId: "west" }),
      crate("lettuce", "lettuce", 0, 5, { supportId: "west" }),
      crate("carrot", "carrot", 0, 7, { supportId: "west" }),
      crate("mushroom", "mushroom", 2, 0, { supportId: "west" }),
      crate("potato", "potato", 4, 0, { supportId: "west" }),
      st("board_w", "board", 2, 2, { supportId: "west" }),
      st("board_w2", "board", 4, 2, { supportId: "west" }),
      st("sink", "sink", 2, 8, { supportId: "west" }),
      st("trash", "trash", 0, 8, { supportId: "west" }),
      st("counter_w", "counter", 5, 4, { supportId: "west" }),
      st("stove_a", "stove", 2, 5, { supportId: "east" }),
      st("stove_b", "stove", 4, 5, { supportId: "east" }),
      st("plates", "plates", 4, 8, { supportId: "east" }),
      st("window", "window", 5, 4, { supportId: "east" }),
      st("counter_e", "counter", 0, 4, { supportId: "east" }),
      st("counter_e2", "counter", 2, 8, { supportId: "east" }),
      st("counter_e3", "counter", 5, 7, { supportId: "east" })
    ],
    mechanisms: [{ id: "islands", type: "movingPlatform", config: { mode: "dock", platformIds: ["west", "east"], cycle: 24, separatedHold: 8, mergeDuration: 4, mergedHold: 8, separateDuration: 4, offsets: { west: { x: 2, z: 0 }, east: { x: -2, z: 0 } } } }, { id: "river", type: "waterHazard", config: {} }],
    checkpoints: [{ id: "west_safe", x: 3.5, z: 4.5, supportId: "west" }, { id: "east_safe", x: 3.5, z: 4.5, supportId: "east" }],
    spawns: [{ slot: 1, x: 3.5, z: 4.5, supportId: "west" }, { slot: 2, x: 3.5, z: 4.5, supportId: "east" }, { slot: 3, x: 4.5, z: 7.5, supportId: "west" }, { slot: 4, x: 1.5, z: 7.5, supportId: "east" }],
    camera: { minPixelsPerTile: 44 }
  },
  ring: {
    id: "ring",
    name: "\u73AF\u5C9B\u9910\u5427",
    desc: "\u5916\u73AF\u5207\u914D\u3001\u4E2D\u592E\u51FA\u9910\uFF0C\u4E1C\u897F\u53CC\u77ED\u7EBF\u5C06\u98DF\u6750\u9001\u5165\u53EF\u884C\u8D70\u4E2D\u592E\u5C9B\u3002",
    bounds: { w: 21, h: 17 },
    plateCount: 5,
    recipePool: ["tomato_soup", "onion_soup", "carrot_soup", "potato_soup", "mushroom_soup", "garden_stew", "garden_salad", "crisp_salad", "deluxe_salad", "rainbow_salad"],
    terrain: terrainWithWalls(21, 17, (x, z) => {
      const dx = (x - 10) / 9, dz = (z - 8) / 7;
      const outer = dx * dx + dz * dz <= 1 && z <= 14;
      const inner = (x - 10) * (x - 10) / 25 + (z - 8) * (z - 8) / 16 <= 1;
      const center = x >= 8 && x <= 12 && z >= 6 && z <= 10;
      return outer && (!inner || center) ? "." : "~";
    }, { empty: "~", openings: [{ x: 9, z: 4 }, { x: 10, z: 4 }, { x: 9, z: 5 }, { x: 10, z: 5 }, { x: 11, z: 11 }, { x: 12, z: 11 }, { x: 11, z: 12 }, { x: 12, z: 12 }, { x: 5, z: 7 }, { x: 6, z: 7 }, { x: 7, z: 7 }, { x: 5, z: 8 }, { x: 6, z: 8 }, { x: 7, z: 8 }, { x: 13, z: 8 }, { x: 14, z: 8 }, { x: 15, z: 8 }, { x: 13, z: 9 }, { x: 14, z: 9 }, { x: 15, z: 9 }] }),
    platforms: [],
    stations: [
      crate("tomato", "tomato", 2, 6),
      crate("onion", "onion", 4, 3),
      crate("mushroom", "mushroom", 8, 2),
      crate("lettuce", "lettuce", 15, 3),
      crate("cucumber", "cucumber", 18, 6),
      crate("carrot", "carrot", 17, 11),
      crate("potato", "potato", 10, 14),
      st("board_n", "board", 6, 3),
      st("board_s", "board", 15, 13),
      st("sink", "sink", 6, 13),
      st("counter_outer_n", "counter", 7, 3),
      st("counter_outer_s", "counter", 14, 13),
      conveyorPort("ring_in_w", 4, 8, "ring_belt_w", "input", { x: 5.5, z: 8.5 }),
      conveyorPort("ring_out_w", 8, 8, "ring_belt_w", "output", { x: 8.5, z: 8.5 }),
      conveyorPort("ring_in_e", 16, 8, "ring_belt_e", "input", { x: 15.5, z: 8.5 }),
      conveyorPort("ring_out_e", 12, 8, "ring_belt_e", "output", { x: 12.5, z: 8.5 }),
      st("stove_a", "stove", 9, 7),
      st("trash", "trash", 10, 7),
      st("stove_b", "stove", 11, 7),
      st("counter_center_n", "counter", 8, 6),
      st("plates", "plates", 9, 9),
      st("stove_c", "stove", 10, 9),
      st("window", "window", 11, 9),
      st("counter_center_s", "counter", 12, 10)
    ],
    mechanisms: [{ id: "ring_belt_w", type: "conveyor", config: { path: path([{ x: 5.5, z: 8.5 }, { x: 8.5, z: 8.5 }], 1) } }, { id: "ring_belt_e", type: "conveyor", config: { path: path([{ x: 15.5, z: 8.5 }, { x: 12.5, z: 8.5 }], 1) } }],
    hazardMarkers: [{ x: 6.5, z: 8.5 }, { x: 14.5, z: 8.5 }],
    checkpoints: [{ id: "outer", x: 4.5, z: 9.5 }, { id: "center", x: 10.5, z: 8.5 }],
    spawns: [{ slot: 1, x: 4.5, z: 9.5 }, { slot: 2, x: 9.5, z: 8.5 }, { slot: 3, x: 16.5, z: 9.5 }, { slot: 4, x: 11.5, z: 8.5 }],
    camera: { minPixelsPerTile: 44 }
  },
  snow: {
    id: "snow",
    name: "\u96EA\u5C71\u9910\u8F66",
    desc: "\u4E09\u5EA7\u6709\u62A4\u5899\u7684\u9910\u8F66\u4EE5\u51B0\u6865\u3001\u77F3\u9053\u548C\u7F06\u8F66\u8DE8\u8D8A\u88C2\u8C37\u3002",
    bounds: { w: 23, h: 14 },
    plateCount: 5,
    recipePool: ["potato_soup", "mushroom_soup", "cheese_potato_soup", "mushroom_meat_soup", "cheese_salad"],
    terrain: terrainWithWalls(23, 14, (x, z) => {
      const west = x >= 1 && x <= 6 && z >= 2 && z <= 8, east = x >= 16 && x <= 21 && z >= 2 && z <= 8, center = x >= 8 && x <= 14 && z >= 4 && z <= 12, iceBridge = (x === 7 || x === 15) && (z === 4 || z === 5), stoneBridge = (x === 7 || x === 15) && (z === 7 || z === 8);
      return west || east || center || iceBridge || stoneBridge ? iceBridge ? "i" : "." : "~";
    }, { empty: "~", openings: [{ x: 7, z: 6 }, { x: 15, z: 6 }] }),
    platforms: [],
    stations: [
      crate("potato", "potato", 1, 3),
      crate("mushroom", "mushroom", 3, 2),
      crate("cheese", "cheese", 5, 2),
      crate("meat", "meat", 21, 3),
      crate("onion", "onion", 19, 2),
      crate("lettuce", "lettuce", 17, 2),
      crate("tomato", "tomato", 21, 6),
      st("board_a", "board", 3, 7),
      st("board_b", "board", 19, 7),
      st("stove_a", "stove", 9, 10),
      st("stove_b", "stove", 12, 10),
      st("plates", "plates", 14, 8),
      st("sink", "sink", 8, 11),
      st("trash", "trash", 10, 4),
      st("window", "window", 12, 12),
      st("counter_w1", "counter", 5, 7),
      st("counter_w2", "counter", 5, 8),
      st("counter_e1", "counter", 17, 7),
      st("counter_center", "counter", 13, 7),
      conveyorPort("lift_in", 5, 5, "ski_lift", "input", { x: 5.5, z: 5.5 }),
      conveyorPort("lift_out", 14, 5, "ski_lift", "output", { x: 14.5, z: 5.5 })
    ],
    mechanisms: [{ id: "ice", type: "iceSurface", config: { stopTime: 0.65, turnTime: 0.25 } }, { id: "ski_lift", type: "conveyor", config: { path: path([{ x: 5.5, z: 5.5 }, { x: 14.5, z: 5.5 }], 1) } }, { id: "ravine", type: "waterHazard", config: {} }],
    hazards: [
      { id: "west_crevasse", type: "iceCrevasse", cells: [{ x: 7, z: 6 }], guardEdges: ["north", "south"] },
      { id: "east_crevasse", type: "iceCrevasse", cells: [{ x: 15, z: 6 }], guardEdges: ["north", "south"] }
    ],
    checkpoints: [{ id: "lower", x: 11.5, z: 8.5 }, { id: "west", x: 4.5, z: 6.5 }, { id: "east", x: 17.5, z: 5.5 }],
    spawns: [{ slot: 1, x: 4.5, z: 6.5 }, { slot: 2, x: 17.5, z: 5.5 }, { slot: 3, x: 9.5, z: 8.5 }, { slot: 4, x: 13.5, z: 8.5 }],
    camera: { minPixelsPerTile: 44 }
  },
  space: {
    id: "space",
    name: "\u592A\u7A7A\u53A8\u623F",
    desc: "\u4E09\u5EA7\u5C01\u95ED\u8231\u5BA4\u4EE5\u8D27\u8FD0\u6C14\u95F8\u548C\u5E95\u90E8\u52E4\u52A1\u9053\u534F\u4F5C\u3002",
    bounds: { w: 24, h: 16 },
    plateCount: 5,
    recipePool: ["mushroom_risotto", "meat_sauce_soup", "power_salad", "deluxe_salad", "party_platter"],
    terrain: terrainWithWalls(24, 16, (x, z) => x >= 1 && x <= 6 && z >= 3 && z <= 11 || x >= 17 && x <= 22 && z >= 3 && z <= 11 || x >= 9 && x <= 14 && z >= 5 && z <= 10 || x >= 6 && x <= 17 && z >= 11 && z <= 12 ? "." : " "),
    platforms: [],
    stations: [
      crate("rice", "rice", 1, 4),
      crate("onion", "onion", 1, 6),
      crate("tomato", "tomato", 1, 8),
      crate("cucumber", "cucumber", 1, 10),
      st("board_w", "board", 4, 4),
      st("sink", "sink", 4, 10),
      conveyorPort("airlock_w", 6, 7, "airlock_w_belt", "input", { x: 6.5, z: 7.5 }),
      crate("mushroom", "mushroom", 22, 4),
      crate("meat", "meat", 22, 6),
      crate("lettuce", "lettuce", 22, 8),
      crate("cheese", "cheese", 22, 10),
      st("board_e", "board", 19, 4),
      st("plates", "plates", 19, 10),
      conveyorPort("airlock_e", 17, 7, "airlock_e_belt", "input", { x: 17.5, z: 7.5 }),
      st("stove_a", "stove", 10, 6),
      st("stove_b", "stove", 13, 6),
      st("stove_c", "stove", 11, 9),
      st("trash", "trash", 13, 9),
      st("window", "window", 11, 5),
      st("counter_core_a", "counter", 9, 9),
      st("counter_core_b", "counter", 14, 9),
      st("counter_w", "counter", 5, 9),
      st("counter_e", "counter", 18, 9),
      conveyorPort("counter_core_w", 9, 8, "airlock_w_belt", "output", { x: 9.5, z: 8.5 }),
      conveyorPort("counter_core_e", 14, 8, "airlock_e_belt", "output", { x: 14.5, z: 8.5 })
    ],
    mechanisms: [{ id: "airlock_w_belt", type: "conveyor", config: { path: path([{ x: 6.5, z: 7.5 }, { x: 9.5, z: 7.5 }, { x: 9.5, z: 8.5 }], 1) } }, { id: "airlock_e_belt", type: "conveyor", config: { path: path([{ x: 17.5, z: 7.5 }, { x: 14.5, z: 7.5 }, { x: 14.5, z: 8.5 }], 1) } }, { id: "void", type: "waterHazard", config: {} }],
    checkpoints: [{ id: "core", x: 11.5, z: 8.5 }, { id: "outer_link", x: 11.5, z: 12.5 }, { id: "west", x: 4, z: 7 }, { id: "east", x: 20, z: 7 }],
    spawns: [{ slot: 1, x: 4, z: 7 }, { slot: 2, x: 11.5, z: 8.5 }, { slot: 3, x: 20, z: 7 }, { slot: 4, x: 5.5, z: 10.5 }],
    camera: { minPixelsPerTile: 44 }
  },
  castle: {
    id: "castle",
    name: "\u57CE\u5821\u5BB4\u4F1A\u5385",
    desc: "\u56DB\u7FFC\u5BB4\u4F1A\u5385\u4EE5\u968F\u673A\u95E8\u9635\u6539\u53D8\u4E2D\u592E\u6377\u5F84\uFF0C\u5916\u56F4\u52E4\u52A1\u9053\u59CB\u7EC8\u5F00\u653E\u3002",
    bounds: { w: 23, h: 17 },
    plateCount: 5,
    recipePool: ["garden_stew", "deluxe_salad", "meat_sauce_soup", "cheese_potato_soup", "golden_risotto", "cheese_salad", "party_platter"],
    terrain: terrainWithWalls(23, 17, (x, z) => {
      const hall = x >= 9 && x <= 13 && z >= 6 && z <= 10, north = x >= 9 && x <= 13 && z >= 1 && z <= 4, south = x >= 9 && x <= 13 && z >= 12 && z <= 15, west = x >= 1 && x <= 7 && z >= 6 && z <= 10, east = x >= 15 && x <= 21 && z >= 6 && z <= 10, necks = z === 5 && x >= 10 && x <= 12 || z === 11 && x >= 10 && x <= 12 || x === 8 && z >= 7 && z <= 9 || x === 14 && z >= 7 && z <= 9, ring = x >= 4 && x <= 18 && (z === 3 || z === 4 || z === 12 || z === 13) || (x === 4 || x === 5 || x === 17 || x === 18) && z >= 3 && z <= 13;
      return hall || north || south || west || east || necks || ring ? "." : " ";
    }),
    platforms: [],
    stations: [
      crate("tomato", "tomato", 1, 7),
      crate("onion", "onion", 1, 9),
      crate("cheese", "cheese", 3, 6),
      crate("rice", "rice", 9, 2),
      crate("mushroom", "mushroom", 13, 2),
      crate("meat", "meat", 19, 6),
      crate("lettuce", "lettuce", 21, 7),
      crate("cucumber", "cucumber", 21, 9),
      crate("carrot", "carrot", 9, 12),
      crate("potato", "potato", 13, 12),
      st("board_w", "board", 6, 8),
      st("board_e", "board", 16, 8),
      st("stove_a", "stove", 10, 7),
      st("stove_b", "stove", 12, 7),
      st("stove_c", "stove", 11, 9),
      st("plates", "plates", 10, 15),
      st("sink", "sink", 12, 15),
      st("trash", "trash", 12, 13),
      st("window", "window", 11, 1),
      st("counter_w", "counter", 9, 9),
      st("counter_e", "counter", 13, 9),
      st("counter_n", "counter", 10, 3),
      st("counter_s", "counter", 10, 13)
    ],
    mechanisms: [{ id: "royal_gates", type: "gate", config: { groups: [
      { id: "north", label: "\u5317\u95E8", orientation: "x", cells: [{ x: 10, z: 5 }, { x: 11, z: 5 }, { x: 12, z: 5 }] },
      { id: "east", label: "\u4E1C\u95E8", orientation: "z", cells: [{ x: 14, z: 7 }, { x: 14, z: 8 }, { x: 14, z: 9 }] },
      { id: "south", label: "\u5357\u95E8", orientation: "x", cells: [{ x: 10, z: 11 }, { x: 11, z: 11 }, { x: 12, z: 11 }] },
      { id: "west", label: "\u897F\u95E8", orientation: "z", cells: [{ x: 8, z: 7 }, { x: 8, z: 8 }, { x: 8, z: 9 }] }
    ], presets: [
      { id: "north_south", label: "\u5357\u5317\u901A\u8DEF", open: ["north", "south"] },
      { id: "east_west", label: "\u4E1C\u897F\u901A\u8DEF", open: ["east", "west"] },
      { id: "north_east", label: "\u5317\u4E1C\u901A\u8DEF", open: ["north", "east"] },
      { id: "south_west", label: "\u5357\u897F\u901A\u8DEF", open: ["south", "west"] }
    ], switchEvery: 16, warning: 4 } }],
    checkpoints: [{ id: "hall", x: 11.5, z: 8.5 }, { id: "north_safe", x: 11.5, z: 3.5 }, { id: "south_safe", x: 11.5, z: 13.5 }, { id: "west_safe", x: 5.5, z: 8.5 }, { id: "east_safe", x: 17.5, z: 8.5 }],
    spawns: [{ slot: 1, x: 5.5, z: 8.5 }, { slot: 2, x: 17.5, z: 8.5 }, { slot: 3, x: 11.5, z: 13.5 }, { slot: 4, x: 11.5, z: 3.5 }],
    camera: { minPixelsPerTile: 44 }
  }
};
function cloneLayout(map) {
  return {
    mapId: map.id,
    name: map.name,
    bounds: map.bounds,
    terrain: map.terrain,
    platforms: map.platforms.map((p) => ({ ...p, origin: { ...p.origin }, tiles: p.tiles.map((t) => ({ ...t })), motion: p.motion && { ...p.motion, axis: { ...p.motion.axis } } })),
    stations: map.stations.map((entry) => ({ ...entry })),
    mechanisms: map.mechanisms.map((m) => ({ id: m.id, type: m.type, config: JSON.parse(JSON.stringify(m.config)) })),
    checkpoints: map.checkpoints.map((c) => ({ ...c })),
    spawns: map.spawns.map((spawn) => ({ ...spawn })),
    hazardMarkers: (map.hazardMarkers || []).map((entry) => ({ ...entry })),
    hazards: (map.hazards || []).map((entry) => ({ ...entry, cells: entry.cells.map((cell) => ({ ...cell })), guardEdges: [...entry.guardEdges || []] })),
    camera: { ...map.camera }
  };
}
for (const map of Object.values(MAPS)) {
  if (map.terrain.length !== map.bounds.h || map.terrain.some((row) => row.length !== map.bounds.w)) throw new Error(`Invalid terrain: ${map.id}`);
  if (map.spawns.length !== 4 || new Set(map.spawns.map((spawn) => spawn.slot)).size !== 4) throw new Error(`Invalid spawns: ${map.id}`);
  const ids = [...map.stations, ...map.platforms, ...map.mechanisms].map((entry) => entry.id);
  if (new Set(ids).size !== ids.length) throw new Error(`Duplicate map id: ${map.id}`);
  for (const mechanism of map.mechanisms.filter((entry) => entry.type === "conveyor")) {
    const points = mechanism.config.path.points;
    if (points.length < 2) throw new Error(`Invalid conveyor path: ${map.id}:${mechanism.id}`);
    for (let index = 1; index < points.length; index++) {
      const dx = points[index].x - points[index - 1].x, dz = points[index].z - points[index - 1].z;
      if (Math.abs(dx) < 1e-9 && Math.abs(dz) < 1e-9 || Math.abs(dx) > 1e-9 && Math.abs(dz) > 1e-9) throw new Error(`Conveyor segments must be orthogonal: ${map.id}:${mechanism.id}`);
    }
    const ports = map.stations.filter((entry) => entry.type === "conveyorPort" && entry.conveyorId === mechanism.id);
    if (!ports.some((entry) => entry.portMode === "input") || !ports.some((entry) => entry.portMode === "output")) throw new Error(`Conveyor ports missing: ${map.id}:${mechanism.id}`);
    for (const port of ports) {
      if (!["input", "output"].includes(port.portMode)) throw new Error(`Invalid conveyor port mode: ${map.id}:${port.id}`);
      let nearest = Infinity;
      for (let index = 1; index < points.length; index++) {
        const a = points[index - 1], b = points[index], vx = b.x - a.x, vz = b.z - a.z, len2 = vx * vx + vz * vz, t = Math.max(0, Math.min(1, ((port.pathPoint.x - a.x) * vx + (port.pathPoint.z - a.z) * vz) / len2)), px = a.x + vx * t, pz = a.z + vz * t;
        nearest = Math.min(nearest, Math.hypot(port.pathPoint.x - px, port.pathPoint.z - pz));
      }
      if (nearest > 1e-6) throw new Error(`Conveyor port is not on path: ${map.id}:${port.id}`);
    }
  }
  for (const port of map.stations.filter((entry) => entry.type === "conveyorPort")) if (!map.mechanisms.some((entry) => entry.type === "conveyor" && entry.id === port.conveyorId)) throw new Error(`Unknown conveyor port target: ${map.id}:${port.id}`);
}
function platformOrigin(L, runtime, supportId) {
  const def = L.platforms.find((entry) => entry.id === supportId);
  const state = runtime?.platforms?.[supportId];
  return def ? { x: def.origin.x + (state?.x || 0), z: def.origin.z + (state?.z || 0) } : { x: 0, z: 0 };
}
function worldPoint(L, runtime, value) {
  const origin = value.supportId ? platformOrigin(L, runtime, value.supportId) : { x: 0, z: 0 };
  return { x: value.x + origin.x, z: value.z + origin.z };
}
function terrainAt(L, runtime, x, z) {
  for (const platform of L.platforms) {
    const origin = platformOrigin(L, runtime, platform.id);
    for (const tile of platform.tiles) {
      if (x >= origin.x + tile.x && x < origin.x + tile.x + 1 && z >= origin.z + tile.z && z < origin.z + tile.z + 1) return { kind: tile.kind, supportId: platform.id };
    }
  }
  const cx = Math.floor(x), cz = Math.floor(z);
  if (cx < 0 || cz < 0 || cx >= L.bounds.w || cz >= L.bounds.h) return { kind: " " };
  return { kind: L.terrain[cz][cx] };
}
function stationWorld(L, runtime, station) {
  const point = worldPoint(L, runtime, station);
  return { ...station, x: point.x, z: point.z };
}
function conveyorRects(L, runtime, width = 0.8) {
  const rects = [];
  for (const def of L.mechanisms.filter((entry) => entry.type === "conveyor")) {
    const origin = def.config.supportId ? platformOrigin(L, runtime, def.config.supportId) : { x: 0, z: 0 };
    const points = def.config.path.points.map((point) => ({ x: point.x + origin.x, z: point.z + origin.z }));
    for (let index = 1; index < points.length; index++) {
      const a = points[index - 1], b = points[index], half = width / 2;
      rects.push({ x: Math.min(a.x, b.x) - half, z: Math.min(a.z, b.z) - half, w: Math.abs(b.x - a.x) + width, h: Math.abs(b.z - a.z) + width, kind: "conveyor" });
    }
  }
  return rects;
}
function hazardGuardRects(L) {
  const rects = [], thickness = 0.16;
  for (const hazard of L.hazards || []) for (const cell of hazard.cells || []) for (const edge of hazard.guardEdges || []) {
    if (edge === "north") rects.push({ x: cell.x, z: cell.z - thickness / 2, w: 1, h: thickness, kind: "hazardGuard" });
    if (edge === "south") rects.push({ x: cell.x, z: cell.z + 1 - thickness / 2, w: 1, h: thickness, kind: "hazardGuard" });
    if (edge === "west") rects.push({ x: cell.x - thickness / 2, z: cell.z, w: thickness, h: 1, kind: "hazardGuard" });
    if (edge === "east") rects.push({ x: cell.x + 1 - thickness / 2, z: cell.z, w: thickness, h: 1, kind: "hazardGuard" });
  }
  return rects;
}
function blockingRects(L, runtime) {
  const rects = [];
  for (let z = 0; z < L.bounds.h; z++) for (let x = 0; x < L.bounds.w; x++) if (L.terrain[z][x] === "#") rects.push({ x, z, w: 1, h: 1 });
  for (const station of L.stations) {
    const p = stationWorld(L, runtime, station);
    rects.push({ x: p.x, z: p.z, w: 1, h: 1 });
  }
  rects.push(...conveyorRects(L, runtime), ...hazardGuardRects(L));
  for (const state of Object.values(runtime?.mechanisms || {})) if (state?.type === "gate") {
    for (const gate of state.gates || []) if (!gate.open) for (const cell of gate.cells || [gate]) rects.push({ x: cell.x, z: cell.z, w: 1, h: 1 });
  }
  return rects;
}
function projectileBlockingRects(L, runtime) {
  const rects = [];
  for (let z = 0; z < L.bounds.h; z++) for (let x = 0; x < L.bounds.w; x++) if (L.terrain[z][x] === "#") rects.push({ x, z, w: 1, h: 1 });
  for (const state of Object.values(runtime?.mechanisms || {})) if (state?.type === "gate") {
    for (const gate of state.gates || []) if (!gate.open) for (const cell of gate.cells || [gate]) rects.push({ x: cell.x, z: cell.z, w: 1, h: 1 });
  }
  return rects;
}
function segmentHitsRect(from, to, rect) {
  const dx = to.x - from.x, dz = to.z - from.z;
  let near = 0, far = 1;
  for (const [start, delta, min, max] of [[from.x, dx, rect.x, rect.x + rect.w], [from.z, dz, rect.z, rect.z + rect.h]]) {
    if (Math.abs(delta) < 1e-9) {
      if (start < min || start > max) return false;
      continue;
    }
    let a = (min - start) / delta, b = (max - start) / delta;
    if (a > b) [a, b] = [b, a];
    near = Math.max(near, a);
    far = Math.min(far, b);
    if (near > far) return false;
  }
  return far >= 0 && near <= 1;
}
function resolvePlayerCollision(L, runtime, p) {
  const rects = blockingRects(L, runtime);
  for (let pass = 0; pass < MOVE_SOLVER_PASSES; pass++) {
    let resolved = false;
    for (const rect of rects) {
      const nearestX = Math.max(rect.x, Math.min(p.x, rect.x + rect.w));
      const nearestZ = Math.max(rect.z, Math.min(p.z, rect.z + rect.h));
      let nx = p.x - nearestX;
      let nz = p.z - nearestZ;
      const distanceSq = nx * nx + nz * nz;
      if (distanceSq >= PLAYER_R * PLAYER_R - MOVE_EPSILON) continue;
      let penetration;
      const distance = Math.sqrt(distanceSq);
      if (distance > MOVE_EPSILON) {
        nx /= distance;
        nz /= distance;
        penetration = PLAYER_R - distance;
      } else {
        const exits = [
          { d: p.x - (rect.x - PLAYER_R), nx: -1, nz: 0 },
          { d: rect.x + rect.w + PLAYER_R - p.x, nx: 1, nz: 0 },
          { d: p.z - (rect.z - PLAYER_R), nx: 0, nz: -1 },
          { d: rect.z + rect.h + PLAYER_R - p.z, nx: 0, nz: 1 }
        ];
        exits.sort((a, b) => a.d - b.d);
        ({ d: penetration, nx, nz } = exits[0]);
      }
      p.x += nx * penetration;
      p.z += nz * penetration;
      const intoSurface = p.vx * nx + p.vz * nz;
      if (intoSurface < 0) {
        p.vx -= intoSurface * nx;
        p.vz -= intoSurface * nz;
      }
      resolved = true;
    }
    if (!resolved) break;
  }
}
function resolvePlayerBodies(p, others) {
  for (let pass = 0; pass < MOVE_SOLVER_PASSES; pass++) {
    let resolved = false;
    for (let index = 0; index < others.length; index++) {
      const other = others[index];
      let nx = p.x - other.x;
      let nz = p.z - other.z;
      const distanceSq = nx * nx + nz * nz;
      const minDistance = PLAYER_R * 2;
      if (distanceSq >= minDistance * minDistance - MOVE_EPSILON) continue;
      const distance = Math.sqrt(distanceSq);
      if (distance > MOVE_EPSILON) {
        nx /= distance;
        nz /= distance;
      } else {
        nx = index % 2 === 0 ? 1 : -1;
        nz = 0;
      }
      const penetration = minDistance - distance;
      p.x += nx * penetration;
      p.z += nz * penetration;
      const intoPlayer = p.vx * nx + p.vz * nz;
      if (intoPlayer < 0) {
        p.vx -= intoPlayer * nx;
        p.vz -= intoPlayer * nz;
      }
      resolved = true;
    }
    if (!resolved) break;
  }
}
function movementProfileAt(L, runtime, p) {
  const kind = terrainAt(L, runtime, p.x, p.z).kind;
  const ice = L.mechanisms.find((entry) => entry.type === "iceSurface");
  return kind === "i" && ice ? { speed: SPEED, stopTime: ice.config.stopTime, turnTime: ice.config.turnTime } : {};
}
function stepPlayerMovement(L, runtime, p, input, dt, otherPlayers) {
  const ix = Number(input && input.dx) || 0;
  const iz = Number(input && input.dz) || 0;
  const active = ix !== 0 || iz !== 0;
  const profile = movementProfileAt(L, runtime, p);
  const speedLimit = (profile.speed || SPEED) * (p.activeBuff && p.activeBuff.type === "swift_feet" ? 1.25 : 1);
  const deceleration = speedLimit / (profile.stopTime || STOP_TIME);
  const turnTime = profile.turnTime || 0;
  const steps = Math.max(1, Math.round(dt / MOVE_FIXED_STEP));
  const stepDt = dt / steps;
  for (let step = 0; step < steps; step++) {
    let moveX;
    let moveZ;
    if (active) {
      const targetVx = ix * speedLimit;
      const targetVz = iz * speedLimit;
      const blend = turnTime ? Math.min(1, stepDt / turnTime) : 1;
      p.vx = (p.vx || 0) + (targetVx - (p.vx || 0)) * blend;
      p.vz = (p.vz || 0) + (targetVz - (p.vz || 0)) * blend;
      moveX = p.vx * stepDt;
      moveZ = p.vz * stepDt;
    } else {
      const speed = Math.hypot(p.vx || 0, p.vz || 0);
      if (speed <= MOVE_EPSILON) {
        p.vx = 0;
        p.vz = 0;
        break;
      }
      const nextSpeed = Math.max(0, speed - deceleration * stepDt);
      const averageSpeed = (speed + nextSpeed) * 0.5;
      const dirX = p.vx / speed;
      const dirZ = p.vz / speed;
      moveX = dirX * averageSpeed * stepDt;
      moveZ = dirZ * averageSpeed * stepDt;
      p.vx = dirX * nextSpeed;
      p.vz = dirZ * nextSpeed;
    }
    p.x += moveX;
    p.z += moveZ;
    resolvePlayerCollision(L, runtime, p);
    resolvePlayerBodies(p, otherPlayers);
    resolvePlayerCollision(L, runtime, p);
  }
}
function targetStation(L, runtime, p) {
  const tx = p.x + p.face.dx * 0.95;
  const tz = p.z + p.face.dz * 0.95;
  let best = null;
  for (const station of L.stations) {
    const world = stationWorld(L, runtime, station);
    const distance = Math.hypot(tx - (world.x + 0.5), tz - (world.z + 0.5));
    if (distance < 0.72 && (!best || distance < best.distance)) best = { ...world, distance };
  }
  return best;
}
function armTick(ctx) {
  ctx.setTimer("tick", TICK_MS, () => tick(ctx));
}
function tick(ctx) {
  const s = ctx.state;
  if (s.phase === "countdown") {
    s.elapsed += DT;
    for (const def of s.layout.mechanisms.filter((entry) => entry.type === "movingPlatform")) MECHANISM_REGISTRY.movingPlatform.tick(ctx, def, s.mechanisms[def.id]);
    s.countdown -= DT;
    if (s.countdown <= 0) {
      s.countdown = 0;
      s.phase = "playing";
      spawnOrder(ctx);
      resetNextOrderIn(ctx);
      ctx.broadcast("game:start", {});
    }
  } else if (s.phase === "playing") {
    stepGame(ctx);
  } else if (s.phase === "roundResult") {
    s.roundResultTime -= DT;
    if (s.roundResultTime <= 0) setupRound(ctx);
  } else if (s.phase === "awards") {
    const ids = Object.keys(s.players);
    for (const id of ids) {
      const p = s.players[id];
      if (p.input.dx || p.input.dz) {
        const len = Math.hypot(p.input.dx, p.input.dz);
        if (len > 0.2) p.face = { dx: p.input.dx / len, dz: p.input.dz / len };
      }
      stepPlayerMovement(s.layout, { platforms: s.platforms, mechanisms: s.mechanisms }, p, p.input, DT, ids.filter((other) => other !== id).map((other) => s.players[other]));
      const podium = AWARDS_PODIUMS.find((entry) => entry.rank === p.awardsPodiumRank);
      if (podium && p.awardsPodiumHeight > 0 && (Math.abs(p.x - podium.x) > 0.725 || Math.abs(p.z - podium.z) > 0.675)) {
        p.awardsPodiumHeight = 0;
        p.awardsPodiumRank = 0;
      }
    }
  } else {
    return;
  }
  if (s.phase === "countdown" || s.phase === "playing" || s.phase === "roundResult" || s.phase === "awards") armTick(ctx);
}
function spawnOrder(ctx) {
  const s = ctx.state;
  const pool = MAPS[s.mapId].recipePool;
  const candidates = pool.map((id) => RECIPES.find((r2) => r2.id === id)).filter(Boolean);
  const weighted = candidates.map((r2) => ({ r: r2, w: r2.difficulty > s.difficultyLevel ? 1 : r2.weight + r2.difficulty * Math.max(0, s.difficultyLevel - 1) * 2 }));
  const totalWeight = weighted.reduce((sum, x) => sum + x.w, 0);
  let pick = ctx.random() * totalWeight;
  let r = weighted[weighted.length - 1].r;
  for (const entry of weighted) {
    pick -= entry.w;
    if (pick <= 0) {
      r = entry.r;
      break;
    }
  }
  s.orderSeq += 1;
  s.orders.push({
    id: "o" + s.orderSeq,
    recipeId: r.id,
    difficulty: r.difficulty,
    key: recipeKey(r.items),
    items: r.items.map((item) => ({ ...item })),
    name: r.name,
    points: r.points,
    t: ORDER_LIFE,
    total: ORDER_LIFE
  });
  ctx.broadcast("order:new", { name: r.name });
}
function resetNextOrderIn(ctx) {
  const s = ctx.state;
  const pressure = Math.max(0.4, 1 - 0.15 * Math.max(0, s.difficultyLevel - 1));
  const players = Math.max(2, Math.min(4, Object.keys(s.players).length));
  const playerMultiplier = players === 4 ? 0.72 : players === 3 ? 0.85 : 1;
  s.nextOrderIn = Math.max(8, (ORDER_MIN_GAP + ctx.random() * ORDER_VAR_GAP) * pressure * playerMultiplier);
}
function shuffleMaps(ctx, previous) {
  const ids = Object.keys(MAPS);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(ctx.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  if (ids.length > 1 && ids[0] === previous) [ids[0], ids[1]] = [ids[1], ids[0]];
  return ids;
}
function takeNextMap(ctx) {
  const s = ctx.state;
  if (!s.mapQueue.length) s.mapQueue = shuffleMaps(ctx, s.mapId);
  return s.mapQueue.shift();
}
function clearPlayerRuntime(p) {
  p.input = { dx: 0, dz: 0 };
  p.vx = 0;
  p.vz = 0;
  p.moveSeq = 0;
  p.face = { dx: 0, dz: 1 };
  p.carrying = null;
  p.working = false;
  p.charge = null;
  p.fall = null;
  p.respawnGrace = 0;
  p.interactSeq = 0;
  p.workSeq = 0;
  p.nextInteractAt = 0;
  p.nextCrateAt = 0;
  p.awardsPodiumHeight = 0;
  p.awardsPodiumRank = 0;
  p.activeBuff = null;
}
function resetPlayerForLayout(p, sp, layout = null, runtime = null) {
  const point = layout ? worldPoint(layout, runtime, sp) : sp;
  p.x = point.x;
  p.z = point.z;
  p.supportId = sp.supportId || null;
  if (Number.isInteger(sp.slot)) p.roundSpawnSlot = sp.slot;
  clearPlayerRuntime(p);
  p.roundContributionScore = 0;
  p.roundServed = 0;
  p.roundPublicEvents = 0;
  p.roundStats = emptyStats();
}
function spawnForPlayer(s, p, playerId = "") {
  const used = new Set(Object.entries(s.players).filter(([id, other]) => id !== playerId && Number.isInteger(other.roundSpawnSlot)).map(([, other]) => other.roundSpawnSlot));
  return s.layout.spawns.find((spawn) => spawn.slot === p.roundSpawnSlot) || s.layout.spawns.find((spawn) => !used.has(spawn.slot)) || s.layout.spawns[0];
}
function respawnAtRoundSpawn(s, p, playerId) {
  const spawn = spawnForPlayer(s, p, playerId);
  if (!spawn) return;
  p.roundSpawnSlot = spawn.slot;
  const point = worldPoint(s.layout, runtimeOf(s), spawn);
  p.x = point.x;
  p.z = point.z;
  p.supportId = spawn.supportId || null;
  p.input = { dx: 0, dz: 0 };
  p.vx = 0;
  p.vz = 0;
  p.working = false;
  p.charge = null;
  p.fall = null;
  p.respawnGrace = RESPAWN_GRACE;
}
function teamComment(s, summary, final = false) {
  const closed = summary.served + summary.expired;
  const expiredRate = closed ? summary.expired / closed : 0;
  const seed = `${s.gameSeq}:${summary.round || "final"}:${summary.score}:${summary.served}:${summary.expired}`;
  if (final) {
    const history = s.roundHistory || [];
    const first = history[0];
    const last = history[history.length - 1];
    if (history.length >= 3 && history.every((r) => r.served > 0 && r.expired === 0)) return commentFrom(FINAL_COPY.allPerfect, seed, true);
    if (first && last && first.expired > 0 && last.expired === 0 && last.score >= first.score * 1.5) return commentFrom(FINAL_COPY.comeback, seed, true);
    if (first && last && history.length > 1 && last.score >= first.score * 1.5 && last.score > first.score) return commentFrom(FINAL_COPY.improving, seed, true);
    if (summary.served > 0 && summary.expired === 0) return commentFrom(FINAL_COPY.perfect, seed, true);
    if (summary.served >= 8 && expiredRate <= 0.15) return commentFrom(FINAL_COPY.efficient, seed);
    if (summary.expired >= 3 || expiredRate >= 0.5 || summary.burns >= 3) return commentFrom(FINAL_COPY.chaotic, seed);
    return commentFrom(FINAL_COPY.generic, seed);
  }
  const active = Object.values(s.players || {}).filter((p) => (p.roundContributionScore || 0) > 0);
  const values = active.map((p) => p.roundContributionScore || 0);
  const balanced = active.length === Object.keys(s.players || {}).length && active.every((p) => (p.roundPublicEvents || 0) > 0) && values.length > 1 && Math.max(...values) / Math.max(1, Math.min(...values)) <= 1.5;
  if (summary.served > 0 && summary.expired === 0) return commentFrom(TEAM_COPY.perfect, seed, true);
  if (summary.served >= 4 && expiredRate <= 0.15) return commentFrom(TEAM_COPY.efficient, seed);
  if (summary.served >= 3 && (summary.expired >= 2 || summary.burns >= 2)) return commentFrom(TEAM_COPY.hectic, seed);
  if (summary.burns >= 2) return commentFrom(TEAM_COPY.burnt, seed);
  if (summary.expired >= 3 || expiredRate >= 0.5) return commentFrom(TEAM_COPY.expired, seed);
  if (balanced) return commentFrom(TEAM_COPY.teamwork, seed, true);
  if (summary.served === 0) return commentFrom(TEAM_COPY.idle, seed);
  if (expiredRate >= 0.25) return commentFrom(TEAM_COPY.middling, seed);
  return commentFrom(TEAM_COPY.generic, seed);
}
function playerMetric(p, key, round) {
  if (key === "contribution") return round ? p.roundContributionScore || 0 : p.contributionScore || 0;
  if (key === "teamwork") return round ? p.roundPublicEvents || 0 : p.publicEvents || 0;
  return ((round ? p.roundStats : p.stats) || {})[key] || 0;
}
function makePlayerTitles(entries, round, seed) {
  const out = {};
  const used = /* @__PURE__ */ new Set();
  const maxima = {};
  for (const key of [...STAT_KEYS, "teamwork", "contribution"]) maxima[key] = Math.max(0, ...entries.map((p) => playerMetric(p, key, round)));
  const sorted = [...entries].sort((a, b) => playerMetric(b, "contribution", round) - playerMetric(a, "contribution", round) || (a.joinOrder || 0) - (b.joinOrder || 0));
  for (let rankIndex = 0; rankIndex < sorted.length; rankIndex++) {
    const p = sorted[rankIndex];
    const stats = round ? p.roundStats || emptyStats() : p.stats || emptyStats();
    const candidates = [];
    const specialPriority = { clutchServes: 5, burnClears: 5, fastServes: 4, throws: 4, catches: 5, conveyorTransfers: 4, teamwork: 3, backstage: 3, allrounder: 3, noWaste: 2, clutch: 4, improving: 4, champion: 1 };
    const add = (kind, value, min, reason) => {
      if (value >= min && value === maxima[kind]) candidates.push({ kind, value, reason, priority: specialPriority[kind] || 4 });
    };
    add("clutchServes", stats.clutchServes, 1, `${stats.clutchServes} \u6B21\u538B\u7EBF\u4E0A\u83DC`);
    add("burnClears", stats.burnClears, 1, `${stats.burnClears} \u6B21\u6E05\u7406\u7126\u9505`);
    add("fastServes", stats.fastServes, 2, `${stats.fastServes} \u6B21\u95EA\u7535\u51FA\u9910`);
    add("chops", stats.chops, 3, `\u5B8C\u6210 ${stats.chops} \u6B21\u5207\u914D`);
    add("washes", stats.washes, 2, `\u6D17\u51C0 ${stats.washes} \u4E2A\u76D8\u5B50`);
    add("assembles", stats.assembles, 3, `\u5B8C\u6210 ${stats.assembles} \u6B21\u88C5\u76D8`);
    add("potAdds", stats.potAdds, 3, `${stats.potAdds} \u6B21\u7CBE\u51C6\u4E0B\u9505`);
    add("deliveries", stats.deliveries, 2, `\u9001\u51FA ${stats.deliveries} \u9053\u83DC`);
    add("throws", stats.throws, 3, `${stats.throws} \u6B21\u7CBE\u51C6\u6295\u63B7`);
    add("catches", stats.catches, 2, `${stats.catches} \u6B21\u7A7A\u4E2D\u63A5\u53D6`);
    add("conveyorTransfers", stats.conveyorTransfers, 3, `${stats.conveyorTransfers} \u6B21\u7269\u6D41\u8F6C\u8FD0`);
    const teamwork = playerMetric(p, "teamwork", round);
    if (teamwork >= 3 && teamwork === maxima.teamwork) candidates.push({ kind: "teamwork", value: teamwork, reason: `${teamwork} \u6B21\u5173\u952E\u534F\u4F5C`, priority: specialPriority.teamwork });
    const basics = stats.chops + stats.washes + stats.assembles + stats.potAdds + stats.potPickups;
    if (stats.deliveries === 0 && basics >= 5) candidates.push({ kind: "backstage", value: basics, reason: `${basics} \u6B21\u5E55\u540E\u652F\u63F4`, priority: specialPriority.backstage });
    const varied = ["chops", "washes", "assembles", "potAdds", "deliveries"].filter((key) => stats[key] > 0).length;
    if (varied >= 4) candidates.push({ kind: "allrounder", value: varied, reason: `\u6D89\u730E ${varied} \u7C7B\u5DE5\u4F5C`, priority: specialPriority.allrounder });
    if (stats.discards === 0 && playerMetric(p, "contribution", round) >= 8) candidates.push({ kind: "noWaste", value: 1, reason: "\u5168\u7A0B\u96F6\u6D6A\u8D39", priority: specialPriority.noWaste });
    if (!round && rankIndex > 0 && playerMetric(p, "contribution", false) >= maxima.contribution * 0.85) candidates.push({ kind: "clutch", value: 1, reason: "\u5173\u952E\u8D21\u732E\u7D27\u8FFD\u699C\u9996", priority: specialPriority.clutch });
    if (!round && p.roundContributionScore >= Math.max(8, (p.contributionScore || 0) * 0.45)) candidates.push({ kind: "improving", value: p.roundContributionScore, reason: "\u6536\u5B98\u9636\u6BB5\u706B\u529B\u5168\u5F00", priority: specialPriority.improving });
    if (rankIndex === 0 && playerMetric(p, "contribution", round) > 0) candidates.push({ kind: "champion", value: 0, reason: round ? "\u672C\u5C40\u8D21\u732E\u699C\u9996" : "\u5168\u573A\u8D21\u732E\u699C\u9996", priority: specialPriority.champion });
    candidates.sort((a, b) => (b.priority || 0) - (a.priority || 0) || b.value - a.value);
    let chosen = candidates.find((c) => !used.has(c.kind)) || candidates[0] || { kind: "fallback", reason: "\u8BA4\u771F\u5B8C\u6210\u6BCF\u4E00\u6B21\u914D\u5408" };
    const pool = TITLE_COPY[chosen.kind] || TITLE_COPY.fallback;
    let title = stablePick(pool, `${seed}:${p.id || p.name}:${chosen.kind}`);
    if (used.has(title[1])) title = pool.find((item) => !used.has(item[1])) || title;
    used.add(chosen.kind);
    used.add(title[1]);
    out[p.id] = { icon: title[0], title: title[1], reason: chosen.reason, rare: ["champion", "clutchServes", "burnClears", "clutch", "improving"].includes(chosen.kind) };
  }
  return out;
}
function captureRoundResult(s) {
  if ((s.roundHistory || []).some((r) => r.round === s.roundIndex)) return;
  const summary = { round: s.roundIndex, score: s.roundScore || 0, served: s.roundServed || 0, expired: s.roundExpired || 0, burns: s.roundBurns || 0 };
  const closed = summary.served + summary.expired;
  summary.serveRate = closed ? Math.round(100 * summary.served / closed) : 0;
  s.roundHistory.push(summary);
  s.roundComment = teamComment(s, summary, false);
  const entries = Object.keys(s.players).map((id) => ({ id, ...s.players[id] }));
  s.roundTitles = makePlayerTitles(entries, true, `${s.gameSeq}:${s.roundIndex}:round`);
}
function setupRound(ctx) {
  const s = ctx.state;
  s.roundIndex += 1;
  s.difficultyLevel = s.mode === "party" ? Math.min(3, s.roundIndex) : s.roundIndex;
  s.mapId = s.nextMapId || takeNextMap(ctx);
  s.nextMapId = null;
  s.gameSeq = (s.gameSeq || 0) + 1;
  const map = MAPS[s.mapId];
  const layout = cloneLayout(map);
  s.layout = layout;
  s.stations = {};
  for (const station of layout.stations) {
    if (station.type === "counter" || station.type === "board" || station.type === "conveyorPort") s.stations[station.id] = { item: null };
    else if (station.type === "stove") s.stations[station.id] = { contents: [], credits: [], phase: "idle", t: 0, masterChef: false };
    else s.stations[station.id] = {};
  }
  s.platforms = {};
  for (const platform of layout.platforms) s.platforms[platform.id] = { x: 0, z: 0, previousX: 0, previousZ: 0 };
  s.mechanisms = {};
  for (const mechanism of layout.mechanisms) s.mechanisms[mechanism.id] = createMechanismState(mechanism, ctx);
  s.worldItems = {};
  s.worldItemSeq = 0;
  s.elapsed = 0;
  s.roundScore = 0;
  s.roundServed = 0;
  s.roundExpired = 0;
  s.roundBurns = 0;
  s.roundComment = null;
  s.roundTitles = {};
  s.orders = [];
  s.orderSeq = 0;
  s.plates = { clean: map.plateCount, dirty: 0, washT: 0, due: [], cleanCredits: [] };
  s.timeLeft = GAME_TIME;
  s.nextOrderIn = 0;
  s.groundBuff = null;
  s.nextBuffIn = 25;
  s.fireOverdriveRemaining = 0;
  const ids = Object.keys(s.players);
  const runtime = { platforms: s.platforms, mechanisms: s.mechanisms };
  for (let i = 0; i < ids.length; i++) {
    const p = s.players[ids[i]];
    resetPlayerForLayout(p, layout.spawns[i % layout.spawns.length], layout, runtime);
    syncPlayerRecord(s, ids[i]);
  }
  s.phase = "countdown";
  s.countdown = COUNTDOWN_T;
  ctx.broadcast("game:countdown", { mapId: s.mapId, mapName: map.name });
  armTick(ctx);
}
function setupSession(ctx) {
  const s = ctx.state;
  s.roundIndex = 0;
  s.difficultyLevel = 1;
  s.mapQueue = shuffleMaps(ctx, null);
  s.mapId = null;
  s.nextMapId = null;
  s.sessionScore = 0;
  s.score = 0;
  s.served = 0;
  s.expired = 0;
  s.rage = 0;
  s.standings = [];
  s.burns = 0;
  s.roundBurns = 0;
  s.roundHistory = [];
  s.roundComment = null;
  s.finalComment = null;
  s.roundTitles = {};
  s.finalTitles = {};
  s.playerRecords = {};
  for (const id in s.players) {
    const p = s.players[id];
    p.contributionScore = 0;
    p.roundContributionScore = 0;
    p.servedCount = 0;
    p.publicEvents = 0;
    p.roundServed = 0;
    p.roundPublicEvents = 0;
    p.stats = emptyStats();
    p.roundStats = emptyStats();
    syncPlayerRecord(s, id);
  }
  setupRound(ctx);
}
function buildStandings(s) {
  return Object.keys(s.playerRecords).map((id) => ({ id, ...s.playerRecords[id] })).sort((a, b) => b.contributionScore - a.contributionScore || b.servedCount - a.servedCount || b.publicEvents - a.publicEvents || a.joinOrder - b.joinOrder).map((p, index) => ({ ...p, rank: index + 1 }));
}
function syncPlayerRecord(s, id) {
  const p = s.players[id];
  if (!p) return;
  s.playerRecords[id] = { name: p.name, color: p.color, contributionScore: p.contributionScore, servedCount: p.servedCount, publicEvents: p.publicEvents, joinOrder: p.joinOrder, stats: normalizeStats(p.stats), roundSpawnSlot: p.roundSpawnSlot, roundSpawnGameSeq: s.gameSeq, roundSpawnMapId: s.mapId };
}
var AWARDS_PODIUMS = [
  { rank: 1, x: 7.5, z: 2.4, height: 1.5, label: "1", color: 16765503 },
  { rank: 2, x: 5.8, z: 2.7, height: 1.05, label: "2", color: 13358044 },
  { rank: 3, x: 9.2, z: 2.8, height: 0.78, label: "3", color: 13141845 }
];
var AWARDS_FLOOR_SPOTS = [{ x: 7.5, z: 5.8 }, { x: 5.5, z: 5.8 }, { x: 9.5, z: 5.8 }, { x: 7.5, z: 6.6 }];
function placePlayerForAwards(s, id, index) {
  const standing = s.standings.find((entry) => entry.id === id);
  const podium = AWARDS_PODIUMS.find((entry) => entry.rank === standing?.rank);
  const spot = podium || AWARDS_FLOOR_SPOTS[index % AWARDS_FLOOR_SPOTS.length];
  resetPlayerForLayout(s.players[id], spot);
  s.players[id].awardsPodiumHeight = podium?.height || 0;
  s.players[id].awardsPodiumRank = podium?.rank || 0;
}
function finishSession(ctx) {
  const s = ctx.state;
  captureRoundResult(s);
  for (const id in s.players) syncPlayerRecord(s, id);
  s.standings = buildStandings(s);
  const finalSummary = { score: s.sessionScore || 0, served: s.served || 0, expired: s.expired || 0, burns: s.burns || 0 };
  s.finalComment = teamComment(s, finalSummary, true);
  s.finalTitles = makePlayerTitles(s.standings, false, `${s.gameSeq}:final`);
  s.phase = "awards";
  s.layout = makeAwardsLayout();
  s.stations = {};
  s.platforms = {};
  s.mechanisms = {};
  s.worldItems = {};
  s.orders = [];
  s.gameSeq += 1;
  const ids = Object.keys(s.players);
  ids.forEach((id, i) => placePlayerForAwards(s, id, i));
  ctx.broadcast("game:over", { score: s.sessionScore, served: s.served, expired: s.expired });
  armTick(ctx);
}
function makeAwardsLayout() {
  return { mapId: "awards", name: "\u9881\u5956\u5E7F\u573A", bounds: { w: 15, h: 9 }, terrain: terrain(15, 9, (x, z) => x >= 1 && x <= 13 && z >= 1 && z <= 7, () => false, " "), platforms: [], stations: [], mechanisms: [], podiums: AWARDS_PODIUMS.map((entry) => ({ ...entry })), checkpoints: [{ id: "awards", x: 7, z: 4 }], spawns: [{ slot: 1, x: 7.5, z: 2.4 }, { slot: 2, x: 5.8, z: 2.7 }, { slot: 3, x: 9.2, z: 2.8 }, { slot: 4, x: 7.5, z: 5.8 }], camera: { minPixelsPerTile: 44 } };
}
function finishRound(ctx) {
  const s = ctx.state;
  captureRoundResult(s);
  if (s.mode === "party" && s.roundIndex >= 3) return finishSession(ctx);
  s.nextMapId = takeNextMap(ctx);
  s.roundResultTime = ROUND_RESULT_T;
  s.phase = "roundResult";
  s.orders = [];
  for (const id in s.players) clearPlayerRuntime(s.players[id]);
  ctx.broadcast("round:over", { round: s.roundIndex, nextMapId: s.nextMapId, nextMapName: MAPS[s.nextMapId].name });
}
function weightedBuff(ctx) {
  let pick = ctx.random() * BUFF_WEIGHTS.reduce((a, b) => a + b, 0);
  for (let i = 0; i < BUFF_TYPES.length; i++) {
    pick -= BUFF_WEIGHTS[i];
    if (pick <= 0) return BUFF_TYPES[i];
  }
  return BUFF_TYPES[0];
}
function spawnGroundBuff(ctx) {
  const s = ctx.state;
  const L = s.layout;
  const candidates = [];
  const runtime = { platforms: s.platforms, mechanisms: s.mechanisms };
  for (let z = 1; z < L.bounds.h - 1; z++) for (let x = 1; x < L.bounds.w - 1; x++) {
    if (![".", "i"].includes(terrainAt(L, runtime, x + 0.5, z + 0.5).kind)) continue;
    if (blockingRects(L, runtime).some((r) => x + 0.5 >= r.x && x + 0.5 <= r.x + r.w && z + 0.5 >= r.z && z + 0.5 <= r.z + r.h)) continue;
    if (L.spawns.some((sp) => {
      const wp = worldPoint(L, runtime, sp);
      return Math.hypot(x + 0.5 - wp.x, z + 0.5 - wp.z) < 1.5;
    })) continue;
    if (Object.values(s.players).some((p) => Math.hypot(x + 0.5 - p.x, z + 0.5 - p.z) < 2)) continue;
    const exits = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dz]) => [".", "i"].includes(terrainAt(L, runtime, x + dx + 0.5, z + dz + 0.5).kind)).length;
    if (exits < 2) continue;
    candidates.push({ x: x + 0.5, z: z + 0.5 });
  }
  if (!candidates.length) {
    s.nextBuffIn = 10;
    return;
  }
  const pos = candidates[Math.floor(ctx.random() * candidates.length)];
  s.groundBuff = { type: weightedBuff(ctx), ...pos, remaining: BUFF_LIFETIME };
  ctx.broadcast("buff:spawn", { type: s.groundBuff.type });
}
function stepBuffs(ctx) {
  const s = ctx.state;
  for (const p of Object.values(s.players)) {
    if (p.activeBuff) {
      p.activeBuff.remaining = Math.max(0, p.activeBuff.remaining - DT);
      if (!p.activeBuff.remaining) p.activeBuff = null;
    }
  }
  if (s.fireOverdriveRemaining > 0) s.fireOverdriveRemaining = Math.max(0, s.fireOverdriveRemaining - DT);
  if (s.groundBuff) {
    s.groundBuff.remaining -= DT;
    const picker = Object.values(s.players).find((p) => Math.hypot(p.x - s.groundBuff.x, p.z - s.groundBuff.z) <= 0.55);
    if (picker) {
      const type = s.groundBuff.type;
      picker.activeBuff = { type, remaining: type === "fire_overdrive" ? FIRE_OVERDRIVE_DURATION : BUFF_DURATION };
      if (type === "fire_overdrive") s.fireOverdriveRemaining = FIRE_OVERDRIVE_DURATION;
      s.groundBuff = null;
      s.nextBuffIn = 35 + ctx.random() * 15;
      ctx.broadcast("buff:picked", { type, by: picker.name });
    } else if (s.groundBuff.remaining <= 0) {
      s.groundBuff = null;
      s.nextBuffIn = 35 + ctx.random() * 15;
    }
  } else {
    s.nextBuffIn -= DT;
    if (s.nextBuffIn <= 0) spawnGroundBuff(ctx);
  }
}
function createMechanismState(def, ctx) {
  return MECHANISM_REGISTRY[def.type]?.create(def, ctx) || { type: def.type };
}
function runtimeOf(s) {
  return { platforms: s.platforms, mechanisms: s.mechanisms };
}
function itemHasPlate(content) {
  return content && (content.k === "plate" || content.k === "dish");
}
function recycleContent(s, content) {
  if (!itemHasPlate(content)) return;
  if (content.k === "plate" && (!content.items || content.items.length === 0)) s.plates.clean += 1;
  else s.plates.due.push(DIRTY_DELAY);
}
function removeWorldItem(s, id, recycle = true) {
  const entity = s.worldItems[id];
  if (!entity) return;
  if (recycle) recycleContent(s, entity.content);
  delete s.worldItems[id];
}
function ensureWorldLimit(s) {
  const entries = Object.values(s.worldItems);
  if (entries.length < WORLD_ITEM_LIMIT) return true;
  const victim = entries.filter((entry) => entry.mode !== "airborne").sort((a, b) => a.createdAt - b.createdAt)[0];
  if (victim) {
    removeWorldItem(s, victim.id, true);
    return true;
  }
  return false;
}
function createWorldItem(s, content, position, mode = "ground", extra = {}) {
  if (!ensureWorldLimit(s)) return null;
  const id = `wi${++s.worldItemSeq}`;
  s.worldItems[id] = { id, content, mode, x: position.x, z: position.z, supportId: position.supportId || null, createdAt: s.elapsed, expiresAt: s.elapsed + WORLD_ITEM_LIFETIME, ...extra };
  return s.worldItems[id];
}
function pathMetrics(points) {
  const segments = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], length = Math.hypot(b.x - a.x, b.z - a.z);
    segments.push({ a, b, length, start: total });
    total += length;
  }
  return { segments, total };
}
function distanceOnPath(points, point) {
  const metrics = pathMetrics(points);
  let best = null;
  for (const seg of metrics.segments) {
    const vx = seg.b.x - seg.a.x, vz = seg.b.z - seg.a.z, len2 = vx * vx + vz * vz, t = len2 ? Math.max(0, Math.min(1, ((point.x - seg.a.x) * vx + (point.z - seg.a.z) * vz) / len2)) : 0, px = seg.a.x + vx * t, pz = seg.a.z + vz * t, d = Math.hypot(point.x - px, point.z - pz), distance = seg.start + seg.length * t;
    if (!best || d < best.d) best = { d, distance };
  }
  return best?.distance || 0;
}
function pointOnPath(points, distance) {
  const metrics = pathMetrics(points);
  const d = Math.max(0, Math.min(metrics.total, distance));
  const seg = metrics.segments.find((entry) => d <= entry.start + entry.length) || metrics.segments[metrics.segments.length - 1];
  if (!seg) return points[0] || { x: 0, z: 0 };
  const t = seg.length ? (d - seg.start) / seg.length : 0;
  return { x: seg.a.x + (seg.b.x - seg.a.x) * t, z: seg.a.z + (seg.b.z - seg.a.z) * t };
}
function startFall(ctx, id, p) {
  if (p.fall || p.respawnGrace > 0) return;
  recycleContent(ctx.state, p.carrying);
  p.carrying = null;
  p.vx = p.vz = 0;
  p.input = { dx: 0, dz: 0 };
  p.working = false;
  p.charge = null;
  p.fall = { remaining: FALL_TIME };
  bumpStat(p, "falls");
  ctx.broadcast("player:fall", { id, name: p.name });
}
function carryPlatformDelta(s, def, dx, dz) {
  if (!dx && !dz) return;
  for (const p of Object.values(s.players)) if (p.supportId === def.id && !p.fall) {
    p.x += dx;
    p.z += dz;
  }
  for (const item of Object.values(s.worldItems)) if (item.supportId === def.id && item.mode !== "airborne") {
    item.x += dx;
    item.z += dz;
  }
}
function secureDockSeam(s, def, offset) {
  const xs = def.tiles.map((tile) => tile.x), minX = def.origin.x + offset.x + Math.min(...xs), maxX = def.origin.x + offset.x + Math.max(...xs) + 1;
  const margin = PLAYER_R + 0.02;
  for (const p of Object.values(s.players)) if (p.supportId === def.id && !p.fall) {
    p.x = Math.max(minX + margin, Math.min(maxX - margin, p.x));
  }
  for (const item of Object.values(s.worldItems)) if (item.supportId === def.id && item.mode === "ground") {
    item.x = Math.max(minX + 0.08, Math.min(maxX - 0.08, item.x));
  }
}
function dockMotionAt(config, elapsed) {
  const separatedEnd = config.separatedHold, mergeEnd = separatedEnd + config.mergeDuration, mergedEnd = mergeEnd + config.mergedHold;
  const t = (elapsed % config.cycle + config.cycle) % config.cycle;
  if (t < separatedEnd) return { phase: "separated", remaining: separatedEnd - t, progress: 0, merged: false };
  if (t < mergeEnd) {
    const linear2 = (t - separatedEnd) / config.mergeDuration;
    return { phase: "merging", remaining: mergeEnd - t, progress: (1 - Math.cos(Math.PI * linear2)) / 2, merged: false };
  }
  if (t < mergedEnd) return { phase: "merged", remaining: mergedEnd - t, progress: 1, merged: true };
  const linear = (t - mergedEnd) / config.separateDuration;
  return { phase: "separating", remaining: config.cycle - t, progress: (1 + Math.cos(Math.PI * linear)) / 2, merged: false };
}
function stepPlatforms(s, def, mechanismState) {
  const runtime = runtimeOf(s);
  const dock = def.config.mode === "dock" ? dockMotionAt(def.config, s.elapsed) : null;
  if (dock && mechanismState.phase === "merged" && dock.phase === "separating") for (const platform of s.layout.platforms.filter((entry) => def.config.platformIds.includes(entry.id))) secureDockSeam(s, platform, def.config.offsets[platform.id]);
  for (const platform of s.layout.platforms.filter((entry) => def.config.platformIds.includes(entry.id))) {
    const state = s.platforms[platform.id];
    state.previousX = state.x;
    state.previousZ = state.z;
    if (dock) {
      const target = def.config.offsets[platform.id] || { x: 0, z: 0 };
      state.x = target.x * dock.progress;
      state.z = target.z * dock.progress;
    } else if (platform.motion) {
      const angle = (s.elapsed / platform.motion.period + platform.motion.phase) * Math.PI * 2;
      const wave = Math.sin(angle) * platform.motion.amplitude;
      state.x = platform.motion.axis.x * wave;
      state.z = platform.motion.axis.z * wave;
    }
    carryPlatformDelta(s, platform, state.x - state.previousX, state.z - state.previousZ);
  }
  for (const p of Object.values(s.players)) if (!p.fall) {
    const support = terrainAt(s.layout, runtime, p.x, p.z).supportId || null;
    p.supportId = support;
  }
  if (dock) {
    mechanismState.phase = dock.phase;
    mechanismState.remaining = dock.remaining;
    mechanismState.merged = dock.merged;
  }
}
function stepConveyor(ctx, def, state) {
  const s = ctx.state, config = def.config, origin = config.supportId ? platformOrigin(s.layout, runtimeOf(s), config.supportId) : { x: 0, z: 0 }, points = config.path.points.map((point) => ({ x: point.x + origin.x, z: point.z + origin.z })), metrics = pathMetrics(points);
  if (config.reverseEvery) {
    state.reverseIn -= DT;
    state.warning = state.reverseIn <= config.warning;
    if (state.reverseIn <= 0) {
      state.direction *= -1;
      state.reverseIn = config.reverseEvery;
      state.warning = false;
      ctx.broadcast("conveyor:reverse", { id: def.id, direction: state.direction });
    }
  }
  const ports = s.layout.stations.filter((entry) => entry.type === "conveyorPort" && entry.conveyorId === def.id).map((entry) => ({ def: entry, state: s.stations[entry.id], distance: distanceOnPath(points, { x: entry.pathPoint.x + origin.x, z: entry.pathPoint.z + origin.z }) }));
  for (const port of ports.filter((entry) => entry.def.portMode === "input" && entry.state?.item)) {
    const occupied = Object.values(s.worldItems).some((item2) => item2.mode === "conveyor" && item2.conveyorId === def.id && Math.min(Math.abs(item2.pathDistance - port.distance), config.path.loop ? metrics.total - Math.abs(item2.pathDistance - port.distance) : Infinity) < 0.7);
    if (occupied) continue;
    const position = pointOnPath(points, port.distance), item = createWorldItem(s, port.state.item, { ...position, supportId: config.supportId || null }, "conveyor", { conveyorId: def.id, pathDistance: port.distance, lastOwnerId: port.state.lastOwnerId || "" });
    if (item) {
      port.state.item = null;
      port.state.lastOwnerId = null;
    }
  }
  const items = Object.values(s.worldItems).filter((entry) => entry.mode === "conveyor" && entry.conveyorId === def.id).sort((a, b) => state.direction * (b.pathDistance - a.pathDistance));
  let ahead = null;
  for (const item of items) {
    const previous = item.pathDistance;
    let next = previous + state.direction * config.path.speed * DT;
    if (config.path.loop) next = (next % metrics.total + metrics.total) % metrics.total;
    else {
      if (ahead !== null) next = state.direction > 0 ? Math.min(next, ahead - 0.7) : Math.max(next, ahead + 0.7);
      next = Math.max(0, Math.min(metrics.total, next));
    }
    item.pathDistance = next;
    const pos = pointOnPath(points, next);
    item.x = pos.x;
    item.z = pos.z;
    item.supportId = config.supportId || null;
    ahead = next;
    const travelled = state.direction > 0 ? config.path.loop ? (next - previous + metrics.total) % metrics.total : next - previous : config.path.loop ? (previous - next + metrics.total) % metrics.total : previous - next;
    const output = ports.filter((entry) => entry.def.portMode === "output" && entry.state && !entry.state.item).map((entry) => ({ entry, delta: state.direction > 0 ? config.path.loop ? (entry.distance - previous + metrics.total) % metrics.total : entry.distance - previous : config.path.loop ? (previous - entry.distance + metrics.total) % metrics.total : previous - entry.distance })).filter(({ delta }) => delta >= -1e-6 && delta <= travelled + 1e-6).sort((a, b) => a.delta - b.delta)[0]?.entry;
    if (output) {
      output.state.item = item.content;
      delete s.worldItems[item.id];
      const owner = s.players[item.lastOwnerId];
      if (owner) bumpStat(owner, "conveyorTransfers");
    }
  }
}
function shuffleGatePresets(ctx, ids, avoid = null) {
  const bag = [...ids];
  for (let index = bag.length - 1; index > 0; index--) {
    const other = Math.floor(ctx.random() * (index + 1));
    [bag[index], bag[other]] = [bag[other], bag[index]];
  }
  if (bag.length > 1 && bag[0] === avoid) [bag[0], bag[1]] = [bag[1], bag[0]];
  return bag;
}
function gatePreset(def, id) {
  return def.config.presets.find((entry) => entry.id === id);
}
function setGatePreview(state, nextOpenIds = []) {
  const next = new Set(nextOpenIds);
  for (const gate of state.gates) {
    gate.willOpen = !gate.open && next.has(gate.id);
    gate.willClose = gate.open && !next.has(gate.id);
  }
}
function takeGatePreset(ctx, def, state) {
  if (!state.bag.length) state.bag = shuffleGatePresets(ctx, def.config.presets.map((entry) => entry.id), state.activePresetId);
  return state.bag.shift();
}
function createGateState(def, ctx) {
  const presetIds = def.config.presets.map((entry) => entry.id), bag = shuffleGatePresets(ctx, presetIds), activePresetId = bag.shift(), active = gatePreset(def, activePresetId), open = new Set(active.open);
  return { type: def.type, remaining: def.config.switchEvery, warning: false, activePresetId, nextPresetId: null, bag, gates: def.config.groups.map((gate) => ({ ...gate, cells: gate.cells.map((cell) => ({ ...cell })), open: open.has(gate.id), willOpen: false, willClose: false })) };
}
function stepGate(ctx, def, state) {
  state.remaining -= DT;
  if (state.remaining <= def.config.warning && !state.nextPresetId) {
    state.nextPresetId = takeGatePreset(ctx, def, state);
    setGatePreview(state, gatePreset(def, state.nextPresetId).open);
  }
  state.warning = !!state.nextPresetId;
  if (state.remaining > 0) return;
  const closing = state.gates.filter((gate) => gate.willClose);
  const occupied = Object.values(ctx.state.players).some((p) => closing.some((gate) => gate.cells.some((cell) => Math.hypot(p.x - (cell.x + 0.5), p.z - (cell.z + 0.5)) < 0.9)));
  if (occupied) {
    state.remaining = 0.5;
    return;
  }
  const next = gatePreset(def, state.nextPresetId), open = new Set(next.open), previousOpen = state.gates.filter((gate) => gate.open).map((gate) => gate.id);
  for (const gate of state.gates) {
    gate.open = open.has(gate.id);
    gate.willOpen = false;
    gate.willClose = false;
  }
  state.activePresetId = next.id;
  state.nextPresetId = null;
  state.remaining = def.config.switchEvery;
  state.warning = false;
  ctx.broadcast("gate:switch", { presetId: next.id, label: next.label, open: [...next.open], closed: previousOpen.filter((id) => !open.has(id)) });
}
var noopMechanism = () => {
};
var MECHANISM_REGISTRY = {
  movingPlatform: { create: (def) => ({ type: def.type, phase: def.config.mode === "dock" ? "separated" : null, remaining: def.config.separatedHold || 0, merged: false }), tick: (ctx, def, state) => stepPlatforms(ctx.state, def, state), getCollision: noopMechanism, getInteractions: noopMechanism, getRenderState: noopMechanism, destroy: noopMechanism },
  conveyor: { create: (def) => ({ type: def.type, direction: 1, reverseIn: def.config.reverseEvery || 0, warning: false }), tick: stepConveyor, getCollision: noopMechanism, getInteractions: noopMechanism, getRenderState: noopMechanism, destroy: noopMechanism },
  gate: { create: createGateState, tick: stepGate, getCollision: noopMechanism, getInteractions: noopMechanism, getRenderState: noopMechanism, destroy: noopMechanism },
  iceSurface: { create: (def) => ({ type: def.type }), tick: noopMechanism, getCollision: noopMechanism, getInteractions: noopMechanism, getRenderState: noopMechanism, destroy: noopMechanism },
  waterHazard: { create: (def) => ({ type: def.type }), tick: noopMechanism, getCollision: noopMechanism, getInteractions: noopMechanism, getRenderState: noopMechanism, destroy: noopMechanism }
};
function stepMapMechanisms(ctx) {
  const s = ctx.state;
  for (const def of s.layout.mechanisms) {
    const handler = MECHANISM_REGISTRY[def.type];
    handler?.tick(ctx, def, s.mechanisms[def.id]);
  }
}
function finishAirborne(ctx, item) {
  const s = ctx.state, runtime = runtimeOf(s);
  const receivers = Object.entries(s.players).filter(([id, p]) => id !== item.ownerId && !p.carrying && !p.fall && !p.working).map(([id, p]) => ({ id, p, d: Math.hypot(p.x - item.x, p.z - item.z) })).filter((entry) => entry.d < 0.55 && entry.p.face.dx * (item.x - entry.p.x) + entry.p.face.dz * (item.z - entry.p.z) > 0).sort((a, b) => a.d - b.d);
  if (receivers.length) {
    const receiver = receivers[0];
    receiver.p.carrying = item.content;
    bumpStat(receiver.p, "catches");
    delete s.worldItems[item.id];
    ctx.broadcast("item:caught", { by: receiver.p.name });
    return;
  }
  let landing = null;
  for (const stationDef of s.layout.stations.filter((entry) => entry.type === "counter" || entry.type === "board")) {
    const pos = stationWorld(s.layout, runtime, stationDef);
    const dyn = s.stations[stationDef.id];
    if (Math.hypot(item.x - (pos.x + 0.5), item.z - (pos.z + 0.5)) < 0.7 && dyn && !dyn.item) {
      if (stationDef.type === "board" && (!(item.content.k === "raw" || item.content.k === "chopped") || item.content.k === "raw" && !INGREDIENTS[item.content.g]?.choppable)) continue;
      landing = { stationDef, dyn };
      break;
    }
  }
  if (landing) {
    landing.dyn.item = item.content;
    delete s.worldItems[item.id];
    return;
  }
  const dx = item.motion ? item.motion.toX - item.motion.fromX : 0, dz = item.motion ? item.motion.toZ - item.motion.fromZ : 0, length = Math.hypot(dx, dz) || 1;
  const candidates = [0, 0.55, 1, 1.45].map((offset) => ({ x: item.x - dx / length * offset, z: item.z - dz / length * offset }));
  const safe = candidates.map((position) => safeLooseItemPosition(s, position)).find(Boolean);
  if (safe) {
    item.mode = "ground";
    item.x = safe.x;
    item.z = safe.z;
    item.supportId = safe.supportId || null;
    item.expiresAt = s.elapsed + WORLD_ITEM_LIFETIME;
    delete item.motion;
    return;
  }
  removeWorldItem(s, item.id, true);
  ctx.broadcast("item:lost", {});
}
function stepWorldItems(ctx) {
  const s = ctx.state;
  for (const item of Object.values(s.worldItems)) {
    if (item.mode === "airborne") {
      const previous = { x: item.x, z: item.z };
      item.motion.elapsed += DT;
      const t = Math.min(1, item.motion.elapsed / item.motion.duration);
      item.x = item.motion.fromX + (item.motion.toX - item.motion.fromX) * t;
      item.z = item.motion.fromZ + (item.motion.toZ - item.motion.fromZ) * t;
      const receiver = Object.entries(s.players).filter(([id, p]) => id !== item.ownerId && !p.carrying && !p.fall && !p.working).find(([, p]) => Math.hypot(p.x - item.x, p.z - item.z) < 0.55 && p.face.dx * (item.x - p.x) + p.face.dz * (item.z - p.z) > 0);
      if (receiver) {
        receiver[1].carrying = item.content;
        bumpStat(receiver[1], "catches");
        delete s.worldItems[item.id];
        ctx.broadcast("item:caught", { by: receiver[1].name });
        continue;
      }
      const blocked = projectileBlockingRects(s.layout, runtimeOf(s)).some((rect) => segmentHitsRect(previous, item, rect));
      if (blocked) {
        item.x = previous.x;
        item.z = previous.z;
        finishAirborne(ctx, item);
      } else if (t >= 1) finishAirborne(ctx, item);
    } else if (s.elapsed >= item.expiresAt) removeWorldItem(s, item.id, true);
  }
}
function stepGame(ctx) {
  const s = ctx.state;
  const L = s.layout;
  const playerIds = Object.keys(s.players);
  s.elapsed += DT;
  stepBuffs(ctx);
  stepMapMechanisms(ctx);
  stepWorldItems(ctx);
  const runtime = runtimeOf(s);
  for (const id of playerIds) {
    const p = s.players[id];
    if (p.respawnGrace > 0) p.respawnGrace = Math.max(0, p.respawnGrace - DT);
    if (p.charge) {
      p.charge.held += DT;
      if (p.charge.held >= THROW_TIMEOUT) p.charge = null;
    }
    if (p.fall) {
      p.fall.remaining -= DT;
      if (p.fall.remaining <= 0) respawnAtRoundSpawn(s, p, id);
      continue;
    }
    if (p.working) {
      const st2 = targetStation(L, runtime, p);
      let didWork = false;
      if (st2 && st2.type === "board") {
        const dyn = s.stations[st2.id];
        if (dyn && dyn.item && dyn.item.k === "raw" && INGREDIENTS[dyn.item.g]?.choppable) {
          const rate = p.activeBuff && p.activeBuff.type === "fast_hands" ? 1.5 : 1;
          dyn.item.progress = (dyn.item.progress || 0) + DT * rate;
          if (dyn.item.progress >= CHOP_TIME) {
            dyn.item = { ...dyn.item, k: "chopped", progress: 0 };
            addCredit(dyn.item, id, 1, false);
            bumpStat(p, "chops");
          }
          didWork = true;
        }
      } else if (st2 && st2.type === "sink") {
        if (!p.carrying && s.plates.dirty > 0) {
          const rate = p.activeBuff && p.activeBuff.type === "fast_hands" ? 1.5 : 1;
          s.plates.washT += DT * rate;
          if (s.plates.washT >= WASH_TIME) {
            s.plates.washT = 0;
            s.plates.dirty -= 1;
            s.plates.clean += 1;
            s.plates.cleanCredits.push([credit(id, 2, true)]);
            bumpStat(p, "washes");
          }
          didWork = true;
        }
      }
      if (didWork) {
        p.vx = 0;
        p.vz = 0;
        continue;
      }
    }
    const ix = p.input.dx;
    const iz = p.input.dz;
    if (ix !== 0 || iz !== 0) {
      const flen = Math.hypot(ix, iz);
      if (flen > 0.2) p.face = { dx: ix / flen, dz: iz / flen };
    }
    const otherPlayers = playerIds.filter((otherId) => otherId !== id).map((otherId) => s.players[otherId]);
    stepPlayerMovement(L, runtime, p, p.input, DT, otherPlayers);
    const ground = terrainAt(L, runtime, p.x, p.z);
    if (![".", "i"].includes(ground.kind)) startFall(ctx, id, p);
  }
  for (const k in s.stations) {
    const pot = s.stations[k];
    if (!pot.contents) continue;
    if (pot.phase === "cooking") {
      const heat = s.fireOverdriveRemaining > 0 ? 2 : 1;
      pot.t += DT * heat * (pot.masterChef ? 1.4 : 1);
      if (pot.t >= COOK_TIME) {
        pot.phase = "ready";
        pot.t = 0;
        const st2 = L.stations.find((entry) => entry.id === k);
        ctx.broadcast("pot:ready", { x: st2.x, z: st2.z });
      }
    } else if (pot.phase === "ready") {
      pot.t += DT * (s.fireOverdriveRemaining > 0 ? 2 : 1);
      if (pot.t >= BURN_TIME) {
        pot.phase = "burnt";
        pot.t = 0;
        pot.masterChef = false;
        s.burns = (s.burns || 0) + 1;
        s.roundBurns = (s.roundBurns || 0) + 1;
        const st2 = L.stations.find((entry) => entry.id === k);
        ctx.broadcast("pot:burnt", { x: st2.x, z: st2.z });
      }
    }
  }
  for (let i = s.plates.due.length - 1; i >= 0; i--) {
    s.plates.due[i] -= DT;
    if (s.plates.due[i] <= 0) {
      s.plates.due.splice(i, 1);
      s.plates.dirty += 1;
      ctx.broadcast("plate:dirty", {});
    }
  }
  s.nextOrderIn -= DT;
  if (s.nextOrderIn <= 0 && s.orders.length < MAX_ORDERS) {
    spawnOrder(ctx);
    resetNextOrderIn(ctx);
  }
  for (let i = s.orders.length - 1; i >= 0; i--) {
    const o = s.orders[i];
    o.t -= DT;
    if (o.t <= 0) {
      s.orders.splice(i, 1);
      s.expired += 1;
      s.roundExpired += 1;
      s.score = Math.max(0, s.score - EXPIRE_PENALTY);
      s.sessionScore = Math.max(0, s.sessionScore - EXPIRE_PENALTY);
      s.roundScore = Math.max(0, s.roundScore - EXPIRE_PENALTY);
      if (s.mode === "endless") s.rage = Math.min(RAGE_MAX, s.rage + RAGE_EXPIRED);
      ctx.broadcast("order:expired", { name: o.name });
      if (s.mode === "endless" && s.rage >= RAGE_MAX) {
        finishSession(ctx);
        return;
      }
    }
  }
  if (s.orders.length === 0) {
    spawnOrder(ctx);
    resetNextOrderIn(ctx);
  }
  s.timeLeft -= DT;
  if (s.timeLeft <= 0) {
    s.timeLeft = 0;
    finishRound(ctx);
  }
}
function credit(playerId, points, publicEvent) {
  return { playerId, points, publicEvent: !!publicEvent };
}
function addCredit(item, playerId, points, publicEvent) {
  if (!item.credits) item.credits = [];
  item.credits.push(credit(playerId, points, publicEvent));
}
function mergeCredits(...items) {
  const out = [];
  for (const item of items) if (item && item.credits) out.push(...item.credits);
  return out;
}
function awardCredits(s, credits) {
  for (const c of credits || []) {
    const p = s.players[c.playerId];
    if (!p) continue;
    p.contributionScore += c.points;
    p.roundContributionScore += c.points;
    if (c.publicEvent) {
      p.publicEvents += 1;
      p.roundPublicEvents += 1;
    }
    syncPlayerRecord(s, c.playerId);
  }
}
function nearestGroundItem(s, p) {
  const tx = p.x + p.face.dx * 0.65, tz = p.z + p.face.dz * 0.65;
  return Object.values(s.worldItems).filter((item) => item.mode === "ground").map((item) => ({ item, d: Math.hypot(item.x - tx, item.z - tz) })).filter((entry) => entry.d <= 0.85).sort((a, b) => a.d - b.d)[0]?.item || null;
}
function canUseStation(s, p, st2) {
  const c = p.carrying, dyn = s.stations[st2.id];
  if (st2.type === "crate") return !c && s.elapsed >= (p.nextCrateAt || 0);
  if (st2.type === "counter" || st2.type === "board") {
    if (!c) return !!dyn?.item;
    if (!dyn?.item) return st2.type === "counter" || (c.k === "raw" || c.k === "chopped") && (c.k !== "raw" || INGREDIENTS[c.g]?.choppable);
    const on = dyn.item;
    return (c.k === "raw" || c.k === "chopped") && validItemPrep(c) && (on.k === "plate" || on.k === "dish") && on.items.length < 3;
  }
  if (st2.type === "conveyorPort") return st2.portMode === "input" ? !c ? !!dyn?.item : !dyn?.item : !c && !!dyn?.item;
  if (st2.type === "stove") {
    if (!dyn) return false;
    if (c && (c.k === "raw" || c.k === "chopped")) return validItemPrep(c) && COOKABLE.has(c.g) && (dyn.phase === "idle" || dyn.phase === "cooking") && dyn.contents.length < 3;
    if (c?.k === "plate") return c.items.length === 0 && dyn.phase === "ready";
    return !c && dyn.contents.length > 0 && (dyn.phase === "idle" || dyn.phase === "burnt");
  }
  if (st2.type === "plates") return !c && s.plates.clean > 0;
  if (st2.type === "window") return c?.k === "dish" && s.orders.some((order) => order.key === recipeKey(c.items));
  if (st2.type === "trash") return !!c;
  return false;
}
function safeItemPosition(s, p, position) {
  const terrain2 = terrainAt(s.layout, runtimeOf(s), position.x, position.z);
  if (![".", "i"].includes(terrain2.kind)) return null;
  if (blockingRects(s.layout, runtimeOf(s)).some((rect) => position.x >= rect.x - 0.18 && position.x <= rect.x + rect.w + 0.18 && position.z >= rect.z - 0.18 && position.z <= rect.z + rect.h + 0.18)) return null;
  if (Object.values(s.worldItems).some((item) => item.mode !== "airborne" && Math.hypot(item.x - position.x, item.z - position.z) < 0.55)) return null;
  if (Object.values(s.players).some((other) => other !== p && Math.hypot(other.x - position.x, other.z - position.z) < 0.4)) return null;
  return { ...position, supportId: terrain2.supportId || null };
}
function safeLooseItemPosition(s, position) {
  const terrain2 = terrainAt(s.layout, runtimeOf(s), position.x, position.z);
  if (![".", "i"].includes(terrain2.kind)) return null;
  if (blockingRects(s.layout, runtimeOf(s)).some((rect) => position.x >= rect.x - 0.18 && position.x <= rect.x + rect.w + 0.18 && position.z >= rect.z - 0.18 && position.z <= rect.z + rect.h + 0.18)) return null;
  if (Object.values(s.worldItems).some((item) => item.mode !== "airborne" && Math.hypot(item.x - position.x, item.z - position.z) < 0.55)) return null;
  return { ...position, supportId: terrain2.supportId || null };
}
function dropCarrying(ctx, p) {
  const s = ctx.state;
  const candidates = [{ x: p.x + p.face.dx * 0.8, z: p.z + p.face.dz * 0.8 }, { x: p.x, z: p.z }];
  for (const position of candidates) {
    const safe = safeItemPosition(s, p, position);
    if (safe) {
      const entity = createWorldItem(s, p.carrying, safe, "ground", { lastOwnerId: playerIdFor(s, p) });
      if (!entity) return false;
      p.carrying = null;
      return true;
    }
  }
  return false;
}
function doInteract(ctx, p) {
  const s = ctx.state;
  const target = targetStation(s.layout, runtimeOf(s), p);
  const st2 = target && (canUseStation(s, p, target) || target.type === "conveyorPort") ? target : null;
  if (!st2) {
    if (!p.carrying) {
      const item = nearestGroundItem(s, p);
      if (item) {
        p.carrying = item.content;
        delete s.worldItems[item.id];
        bumpStat(p, "groundPickups");
      }
    } else dropCarrying(ctx, p);
    return;
  }
  const dyn = s.stations[st2.id];
  const c = p.carrying;
  if (st2.type === "crate") {
    if (!c && s.elapsed >= (p.nextCrateAt || 0)) {
      p.carrying = { k: "raw", g: st2.crate, progress: 0, credits: [credit(playerIdFor(s, p), 1, false)] };
      p.nextCrateAt = s.elapsed + INTERACT_COOLDOWN;
    }
    return;
  }
  if (st2.type === "counter" || st2.type === "board") {
    if (!c && dyn && dyn.item) {
      p.carrying = dyn.item;
      dyn.item = null;
      if (p.carrying.k === "raw") p.carrying.progress = 0;
    } else if (c && dyn && !dyn.item) {
      if (st2.type === "board" && (!(c.k === "raw" || c.k === "chopped") || c.k === "raw" && !INGREDIENTS[c.g]?.choppable)) return;
      if (c.k === "raw") c.progress = 0;
      dyn.item = c;
      p.carrying = null;
    } else if (c && dyn && dyn.item) {
      const on = dyn.item;
      if ((c.k === "raw" || c.k === "chopped") && validItemPrep(c) && (on.k === "plate" || on.k === "dish") && on.items.length < 3) {
        on.items.push(itemRequirement(c));
        on.k = "dish";
        on.credits = mergeCredits(on, c);
        addCredit(on, playerIdFor(s, p), 2, true);
        bumpStat(p, "assembles");
        p.carrying = null;
      }
    }
    return;
  }
  if (st2.type === "conveyorPort") {
    if (!c && dyn?.item) {
      p.carrying = dyn.item;
      dyn.item = null;
      dyn.lastOwnerId = null;
      if (p.carrying.k === "raw") p.carrying.progress = 0;
    } else if (c && st2.portMode === "input" && dyn && !dyn.item) {
      if (c.k === "raw") c.progress = 0;
      dyn.item = c;
      dyn.lastOwnerId = playerIdFor(s, p);
      p.carrying = null;
    }
    return;
  }
  if (st2.type === "stove") {
    const pot = dyn;
    if (!pot) return;
    if (c && (c.k === "raw" || c.k === "chopped") && validItemPrep(c) && (pot.phase === "idle" || pot.phase === "cooking") && pot.contents.length < 3) {
      if (!COOKABLE.has(c.g)) return;
      pot.contents.push(itemRequirement(c));
      pot.credits.push(...mergeCredits(c));
      if (p.activeBuff && p.activeBuff.type === "master_chef") pot.masterChef = true;
      addCredit(pot, playerIdFor(s, p), 2, true);
      bumpStat(p, "potAdds");
      p.carrying = null;
      const r = RECIPE_BY_KEY[recipeKey(pot.contents)];
      if (r && r.cook) {
        pot.phase = "cooking";
        pot.t = 0;
      } else if (pot.contents.length >= 3) {
        pot.phase = "burnt";
        pot.t = 0;
        pot.masterChef = false;
        s.burns = (s.burns || 0) + 1;
        s.roundBurns = (s.roundBurns || 0) + 1;
        ctx.broadcast("pot:burnt", { x: st2.x, z: st2.z });
      }
    } else if (c && c.k === "plate" && c.items.length === 0 && pot.phase === "ready") {
      p.carrying = { k: "dish", items: pot.contents.map((item) => ({ ...item })), credits: mergeCredits(pot) };
      addCredit(p.carrying, playerIdFor(s, p), 2, true);
      bumpStat(p, "potPickups");
      pot.contents = [];
      pot.credits = [];
      pot.masterChef = false;
      pot.phase = "idle";
      pot.t = 0;
    } else if (!c && pot.contents.length > 0 && (pot.phase === "idle" || pot.phase === "burnt")) {
      if (pot.phase === "burnt") bumpStat(p, "burnClears");
      pot.contents = [];
      pot.credits = [];
      pot.masterChef = false;
      pot.phase = "idle";
      pot.t = 0;
    }
    return;
  }
  if (st2.type === "plates") {
    if (!c && s.plates.clean > 0) {
      s.plates.clean -= 1;
      p.carrying = { k: "plate", items: [], credits: s.plates.cleanCredits.shift() || [] };
    }
    return;
  }
  if (st2.type === "window") {
    if (c && c.k === "dish") {
      const key2 = recipeKey(c.items);
      const idx = s.orders.findIndex((o) => o.key === key2);
      if (idx >= 0) {
        const o = s.orders[idx];
        s.orders.splice(idx, 1);
        const tip = Math.round(10 * Math.max(0, o.t) / o.total);
        const gained = o.points + tip;
        s.score += gained;
        s.sessionScore += gained;
        s.roundScore += gained;
        s.served += 1;
        s.roundServed += 1;
        addCredit(c, playerIdFor(s, p), 2, true);
        awardCredits(s, c.credits);
        p.servedCount += 1;
        p.roundServed += 1;
        syncPlayerRecord(s, playerIdFor(s, p));
        bumpStat(p, "deliveries");
        if (o.t / o.total >= 0.7) bumpStat(p, "fastServes");
        if (o.t <= 10) bumpStat(p, "clutchServes");
        syncPlayerRecord(s, playerIdFor(s, p));
        if (s.mode === "endless") s.rage = Math.max(0, s.rage - RAGE_SERVED);
        s.plates.due.push(DIRTY_DELAY);
        p.carrying = null;
        ctx.broadcast("order:served", { name: o.name, points: o.points, tip, by: p.name });
        if (s.orders.length === 0) {
          spawnOrder(ctx);
          resetNextOrderIn(ctx);
        }
      }
    }
    return;
  }
  if (st2.type === "trash") {
    if (c) {
      bumpStat(p, "discards");
      recycleContent(s, c);
      p.carrying = null;
    }
    return;
  }
}
function throwCarrying(ctx, p, held) {
  if (!p.carrying) return;
  const charge = Math.max(0, Math.min(1, (held - THROW_THRESHOLD) / (THROW_FULL_TIME - THROW_THRESHOLD)));
  const range = THROW_MIN_RANGE + (THROW_MAX_RANGE - THROW_MIN_RANGE) * charge;
  const fromX = p.x + p.face.dx * 0.45, fromZ = p.z + p.face.dz * 0.45;
  const entity = createWorldItem(ctx.state, p.carrying, { x: fromX, z: fromZ }, "airborne", { ownerId: playerIdFor(ctx.state, p), lastOwnerId: playerIdFor(ctx.state, p), motion: { fromX, fromZ, toX: fromX + p.face.dx * range, toZ: fromZ + p.face.dz * range, elapsed: 0, duration: 0.45 + range * 0.07 } });
  if (!entity) return;
  p.carrying = null;
  bumpStat(p, "throws");
  ctx.broadcast("item:thrown", { id: entity.id, by: p.name, range });
}
function playerIdFor(s, player) {
  for (const id in s.players) if (s.players[id] === player) return id;
  return "";
}
var index_default = defineRoom({
  meta: { name: "\u65B0\u624B\u4E0A\u53A8", minPlayers: 2, maxPlayers: 4 },
  initialState() {
    return {
      phase: "lobby",
      // lobby | countdown | playing | roundResult | awards
      mode: "party",
      roundIndex: 0,
      difficultyLevel: 1,
      mapQueue: [],
      nextMapId: null,
      roundResultTime: 0,
      gameSeq: 0,
      // 每开一局 +1，客户端据此重建场景
      mapId: "classic",
      hostId: null,
      countdown: 0,
      timeLeft: 0,
      score: 0,
      sessionScore: 0,
      roundScore: 0,
      served: 0,
      roundServed: 0,
      expired: 0,
      roundExpired: 0,
      burns: 0,
      roundBurns: 0,
      roundHistory: [],
      roundComment: null,
      finalComment: null,
      roundTitles: {},
      finalTitles: {},
      rage: 0,
      rageMax: RAGE_MAX,
      standings: [],
      playerRecords: {},
      joinSeq: 0,
      players: {},
      layout: null,
      stations: {},
      platforms: {},
      mechanisms: {},
      worldItems: {},
      worldItemSeq: 0,
      elapsed: 0,
      orders: [],
      nextOrderIn: 0,
      plates: { clean: 0, dirty: 0, washT: 0, due: [], cleanCredits: [] },
      orderSeq: 0,
      groundBuff: null,
      nextBuffIn: 25,
      fireOverdriveRemaining: 0
    };
  },
  onCreate(ctx) {
    ctx.state.hostId = ctx.host ? ctx.host.id : null;
  },
  onRestore(ctx) {
    if (ctx.host) ctx.state.hostId = ctx.host.id;
    if (ctx.state.phase === "playing" || ctx.state.phase === "countdown" || ctx.state.phase === "roundResult" || ctx.state.phase === "awards") {
      armTick(ctx);
    }
  },
  onJoin(ctx, player) {
    const s = ctx.state;
    const previousRecord = s.playerRecords[player.id];
    if (ctx.host && player.id === ctx.host.id) s.hostId = ctx.host.id;
    const count = Object.keys(s.players).length;
    s.joinSeq = (s.joinSeq || 0) + 1;
    const p = {
      name: (player.name || "\u53A8\u5E08").slice(0, 12),
      color: PLAYER_COLORS[count % PLAYER_COLORS.length],
      x: 0,
      z: 0,
      input: { dx: 0, dz: 0 },
      vx: 0,
      vz: 0,
      moveSeq: 0,
      face: { dx: 0, dz: 1 },
      carrying: null,
      working: false,
      supportId: null,
      roundSpawnSlot: null,
      charge: null,
      fall: null,
      respawnGrace: 0,
      interactSeq: 0,
      workSeq: 0,
      nextInteractAt: 0,
      nextCrateAt: 0,
      awardsPodiumHeight: 0,
      awardsPodiumRank: 0,
      activeBuff: null,
      contributionScore: previousRecord?.contributionScore || 0,
      roundContributionScore: 0,
      servedCount: previousRecord?.servedCount || 0,
      publicEvents: previousRecord?.publicEvents || 0,
      roundServed: 0,
      roundPublicEvents: 0,
      stats: normalizeStats(previousRecord?.stats),
      roundStats: emptyStats(),
      joinOrder: previousRecord?.joinOrder || s.joinSeq
    };
    s.players[player.id] = p;
    syncPlayerRecord(s, player.id);
    if (s.phase === "awards" && s.layout) {
      placePlayerForAwards(s, player.id, count);
      syncPlayerRecord(s, player.id);
    } else if ((s.phase === "playing" || s.phase === "countdown") && s.layout) {
      const used = new Set(Object.entries(s.players).filter(([id]) => id !== player.id).map(([, other]) => other.roundSpawnSlot).filter(Number.isInteger));
      const remembered = previousRecord?.roundSpawnGameSeq === s.gameSeq && previousRecord?.roundSpawnMapId === s.mapId ? previousRecord.roundSpawnSlot : null;
      const sp = s.layout.spawns.find((entry) => entry.slot === remembered && !used.has(entry.slot)) || s.layout.spawns.find((entry) => !used.has(entry.slot)) || s.layout.spawns[count % s.layout.spawns.length];
      resetPlayerForLayout(p, sp, s.layout, runtimeOf(s));
      syncPlayerRecord(s, player.id);
    }
    ctx.broadcast("player:joined", { name: p.name });
  },
  onLeave(ctx, player) {
    const s = ctx.state;
    syncPlayerRecord(s, player.id);
    delete s.players[player.id];
    if (Object.keys(s.players).length === 0 && s.phase !== "lobby") {
      s.phase = "lobby";
      s.layout = null;
      s.stations = {};
      s.platforms = {};
      s.mechanisms = {};
      s.worldItems = {};
      s.orders = [];
      ctx.clearTimer("tick");
    }
  },
  actions: {
    selectMode(ctx, { player, payload }) {
      const s = ctx.state;
      if (s.phase !== "lobby" || player.id !== ctx.host.id) return;
      if (payload && (payload.mode === "party" || payload.mode === "endless")) s.mode = payload.mode;
    },
    // 大厅：开始游戏（仅房主，>=2 人）
    start(ctx, { player }) {
      const s = ctx.state;
      if (s.phase !== "lobby") return;
      if (player.id !== ctx.host.id) return;
      if (Object.keys(s.players).length < 2) return;
      setupSession(ctx);
    },
    // 结算：同图再来一局（仅房主）
    rematch(ctx, { player }) {
      const s = ctx.state;
      if (s.phase !== "awards") return;
      if (player.id !== ctx.host.id) return;
      if (Object.keys(s.players).length < 2) return;
      setupSession(ctx);
    },
    // 结算：返回大厅（仅房主）
    toLobby(ctx, { player }) {
      const s = ctx.state;
      if (s.phase !== "awards") return;
      if (player.id !== ctx.host.id) return;
      s.phase = "lobby";
      s.layout = null;
      s.stations = {};
      s.platforms = {};
      s.mechanisms = {};
      s.worldItems = {};
      s.orders = [];
      for (const id in s.players) {
        clearPlayerRuntime(s.players[id]);
      }
      ctx.clearTimer("tick");
    },
    // 移动意图：{ dx, dz, seq }（持续状态，客户端在方向变化时发送）
    move(ctx, { player, payload }) {
      const s = ctx.state;
      if (s.phase !== "playing" && s.phase !== "awards") return;
      const p = s.players[player.id];
      if (!p) return;
      let dx = Number(payload && payload.dx) || 0;
      let dz = Number(payload && payload.dz) || 0;
      if (!Number.isFinite(dx)) dx = 0;
      if (!Number.isFinite(dz)) dz = 0;
      dx = Math.max(-1, Math.min(1, dx));
      dz = Math.max(-1, Math.min(1, dz));
      const len = Math.hypot(dx, dz);
      if (len > 1) {
        dx /= len;
        dz /= len;
      }
      const seq = Number(payload && payload.seq);
      if (!Number.isSafeInteger(seq) || seq <= p.moveSeq) return;
      p.moveSeq = seq;
      p.input = { dx, dz };
    },
    // 工作意图（切菜/洗碗，长按）：{ active: boolean, seq: number }
    work(ctx, { player, payload }) {
      const s = ctx.state;
      if (s.phase !== "playing") return;
      const p = s.players[player.id];
      if (!p) return;
      const seq = Number(payload?.seq);
      if (!Number.isSafeInteger(seq) || seq <= p.workSeq) return;
      p.workSeq = seq;
      p.working = !!payload.active;
    },
    // 全新按下/松开协议：短按互动，长按投掷。
    interact(ctx, { player, payload }) {
      const s = ctx.state;
      if (s.phase !== "playing") return;
      const p = s.players[player.id];
      if (!p || !s.layout) return;
      const phase = payload?.phase, seq = Number(payload?.seq);
      if (!["start", "release", "cancel"].includes(phase) || !Number.isSafeInteger(seq)) return;
      if (phase === "start") {
        if (seq <= p.interactSeq || s.elapsed < (p.nextInteractAt || 0)) return;
        p.interactSeq = seq;
        p.nextInteractAt = s.elapsed + INTERACT_COOLDOWN;
        if (!p.carrying) doInteract(ctx, p);
        else p.charge = { seq, held: 0 };
        return;
      }
      if (!p.charge || p.charge.seq !== seq) return;
      const held = p.charge.held;
      p.charge = null;
      if (phase === "cancel") return;
      if (held <= THROW_THRESHOLD + 1e-6) doInteract(ctx, p);
      else throwCarrying(ctx, p, held);
    }
  }
});
export default index_default;
