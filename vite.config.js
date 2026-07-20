import { readFileSync, writeFileSync } from 'node:fs';
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
