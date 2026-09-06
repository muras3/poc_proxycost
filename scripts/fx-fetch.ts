/**
 * 出典（ECB 日次参照レート）を叩いて、rates.ts に転記する値を出す。
 *
 * **数字は自動更新しない。**fees-check.ts と同じ作法で、ここがやるのは
 * 「原文はこうだった」と見せるところまで。rates.ts を書き換えるのは人間。
 *
 * **取れなかった通貨の行は出さない。**推測で埋めないため、そして古い値が
 * 新しい取得日を名乗らないため。落ちた通貨があれば非ゼロで終わる。
 *
 *   npm run fx:fetch
 */
import { fetchEcbDaily, yenPer, ECB_DAILY_URL } from './lib/ecb';
import { RATES, RATES_AS_OF, RATES_SOURCE_URL } from '../src/lib/pricing/rates';

const WANT = ['USD', 'GBP', 'EUR', 'AUD', 'CAD', 'SGD'];
const today = new Date().toISOString().slice(0, 10);

if (RATES_SOURCE_URL !== ECB_DAILY_URL) {
  console.error(`rates.ts の RATES_SOURCE_URL が ${ECB_DAILY_URL} と違う。どちらかが古い。`);
  process.exit(2);
}

const daily = await fetchEcbDaily();
if (!daily) {
  console.error(`取得できなかった: ${ECB_DAILY_URL}`);
  console.error('**rates.ts は触るな。**取れていないのに日付だけ新しくするのが元の不具合。');
  process.exit(1);
}

console.log(`出典: ${ECB_DAILY_URL}`);
console.log(`参照日 (ECB の公表): ${daily.refDate}`);
console.log(`取得日 (このスクリプトを走らせた日): ${today}`);
console.log('');

const missing: string[] = [];
const lines: string[] = [];
const raw: string[] = [];

console.log('| 通貨 | ECB 原文 (1 EUR あたり) | 円/1通貨 | 現行 rates.ts | ずれ |');
console.log('|---|---:|---:|---:|---:|');
for (const ccy of WANT) {
  const yen = yenPer(daily.perEur, ccy);
  const now = RATES[ccy];
  if (yen == null) {
    missing.push(ccy);
    console.log(`| ${ccy} | — | **取れず** | ${now ?? '—'} | — |`);
    continue;
  }
  const src = ccy === 'EUR' ? daily.perEur['JPY'] : daily.perEur[ccy];
  const drift = now != null ? ((yen - now) / now) * 100 : null;
  console.log(
    `| ${ccy} | ${ccy === 'EUR' ? `JPY ${src}` : src} | ${yen.toFixed(2)} | ${now ?? '—'} |`
      + ` ${drift == null ? '—' : `${drift >= 0 ? '+' : ''}${drift.toFixed(1)}%`} |`,
  );
  lines.push(`  ${ccy}: ${yen.toFixed(2)},`);
  raw.push(`  ${ccy === 'EUR' ? 'JPY' : ccy}: ${src},`);
}

console.log('');
console.log('rates.ts に転記する（取れた通貨だけ。取れなかった通貨は据え置き＋ RATES_STALE に理由）:');
console.log('');
console.log(`export const RATES_AS_OF = '${daily.refDate}';`);
console.log(`export const RATES_FETCHED_ON = '${today}';`);
console.log('export const ECB_PER_EUR: Record<string, number> = {');
console.log(`  JPY: ${daily.perEur['JPY']},`);
console.log(raw.filter((l) => !l.startsWith('  JPY')).join('\n'));
console.log('};');
console.log('export const RATES: Record<string, number> = {');
console.log(lines.join('\n'));
console.log('};');

if (missing.length) {
  console.error('');
  console.error(`**取れなかった通貨がある: ${missing.join(', ')}**`);
  console.error('推測で埋めるな。古い値を据え置いて RATES_STALE に理由と据え置いた日を書け。');
  process.exit(1);
}
if (daily.refDate !== RATES_AS_OF) {
  console.log('');
  console.log(`現行の RATES_AS_OF は ${RATES_AS_OF}。出典は ${daily.refDate} を公表している。`);
}
