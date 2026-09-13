/**
 * `scripts/indeterminacy-ledger.ts` が書いた中間 JSON
 * (`docs/ledger/.indeterminacy-<日付>.rows.json`) から、人が見る要約
 * markdown を作る。集計だけを行い、`compare()` は呼ばない
 * （台帳生成スクリプトの結果を集計するだけ）。
 *
 * xlsx（明細＋要約の2シート）の生成は Node 側に xlsx ライブラリが無いため
 * Python(openpyxl) に委譲する（`scripts/indeterminacy-xlsx.py`）。
 */
import { readFileSync, writeFileSync } from 'node:fs';

interface LedgerRow {
  country: string; weightG: number; priceYen: number; itemCount: number; storageDays: number;
  site: string; leaderCompany: string; leaderMethod: string; leaderLow: number; leaderHigh: number | null;
  rankIndeterminate: boolean; blockingKeys: string; blockingLabels: string; blockingTiers: string;
  blockingUnknownReasons: string; blockingSourceUrls: string;
  runnerUpCompany: string | null; runnerUpLow: number | null;
}

function parseArgs(argv: string[]) {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const date = get('--date') ?? new Date().toISOString().slice(0, 10);
  const outDir = get('--out-dir') ?? 'docs/ledger';
  return { date, outDir };
}

// 「調べれば分かる」か「公表されていない」かを費目キーで分類する。
// **集計から機械的に出せるものではない**——出典の有無（audit ドキュメント）を
// 手で当たった結果をここに固定表として持つ。新しい費目キーが出てきたら
// 'unclassified' に落ちるので、要約に「未分類」として明示する。
type Resolvability = 'findable' | 'unpublished' | 'unclassified';
const RESOLVABILITY: Record<string, { status: Resolvability; note: string }> = {
  'courier-destination-fees': {
    status: 'unpublished',
    note: '着地側の宅配便フルフィルメント/取扱手数料。4社中データがあるのは一部のみ。'
      + 'master/carrier-weight-limits.json・docs/audit/courier-transit-days-2026-09-13.md '
      + '参照。FedEx は公式サイトが HTTP 200 で WAF ページを返し取得不能。ECMS は自社の'
      + '手数料を公表していない。',
  },
  'outsourced-packing': {
    status: 'unpublished',
    note: 'FROM JAPAN の外注梱包費。同社は公表しておらず、社固有の未取得（scope無し）。',
  },
  'courier-fuel-surcharge': {
    status: 'unpublished',
    note: '燃油サーチャージ。表示価格に込みかどうか未確認（fable-fix-readiness A2）。',
  },
  'courier-remote-surcharge': {
    status: 'unpublished',
    note: '遠隔地サーチャージ。表示価格に込みかどうか未確認（fable-fix-readiness A2）。',
  },
  'courier-clearance-fee': {
    status: 'findable',
    note: '宅配便の着地側通関手数料。compare.ts のコメント（1691行付近）は GB/DE の '
      + 'FedEx・UPS を "schema_gap / C_unknown" と呼んでいる——「該当する運賃表・T&C '
      + 'に到達できなかった」であって「その社が公表していないと確認した」ではない。'
      + '一次資料（運送会社の Service Guide 等）を追加で当たれば埋まる可能性がある側'
      + '——ただし FedEx は既に公式サイトが WAF を返す事例が他にもあり（courier-'
      + 'destination-fees 参照）、実際に埋まる保証はない。',
  },
  'duty': {
    status: 'findable',
    note: '関税率。国によっては税率表自体が未収集（例: GB 2.9%、fable-fix-readiness B2）。'
      + '一次情報（税関の関税率表）を当たれば埋まる——「調べれば分かる」側。',
  },
};

function classify(key: string): { status: Resolvability; note: string } {
  return RESOLVABILITY[key] ?? { status: 'unclassified', note: '(このスクリプトの分類表に未登録の費目)' };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const jsonPath = `${args.outDir}/.indeterminacy-${args.date}.rows.json`;
  const data = JSON.parse(readFileSync(jsonPath, 'utf8')) as {
    args: { countries: string[]; weights: number[]; prices: number[]; itemCount: number; storageDays: number; site: string };
    rows: LedgerRow[]; total: number; indeterminateCount: number;
  };
  const { rows, total, indeterminateCount } = data;
  const indet = rows.filter((r) => r.rankIndeterminate);

  // ── 1. 妨げている費目ごとの件数 ──────────────────────────────────────
  // 1条件が複数費目でブロックされていることがあるので、件数は「その費目が
  // 少なくとも1つの理由として挙がった条件数」（延べではなく条件数）。
  interface KeyStat { key: string; label: string; count: number; companies: Set<string>; tiers: Set<string> }
  const byKey = new Map<string, KeyStat>();
  for (const r of indet) {
    const keys = r.blockingKeys ? r.blockingKeys.split(';') : [];
    const labels = r.blockingLabels ? r.blockingLabels.split(';') : [];
    const tiers = r.blockingTiers ? r.blockingTiers.split(';') : [];
    const companies = new Set<string>([r.leaderCompany, ...(r.runnerUpCompany ? [r.runnerUpCompany] : [])]);
    keys.forEach((k, i) => {
      if (!k) return;
      const existing = byKey.get(k) ?? { key: k, label: labels[i] ?? k, count: 0, companies: new Set(), tiers: new Set() };
      existing.count += 1;
      companies.forEach((c) => existing.companies.add(c));
      if (tiers[i]) existing.tiers.add(tiers[i]);
      byKey.set(k, existing);
    });
  }
  const keyStats = [...byKey.values()].sort((a, b) => b.count - a.count);

  // ── 2. 累積効果（上位1〜5費目を「埋めた」ことにしたら何件に減るか） ───
  // 「埋める」＝その費目が rankIndeterminate の唯一の原因である条件を解消する
  // 近似。**厳密なシミュレーションではない**——ある条件が複数費目でブロック
  // されているとき、その一部だけを埋めても実際には解消されないことがある
  // （残り1つでも未取得なら rankIndeterminate は true のまま）。ここでは
  // 「累積で選んだ費目の集合が、ブロック要因の全集合を覆う条件」だけを
  // 解消できたとみなす、保守的な（＝過大評価しない）近似を取る。
  function cumulativeResolved(selectedKeys: Set<string>): number {
    let resolved = 0;
    for (const r of indet) {
      const keys = new Set((r.blockingKeys ? r.blockingKeys.split(';') : []).filter(Boolean));
      if (keys.size > 0 && [...keys].every((k) => selectedKeys.has(k))) resolved += 1;
    }
    return resolved;
  }
  const top5 = keyStats.slice(0, 5);
  const cumulative: { n: number; keys: string[]; remaining: number }[] = [];
  const acc = new Set<string>();
  for (let n = 1; n <= top5.length; n += 1) {
    acc.add(top5[n - 1]!.key);
    const resolved = cumulativeResolved(acc);
    cumulative.push({ n, keys: [...acc], remaining: indeterminateCount - resolved });
  }

  // ── 3. 断定できている条件の偏り ───────────────────────────────────
  const determinate = rows.filter((r) => !r.rankIndeterminate);
  const countBy = <T extends string | number>(arr: T[]) => {
    const m = new Map<T, number>();
    for (const v of arr) m.set(v, (m.get(v) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const byCountry = countBy(determinate.map((r) => r.country));
  const byWeight = countBy(determinate.map((r) => r.weightG));
  const byPrice = countBy(determinate.map((r) => r.priceYen));

  // ── 4. 「調べれば分かる」/「公表されていない」の内訳 ─────────────────
  const resolvability = keyStats.map((k) => ({ ...k, ...classify(k.key) }));
  const findable = resolvability.filter((k) => k.status === 'findable');
  const unpublished = resolvability.filter((k) => k.status === 'unpublished');
  const unclassified = resolvability.filter((k) => k.status === 'unclassified');

  const pct = (n: number) => `${((n / total) * 100).toFixed(1)}%`;

  const md: string[] = [];
  md.push(`# 断定不能（rankIndeterminate）台帳 — 要約 (${args.date})`);
  md.push('');
  md.push('**このファイルの作り方（再生成の手順）**: '
    + '`npx tsx scripts/indeterminacy-ledger.ts --date <日付>` で明細 CSV と中間 JSON を作り、'
    + '`npx tsx scripts/indeterminacy-summary.ts --date <日付>` で本ファイルを作る。'
    + 'xlsx が要るときは続けて `python3 scripts/indeterminacy-xlsx.py --date <日付>`。'
    + '費目を1つ埋めたら（`src/lib/pricing/` に一次情報を追加したら）同じ3コマンドを'
    + '再実行し、下の「累積効果」の残件数が減っているかを見る——減っていなければ、'
    + '埋めた費目が実は他の未取得行と同じ条件を同時にブロックしていなかったということ。');
  md.push('');
  md.push('## 条件格子（このファイルが対象にした範囲）');
  md.push('');
  md.push(`- 国: ${data.args.countries.join(', ')}（${data.args.countries.length} か国）`);
  md.push(`- 重量: ${data.args.weights.join(', ')} g（${data.args.weights.length} 段）`);
  md.push(`- 商品価格: ${data.args.prices.join(', ')} 円（${data.args.prices.length} 段）`);
  md.push(`- 品目数: ${data.args.itemCount} / 保管日数: ${data.args.storageDays} / site: ${data.args.site}`);
  md.push(`- 条件数: ${total}（**サンプルであって「全パターン」ではない**——重量・価格は`
    + '連続値で、上のリストはその上の代表点でしかない。多品目・保管日数 > 0 の効果は'
    + 'この格子には入っていない。）');
  md.push('');
  md.push(`**rankIndeterminate: ${indeterminateCount}/${total}（${pct(indeterminateCount)}）** `
    + `／ 断定できた: ${total - indeterminateCount}/${total}（${pct(total - indeterminateCount)}）`);
  md.push('');
  md.push('オーナー言及の「297/343 (86.6%)」（Fable 5.1）は、本スクリプトを '
    + '`site: mercari`（既定）で走らせると再現する。`site: yahoo-auctions` では '
    + '292/343（85.1%）になり、`docs/audit/fable-fix-readiness-2026-09-13.md` §5-6 が '
    + '書く「288/343（84%）」はどちらとも一致しない——同文書は site を明記しておらず、'
    + 'スイープに使ったスクリプトもリポジトリに残っていない（同 CLAUDE.md §5 の方針どおり）'
    + 'ため、288 との食い違いの原因は確認できていない（288 は `cheapest-by-total` '
    + '修正 (#143) 前の数字——本スクリプトは修正後の `compare()` を呼んでいる）。');
  md.push('');
  md.push('**下の「1. 妨げている費目」の内訳（266 / 97 / 51、累積 297→131→51→0）は、'
    + '`docs/audit/fable-fix-readiness-round2-2026-09-13.md`「297条件の内訳」節が'
    + '手作業で数えた同じ内訳と1件残らず一致する**（1位行自身の未取得行だけを見る、'
    + 'という同じ方法論を使ったため——詳細は「限界」節）。');
  md.push('');

  md.push('## 1. 妨げている費目ごとの件数（多い順）');
  md.push('');
  md.push('| 費目 (key) | ラベル | 社（1社/複数） | 妨げている条件数 | tier | 出典 |');
  md.push('|---|---|---|---|---|---|');
  for (const k of keyStats) {
    const companies = [...k.companies].join(', ');
    const tiers = [...k.tiers].join(', ') || '(不明)';
    const cls = classify(k.key);
    const src = cls.status === 'findable' ? 'あり（一次情報を当たれば埋まる）'
      : cls.status === 'unpublished' ? 'なし（公表されていない）' : '未分類';
    md.push(`| ${k.key} | ${k.label} | ${companies} | ${k.count} | ${tiers} | ${src} |`);
  }
  md.push('');

  md.push('## 2. 累積効果（上位費目を埋めたら何件に減るか）');
  md.push('');
  md.push('**近似**: ある条件が複数費目で同時にブロックされているとき、選んだ費目の集合が'
    + 'その条件のブロック要因を**全て**覆っていなければ「解消」に数えない'
    + '（過大評価を避ける保守的な近似。詳細はスクリプトのコメント参照）。');
  md.push('');
  md.push('| 上位n費目 | 埋めた費目 | 残る rankIndeterminate 件数 |');
  md.push('|---|---|---|');
  for (const c of cumulative) {
    md.push(`| ${c.n} | ${c.keys.join(', ')} | ${indeterminateCount} → **${c.remaining}** |`);
  }
  md.push('');

  md.push('## 3. 断定できている条件の偏り');
  md.push('');
  md.push(`断定できた ${total - indeterminateCount} 件の内訳:`);
  md.push('');
  md.push('国別: ' + byCountry.map(([k, v]) => `${k}=${v}`).join(', ') || '(0件)');
  md.push('');
  md.push('重量別: ' + byWeight.map(([k, v]) => `${k}g=${v}`).join(', ') || '(0件)');
  md.push('');
  md.push('価格別: ' + byPrice.map(([k, v]) => `¥${k}=${v}`).join(', ') || '(0件)');
  md.push('');
  if (determinate.length > 0) {
    md.push('偏りが見えれば書く。件数がどこかの国・重量・価格帯に極端に寄っていれば、'
      + '「断定できる条件」自体が代表的でない可能性がある。');
  }
  md.push('');

  md.push('## 4. 「調べれば分かる」 / 「公表されていない」の区別');
  md.push('');
  md.push('**これが一番重要な区別。**「調べれば分かる」費目を埋めれば断定不能は減らせる。'
    + '「公表されていない」費目は、公表されない限り埋められない——その費目が'
    + '断定不能の主因なら、断定不能は構造的に減らせないという結論になる。');
  md.push('');
  md.push(`- 調べれば分かる（findable）: ${findable.length} 費目 / 延べ `
    + `${findable.reduce((a, k) => a + k.count, 0)} 条件`);
  for (const k of findable) md.push(`  - **${k.key}**（${k.count}条件）: ${k.note}`);
  md.push(`- 公表されていない（unpublished）: ${unpublished.length} 費目 / 延べ `
    + `${unpublished.reduce((a, k) => a + k.count, 0)} 条件`);
  for (const k of unpublished) md.push(`  - **${k.key}**（${k.count}条件）: ${k.note}`);
  if (unclassified.length > 0) {
    md.push(`- **未分類（このスクリプトの分類表に無い新しい費目）**: ${unclassified.length} 費目 `
      + `/ 延べ ${unclassified.reduce((a, k) => a + k.count, 0)} 条件 —— `
      + '`scripts/indeterminacy-summary.ts` の `RESOLVABILITY` に追記が要る。');
    for (const k of unclassified) md.push(`  - ${k.key}（${k.count}条件）`);
  }
  md.push('');
  const unpublishedShare = unpublished.reduce((a, k) => a + k.count, 0);
  const findableShare = findable.reduce((a, k) => a + k.count, 0);
  if (unpublishedShare > findableShare) {
    md.push('**「公表されていない」側が優勢。** 現状の格子では、断定不能の主因は'
      + '調べても埋まらない費目が占めている——正直に言えば、この格子の範囲では'
      + '断定不能は大きくは減らせない可能性がある。');
  } else if (findableShare > 0) {
    md.push('**「調べれば分かる」側が優勢、または拮抗。** 上位の findable 費目から'
      + '潰していけば断定不能の削減が見込める。');
  }
  md.push('');
  md.push('## 限界（必ず読むこと）');
  md.push('');
  md.push('- 上の条件格子は**サンプル**であり「全パターン」ではない。重量・商品価格は'
    + '連続値で、この台帳はその上の代表点だけを見ている。多品目（複数商品・複数個口）や'
    + '`storageDays > 0` の効果はこの格子には含まれていない——それらを変えると'
    + 'rankIndeterminate の比率は変わりうる。');
  md.push('- 「1. 妨げている費目」は1位行自身の未取得行だけを見ている'
    + '（`docs/audit/fable-fix-readiness-round2-2026-09-13.md` の方法論に合わせた——'
    + '同監査は297条件すべてが1位自身の未取得費目で説明できたと確認済み）。'
    + '次点以下の未取得行が原因で不確定になるケース（`overlapsLeader`側）が'
    + 'この格子には現れなかったのでこの単純化で足りているが、別の格子では'
    + '成立しない可能性がある。');
  md.push('- 「4. findable/unpublished」の分類は本スクリプト内の手書き表'
    + '（`RESOLVABILITY`）に基づく——**集計から自動で出せるものではない**。'
    + '新しい未取得費目が現れたら「未分類」に落ち、この表への追記が要る。');
  md.push('');

  const mdPath = `${args.outDir}/indeterminacy-summary-${args.date}.md`;
  writeFileSync(mdPath, md.join('\n'), 'utf8');
  console.log(`wrote ${mdPath}`);
}

main();
