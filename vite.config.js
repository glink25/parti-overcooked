import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const appDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Parti Room Package 产物契约（docs/room-dev-harness.md）：
 *  - UI：blob 模式单文件 index.html（inline 全部 JS/CSS/资源）
 *  - Worker：esbuild 单独打包为 room.worker.js，保留 canonical
 *    `import { defineRoom } from '@parti/worker-sdk'`，无相对 import，
 *    export default 形式兼容 loader
 */
function workerBundle(outDir) {
  return {
    name: 'parti-worker-bundle',
    async closeBundle() {
      const outfile = path.join(outDir, 'room.worker.js');
      await esbuild({
        entryPoints: [path.resolve(appDir, 'src/worker/index.js')],
        outfile,
        bundle: true,
        format: 'esm',
        target: 'es2022',
        // 不压缩：loader 以 defineRoom 为名注入依赖，压缩会改写本地绑定名导致运行时报错
        minify: false,
        external: ['@parti/worker-sdk'],
      });
      const source = readFileSync(outfile, 'utf8');
      writeFileSync(
        outfile,
        source.replace(
          /export\s*\{\s*([A-Za-z_$][\w$]*)\s+as\s+default\s*\};?/,
          'export default $1;',
        ),
      );

      // CI 发布兜底：老版 release workflow 的 parti-package 孤儿分支发布会把工作区
      // 全部未跟踪文件 git add 进去（node_modules 曾因此被打进分支，jsdelivr 判定
      // 包超 50MB，市场安装失败）。git rm 不会动 .git 目录，构建时把忽略规则追加到
      // .git/info/exclude，publish 步骤的 git add -A 就会自动跳过这些路径。
      try {
        const gitInfoDir = path.resolve(appDir, '.git/info');
        if (existsSync(gitInfoDir)) {
          const excludeFile = path.join(gitInfoDir, 'exclude');
          const rules = '\n# parti build: keep parti-package branch clean\nnode_modules/\ndist/\nparti.room.zip\npackage-lock.json\n';
          const cur = existsSync(excludeFile) ? readFileSync(excludeFile, 'utf8') : '';
          if (!cur.includes('# parti build:')) appendFileSync(excludeFile, rules);
        }
      } catch { /* 非 git 环境则忽略 */ }
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [viteSingleFile(), workerBundle(path.resolve(appDir, 'dist'))],
  build: {
    outDir: path.resolve(appDir, 'dist'),
    emptyOutDir: true,
    target: 'es2022',
    assetsInlineLimit: 100 * 1024 * 1024,
    chunkSizeWarningLimit: 4096,
  },
});
