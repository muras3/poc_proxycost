import type { ReactNode } from 'react';
import { BASE, Parts, prism } from './primitives';

// 重量表に無い商品。**「不明」を状態として描く。**
// 見本帳の reel / rod と同じ作法で、家族のシルエット（ここでは最も一般的な
// 「梱包された荷物」= 箱）から決め手を全部剥ぎ取り、輪郭を点線にする。
// 別の品を描くのではなく、同じ語彙を確度の低い線で引く。
// 色も確度4段階の「未取得」と同じ dim（families.ts の familyTone.unknown）。
export function drawUnknown(): ReactNode {
  const p = prism(50 - (18 * 0.55) / 2, BASE, 46, 56, 18, 1.2, { dash: true, fillScale: 0.4 });
  return <Parts of={[p.node]} />;
}
