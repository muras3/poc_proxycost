#!/usr/bin/env bash
# 新しい git worktree で開発を始める前に一度実行する。
#
# 新しい worktree には node_modules が無い。メインチェックアウトの
# node_modules をシンボリックリンクして補う。冪等 ── 何度実行しても
# 安全（既に正しいリンクがあれば何もしない、無ければ張り直す）。
#
# 注意（Turbopack）: このシンボリックリンクを張った worktree で
# `next build` / `next dev` の既定（Turbopack）を使うと、
# 「symlink points out of the filesystem root」で失敗する。
# ローカルでの確認は `next build --webpack` を使うこと。
# これはこの worktree だけのローカル回避策であり、デフォルトの
# ビルド設定（package.json など）を変更してはいけない。
#
# 注意（Playwright）: Chromium は既にインストール済みで
# PLAYWRIGHT_BROWSERS_PATH も設定済み。`playwright install` は
# 実行しないこと（不要なうえブロックされる）。

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
worktree_root="$(cd "$script_dir/.." && pwd)"

main_checkout="$(git -C "$worktree_root" worktree list --porcelain | awk 'NR==1{print $2}')"

if [ -z "$main_checkout" ] || [ "$main_checkout" = "$worktree_root" ]; then
  echo "worktree-setup: メインチェックアウトを特定できませんでした。手動で node_modules を用意してください。" >&2
  exit 1
fi

target="$worktree_root/node_modules"
source="$main_checkout/node_modules"

if [ -L "$target" ] && [ "$(readlink "$target")" = "$source" ]; then
  echo "worktree-setup: node_modules は既に $source にリンク済みです。"
elif [ -e "$target" ]; then
  echo "worktree-setup: $target が既に存在します（シンボリックリンクではありません）。手動で確認してください。" >&2
  exit 1
else
  ln -s "$source" "$target"
  echo "worktree-setup: node_modules -> $source をリンクしました。"
fi

cat <<'EOF'

これで依存関係の準備は完了。ビルドを確認するときは Turbopack ではなく webpack を使うこと:

  npx next build --webpack

(このシンボリックリンク worktree では Turbopack が
 "symlink points out of the filesystem root" で失敗するため。
 --webpack はローカル確認専用で、デフォルトのビルド設定は変更しない。)

Playwright の Chromium は導入済み・PLAYWRIGHT_BROWSERS_PATH も設定済み。
`playwright install` は実行しないこと。
EOF
