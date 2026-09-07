#!/usr/bin/env node
// Shopify の公開商品JSON から発送重量を集め、値が実測に近いか擬似値かを判定する。
//
//   node scripts/shopify-probe.mjs <domain> [--pages N] [--out FILE]
//                                   [--dump FILE] [--from FILE] [--slice "kw1,kw2"]
//
// --dump は取ってきた行（title / product_type / grams）をそのまま置く。--from はその置いた行を
// 読み直して、店を叩かずに同じ判定をやり直す。--slice はタイトルか product_type にその語を含む行
// だけを残し、--not はその語を含む行を落として判定する。**判定はスライスにも同じものを掛ける。**
// カテゴリ全体が usable でも、その中の1ラインだけが定数（フィギュアの 1/7 が全件 1,500g）と
// いうことがあるため。総称ライン（他のどのラインにも当たらなかったとき用）の中央値は
// --slice figure --not "1/7,nendoroid,..." のように、既存ラインを引いた残りで測る。
//
// grams は送料計算用の入力値であって実測ではない。店が一律送料・帯別送料を使っていると
// 全件同じ値や 100 の倍数だらけになる（カメラ店で全件 1500g、楽器店でギター 180kg が実在）。
// だから採否は「値の分布」で決める。この判定を7カテゴリで同じ手順にするための共通実装。

const args = process.argv.slice(2);
const domain = args[0];
if (!domain || domain.startsWith('--')) {
  console.error('usage: node scripts/shopify-probe.mjs <domain> [--pages N] [--out FILE]'
    + ' [--dump FILE] [--from FILE] [--slice "kw1,kw2"] [--not "kw1,kw2"]');
  process.exit(2);
}
const flag = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? dflt : args[i + 1];
};
const maxPages = Number(flag('pages', 20));
const outFile = flag('out', null);
const dumpFile = flag('dump', null);
const fromFile = flag('from', null);
const sliceWords = (flag('slice', '') || '')
  .split(',').map((w) => w.trim().toLowerCase()).filter(Boolean);
const notWords = (flag('not', '') || '')
  .split(',').map((w) => w.trim().toLowerCase()).filter(Boolean);

const UA = 'proxycost-research/0.1 (+https://github.com/muras3/poc_proxycost; weight data survey)';

async function robotsAllows(host) {
  try {
    const r = await fetch(`https://${host}/robots.txt`, { headers: { 'user-agent': UA } });
    if (!r.ok) return { allowed: true, note: `robots.txt ${r.status}` };
    const txt = await r.text();
    // `User-agent: *` ブロックに /products.json を止める Disallow があるかだけ見る。
    const blocks = txt.split(/\n(?=user-agent:)/i);
    for (const b of blocks) {
      if (!/^user-agent:\s*\*/im.test(b)) continue;
      for (const m of b.matchAll(/^disallow:\s*(\S*)\s*$/gim)) {
        const p = m[1];
        if (p && (p === '/' || '/products.json'.startsWith(p))) {
          return { allowed: false, note: `Disallow: ${p}` };
        }
      }
    }
    return { allowed: true, note: 'User-agent: * allows /products.json' };
  } catch (e) {
    return { allowed: true, note: `robots.txt unreachable: ${e.message}` };
  }
}

async function fetchAll(host) {
  const products = [];
  for (let page = 1; page <= maxPages; page++) {
    const url = `https://${host}/products.json?limit=250&page=${page}`;
    const r = await fetch(url, { headers: { 'user-agent': UA } });
    if (!r.ok) {
      if (page === 1) throw new Error(`HTTP ${r.status} on page 1`);
      break;
    }
    const ct = r.headers.get('content-type') || '';
    if (!ct.includes('json')) {
      if (page === 1) throw new Error(`not JSON (content-type: ${ct})`);
      break;
    }
    const body = await r.json();
    const batch = body.products;
    if (!Array.isArray(batch) || batch.length === 0) break;
    products.push(...batch);
    if (batch.length < 250) break;
    await new Promise((res) => setTimeout(res, 400)); // 相手への礼儀
  }
  return products;
}

const quantile = (sorted, q) => {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo));
};

// 分布から「実測に近いか擬似値か」を決める。
// pseudo  … 事実上の定数。EMS の段を引く用途にも使えない
// suspect … 帯別送料の匂い。段を引く用途には使えるが実測ではないと明示する
// usable  … 商品ごとに値が動いている。段を引く用途には十分
function judge(values) {
  const n = values.length;
  if (n < 50) return { verdict: 'insufficient', reason: `n=${n} < 50` };
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  const distinct = counts.size;
  const distinctRatio = distinct / n;
  const topShare = Math.max(...counts.values()) / n;
  const roundRatio = values.filter((v) => v % 100 === 0).length / n;
  const round500 = values.filter((v) => v % 500 === 0).length / n;

  let verdict, reason;
  if (distinct <= 3 || topShare >= 0.6) {
    verdict = 'pseudo';
    reason = `distinct=${distinct}, 最頻値が全体の ${(topShare * 100).toFixed(0)}%`;
  } else if (distinctRatio < 0.02 || (roundRatio > 0.95 && round500 > 0.8)) {
    verdict = 'suspect';
    reason = `distinct比 ${(distinctRatio * 100).toFixed(1)}%, 100の倍数 ${(roundRatio * 100).toFixed(0)}%, 500の倍数 ${(round500 * 100).toFixed(0)}%`;
  } else {
    verdict = 'usable';
    reason = `distinct=${distinct} (${(distinctRatio * 100).toFixed(1)}%), 最頻値 ${(topShare * 100).toFixed(0)}%, 100の倍数 ${(roundRatio * 100).toFixed(0)}%`;
  }
  return {
    verdict, reason, n, distinct,
    distinctRatio: +distinctRatio.toFixed(4),
    topValueShare: +topShare.toFixed(4),
    roundRatio: +roundRatio.toFixed(4),
    round500Ratio: +round500.toFixed(4),
    top: [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([g, c]) => ({ grams: g, count: c })),
  };
}

function stats(values) {
  const s = [...values].sort((a, b) => a - b);
  const p25 = quantile(s, 0.25);
  const p75 = quantile(s, 0.75);
  return {
    n: s.length, min: s[0], max: s[s.length - 1],
    median: quantile(s, 0.5), p25, p75,
    spread: p25 ? +(p75 / p25).toFixed(2) : null,
  };
}

const host = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');

let rows = [];
let productCount = 0;
let robots = { note: 'not fetched (--from)' };

if (fromFile) {
  const { readFileSync } = await import('node:fs');
  const dump = JSON.parse(readFileSync(fromFile, 'utf8'));
  rows = dump.rows;
  productCount = dump.products;
  robots = { note: dump.robots ?? 'recorded in the dump' };
} else {
  robots = await robotsAllows(host);
  if (!robots.allowed) {
    console.log(JSON.stringify({ domain: host, ok: false, error: `robots.txt disallows: ${robots.note}` }, null, 2));
    process.exit(0);
  }
  let products;
  try {
    products = await fetchAll(host);
  } catch (e) {
    console.log(JSON.stringify({ domain: host, ok: false, error: e.message }, null, 2));
    process.exit(0);
  }
  productCount = products.length;
  for (const p of products) {
    for (const v of p.variants || []) {
      if (typeof v.grams === 'number' && v.grams > 0) {
        rows.push({ title: p.title, type: p.product_type || '', tags: p.tags || [], grams: v.grams });
      }
    }
  }
  if (dumpFile) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(dumpFile, JSON.stringify({ domain: host, robots: robots.note, products: productCount, rows }) + '\n');
    console.error(`wrote ${dumpFile} — ${rows.length} rows`);
  }
}

const all = rows;
if (sliceWords.length > 0 || notWords.length > 0) {
  rows = rows.filter((r) => {
    const hay = `${r.title} ${r.type}`.toLowerCase();
    if (sliceWords.length > 0 && !sliceWords.some((w) => hay.includes(w))) return false;
    return !notWords.some((w) => hay.includes(w));
  });
}
const values = rows.map((r) => r.grams);

// 商品タイプごとにも切る。カテゴリ内の「商品ライン」が見えると精度が上がる
// （フィギュアでは 1/7 scale が全件 1500g で ばらつき 1.0x だった）。
const byType = {};
for (const r of rows) {
  const k = r.type || '(untyped)';
  (byType[k] ||= []).push(r.grams);
}
const types = Object.entries(byType)
  .filter(([, v]) => v.length >= 20)
  .map(([type, v]) => ({ type, ...stats(v) }))
  .sort((a, b) => b.n - a.n)
  .slice(0, 25);

const out = {
  domain: host,
  ok: true,
  robots: robots.note,
  products: productCount,
  slice: sliceWords.length > 0 || notWords.length > 0
    ? { words: sliceWords, without: notWords, rowsInSlice: rows.length, rowsInCatalogue: all.length }
    : null,
  variantsWithGrams: rows.length,
  overall: values.length ? stats(values) : null,
  quality: judge(values),
  byProductType: types,
  sampleTitles: rows.slice(0, 5).map((r) => `${r.grams}g — ${r.title}`),
};

const json = JSON.stringify(out, null, 2);
if (outFile) {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(outFile, json + '\n');
  console.error(`wrote ${outFile}`);
}
console.log(json);
