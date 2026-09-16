import { createHash } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// この環境には Chromium が /opt/pw-browsers に焼いてある（revision 1194）。
// @playwright/test 側が期待する revision と一致しないので、実体を直接指す。
// `playwright install` は環境の指示で禁止されている。
// CI（GitHub Actions）では playwright install で入る標準の場所を使うので、
// 実体があるときだけ差し替える。
const PINNED = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const CHROME = existsSync(PINNED) ? PINNED : undefined;

// 複数の worktree で並行して e2e を走らせると、ポートが固定だと衝突する
// (CLAUDE.md の教訓を参照)。PORT / E2E_PORT があればそれを最優先。
// 無ければ、リンクされた worktree(.git がファイル)のときだけ絶対パスの
// ハッシュから 3100-3199 の範囲で決定的に導出する。メインチェックアウト
// (.git がディレクトリ。CI のチェックアウトも同様)では常に 3100 になり、
// CI の挙動は変えない。
function defaultPort(): number {
  const isLinkedWorktree = existsSync('.git') && statSync('.git').isFile();
  if (!isLinkedWorktree) return 3100;
  const hash = createHash('sha256').update(process.cwd()).digest();
  return 3100 + (hash.readUInt32BE(0) % 100);
}

const PORT = Number(process.env.PORT ?? process.env.E2E_PORT ?? defaultPort());
// **127.0.0.1 ではなく localhost を使う。** Next 16 は 127.0.0.1 からの dev リソース要求を
// クロスオリジンとして遮断し、チャンクが 404 になって hydration が完了しない。
// 実ブラウザで操作すると「クリックしても何も起きない」形で出る。

export default defineConfig({
  testDir: './e2e',
  // **テストは並列が既定。** 単列に戻すのは、並列で壊れることを実測で示せたときだけ。
  // 根拠（.github/workflows/ci.yml のコメントに残る 2026-09-07 の実測、4コア機・212件）:
  //   workers=1 → 4.9分 / workers=2 → 3.6分 / workers=4 → 3.0分。
  //   **並列にして落ちたテストは1件も無かった**ので、隠れた状態依存は無い。
  // 共有状態は localStorage だけで、これは browser context 単位なので並列で衝突しない。
  // `test.describe.serial` を要求するファイルは1つも無い（2026-09-16 時点）。
  fullyParallel: true,
  // 手元は CPU に応じて。CI の runner は2コアなので 2。
  workers: process.env.CI ? 2 : '50%',
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
    command: `node scripts/check-port-free.mjs ${PORT} && npm run build && npx next start -p ${PORT} -H localhost`,
    url: `http://localhost:${PORT}`,
    // 再ビルドで .next が入れ替わると、生き残ったサーバが消えたチャンクを参照して
    // 500 を返し続ける。毎回起こし直す方が確実。
    reuseExistingServer: false,
    timeout: 300_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
