# Verifier 索引（append-only）

本目录存放 parti-overcooked 的验收标准与测试脚本。每个版本一个子目录，不重写旧版本；
每次运行结果追加记录到 `verifier/runs/`。

## v1（2026-07-19）
- 位置：`verifier/v1/`
- 衡量内容：
  1. `parti.room.json` 符合 docs/manifest.md 校验规则（必填非空、entry.ui+worker、tags/sensors 合法）
  2. Worker 产物契约（docs/room-dev-harness.md）：单文件、保留 `import { defineRoom } from '@parti/worker-sdk'`、
     无相对 import、`export default` 存在、`initialState` 为函数、无 async action
  3. Worker 逻辑全流程模拟（仿 Parti loader 剥离 import 注入 defineRoom 后驱动）：
     加入 2-4 人、选图、开局倒计时、移动碰撞、取菜/切菜/煮汤/装盘/上菜得分、
     烧糊、脏盘回收、洗盘、订单过期扣分、终局、rematch/toLobby、非法 action 拒绝
  4. 构建产物完整：dist 含 parti.room.json / index.html / room.worker.js；index.html 为自包含单文件
     （无外部 http(s) 引用）；zip 根目录即房间包
- 运行：`node verifier/v1/run.mjs`（在仓库根目录，需先 `npm run build` 或加 `--src` 仅测源码 worker）

## v2（2026-07-19）
- 位置：`verifier/v2/`
- 与 v1 的差异：新增「真实 loader 加载」检查——逐行复制 Parti 仓库
  `packages/worker-sdk/src/loader.ts` 的 `transformSource` + `new Function` 注入逻辑，
  直接加载 `dist/room.worker.js`，验证产物与线上加载器逐字节级兼容（v1 用的是自研近似 loader）。
- 运行：`node verifier/v2/run.mjs`（需先 `npm run build`）
