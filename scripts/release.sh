#!/usr/bin/env bash
# 本番リリース用タグを打つ。
#
# タグ = 本番デプロイのトリガー（.github/workflows/release.yml）。
# 環境を選ぶ引数は無い — タグを打つことは常に「本番へ」を意味する。
# ロールバックしたいときは、このスクリプトで新しいタグを打ち直すのではなく、
# GitHub の Actions 画面で release ワークフローの「Run workflow」を開き、
# **Use workflow from にブランチではなく過去の緑だったタグ自身を選んで**実行する
# （production 環境の deployment branch policy がタグ以外の workflow_dispatch を弾く設定に
#  なっているため、タグを選ばずに実行しても動かない）。
#
# 使い方: scripts/release.sh vX.Y.Z
set -euo pipefail

usage() {
  echo "使い方: $0 vX.Y.Z" >&2
  exit 1
}

if [ $# -ne 1 ]; then
  usage
fi

tag="$1"

# semver: vMAJOR.MINOR.PATCH（プレリリース/ビルドメタデータは今は受け付けない。
# 必要になったら緩める）。
if ! [[ "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "エラー: タグは vX.Y.Z 形式で（例: v1.2.0）。'$tag' はそれに合っていない" >&2
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "エラー: gh (GitHub CLI) が無い。CI の成否確認に使うのでインストールすること" >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "エラー: gh が認証されていない。'gh auth login' を先に実行すること" >&2
  exit 1
fi

# 1. 作業ツリーがクリーンか
if [ -n "$(git status --porcelain)" ]; then
  echo "エラー: 作業ツリーがクリーンでない。コミットするか退避してから実行すること" >&2
  git status --short >&2
  exit 1
fi

# 2. origin/main を取ってきて、HEAD と一致しているか
echo "origin/main を取得中..."
git fetch origin main --quiet

local_head="$(git rev-parse HEAD)"
remote_main="$(git rev-parse origin/main)"

if [ "$local_head" != "$remote_main" ]; then
  echo "エラー: HEAD ($local_head) が origin/main ($remote_main) と一致しない。" >&2
  echo "main 以外のブランチ、または origin/main に push されていないコミットからタグを打とうとしている。" >&2
  echo "'git checkout main && git pull' してから実行すること。" >&2
  exit 1
fi

echo "OK: HEAD は origin/main と一致 ($local_head)"

# 3. このコミットの main 上の CI が success か。
#    ci.yml は pull_request 契機なので、そのチェックランは PR のヘッドコミットに付き、
#    main へのマージコミット（＝ここで見ている local_head）には基本的に付かない
#    （squash/merge commit は別 SHA になるため）。したがってこのコミット SHA に
#    check-runs として実際に出るのは push 契機の deploy.yml の分だけのはずで、
#    このスクリプトが検査しているのも「deploy.yml のジョブ名で success か」である。
#    ci.yml 自体の合否は、そのコミットが載った PR がマージされた時点で別途確認済みという前提。
#    --paginate は複数ページ分の JSON を連結して吐くため、そのまま単一の JSON として
#    パースすると壊れる。1ページで足りる前提で per_page=100 を指定して1回だけ取る。
echo "コミット $local_head の CI 状況を確認中..."
check_runs_json="$(gh api "repos/{owner}/{repo}/commits/$local_head/check-runs?per_page=100" 2>/dev/null || true)"

if [ -z "$check_runs_json" ]; then
  echo "エラー: check-runs を取得できなかった（gh api が失敗した、またはリポジトリの解決に失敗した）" >&2
  exit 1
fi

# deploy.yml の各ジョブ（fast / e2e ×4 / deploy）の check run 名で success を確認する。
# 1つでも success 以外（failure / cancelled / skipped / in_progress など）なら止める。
failing="$(echo "$check_runs_json" | node -e '
  const data = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const runs = data.check_runs || [];
  const relevant = runs.filter(r => /^(lint \/ types \/ unit \/ master|e2e \d\/4)$/.test(r.name));
  if (relevant.length === 0) {
    console.log("__NO_RUNS__");
    process.exit(0);
  }
  const bad = relevant.filter(r => !(r.status === "completed" && r.conclusion === "success"));
  for (const r of bad) {
    console.log(`${r.name}: status=${r.status} conclusion=${r.conclusion}`);
  }
')"

if [ "$failing" = "__NO_RUNS__" ]; then
  echo "エラー: コミット $local_head に deploy.yml の check run が見つからなかった。" >&2
  echo "CI がまだ動いていない、またはまだ完了していない可能性がある。Actions タブで確認すること。" >&2
  exit 1
fi

if [ -n "$failing" ]; then
  echo "エラー: コミット $local_head の CI が全て success ではない:" >&2
  echo "$failing" >&2
  exit 1
fi

echo "OK: CI は全て success"

# 4. 既存タグと重複しないか
git fetch origin "refs/tags/*:refs/tags/*" --quiet 2>/dev/null || true
if git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
  echo "エラー: タグ $tag は既に存在する" >&2
  exit 1
fi

# 5. タグを打って push する
echo "タグ $tag を打つ..."
git tag -a "$tag" -m "release $tag"
git push origin "$tag"

echo
echo "OK: $tag を push した。"
echo "GitHub Actions の release ワークフローが動き、production 環境の承認待ちで止まる。"
echo "承認は Settings → Environments → production の Required reviewers（オーナー）が行う。"
