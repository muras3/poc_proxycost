#!/usr/bin/env bash
# 新しい git worktree で開発を始める前に一度実行する。
#
# 新しい worktree には node_modules が無い。メインチェックアウトの
# node_modules をシンボリックリンクして補う。冪等 ── 何度実行しても
# 安全（既に正しいリンクがあれば何もしない、無ければ張り直す）。
#
# このスクリプトはリンクを張るだけでは「成功」と言わない。
# リンク先が実在するか、依存が実際に解決できるかまで確認する。
# 過去に、リンク先自体が壊れたシンボリックリンク（例えば git に
# tracked なシンボリックリンクとして誤って commit された
# node_modules）だったケースで、「リンクを張った」と成功を報告
# しながら依存を1つも入れられていなかったことがある。
#
# 注意（Playwright）: Chromium は既にインストール済みで
# PLAYWRIGHT_BROWSERS_PATH も設定済み。`playwright install` は
# 実行しないこと（不要なうえブロックされる）。

set -euo pipefail

fail() {
  echo "worktree-setup: 失敗: $1" >&2
  if [ -n "${2:-}" ]; then
    echo "  次に試すこと: $2" >&2
  fi
  exit 1
}

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
worktree_root="$(cd "$script_dir/.." && pwd)"

main_checkout="$(git -C "$worktree_root" worktree list --porcelain | awk 'NR==1{print $2}')"

if [ -z "$main_checkout" ] || [ "$main_checkout" = "$worktree_root" ]; then
  fail "メインチェックアウトを特定できませんでした（git worktree list が空、または自分自身を返した）。" \
       "'git worktree list' の出力を確認し、手動で node_modules を用意するか npm ci を実行してください。"
fi

target="$worktree_root/node_modules"
source="$main_checkout/node_modules"

# 1. リンクを張る前に、リンク先が実在するディレクトリであることを確認する。
#    ここでの source はメインチェックアウトの node_modules パスそのもの
#    であり、それ自体がダングリングリンク（存在しないパスを指す壊れた
#    シンボリックリンク）だった前例があるので、"パスとして存在する" だけ
#    でなく "ディレクトリとして解決できる" ことまで確認する。
if [ -L "$source" ]; then
  resolved_source="$(readlink -f "$source" 2>/dev/null || true)"
  if [ -z "$resolved_source" ] || [ ! -d "$resolved_source" ]; then
    fail "メインチェックアウトの node_modules ($source) はダングリングなシンボリックリンクです。実体がありません。" \
         "メインチェックアウト ($main_checkout) で 'npm ci' を実行して実体の node_modules を作ってから、再度このスクリプトを実行してください。"
  fi
fi
if [ ! -d "$source" ]; then
  fail "メインチェックアウトに node_modules ($source) が存在しません。" \
       "メインチェックアウト ($main_checkout) で 'npm ci' を実行してから、再度このスクリプトを実行してください。"
fi

# 2. リンク先が「それ自身」や dangling link になっていないことを確認する。
resolved_target_source="$(readlink -f "$source")"
if [ "$resolved_target_source" = "$target" ]; then
  fail "node_modules のリンク先 ($source) が、リンクを張ろうとしている先 ($target) 自身を指しています（自己参照）。" \
       "メインチェックアウトの node_modules が壊れています。'git -C \"$main_checkout\" ls-files -s node_modules' で tracked なシンボリックリンクとして混入していないか確認してください。"
fi

if [ -L "$target" ] && [ "$(readlink "$target")" = "$source" ]; then
  echo "worktree-setup: node_modules は既に $source にリンク済みです。"
elif [ -e "$target" ] && [ ! -L "$target" ]; then
  fail "$target が既に存在します（シンボリックリンクではありません）。" \
       "意図しないファイル/ディレクトリが node_modules の場所にできています。中身を確認してから 'rm -rf \"$target\"' で削除し、再度実行してください。"
elif [ -e "$target" ] || [ -L "$target" ]; then
  # 既存のリンクだが、別の場所を指している/壊れている場合は張り直す。
  rm -f "$target"
  ln -s "$source" "$target"
  echo "worktree-setup: node_modules -> $source に張り直しました。"
else
  ln -s "$source" "$target"
  echo "worktree-setup: node_modules -> $source をリンクしました。"
fi

# 3. 張り終えたあと、実際に依存が解決できるかを確かめる。
#    リンクの存在チェックだけでは、リンク先が壊れていても「成功」に
#    見えてしまう。主要なバイナリを実行して確かめる。
if [ ! -x "$target/.bin/next" ] && [ ! -e "$target/.bin/next" ]; then
  fail "node_modules/.bin/next が見つかりません。依存が正しく解決できていません。" \
       "メインチェックアウト ($main_checkout) で 'npm ci' を実行し、その node_modules が実体のディレクトリになっていることを確認してから、再度このスクリプトを実行してください。"
fi

if ! "$worktree_root/node_modules/.bin/next" --version >/dev/null 2>&1; then
  fail "node_modules/.bin/next --version の実行に失敗しました。依存が壊れているか不完全です。" \
       "メインチェックアウト ($main_checkout) で 'npm ci' を実行してから、再度このスクリプトを実行してください。"
fi

next_version="$("$worktree_root/node_modules/.bin/next" --version 2>&1)"
echo "worktree-setup: 依存解決を確認しました（$next_version）。"

cat <<'EOF'

これで依存関係の準備は完了。

Playwright の Chromium は導入済み・PLAYWRIGHT_BROWSERS_PATH も設定済み。
`playwright install` は実行しないこと。
EOF

e2e_port="$(cd "$worktree_root" && node -e "
const { createHash } = require('node:crypto');
const { existsSync, statSync } = require('node:fs');
const isLinkedWorktree = existsSync('.git') && statSync('.git').isFile();
if (!isLinkedWorktree) { console.log(3100); process.exit(0); }
const hash = createHash('sha256').update(process.cwd()).digest();
console.log(3100 + (hash.readUInt32BE(0) % 100));
")"

cat <<EOF

この worktree の e2e ポート(playwright.config.ts の既定値): ${e2e_port}
(worktree のパスから決定的に導出される。別の worktree と衝突しない。
 固定したい場合は PORT か E2E_PORT を指定すること。)
EOF
