#!/usr/bin/env node
// e2e の webServer 用ポートが空いているか確認する。
//
// 埋まっていた場合、Playwright は単に webServer の起動待ちでタイムアウトする
// (60s〜300s)。それでは「別の worktree が同じポートを掴んでいる」という
// 一番よくある原因に気づけない。ここで早期に、はっきりしたメッセージで
// 落とす。
import net from 'node:net';

const port = Number(process.argv[2]);
if (!Number.isInteger(port)) {
  console.error('check-port-free: ポート番号を引数で渡してください。');
  process.exit(2);
}

const server = net.createServer();

server.once('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `check-port-free: ポート ${port} は既に使われています。おそらく別の worktree の e2e サーバが握っています。\n` +
        `  - PORT (または E2E_PORT) を明示的に指定して再実行するか、\n` +
        `  - そのポートを使っている worktree のプロセスを止めてください。`,
    );
    process.exit(1);
  }
  console.error(`check-port-free: ポート ${port} の確認中にエラーが発生しました: ${err.message}`);
  process.exit(1);
});

server.once('listening', () => {
  server.close(() => process.exit(0));
});

server.listen(port, 'localhost');
