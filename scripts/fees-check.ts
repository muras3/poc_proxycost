/**
 * 各社の公式料金ページと日本郵便の EMS 料金表に差分が出たら issue を立てる。
 *
 * **数字は自動更新しない。**料金は一次情報の転記であって、推論させてよい対象では
 * ない。ここがやるのは「変わったぞ」と知らせるところまで。直すのは人間。
 *
 * data/fee-pages.json に前回の記録を持つ。差分が出たら GITHUB_TOKEN があれば
 * issue を立て、無ければ標準出力に出す。
 *
 * 見張り方は出典によって違う。同じ「ハッシュ差分」で見ると、毎週必ず変わるものは
 * 出た瞬間に意味を失うため:
 *   text    … 本文テキストのハッシュ。料金ページ・税のページ。差分が出たら
 *             **確かめ取りをしてから報せる**（同じ日に取り直しても別物になる
 *             ページがあるため。figuresOf のコメント）。
 *   value   … 中身の値のずれで見る。為替（毎日変わるのでハッシュは無意味）。
 *   notices … 前回より後に増えた見出しだけを見る。日本郵便のお知らせ（運行情報が
 *             週に何本も増えるのでハッシュは無意味）。
 *
 * 見た出典と HTTP status は毎回すべて出す。**「全件 200 だったか」を実行ログだけで
 * 確かめられるように。**取れなかった出典があっても終了コードは 0 のまま
 * （issue と実行ログに残す。Action を赤くして毎週無視されるより、記録に残す）。
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

import { SERVICES } from '../src/lib/pricing/services';
import { EMS_SOURCE_URL } from '../src/lib/pricing/ems';
import { COUNTRIES } from '../src/lib/pricing/countries';
import { RATES, RATES_AS_OF, RATES_SOURCE_URL } from '../src/lib/pricing/rates';
import { parseEcbDaily, yenPer, ECB_DAILY_URL } from './lib/ecb';

const STORE = 'data/fee-pages.json';
const UA = 'proxycost-fee-watch/0.1 (+https://github.com/muras3/poc_proxycost)';
/** XML(ECB) と JSON(日本郵便) も取りに行くので、HTML だけを名乗らない。 */
const ACCEPT = 'text/html,text/plain,application/json,application/xml;q=0.9,*/*;q=0.8';

/**
 * 日本郵便「国際郵便に関するお知らせ」。**EMS の料金改定はここに出る。**
 * 料金表 (list-ems/all.html) は改定が効いた後にしか変わらないので、予告を拾うには
 * こちらも要る。
 *
 * **人が読むページではなく、そのページが読んでいる JSON を見ている。**
 * https://www.post.japanpost.jp/service/send/oversea/information/ の一覧は
 * 空の <div id="newslist"> に JS が描いていて、その JS の get_json() がこの URL を
 * 叩く。つまり HTML をハッシュしても、お知らせが増えた日に1バイトも変わらない
 * （確認日 2026-09-06、ページの原文で確認）。
 * 旧 https://www.post.japanpost.jp/int/information/ は 4 回の転送でここに来る。
 */
const NOTICE_URL =
  'https://www.post.japanpost.jp/service/send/oversea/information/json/oversea_information.json';
/** issue に載せる、人が読める方の入口。 */
const NOTICE_PAGE = 'https://www.post.japanpost.jp/service/send/oversea/information/';

/** 増えたお知らせのうち、料金に触れていそうなものを目立たせる語。**選り分けはしない。** */
const FEE_WORDS = ['料金', '改定', '値上げ', '値下げ', '運賃'];

/**
 * issue に並べるお知らせの上限。
 * 週次なら増えるのは数件だが、**data/fee-pages.json は Action では更新されない**
 * ので、記録を人が更新しないまま放っておくと差分は溜まり続ける。全部貼ると
 * issue が読めなくなるので、件数だけ添えて一覧に送る。
 */
const MAX_NOTICES = 20;

type Watch = 'text' | 'value' | 'notices';

interface Target { url: string; note: string; watch: Watch }

interface Snapshot {
  url: string;
  /** watch: 'text' のときだけ入る。 */
  hash?: string;
  /** watch: 'text' のときだけ入る。本文の数字だけの指紋（figuresOf のコメント）。 */
  figures?: string;
  /** watch: 'notices' のときだけ入る。前回時点で最新だったお知らせの日時。 */
  mark?: string;
  checkedOn: string;
  note: string;
}

/**
 * 為替がこれ以上ずれていたら報せる。
 * 2% は ¥20,000 の総額で ¥400 にあたり、実測の籠で1位と2位を分けている ¥50 より
 * 大きい。つまりこの幅を超えると、順位の説明が為替の陳腐化で崩れうる。
 */
const FX_DRIFT_PCT = 2;

/**
 * 出典が更新されてからこの日数を超えて転記していなければ報せる。
 * 相場が静かでも「読んだのはいつか」を年単位で放置しないため。
 */
const FX_STALE_DAYS = 14;

const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

/**
 * 為替の出典を見る。**ハッシュでは見ない。**参照レートは毎日変わるので、
 * ハッシュ差分は毎週必ず出て、出た瞬間に意味を失う。見るべきは
 * 「rates.ts の値と出典の値がどれだけ離れたか」と「いつの値を転記したままか」。
 * ここも数字は自動更新しない。直すのは人間（npm run fx:fetch で転記する値が出る）。
 *
 * 本文は上の取得ループが取ってきたものを受け取る。**同じ URL を二度叩かないため。**
 */
function checkFx(today: string, xml: string | null): { changed: string[]; unreachable: string[] } {
  const changed: string[] = [];
  const unreachable: string[] = [];
  if (RATES_SOURCE_URL !== ECB_DAILY_URL) {
    changed.push(`- **為替の出典 URL が食い違っている**: rates.ts=${RATES_SOURCE_URL} / ecb.ts=${ECB_DAILY_URL}`);
    return { changed, unreachable };
  }
  const daily = xml == null ? null : parseEcbDaily(xml);
  if (!daily) {
    unreachable.push(`- 為替の出典（ECB 日次参照レート）— 取得できず: ${ECB_DAILY_URL}`);
    return { changed, unreachable };
  }
  for (const [ccy, held] of Object.entries(RATES)) {
    const live = yenPer(daily.perEur, ccy);
    if (live == null) {
      // **消えた通貨を推測で埋めない。**据え置いて、消えたことだけを報せる。
      unreachable.push(`- 為替 ${ccy} が出典に無くなっている（rates.ts は ¥${held} のまま据え置き）: ${ECB_DAILY_URL}`);
      continue;
    }
    const drift = ((live - held) / held) * 100;
    if (Math.abs(drift) >= FX_DRIFT_PCT) {
      changed.push(
        `- **為替 ${ccy}** が ${drift >= 0 ? '+' : ''}${drift.toFixed(1)}% ずれた`
        + `（rates.ts ¥${held} → 出典 ¥${live.toFixed(2)} / 参照日 ${daily.refDate}）: ${ECB_DAILY_URL}`,
      );
    }
  }
  const age = daysBetween(RATES_AS_OF, daily.refDate);
  if (age > FX_STALE_DAYS) {
    changed.push(
      `- **為替の転記が ${age} 日古い**（rates.ts は ${RATES_AS_OF} の参照レート、`
      + `出典は ${daily.refDate} を公表）: ${ECB_DAILY_URL}`,
    );
  }
  if (!changed.length && !unreachable.length) {
    console.log(`為替は出典の ${daily.refDate} 値と ${FX_DRIFT_PCT}% 以内（転記は ${RATES_AS_OF}、${today} 確認）`);
  }
  return { changed, unreachable };
}

interface Notice { title: string; url: string; type: string; date: string }

/** 日本郵便のお知らせ JSON を読む。**BOM 付きで配信されている**ので剥がす。 */
export function parseNotices(body: string): Notice[] | null {
  let rows: unknown;
  try {
    rows = JSON.parse(body.replace(/^\uFEFF/, ''));
  } catch {
    return null;
  }
  if (!Array.isArray(rows)) return null;
  const out: Notice[] = [];
  for (const row of rows) {
    if (typeof row !== 'object' || row == null) continue;
    const r = row as Record<string, unknown>;
    // 日付と見出しが無い行は数えない。形が変わったのを「0件」と取り違えないため。
    if (typeof r['title'] !== 'string' || typeof r['date'] !== 'string') continue;
    out.push({
      title: r['title'],
      date: r['date'],
      url: typeof r['url'] === 'string' ? r['url'] : '',
      type: typeof r['type'] === 'string' ? r['type'] : '',
    });
  }
  return out.length ? out : null;
}

/**
 * 前回の印（＝前回時点の最新お知らせの日時）より後に増えたものを返す。
 * 日付は "YYYY/MM/DD HH:MM" 固定なので、文字列の大小がそのまま時刻の前後になる。
 * **初回（印が無い）は「全部が新しい」とは言わない。**608 件の見出しを issue に
 * 流し込んでも読まれない。印だけ打って、次回から差分で見る。
 */
export function newNotices(notices: Notice[], mark: string | undefined): Notice[] {
  if (!mark) return [];
  return notices.filter((n) => n.date > mark).sort((a, b) => b.date.localeCompare(a.date));
}

export function latestMark(notices: Notice[]): string {
  return notices.reduce((max, n) => (n.date > max ? n.date : max), '');
}

/** 見た目だけの差分でうるさくならないよう、本文のテキストだけを見る。 */
function stripText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const hashOf = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16);

/**
 * 本文に出てくる数字だけを並べた指紋。
 *
 * **本文ハッシュが毎回変わるページのための逃げ道。**Neokyo の料金ページは読み込み
 * ごとに「Trivia : …」をランダムに差し込むので、本文ハッシュは同じ日に取り直しても
 * 別物になる（2026-09-06 に3回取得して3回とも別ハッシュ、と2回取りで再確認）。
 * それをそのまま差分として報せると、料金が1円も動かない週にも毎週 issue が立ち、
 * 本当に動いた週の1件がその中に埋もれる。
 *
 * 数字だけなら文章の入れ替えでは動かない（同じ2回取りで、監視中の10ページ全部で
 * 指紋は一致した）。**ただし数字が動かない改定（「送料無料」の削除など）は
 * 見落とす。**だから本文ハッシュを捨てず、本文が安定しているページでは今まで
 * 通り本文で見る。指紋を使うのは、本文が当てにならないと実測できた場合だけ。
 */
const figuresOf = (text: string) => hashOf((text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).join(' '));

/** 取れたかどうかだけでなく **status もそのまま返す**。週次の実行ログで全件 200 を確かめるため。 */
async function fetchDoc(url: string): Promise<{ status: number; body: string | null }> {
  try {
    const r = await fetch(url, {
      headers: { 'user-agent': UA, accept: ACCEPT },
      signal: AbortSignal.timeout(20000),
    });
    return { status: r.status, body: r.ok ? await r.text() : null };
  } catch {
    // 届かなかった（DNS・TLS・時間切れ）。status が無いので 0 を立てる。
    return { status: 0, body: null };
  }
}

function targets(): Target[] {
  const out: Target[] = [];
  for (const s of SERVICES) {
    if (s.sourceUrl) out.push({ url: s.sourceUrl, note: `${s.name} の料金ページ`, watch: 'text' });
  }
  out.push({ url: EMS_SOURCE_URL, note: '日本郵便 EMS 料金表', watch: 'text' });
  out.push({ url: NOTICE_URL, note: `日本郵便 国際郵便のお知らせ（一覧は ${NOTICE_PAGE}）`, watch: 'notices' });
  out.push({ url: ECB_DAILY_URL, note: '為替の出典（ECB 日次参照レート）', watch: 'value' });
  for (const [cc, c] of Object.entries(COUNTRIES)) {
    if (c.sourceUrl) out.push({ url: c.sourceUrl, note: `${cc} の税・免税限度`, watch: 'text' });
  }
  return out;
}

async function openIssue(body: string): Promise<boolean> {
  const token = process.env['GITHUB_TOKEN'];
  const repo = process.env['GH_REPO'];
  if (!token || !repo) return false;
  const r = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      title: `料金ページに差分: ${new Date().toISOString().slice(0, 10)}`,
      body,
      labels: ['fees'],
    }),
  });
  return r.ok;
}

const previous: Record<string, Snapshot> = existsSync(STORE)
  ? (JSON.parse(readFileSync(STORE, 'utf8')) as Record<string, Snapshot>)
  : {};

const today = new Date().toISOString().slice(0, 10);
const next: Record<string, Snapshot> = {};
const changed: string[] = [];
const unreachable: string[] = [];
const seen: { status: number; url: string; note: string }[] = [];
let ecbBody: string | null = null;

for (const t of targets()) {
  const { status, body } = await fetchDoc(t.url);
  seen.push({ status, url: t.url, note: t.note });
  const prev = previous[t.url];
  if (body == null) {
    unreachable.push(`- ${t.note} — 取得できず（HTTP ${status || '接続不可'}）: ${t.url}`);
    // 取れなかっただけで前回の記録を消さない。次回また試す。
    if (prev) next[t.url] = prev;
    continue;
  }

  if (t.watch === 'value') {
    // 値のずれは checkFx が見る。ここは「叩けた」ことだけを残す（ハッシュは持たない）。
    ecbBody = body;
    next[t.url] = { url: t.url, checkedOn: today, note: t.note };
    continue;
  }

  if (t.watch === 'notices') {
    const notices = parseNotices(body);
    if (!notices) {
      // 200 で返ってきたのに読めない＝配信の形が変わった。**空扱いで流さない。**
      unreachable.push(`- ${t.note} — 200 だが JSON として読めない（配信の形が変わった疑い）: ${t.url}`);
      if (prev) next[t.url] = prev;
      continue;
    }
    const fresh = newNotices(notices, prev?.mark);
    for (const n of fresh.slice(0, MAX_NOTICES)) {
      const hit = FEE_WORDS.some((w) => n.title.includes(w));
      const link = n.url.startsWith('http') ? n.url : `https://www.post.japanpost.jp${n.url}`;
      changed.push(
        `- ${hit ? '**料金に触れている疑い** ' : ''}日本郵便のお知らせ ${n.date}`
        + `［${n.type}］${hit ? `**${n.title}**` : n.title}: ${link}`,
      );
    }
    if (fresh.length > MAX_NOTICES) {
      changed.push(
        `- 日本郵便のお知らせ 他 ${fresh.length - MAX_NOTICES} 件（前回の記録 ${prev?.mark} が古いほど溜まる。`
        + `読んだら data/fee-pages.json を更新すること）: ${NOTICE_PAGE}`,
      );
    }
    next[t.url] = { url: t.url, mark: latestMark(notices), checkedOn: today, note: t.note };
    if (!prev?.mark) {
      console.log(`日本郵便のお知らせ: 初回なので印だけ打った（${notices.length} 件、最新 ${latestMark(notices)}）`);
    }
    continue;
  }

  const text = stripText(body);
  const hash = hashOf(text);
  const figures = figuresOf(text);
  if (prev?.hash && prev.hash !== hash) {
    // **報せる前に確かめ取りをする。**同じ日に取り直して別物になるページは、
    // 「変わった」のではなく毎回変わっているだけ（figuresOf のコメント）。
    const again = await fetchDoc(t.url);
    const flaps = again.body != null && hashOf(stripText(again.body)) !== hash;
    if (!flaps) {
      changed.push(`- **${t.note}** が変わった（${prev.checkedOn} → ${today}）: ${t.url}`);
    } else if (prev.figures && prev.figures !== figures) {
      changed.push(
        `- **${t.note}** の数字が変わった（${prev.checkedOn} → ${today}`
        + `／本文は取得ごとに変わるページなので数字の指紋で見た）: ${t.url}`,
      );
    } else if (!prev.figures) {
      // **判定できないことを「差分なし」に混ぜない。**次回からは指紋で見られる。
      unreachable.push(
        `- ${t.note} — 本文が取得ごとに変わるページで、前回の記録に数字の指紋が無いため`
        + `今回は判定できない（今回ぶんを記録した。次回から数字で見る）: ${t.url}`,
      );
    } else {
      console.log(`${t.note}: 本文は取得ごとに変わるが数字は動いていない（${t.url}）`);
    }
  }
  next[t.url] = { url: t.url, hash, figures, checkedOn: today, note: t.note };
}

// 為替は本文のハッシュではなく値のずれで見る（checkFx のコメント）。
const fx = checkFx(today, ecbBody);
changed.push(...fx.changed);
unreachable.push(...fx.unreachable);

writeFileSync(STORE, `${JSON.stringify(next, null, 2)}\n`);

// **毎回、対象と HTTP status を全部出す。**「全件 200 だったか」を実行ログだけで確かめられるように。
console.log(`## 見た出典（${seen.length} 件 / ${today}）`);
for (const s of seen) console.log(`${String(s.status || 'ERR').padStart(3)} ${s.url} — ${s.note}`);
console.log('');

if (!changed.length && !unreachable.length) {
  console.log(`差分なし（${Object.keys(next).length} ページ / ${today}）`);
  process.exit(0);
}

const body = [
  changed.length ? `## 差分が出たページ\n\n${changed.join('\n')}` : '',
  unreachable.length ? `## 取得できなかったページ\n\n${unreachable.join('\n')}` : '',
  '\n**数字は自動更新していない。**原文を読んで、変わっていれば',
  '`src/lib/pricing/services.ts` / `ems.ts` / `countries.ts` を手で直し、',
  '確認日を更新すること。為替なら `npm run fx:fetch` が出典の値を出すので、',
  'それを `src/lib/pricing/rates.ts` に転記し、参照日と取得日の両方を更新すること。',
].filter(Boolean).join('\n\n');

console.log(body);
if (changed.length) {
  const filed = await openIssue(body);
  console.log(filed ? 'issue を立てた' : 'GITHUB_TOKEN / GH_REPO が無いので issue は立てていない');
}
