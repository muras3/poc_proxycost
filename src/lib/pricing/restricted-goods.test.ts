import { describe, expect, test } from 'vitest';
import { WEIGHT_CATEGORIES } from '@/data/weights';
import { COUNTRY_CODES } from './countries';
import {
  ALCOHOL_WEIGHT_LINE_IDS,
  LITHIUM_AIRMAIL_LISTED,
  LONG_ITEM_WEIGHT_LINE_IDS,
  RESTRICTED_GOODS,
  alcoholItems,
  longItems,
  restrictedList,
  weightLineLabel,
} from './restricted-goods';
import { compare } from './compare';
import { resolveWeight, weightFieldsFor } from './weights';
import type { CountryCode } from './types';
import type { Item } from './types';

const item = (title: string): Item => ({
  id: title, title, priceYen: 4000, priceTier: 'estimate', site: 'yahoo-auctions',
  qty: 1, ...weightFieldsFor(title),
});

describe('what we publish about goods that may not be shippable', () => {
  test('every entry names its source and the day we read it', () => {
    expect(RESTRICTED_GOODS.length).toBeGreaterThanOrEqual(3);
    for (const g of RESTRICTED_GOODS) {
      expect(g.sourceUrl, g.id).toMatch(/^https:\/\/www\.post\.japanpost\.jp\//);
      expect(g.checkedOn, g.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // 原文を自分で読んだものだけ載せる。読めていない品を混ぜたらこの一覧が
      // 「原文が言っていること」ではなくなる。
      expect(g.tier, g.id).toBe('fixed');
      expect(g.ruleEn.length, g.id).toBeGreaterThan(40);
    }
  });

  test('the three goods the disclosure names are the three we have sources for', () => {
    expect(RESTRICTED_GOODS.map((g) => g.id))
      .toEqual(['alcohol', 'lithium-batteries', 'blades']);
    expect(restrictedList()).toBe('Alcohol, lithium batteries and blades');
  });

  test('a passage that exists only in Japanese is not cited from an English URL', () => {
    // 英語版に無い記述（アルコール 24%、刀剣等）を `_en.html` の URL で出典と書けば、
    // 読みに行った人がその文を見つけられない。言語と URL を突き合わせる。
    for (const g of RESTRICTED_GOODS) {
      const isEnglishUrl = g.sourceUrl.includes('_en.html');
      expect(isEnglishUrl, `${g.id}: ${g.sourceUrl}`).toBe(g.sourceLang === 'en');
    }
  });

  test('every destination has an answer about lithium air mail — none is left undefined', () => {
    for (const cc of COUNTRY_CODES) {
      expect(typeof LITHIUM_AIRMAIL_LISTED[cc], cc).toBe('boolean');
    }
    // 原文（upc_en.html の Note 2）の列挙。英国とドイツはそこに無い。
    expect(COUNTRY_CODES.filter((c) => !LITHIUM_AIRMAIL_LISTED[c])).toEqual(['GB', 'DE']);
  });
});

describe('alcohol in the cart is detected from the weight table, never guessed', () => {
  test('the sake line ids we watch all exist in the weight table', () => {
    // ライン id が表と食い違えば、警告は黙って一度も出なくなる。
    const known = new Set(WEIGHT_CATEGORIES.flatMap((c) => c.lines.map((l) => l.id)));
    for (const id of ALCOHOL_WEIGHT_LINE_IDS) expect(known.has(id), id).toBe(true);
    for (const id of ALCOHOL_WEIGHT_LINE_IDS) expect(weightLineLabel(id), id).toBeTruthy();
  });

  test('a bottle size alone is not read as alcohol — the title has to say so', () => {
    // 重量表の corroboration 規則（weights.ts REQUIRES_CORROBORATION）。'ジュース 700ml' を
    // 四合瓶として読まないための規則がそのままここに効く。**警告も同じ根拠で鳴る。**
    // 裏返せば 'Dassai 45 junmai daiginjo 720ml'（酒だが needs の語が無い）では鳴らない。
    // 見逃す側に外している——鳴らないことは分かっていて、鳴らせるのは表を直したときだけ。
    expect(alcoholItems([item('orange juice 700ml')])).toEqual([]);
    expect(alcoholItems([item('Dassai 45 junmai daiginjo 720ml')])).toEqual([]);
  });

  test('a bottle in the title is caught, and its line label is what we show', () => {
    const hits = alcoholItems([
      item('Dassai 45 junmai daiginjo sake 720ml'),
      item('Hatsune Miku 1/7 scale figure'),
    ]);
    expect(hits.map((i) => i.weightLineId)).toEqual(['sake-720ml']);
    expect(weightLineLabel('sake-720ml')).toBe('Sake / spirits, 700-750ml bottle');
  });

  test('all three bottle sizes are caught', () => {
    const hits = alcoholItems([
      item('sake 1800ml isshobin'),
      item('junmai sake 720ml'),
      item('カップ酒 300ml'),
    ]);
    expect(hits.map((i) => i.weightLineId))
      .toEqual(['sake-1800ml', 'sake-720ml', 'sake-300ml']);
  });

  test('nothing outside those lines is called alcohol', () => {
    // **当たらなかった品を「酒ではない」とは言わない**が、警告の対象にもしない。
    // 表が分類したものだけを名指しする、というのがこの機能の全部。
    const titles = [
      'Hatsune Miku 1/7 scale figure',
      'Nendoroid Kagamine Rin',
      'plush toy, no weight data',
      'matcha green tea 100g',
    ];
    expect(alcoholItems(titles.map(item))).toEqual([]);
  });

  test('a weight the user typed does not erase the classification', () => {
    // 重量を打ち直しても weightLineId は残る（ItemList は weightG/tier/origin だけ触る）。
    // 残らなくなったら警告が消えるので、ここで縛る。
    const typed: Item = { ...item('Dassai 45 junmai daiginjo sake 720ml'), weightG: 1500, weightOrigin: 'user' };
    expect(alcoholItems([typed])).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 長さで方式が絞られうる品（`docs/audit/o2-courier-2026-09-08.md` §2）。
// **我々は寸法を持っていない。**だから「どの方式が落ちるか」は言わず、
// 「見ていない」とだけ言う。ここで縛るのは**誰を名指しするか**と、
// **総額を1円も動かさないこと**の2つ。
// ─────────────────────────────────────────────────────────────────────────────
describe('long items are named, and naming them changes no number', () => {
  const item = (title: string, over: Partial<Item> = {}): Item => {
    const w = resolveWeight(title);
    return {
      id: title, title, priceYen: 8000, priceTier: 'fixed', site: 'yahoo-auctions',
      weightG: w.grams ?? 1000, weightTier: 'estimate', weightLineId: w.lineId,
      qty: 1, ...over,
    };
  };

  test('the six lines we flag are the ones the weight table can actually reach', () => {
    // 表に無い id を並べても永久に鳴らない。**id が実在することをここで縛る。**
    for (const id of LONG_ITEM_WEIGHT_LINE_IDS) {
      expect(weightLineLabel(id), `${id} は重量表に無い`).toBeTruthy();
    }
    expect(LONG_ITEM_WEIGHT_LINE_IDS).toHaveLength(6);
  });

  test('a rod and a bow are named; a gel pen is not', () => {
    const rod = item('シマノ ロッド 1ピース');
    const bow = item('弓道 弓');
    const pen = item('ゼブラ サラサクリップ 0.5mm 黒 10本');
    expect(longItems([rod, bow, pen]).map((i) => i.weightLineId))
      .toEqual(['rod-1piece', 'kyudo-yumi']);
    // **当たらなかった品を「短い」とは言わない。**空配列は「該当なし」であって
    // 「全部短い」ではない——その区別は常時開示の1行が引き受けている。
    expect(longItems([pen])).toEqual([]);
  });

  test('**heavy is not the test — 800 g of shinai bag counts, 3 kg of figure does not**', () => {
    // カテゴリでも重量でも絞れないことの現物。武道具袋は 800g だが竹刀の長さがある。
    expect(longItems([item('防具袋 竹刀袋')]).map((i) => i.weightLineId)).toEqual(['budo-bag']);
    // 1/4スケールのフィギュアは 3,000g だが箱で、長さは label から言えないので入れていない。
    expect(longItems([item('1/4スケール フィギュア')])).toEqual([]);
  });

  test('the warning is disclosure only: the total and the ranking do not move', () => {
    // **これが本体。**開示であって価格の変更ではないので、同じ籠の総額と順位が
    // 長物を含むかどうかで変わってはいけない（変わったら寸法を価格に入れている）。
    const rod = item('シマノ ロッド 1ピース');
    const plain = item('無名の箱', { weightG: 9780, weightLineId: null });
    for (const cc of ['US', 'DE', 'CA'] as CountryCode[]) {
      const withRod = compare({ items: [rod], country: cc }).rows;
      const without = compare({ items: [plain], country: cc }).rows;
      expect(withRod.map((r) => [r.id, r.total]), cc)
        .toEqual(without.map((r) => [r.id, r.total]));
    }
  });
});
