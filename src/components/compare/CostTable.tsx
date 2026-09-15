import { SERVICE_BY_ID } from '@/lib/pricing/services';
import type { CompareResult } from '@/lib/pricing/types';
import { TotalText } from './RankRow';
import { lineAmount, STAGES, stageOf } from './mockFormat';

/**
 * 全社費目表（Mock v3 `costTableHTML`）の中身。器の折りたたみ `details.fold#all-fees`
 * （見出しと件数）は `Calculator` の `Folds` が持つ。
 * 費目=行・会社=列、列順は順位。行は配達ログと同じ段（Bought / Warehouse / …）で区切る。
 * 狭い幅では表が横にはみ出すので、`.tscroll` の中だけ横スクロールさせる（本文は動かさない）。
 */
export function CostTable({ result }: { result: CompareResult }) {
  const rows = result.rows;
  if (!rows.length) return null;

  // 行の並びは1位の内訳の順を正とし、他社にしか無い費目を後ろに足す。
  const keys: string[] = [];
  for (const r of rows) {
    for (const l of r.lines) if (!keys.includes(l.key)) keys.push(l.key);
  }
  // 同じ費目でも社ごとに文言が違うことがある。行見出しは全列に掛かるので、
  // **金額を持っている行の文言を優先する。**
  const labelOf = (key: string) => {
    const ls = rows.flatMap((r) => r.lines).filter((l) => l.key === key);
    return (ls.find((l) => l.amount != null) ?? ls[0])?.label ?? key;
  };

  return (
    <>
      <div className="tscroll" tabIndex={0} role="region" aria-label="All fees table, scrolls sideways">
        <table className="ct">
          <thead>
            <tr>
              <th scope="col">Fee</th>
              {rows.map((r) => {
                // 破線は「その会社の料金表の出所が二次情報」の印。行内の tier で判定すると、
                // 全社共通の関税・通関手数料（二次）で全列が破線になり印として機能しない。
                const secondary = SERVICE_BY_ID.get(r.serviceId)?.primarySource === false;
                return (
                  <th
                    key={r.id}
                    scope="col"
                    className={secondary ? 'sec' : undefined}
                    title={secondary
                      ? 'fee schedule from a second-hand source, not the company’s own page'
                      : 'fee schedule read from the company’s own page'}
                  >
                    {r.serviceName}
                    {r.variant && <><br /><span className="lbl">{r.variant}</span></>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {STAGES.filter(([k]) => k !== 'door').map(([sk, sn]) => {
              const ks = keys.filter((k) => stageOf(k) === sk);
              if (!ks.length) return null;
              return [
                <tr key={`stage-${sk}`}>
                  <td className="stagecell" colSpan={rows.length + 1}>{sn}</td>
                </tr>,
                ...ks.map((k) => (
                  <tr key={k} data-cost-key={k}>
                    <th scope="row" style={{ fontWeight: 400, textAlign: 'left' }}>{labelOf(k)}</th>
                    {rows.map((r) => {
                      const l = r.lines.find((x) => x.key === k);
                      if (!l) return <td key={r.id}>—</td>;
                      const a = lineAmount(l);
                      return (
                        <td key={r.id} className={a.cls} data-tier={l.tier}>
                          {/* 二次情報は点線の下線（Mock `costTableHTML` が描くのと同じ inline の点線）。 */}
                          {l.tier === 'unverified'
                            ? <span style={{ textDecoration: 'underline dotted 1px', textUnderlineOffset: 3 }}>{a.txt}</span>
                            : a.txt}
                        </td>
                      );
                    })}
                  </tr>
                )),
              ];
            })}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              {rows.map((r) => <td key={r.id}><TotalText row={r} /></td>)}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="lbl" style={{ margin: '8px 0 0' }}>
        Column underline: solid = fee table from the company&rsquo;s own page · dashed = second-hand.
        Blue = our estimate · red = not published.
      </p>
    </>
  );
}
