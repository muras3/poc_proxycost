/**
 * 欧州中央銀行(ECB) の euro foreign exchange reference rates を読む。
 *
 * **一次情報の条件を満たすものを選んでいる。**発行元が中央銀行そのもので、
 * URL が固定、機械可読(XML)、まとめサイトでもスクレイピング前提の HTML でもない。
 *
 * ECB は EUR 建てでしか出さない。対円が要るので JPY建て ÷ 当該通貨建て で
 * 割り戻す（クロスレート）。割り戻しの元になった生の値も一緒に返して、
 * rates.ts に転記の証拠として残せるようにする。
 *
 * **ここは取得だけをやる。数字を rates.ts に書くのは人間。**料金と同じ作法で、
 * 為替も自動更新しない（scripts/fees-check.ts の見出しコメントと同じ理由）。
 */

/** 固定 URL。rates.ts の RATES_SOURCE_URL と一致していること（fx-check が突き合わせる）。 */
export const ECB_DAILY_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';

const UA = 'proxycost-fx-watch/0.1 (+https://github.com/muras3/poc_proxycost)';

export interface EcbDaily {
  /** ECB が「いつの参照レートか」として公表している日 (YYYY-MM-DD)。 */
  refDate: string;
  /** 1 EUR あたりの当該通貨。原文そのままで、丸めない。 */
  perEur: Record<string, number>;
}

/** XML から <Cube time> と <Cube currency rate> を拾う。依存を足さないための最小実装。 */
export function parseEcbDaily(xml: string): EcbDaily | null {
  const time = /<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]/.exec(xml);
  if (!time?.[1]) return null;
  const perEur: Record<string, number> = {};
  for (const m of xml.matchAll(/<Cube\s+currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]/g)) {
    const ccy = m[1];
    const rate = Number(m[2]);
    // 0 や NaN を「取れた」と数えない。取れなかったものは落とす。
    if (ccy && Number.isFinite(rate) && rate > 0) perEur[ccy] = rate;
  }
  if (!Object.keys(perEur).length) return null;
  return { refDate: time[1], perEur };
}

export async function fetchEcbDaily(): Promise<EcbDaily | null> {
  try {
    const r = await fetch(ECB_DAILY_URL, {
      headers: { 'user-agent': UA, accept: 'application/xml,text/xml' },
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) return null;
    return parseEcbDaily(await r.text());
  } catch {
    return null;
  }
}

/**
 * EUR 建てから対円へ割り戻し、銭（小数2桁）に丸める。
 * 丸めの誤差は 0.01/156 ≒ 0.006% で、直そうとしている 4〜12% の陳腐化に対して無視できる。
 * EUR 自身は割り戻さない（JPY建てがそのまま「円/EUR」）。
 */
export function yenPer(perEur: Record<string, number>, ccy: string): number | null {
  const jpy = perEur['JPY'];
  if (jpy == null) return null;
  if (ccy === 'EUR') return jpy;
  const q = perEur[ccy];
  if (q == null || q <= 0) return null;
  return Math.round((jpy / q) * 100) / 100;
}
