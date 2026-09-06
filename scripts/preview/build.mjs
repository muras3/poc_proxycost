#!/usr/bin/env node
/**
 * 実装した React コンポーネントと料金エンジンを 1 枚の HTML に固める。
 *
 * **作り直しではない。** src/components と src/lib のコードをそのまま
 * バンドルして、next/link だけ <a> に差し替える。デプロイ前に
 * 「触れる実物」を人に見せるための出口。
 *
 *   npm run preview:build   → dist/proxycost-preview.html
 *
 * 入らないもの: /weights・/sources・/privacy（単一ファイルなので
 * ルーティングが無い）と、API を叩く経路（検索は notice に落ちる）。
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const OUT_DIR = 'dist';
const BUNDLE = join(OUT_DIR, 'bundle.js');
const HTML = join(OUT_DIR, 'proxycost-preview.html');

mkdirSync(OUT_DIR, { recursive: true });

// Tailwind の出力は next build が作る。静的エクスポートまではしない。
if (!existsSync('.next/static')) {
  console.log('next build を先に走らせる（Tailwind の出力が要る）…');
  execFileSync('npx', ['next', 'build'], { stdio: 'inherit' });
}

function findCss(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      const hit = findCss(p);
      if (hit) return hit;
    } else if (e.name.endsWith('.css')) return p;
  }
  return null;
}
const cssPath = findCss('.next/static');
if (!cssPath) throw new Error('.next/static に CSS が見つからない。next build が要る');

execFileSync('npx', [
  'esbuild', 'scripts/preview/entry.tsx', '--bundle', '--format=iife', '--jsx=automatic',
  '--tsconfig=tsconfig.json', '--alias:next/link=./scripts/preview/next-link.tsx',
  '--define:process.env.NODE_ENV="production"', '--minify', `--outfile=${BUNDLE}`,
], { stdio: 'inherit' });

const css = readFileSync(cssPath, 'utf8');
// 本文に </script> が含まれるとそこでタグが閉じる。
const js = readFileSync(BUNDLE, 'utf8').replace(/<\/script/gi, '<\\/script');

writeFileSync(HTML, `<title>proxycost</title>
<style>${css}</style>
<style>
  /* 埋め込み先の下地が透けないよう、本体の globals.css と同じ地色を明示する。 */
  :root { --bg: #fafaf9; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0c0a09; } }
  body { background: var(--bg); margin: 0; }
</style>
<div id="root" class="min-h-dvh text-neutral-900 dark:text-neutral-100 antialiased"></div>
<script>${js}</script>`);

rmSync(BUNDLE, { force: true });
console.log(`${HTML} — ${(readFileSync(HTML).length / 1024).toFixed(0)} KB`);
