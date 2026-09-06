'use client';

import { useMemo, useReducer } from 'react';
import { compare } from '@/lib/pricing/compare';
import { weightFieldsFor } from '@/lib/pricing/weights';
import { siteById } from '@/lib/search/sites';
import type { CompareResult, CountryCode, Item, SiteId } from '@/lib/pricing/types';

export interface Draft {
  title: string;
  priceYen: number | null;
  priceTier: 'fixed' | 'estimate';
  site: SiteId;
  url?: string | null;
  imageUrl?: string | null;
  /** 出品ページから読めたときだけ入る。読めなければ undefined のまま。
   *  総額に直接効くので、推測で埋めずに利用者のトグルに委ねる。 */
  freeShipping?: boolean;
}

interface State {
  items: Item[];
  country: CountryCode;
  seq: number;
  /**
   * 価格をまだ一度も貰えていない項目の id。
   * 検索結果は価格を返さないことがある（docs/UI-DESIGN.md §2「価格なし」）。
   * 読めなかった価格を 0 として総額に混ぜたら「未取得を 0 と書く」ことになるので、
   * 価格が入るまでこの項目は compare() に渡さない。
   */
  unpriced: string[];
}

type Action =
  | { type: 'add'; draft: Draft }
  | { type: 'remove'; id: string }
  | { type: 'patch'; id: string; patch: Partial<Item> }
  | { type: 'country'; country: CountryCode };

function itemFromDraft(draft: Draft, id: string): Item {
  // 重量はタイトルから引く。当たらなければ仮置き（ASSUMED_WEIGHT_G）を 'assumed' として入れる。
  // 以前は null のまま入れて段ごとの総額に落としていたが、重量の推定誤差で1位が替わる
  // 以上、利用者に直してもらうしかなく、直す欄は最初から数字が入っている方が動線として
  // 軽い。押し付けにしないのは画面の仕事（出どころを書き、効く品を名指しする）。
  const w = weightFieldsFor(draft.title);
  return {
    id,
    title: draft.title,
    // 価格が無い項目は unpriced に入り比較から外れるので、この 0 は
    // 総額にも画面にも出ない（Item.priceYen が number なだけの置き場）。
    priceYen: draft.priceYen ?? 0,
    // **オークションの現在価格は確定値ではない。** 落札価格は後で決まる。
    // 確定色で出すと「この額を払う」と読めてしまう。
    priceTier: draft.priceYen == null || siteById(draft.site).kind === 'auction'
      ? 'estimate'
      : draft.priceTier,
    site: draft.site,
    url: draft.url ?? null,
    imageUrl: draft.imageUrl ?? null,
    ...w,
    ...(draft.freeShipping === undefined ? {} : { freeShipping: draft.freeShipping }),
    qty: 1,
  };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'add': {
      const id = `i${state.seq}`;
      return {
        ...state,
        seq: state.seq + 1,
        items: [...state.items, itemFromDraft(action.draft, id)],
        unpriced:
          action.draft.priceYen == null ? [...state.unpriced, id] : state.unpriced,
      };
    }
    case 'remove':
      return {
        ...state,
        items: state.items.filter((i) => i.id !== action.id),
        unpriced: state.unpriced.filter((id) => id !== action.id),
      };
    case 'patch':
      return {
        ...state,
        items: state.items.map((i) => (i.id === action.id ? { ...i, ...action.patch } : i)),
        // 利用者が数字を入れた時点で「未取得」ではなくなる。
        unpriced:
          typeof action.patch.priceYen === 'number'
            ? state.unpriced.filter((id) => id !== action.id)
            : state.unpriced,
      };
    case 'country':
      return { ...state, country: action.country };
  }
}

// 空の画面だと何が起きるか伝わらないので、例として2点入れておく。
const EXAMPLES: Draft[] = [
  {
    title: 'Hatsune Miku 1/7 scale figure (example)',
    priceYen: 12800, priceTier: 'estimate', site: 'yahoo-auctions',
  },
  {
    title: 'Nendoroid Kagamine Rin (example)',
    priceYen: 4200, priceTier: 'estimate', site: 'mercari',
  },
];

function initial(): State {
  let seq = 0;
  const items = EXAMPLES.map((d) => itemFromDraft(d, `i${seq++}`));
  return { items, country: 'US', seq, unpriced: [] };
}

export function useCompare() {
  const [state, dispatch] = useReducer(reducer, undefined, initial);
  // 価格が未取得の項目は総額に入れない。入れれば ¥0 の商品として順位を歪める。
  const priced = useMemo(
    () => state.items.filter((i) => !state.unpriced.includes(i.id)),
    [state.items, state.unpriced],
  );
  const result: CompareResult = useMemo(
    () => compare({ items: priced, country: state.country }),
    [priced, state.country],
  );
  return { ...state, result, dispatch };
}
