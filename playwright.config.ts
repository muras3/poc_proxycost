import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// この環境には Chromium が /opt/pw-browsers に焼いてある（revision 1194）。
// @playwright/test 側が期待する revision と一致しないので、実体を直接指す。
// `playwright install` は環境の指示で禁止されている。
// CI（GitHub Actions）では playwright install で入る標準の場所を使うので、
// 実体があるときだけ差し替える。
const PINNED = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const CHROME = existsSync(PINNED) ? PINNED : undefined;
const PORT = 3100;
// **127.0.0.1 ではなく localhost を使う。** Next 16 は 127.0.0.1 からの dev リソース要求を
// クロスオリジンとして遮断し、チャンクが 404 になって hydration が完了しない。
// 実ブラウザで操作すると「クリックしても何も起きない」形で出る。

export default defineConfig({
  testDir: './e2e',
  // E2E は実操作を求める。1件ずつ確実に。
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    launchOptions: CHROME ? { executablePath: CHROME } : {},
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } },
    // モバイルは 5〜6列をどう畳むかの検証に要る（docs/UI-DESIGN.md §3）。
    { name: 'mobile', use: { ...devices['Pixel 7'], isMobile: true, hasTouch: true } },
  ],
  webServer: {
    // 本番ビルドで回す。dev サーバの遅延で E2E が揺れるのを避ける。
    command: `npm run build && npx next start -p ${PORT} -H localhost`,
    url: `http://localhost:${PORT}`,
    // 再ビルドで .next が入れ替わると、生き残ったサーバが消えたチャンクを参照して
    // 500 を返し続ける。毎回起こし直す方が確実。
    reuseExistingServer: false,
    timeout: 300_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
