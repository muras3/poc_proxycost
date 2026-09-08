// 商品の発送重量。実データから導いた集計だけを持つ（生カタログは再配布しない）。
//
// **Shopify の grams は送料計算用の入力値であって実測ではない。** 店が一律送料・帯別送料を
// 使っていると擬似値になる（カメラ店で全件1,500g、楽器店でギター180kg が実在した）。
// だから scripts/shopify-probe.mjs の分布判定（distinct比・最頻値シェア・丸い値の比率）で
// usable / suspect / pseudo を決め、pseudo は採らない。
//
// このファイルは scripts/weights-build.ts が data/weights/*.json から生成する。
// 手で編集するな。`npm run weights:build` を走らせろ。

export type WeightTier = 'fixed' | 'estimate' | 'unverified';

export interface WeightLine {
  id: string;
  labelEn: string;
  /** 商品タイトルに含まれれば、このラインとみなす語。小文字で比較する。 */
  match: string[];
  medianG: number;
  p25: number;
  p75: number;
  n: number;
  /** P75 / P25。1.0 に近いほど事実上の定数。 */
  spread: number;
  tier: WeightTier;
  /**
   * カテゴリの総称ライン。**他のどのラインにも当たらなかったときだけ**使う。
   * 'フィギュア' は '1/7' より長いので、当たった語の長さで決めると総称が
   * 個別ラインを食う。だから長さではなく段階で分ける。
   */
  generic?: boolean;
  /** このラインを出した店。カテゴリが複数の店を持つとき、行ごとに出所が違う。 */
  sourceDomain?: string;
}

export interface WeightSource {
  domain: string;
  url: string;
  products: number;
  variantsWithGrams: number;
  verdict: string;
  reason: string;
}

export interface WeightCategory {
  category: string;
  labelEn: string;
  labelJa: string;
  checkedOn: string;
  /** 実測値か。Shopify の grams は実測ではないので false。 */
  measured: boolean;
  sources: WeightSource[];
  lines: WeightLine[];
  fallbackG: number | null;
  fallbackTier: 'estimate' | 'none' | 'unverified';
  notes: string;
}

/** 重量が取れなかったカテゴリ。**推定で埋めない。**画面にはそのまま「取れていない」と出す。 */
export interface MissingWeightCategory {
  id: string;
  labelEn: string;
  labelJa: string;
  reason: string;
}

// 実データが取れたカテゴリのみ。取れていないカテゴリはここに無く、
// 計算機は「段ごとの総額」に落ちる。空欄をでっち上げない。
export const WEIGHT_CATEGORIES: WeightCategory[] = [
  {
    category: 'figures',
    labelEn: 'Figures',
    labelJa: 'フィギュア',
    checkedOn: '2026-09-08',
    measured: false,
    sources: [
      {
        domain: 'www.solarisjapan.com',
        url: 'https://www.solarisjapan.com/products.json?limit=250&page=1',
        products: 5000,
        variantsWithGrams: 4747,
        verdict: 'usable',
        reason: 'Every product carries grams. Lines with a scale in the title have a spread of 1.0x. Re-fetched 2026-09-07: 5,000 products, 10,630 variants with grams, verdict usable (distinct=287 at 2.7%, top value 22%). product_type=\'Figure\' is n=9,893.',
      },
      {
        domain: 'japan-figure.com',
        url: 'https://japan-figure.com/products.json?limit=250&page=1',
        products: 10000,
        variantsWithGrams: 17428,
        verdict: 'usable',
        reason: 'distinct=801 (4.6%), top value 9%, multiples of 100: 25%. Adopted 2026-09-08 for the prize line only. product_type=\'Prize Figures\' is n=749, median 480 g, p25 331 / p75 650, spread 1.96, verdict usable (distinct=173 at 23.1%, top value 7%). The plush rows from the same shop went to the toys-models category, because the resolver refuses every figures line on a title that says ぬいぐるみ.',
      },
    ],
    lines: [
      { id: 'scale-1-4', labelEn: '1/4 scale', match: ['1/4'], medianG: 3000, p25: 3000, p75: 3800, n: 198, spread: 1.3, tier: 'estimate' },
      { id: 'scale-1-6', labelEn: '1/6 scale', match: ['1/6'], medianG: 1800, p25: 1800, p75: 1800, n: 641, spread: 1, tier: 'estimate' },
      { id: 'scale-1-7', labelEn: '1/7 scale', match: ['1/7'], medianG: 1500, p25: 1500, p75: 1500, n: 647, spread: 1, tier: 'estimate' },
      { id: 'scale-1-8', labelEn: '1/8 scale', match: ['1/8'], medianG: 1300, p25: 1230, p75: 1500, n: 105, spread: 1.2, tier: 'estimate' },
      { id: 'pop-up-parade', labelEn: 'Pop Up Parade', match: ['pop up parade', 'ポップアップパレード'], medianG: 800, p25: 800, p75: 1000, n: 104, spread: 1.2, tier: 'estimate' },
      { id: 'figma', labelEn: 'figma', match: ['figma'], medianG: 800, p25: 550, p75: 800, n: 78, spread: 1.5, tier: 'estimate' },
      { id: 'nendoroid', labelEn: 'Nendoroid', match: ['nendoroid', 'ねんどろいど'], medianG: 439, p25: 380, p75: 600, n: 426, spread: 1.6, tier: 'estimate' },
      { id: 'figure-generic', labelEn: 'Figure, unspecified', match: ['フィギュア', 'フィギア', 'figure', 'figures'], medianG: 800, p25: 800, p75: 1300, n: 5103, spread: 1.63, tier: 'estimate', generic: true, sourceDomain: 'www.solarisjapan.com' },
    ],
    fallbackG: 1000,
    fallbackTier: 'estimate',
    notes: 
      '5,000 products from the Solaris Japan public catalogue. The grams look like one standard value per packing class rather than a measurement — every 1/7 scale is exactly 1,500 g. Good enough to pick an EMS step, but we never call it a measured weight.\n'
      + '\n'
      + '2026-09-07: added the generic line. The audit (docs/audit/logic.md §5) recorded that this category had no Japanese word for "a figure" at all — only the Japanese spellings of Nendoroid and Pop Up Parade — so ordinary Yahoo! Auctions and Mercari titles matched nothing. Two of the 37 live search titles were plain figure listings and both fell through. The 800 g is the same Solaris Japan catalogue re-fetched, sliced to product_type=\'Figure\' with the rows the existing lines already claim removed (1/4, 1/6, 1/7, 1/8, Nendoroid, figma, Pop Up Parade): n=5,103, verdict usable (distinct=179 at 3.5%, top value 41%), median 800 g, p25 800 / p75 1,300, spread 1.63. It is marked generic, which means it only resolves when no other line in the table matched. The Japanese word for a figure is five characters and \'1/7\' is three, so under the longest-match rule the generic line would otherwise swallow every scale line.\n'
      + '\n'
      + '2026-09-08: prize figures came in from a second shop, japan-figure.com. A prize figure is 480 g against the 800 g generic figure line, so lending it the generic number overstated it by two thirds. Plush from the same catalogue is 184 g and lives in the toys-models category, not here.\n'
      + '\n'
      + 'The prize line deliberately does not carry the bare word プライズ. A dictionary that matches one word at a time cannot tell プライズ フィギュア (a prize figure, 480 g) from プライズ ぬいぐるみ or a prize towel, and the bare word would take every one of them off the 800 g generic line. It only resolves when the compound is written without a space. Two live titles in data/weights-corpus.json (h-b7780a18, h-b8cf7c0e) are single prize figures whose labels read "no prize-specific line exists, so the generic figure line is the closest measured population"; that sentence is no longer true, and whether those rows should now expect prize-figure — and the bare word be added with a corroborating word in the resolver — is a labelling decision, not a data one.',
  },
  {
    category: 'music',
    labelEn: 'Records and CDs',
    labelJa: 'レコード・CD',
    checkedOn: '2026-09-08',
    measured: false,
    sources: [
      {
        domain: 'snowrecords.com',
        url: 'https://snowrecords.com/products.json?limit=250&page=1',
        products: 10000,
        variantsWithGrams: 10000,
        verdict: 'suspect',
        reason: 'distinct ratio 1.0%, multiples of 100: 12%. Suspect, and adopted with that on the record, because the shop weighs in 20 g steps: 100 distinct values over 10,000 rows, every one of them a multiple of 10 and nearly all of them a multiple of 20. The steps are small enough to separate a CD from an LP, which is what the lines need. Until 2026-09-08 this row said products 0 and the two lines carried n=0, because only the shop\'s published range had been read and the catalogue behind it never had been. product_type=\'CD\' is n=2,907, median 120 g, p25 120 / p75 140, spread 1.17. product_type=\'Vinyl Records\' is n=7,075 and bimodal: 1,840 rows at 80 g or below, then a trough of about 150 rows across 90-180 g, then 5,235 rows at 200 g and above with median 280 g, p25 250 / p75 300, spread 1.20. The light mode is the 7-inch single, which this shop does not type separately; the split above is by that gap in the distribution and not by anything in the titles.',
      },
    ],
    lines: [
      { id: 'cd', labelEn: 'CD', match: ['cd', 'compact disc'], medianG: 120, p25: 120, p75: 140, n: 2907, spread: 1.17, tier: 'estimate' },
      { id: 'lp', labelEn: 'LP / vinyl', match: ['lp', 'vinyl', 'レコード'], medianG: 280, p25: 250, p75: 300, n: 5235, spread: 1.2, tier: 'estimate' },
    ],
    fallbackG: 200,
    fallbackTier: 'estimate',
    notes: 
      'The two lines were read from the Snow Records catalogue on 2026-09-08: 10,000 products, every one carrying grams. Until then they came from the range the shop publishes on its own site (CD 80-120 g, LP 240-300 g) with no sample count, and the table printed "sample size not recorded" beside them. The catalogue agrees with the published range for vinyl (250-300 g against 240-300 g) and puts a CD 20 g heavier than the middle of its published range.\n'
      + '\n'
      + 'The verdict on the catalogue is suspect: the shop weighs in 20 g steps, so the values are rounded rather than measured. The steps are far smaller than the difference between the formats, which is all these lines have to carry.\n'
      + '\n'
      + 'The 7-inch line is the light half of a two-peaked vinyl distribution — 1,840 rows sit at 80 g, then almost nothing until 200 g, then 5,235 rows make the LP peak. The shop does not type the two separately, so the sample was split at that gap and not by anything a title says. What a listing does say is EP or 7-inch, and those are the words the line matches.\n'
      + '\n'
      + 'Not obtained: box sets and heavyweight or double LPs (they are inside the LP peak and nothing separates them), and the cases, sleeves and storage the live search returns alongside the discs.',
  },
  {
    category: 'books-manga',
    labelEn: 'Books and manga',
    labelJa: '書籍・漫画',
    checkedOn: '2026-09-07',
    measured: false,
    sources: [
      {
        domain: 'jpbookstore.com',
        url: 'https://jpbookstore.com/products.json?limit=250&page=1',
        products: 5000,
        variantsWithGrams: 5000,
        verdict: 'usable',
        reason: 'distinct=163 (3.3%), top value 15%, multiples of 100: 16%. Adopted. Only one value in six is a round hundred, so these read as per-title weights and not as postage bands. product_type=\'Comics & Manga\' n=4,786 median 210 g (p25 200 / p75 250); \'Literature & Fiction\' n=84 median 408 g (p25 272 / p75 540). \'Art & Design\' (n=33) and \'Self-Help & Hobbies\' (n=37) are under the threshold of 50 and were not used.',
      },
      {
        domain: 'shop.bookoffusa.com',
        url: 'https://shop.bookoffusa.com/products.json?limit=250&page=1',
        products: 1178,
        variantsWithGrams: 1178,
        verdict: 'usable',
        reason: 'distinct=124 (10.5%), top value 11%. Adopted for the complete-set line only: the catalogue is entirely manga box sets, n=1,124 median 2,000 g (p25 1,400 / p75 2,800). It also corroborates the single volume from the other direction — a ten-volume set at 2,000 g is 200 g a volume, against jpbookstore\'s 210 g.',
      },
      {
        domain: 'nipponrama.com',
        url: 'https://nipponrama.com/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'products.json returns HTTP 403, so nothing could be read.',
      },
    ],
    lines: [
      { id: 'manga-set', labelEn: 'Manga, complete set', match: ['全巻セット', '全巻', 'コミックセット', 'complete set'], medianG: 2000, p25: 1400, p75: 2800, n: 1124, spread: 2, tier: 'estimate', sourceDomain: 'shop.bookoffusa.com' },
      { id: 'manga-volume', labelEn: 'Manga volume', match: ['漫画', 'まんが', 'マンガ', 'コミックス', 'コミック', 'manga', 'comics', 'comic'], medianG: 210, p25: 200, p75: 250, n: 4786, spread: 1.25, tier: 'estimate', sourceDomain: 'jpbookstore.com' },
      { id: 'book-general', labelEn: 'Book, non-manga', match: ['文庫本', '文庫', '新書', '小説', '単行本', 'ハードカバー', 'paperback', 'hardcover'], medianG: 408, p25: 272, p75: 540, n: 84, spread: 1.99, tier: 'estimate', sourceDomain: 'jpbookstore.com' },
    ],
    fallbackG: 220,
    fallbackTier: 'estimate',
    notes: 
      'Two shops adopted: jpbookstore.com (usable) and shop.bookoffusa.com (usable). grams is an input to a shipping calculator, not a measurement, so measured: false. This category was listed as not obtained until 2026-09-07; it is obtained now.\n'
      + '\n'
      + 'jpbookstore.com is the better source of the two. Of 5,000 rows only 16% are round hundreds and the median is 220 g, which is what a Japanese tankobon actually weighs — so the shop is recording per-title weights rather than filling in a postage band. The manga line (210 g, n=4,786) is the single strongest line in the whole table by sample size and by spread (1.25).\n'
      + '\n'
      + 'shop.bookoffusa.com sells nothing but complete sets, which is why it is here: a set is a different object from a volume and needed its own line. It also checks the volume from the other side. A 2,000 g set of about ten volumes is 200 g a volume, within 5% of jpbookstore\'s 210 g, from an unrelated shop on another continent.\n'
      + '\n'
      + 'The general-book line is the weak one: 84 rows of \'Literature & Fiction\' with a spread of 1.99. It is kept because a novel is not a manga volume and 408 g is nearer the truth than 210 g, but it should be re-taken from a larger catalogue.\n'
      + '\n'
      + 'What is deliberately not here: illustrated reference books. A 図鑑, a 教科書 or a ムック is a large-format book, far heavier than a novel, and none of the adopted shops carry them in quantity. Rather than stretch the 408 g novel median over them, src/lib/pricing/weights.ts refuses those titles outright, and they fall back to the calculator\'s assumed weight. It also keeps a book about a thing from being read as the thing — a picture book about watches was resolving to 839 g, the weight of a watch.\n'
      + '\n'
      + '\'box set\' was tried as a match word for the set line and dropped: \'CD box set\' and \'Blu-ray box set\' are not manga, and the phrase is eight characters long, so it outranked the two-letter \'cd\' and took the listing.',
  },
  {
    category: 'tcg-singles',
    labelEn: 'Trading cards (singles)',
    labelJa: 'トレカ（単カード）',
    checkedOn: '2026-09-06',
    measured: false,
    sources: [
      {
        domain: 'www.pokeninjapan.store',
        url: 'https://www.pokeninjapan.store/products.json?limit=250&page=1',
        products: 5000,
        variantsWithGrams: 5198,
        verdict: 'suspect',
        reason: 'distinct ratio 0.7%, multiples of 100: 36%, of 500: 4%. Adopted. product_type=Single has 2,743 rows of which 99.2% are 50 g; product_type=PSA has 1,602 rows on two values, 100 g and 250 g. These are packed shipping weights, not measurements.',
      },
      {
        domain: 'japanmaster.myshopify.com',
        url: 'https://japanmaster.myshopify.com/products.json?limit=250&page=1',
        products: 500,
        variantsWithGrams: 491,
        verdict: 'usable',
        reason: 'distinct=10 (2.0%), top value 39%. Adopted. There is no product_type, so singles were isolated by rarity words in the title (sar/sr/ur/hr/ar/csr/promo/parallel/leader), giving n=358 of which 86% are 100 g. Thirteen outliers put a single card at 1,000 g, so the values lean toward shipping bands.',
      },
      {
        domain: 'onepiece.pokeninjapan.store',
        url: 'https://onepiece.pokeninjapan.store/products.json?limit=250&page=1',
        products: 1114,
        variantsWithGrams: 1122,
        verdict: 'pseudo',
        reason: 'distinct=8, top value 97% of all rows. Not adopted: all 1,084 Single rows are 50 g, and it is the same operator as pokeninjapan, so it is not independent evidence.',
      },
      {
        domain: 'zenpan-japan.com',
        url: 'https://zenpan-japan.com/products.json?limit=250&page=1',
        products: 3249,
        variantsWithGrams: 3248,
        verdict: 'pseudo',
        reason: 'distinct=77, top value 64% of all rows. Not adopted, but Pokémon TCG (1,959 rows) and One Piece TCG (336 rows) both have a median of 50 g, which independently supports the 50 g packed value.',
      },
      {
        domain: 'tcg-corner.com',
        url: 'https://tcg-corner.com/products.json?limit=250&page=1',
        products: 5000,
        variantsWithGrams: 4726,
        verdict: 'pseudo',
        reason: 'distinct=18, top value 77% of all rows. Not adopted: singles sit on three values, 2 g / 3 g / 4 g — the card itself, with no packing.',
      },
      {
        domain: 'omotenashitcg.com',
        url: 'https://omotenashitcg.com/products.json?limit=250&page=1',
        products: 5000,
        variantsWithGrams: 5380,
        verdict: 'pseudo',
        reason: 'distinct=65, top value 86% of all rows. Not adopted: Card Games has 4,872 rows almost all at 2 g, the bare card.',
      },
      {
        domain: 'cardotaku.com',
        url: 'https://cardotaku.com/products.json?limit=250&page=1',
        products: 5000,
        variantsWithGrams: 5005,
        verdict: 'pseudo',
        reason: 'distinct=100, top value 94% of all rows. Not adopted: every single is 3 g, the bare card.',
      },
      {
        domain: 'yugi-market.com',
        url: 'https://yugi-market.com/products.json?limit=250&page=1',
        products: 5000,
        variantsWithGrams: 5041,
        verdict: 'pseudo',
        reason: 'distinct=29, top value 89% of all rows. Not adopted: 4,470 singles at 5 g, the bare card.',
      },
      {
        domain: 'japantradingcardstore.com',
        url: 'https://japantradingcardstore.com/products.json?limit=250&page=1',
        products: 2658,
        variantsWithGrams: 538,
        verdict: 'pseudo',
        reason: 'distinct=5, top value 82% of all rows. Not adopted: only 538 of 2,658 rows carry grams, and 82% of those are 1 g.',
      },
      {
        domain: 'sakurascardshop.com',
        url: 'https://sakurascardshop.com/products.json?limit=250&page=1',
        products: 156,
        variantsWithGrams: 185,
        verdict: 'usable',
        reason: 'distinct=31 (16.8%), top value 40%. Usable as a shop, but the stock is almost all sealed product (boxes at 312 g and 454 g) and only about ten singles exist, at 1 g / 2 g / 5 g. Not usable for a line.',
      },
      {
        domain: 'poketherapy.com',
        url: 'https://poketherapy.com/products.json?limit=250&page=1',
        products: 123,
        variantsWithGrams: 115,
        verdict: 'usable',
        reason: 'distinct=15 (13.0%), top value 19%. Usable as a shop, but it carries only booster boxes and bundles — not a single card in the catalogue. Not adopted.',
      },
      {
        domain: 'japan-figure.com',
        url: 'https://japan-figure.com/products.json?limit=250&page=1',
        products: 5000,
        variantsWithGrams: 9093,
        verdict: 'usable',
        reason: 'distinct=438 (4.8%), top value 9%. Usable as a shop, but product_type=\'Trading Cards Single Card\' has n=24, below our threshold of 50, and its contents are actually decks and card sets. Not adopted.',
      },
      {
        domain: 'tcgrepublic.com',
        url: 'https://tcgrepublic.com/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'Not a Shopify store; products.json returns HTTP 404. The largest singles specialist, but no JSON is available.',
      },
      {
        domain: 'ichiba-japan.com',
        url: 'https://ichiba-japan.com/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'products.json returns HTTP 403 (HTML), so nothing could be read.',
      },
      {
        domain: 'www.fujicardshop.com',
        url: 'https://www.fujicardshop.com/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'products.json returns HTTP 403, so nothing could be read.',
      },
      {
        domain: 'samuraiswordtokyo.com',
        url: 'https://samuraiswordtokyo.com/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'Shopify, but products.json redirects to a blog HTML page and never returns JSON.',
      },
      {
        domain: 'japan-game-tcg-market.myshopify.com',
        url: 'https://japan-game-tcg-market.myshopify.com/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'products.json returns HTTP 500, so nothing could be read.',
      },
    ],
    lines: [
      { id: 'graded-slab', labelEn: 'Graded slab (PSA/BGS)', match: ['psa', 'bgs', 'cgc'], medianG: 100, p25: 100, p75: 250, n: 1602, spread: 2.5, tier: 'estimate' },
      { id: 'single-card', labelEn: 'Single card, packed', match: ['トレカ', 'トレーディングカード', 'trading card', 'シングル', 'single card', 'sar', 'csr', 'ssr', 'パラレル', 'parallel'], medianG: 50, p25: 50, p75: 50, n: 3101, spread: 1, tier: 'estimate' },
    ],
    fallbackG: 50,
    fallbackTier: 'estimate',
    notes: 
      'Two shops adopted: www.pokeninjapan.store (suspect) and japanmaster.myshopify.com (usable). grams is an input to a shipping calculator, not a measurement, so measured: false.\n'
      + '\n'
      + 'The decisive point here is that shops follow one of two conventions. (A) Shops that record the bare card: tcg-corner 2 g, omotenashitcg 2 g, cardotaku 3 g, yugi-market 5 g, japantradingcardstore 1 g. Four or five shops land independently between 1 and 5 g, so "a card weighs roughly 1.7 to 5 g" is corroborated by real data. But every one of them puts the same value on every row, which scores pseudo, so none of them feed a line. (B) Shops that record the packed shipping weight: pokeninjapan\'s 2,743 Single rows at 50 g, zenpan-japan\'s Pokémon and One Piece TCG also at a 50 g median, japanmaster\'s 358 singles at 100 g. Postage needs (B), so the lines are built from (B).\n'
      + '\n'
      + 'The 50 g single-card figure matches the expected sleeve, toploader and envelope (the brief\'s 20-60 g range). But it is the packed weight of one order, not of one card. Treating ten cards as 500 g is wrong: by group (A) each card is 2-5 g, so the increment is essentially paper. The pooled p25 and p75 are both 50, giving a spread of 1.0, only because pokeninjapan\'s 2,743 rows swamp japanmaster\'s 358 — real shop-to-shop variation should be read as 50 to 100 g.\n'
      + '\n'
      + 'The 100 g and 250 g of graded-slab reflect the PSA slab itself (about 85 g in reality) versus a padded shipping form. japanmaster has thirteen outliers putting one card at 1,000 g, which is a postage class entered verbatim, not a weight.\n'
      + '\n'
      + 'graded-slab must be matched first: PSA-graded listings also carry rarity words like \'sar\', so testing single-card first would drop graded cards to 50 g. The match words \'psa\', \'sar\', \'csr\' and \'ssr\' are short but appear almost nowhere except card titles, so they were kept; \'sr\', \'ur\' and \'ar\' were dropped as too short to be safe.\n'
      + '\n'
      + 'Limit: pokeninjapan is effectively the only shop with a real body of singles that did not score pseudo. onepiece.pokeninjapan.store is the same operator, so it is not independent verification. tcgrepublic.com, the largest singles specialist, is not Shopify and could not be read.\n'
      + '\n'
      + '2026-09-07: added トレカ, its long form and "trading card" to single-card. The word was already ruled on when the table was built — kpop/photocard lost it to a denylist entry saying "トレカ should be drawn from tcg-singles at 50 g rather than K-pop\'s 28 g" — but it was never added here, so it matched nothing at all. In a sample of 37 titles the live search returned, seven were トレカ listings (mostly K-pop photocards) and every one of them fell through. No new weight data: 50 g is the same packed single-card median already recorded above, and it is the heavier of the two candidates, so a K-pop photocard quoted at 50 g is quoted on the safe side. Graded slabs keep priority through an exclusion in src/lib/pricing/weights.ts: a title carrying psa / bgs / cgc is never read as a raw single.',
  },
  {
    category: 'kpop',
    labelEn: 'K-Pop albums and goods',
    labelJa: 'K-POP（アルバム・グッズ）',
    checkedOn: '2026-09-06',
    measured: false,
    sources: [
      {
        domain: 'kpopmerch.jp',
        url: 'https://kpopmerch.jp/products.json?limit=250&page=1',
        products: 3115,
        variantsWithGrams: 5116,
        verdict: 'suspect',
        reason: 'distinct ratio 1.2%, multiples of 100: 99%, of 500: 46%. Adopted. product_type=ALBUM has 3,193 rows, median 800 g (p25 600 / p75 1000). Japanese-language shop aimed at Japan, but operated from Korea (KPOPMERCH, Yongin).',
      },
      {
        domain: 'www.kpopalbums.com',
        url: 'https://www.kpopalbums.com/products.json?limit=250&page=1',
        products: 5000,
        variantsWithGrams: 13572,
        verdict: 'suspect',
        reason: 'distinct ratio 0.3%, multiples of 100: 100%, of 500: 28%. Adopted. product_type=CD 4,619 rows median 800 g; CARD (platform albums) 1,082 rows 400 g; BOOK 677 rows 1,500 g.',
      },
      {
        domain: 'shop.delivered.co.kr',
        url: 'https://shop.delivered.co.kr/products.json?limit=250&page=1',
        products: 5000,
        variantsWithGrams: 14778,
        verdict: 'suspect',
        reason: 'distinct ratio 0.3%, multiples of 100: 100%, of 500: 79%. Adopted, but most of the catalogue is K-fashion and cosmetics; only Kpop Album (1,357) and Kpop Merch (1,518) are in scope. Album median 1,000 g.',
      },
      {
        domain: 'cokodive.com',
        url: 'https://cokodive.com/products.json?limit=250&page=1',
        products: 499,
        variantsWithGrams: 1048,
        verdict: 'usable',
        reason: 'distinct=52 (5.0%), top value 25%, multiples of 100: 56%. Adopted. K-POP_CD/DVD_ALBUM n=143, median 700 g. Small sample, but the values move per product.',
      },
      {
        domain: 'www.kpop.exchange',
        url: 'https://www.kpop.exchange/products.json?limit=250&page=1',
        products: 2143,
        variantsWithGrams: 7057,
        verdict: 'suspect',
        reason: 'distinct ratio 1.8%, multiples of 100: 9%. Adopted for the photocard line only. Values are ounce conversions (28 g = 1 oz, 113 g = 4 oz, 454 g = 16 oz). product_type=\'Photo Card(s)\' has 1,074 rows — the only shop that carries a weight for a single photocard.',
      },
      {
        domain: 'kpopstoreinusa.com',
        url: 'https://kpopstoreinusa.com/products.json?limit=250&page=1',
        products: 5000,
        variantsWithGrams: 10872,
        verdict: 'suspect',
        reason: 'distinct ratio 0.3%. Not adopted; used only as corroboration. Values are pound conversions (907 g = 2 lb, 1,814 g = 4 lb), so the steps are coarse. Album n=3,395 with median 907 g independently supports 800-1,000 g for an album.',
      },
      {
        domain: 'kplaceshop.com',
        url: 'https://kplaceshop.com/products.json?limit=250&page=1',
        products: 1750,
        variantsWithGrams: 6246,
        verdict: 'usable',
        reason: 'distinct=427 (6.8%), top value 6%, multiples of 100: 1%. The best data quality of any K-Pop shop, but not adopted: the values are ounce conversions of the bare product with no packing, and Albums n=3,161 has a median of 172 g, which is far too low for a shipping weight. Photocard titles mix holders and sets, so single cards cannot be isolated.',
      },
      {
        domain: 'kpopmerch.com',
        url: 'https://kpopmerch.com/products.json?limit=250&page=1',
        products: 3730,
        variantsWithGrams: 9536,
        verdict: 'suspect',
        reason: 'distinct ratio 0.7%, multiples of 100: 99%. Not adopted: same operator as kpopmerch.jp (KPOPMERCH), so it is not independent evidence. ALBUM n=5,680 median 1,000 g, one step heavier than the .jp shop\'s 800 g.',
      },
      {
        domain: 'kpopfromjapan.com',
        url: 'https://kpopfromjapan.com/products.json?limit=250&page=1',
        products: 1432,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'Not adopted. One of the few Shopify stores based in Japan that ships abroad, but all 1,432 rows have grams of 0 — no weights entered at all.',
      },
      {
        domain: 'hallyusuperstore.com',
        url: 'https://hallyusuperstore.com/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'robots.txt is Disallow: / for everyone, so we did not fetch it.',
      },
      {
        domain: 'www.ktown4u.com',
        url: 'https://www.ktown4u.com/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'Not a Shopify store; products.json returns HTTP 303. The largest K-Pop retailer, but no JSON is available.',
      },
      {
        domain: 'www.catchopcd.net',
        url: 'https://www.catchopcd.net/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'Not a Shopify store; products.json returns HTTP 404.',
      },
      {
        domain: 'pocamarket.com',
        url: 'https://pocamarket.com/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'Not a Shopify store; products.json returns HTTP 404. The largest photocard specialist, but unreachable this way.',
      },
      {
        domain: 'kpopcd.com',
        url: 'https://kpopcd.com/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'Not a Shopify store; products.json returns HTTP 404. A Japanese retailer (Kaukau Asia) of Korean pressings.',
      },
      {
        domain: 's-record.jp',
        url: 'https://s-record.jp/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'Not a Shopify store; products.json returns HTTP 404. Seoul Records in Shin-Okubo, Tokyo.',
      },
      {
        domain: 'www.musickorea.com',
        url: 'https://www.musickorea.com/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'Not a Shopify store; products.json returns HTTP 404.',
      },
    ],
    lines: [
      { id: 'photocard', labelEn: 'Photocard (single)', match: ['フォトカード', 'photocard', 'photo card'], medianG: 28, p25: 28, p75: 57, n: 1074, spread: 2.04, tier: 'estimate' },
      { id: 'photobook', labelEn: 'Photobook / photo essay', match: ['写真集', 'フォトブック', 'photobook', 'photo book', 'dicon'], medianG: 1000, p25: 800, p75: 1600, n: 1182, spread: 2, tier: 'estimate' },
      { id: 'lightstick', labelEn: 'Official lightstick', match: ['ペンライト', 'lightstick', 'light stick', '応援棒'], medianG: 900, p25: 500, p75: 1500, n: 586, spread: 3, tier: 'estimate' },
      { id: 'dvd-bluray', labelEn: 'DVD / Blu-ray', match: ['ブルーレイ', 'blu-ray', 'bluray', 'dvd'], medianG: 1750, p25: 1200, p75: 2000, n: 150, spread: 1.67, tier: 'estimate' },
      { id: 'magazine', labelEn: 'Magazine', match: ['雑誌', 'マガジン', 'magazine'], medianG: 1500, p25: 1200, p75: 2500, n: 542, spread: 2.08, tier: 'estimate' },
      { id: 'platform-album', labelEn: 'Platform album (POCA / Weverse / Nemo / Kihno)', match: ['poca', 'weverse album', 'ウィバースアルバム', 'kihno', 'キノアルバム', 'plve', 'objekt', 'smini', 'プラットフォーム', 'platform album'], medianG: 400, p25: 300, p75: 600, n: 1140, spread: 2, tier: 'estimate' },
      { id: 'album', labelEn: 'Physical album (CD + photobook)', match: ['アルバム', 'album'], medianG: 800, p25: 500, p75: 1000, n: 9679, spread: 2, tier: 'estimate' },
    ],
    fallbackG: 700,
    fallbackTier: 'estimate',
    notes: 
      'Four shops adopted (kpopmerch.jp, www.kpopalbums.com, shop.delivered.co.kr, cokodive.com), plus www.kpop.exchange for the photocard line only. grams is an input to a shipping calculator, not a measurement, so measured: false.\n'
      + '\n'
      + 'A correction to the method first. This survey targets Japanese retailers that ship abroad, and for K-Pop that essentially does not exist. kpopfromjapan.com is one of the few Shopify shops based in Japan that ships worldwide, and all 1,432 of its rows have grams of 0. kpopmerch.jp is in Japanese and aimed at Japan, but it is run from Korea (KPOPMERCH, Yongin, Gyeonggi). Ktown4u, catchopcd, pocamarket, kpopcd.com and s-record.jp (Seoul Records in Shin-Okubo) are not Shopify and return 404 or 303. So the figures come from Korean and US shops. The goods are the same Korean pressings a Japanese shop would sell, so they are usable for estimating weight, but they are not "figures from a Japanese retailer".\n'
      + '\n'
      + 'The decisive split here is that shops follow one of two conventions. (A) Shops that record the packed shipping weight: kpopmerch.jp (album 800 g), kpopalbums (800 g), dkshop (1,000 g), cokodive (700 g), kpopstoreinusa (907 g = 2 lb). Five shops land independently between 700 and 1,000 g. (B) Shops that record the bare product: kplaceshop (album 172 g), kpop.exchange (454 g = 16 oz). A proxy shipment needs (A), so the lines pool the four (A) shops. The 400-600 g gap between the two groups is the box and the padding.\n'
      + '\n'
      + 'The brief guessed an album at 300-600 g including the photobook; the data says 800 g (p25 500, p75 1000). The difference is exactly the bare-versus-packed distinction, and group (B)\'s 454 g matches the brief closely. The order of magnitude was right.\n'
      + '\n'
      + 'Photocards cannot use group (A). Their photocard medians of 300-500 g are the Korean shops\' smallest-box postage step, not the weight of a card. Only www.kpop.exchange carries single cards under their own product_type (\'Photo Card(s)\', 1,074 rows), which is where 28 g comes from. Note that 28 g is exactly 1 oz and covers 67% of those rows, so it is a rounded floor; the same shop\'s true minimum is 3 g, and 28 g should be read as card plus sleeve plus envelope. It agrees in magnitude with the 50 g packed single card that the tcg-singles category derived independently.\n'
      + '\n'
      + 'Platform albums (POCA, Weverse, NEMO, Kihno, PLVE, Objekt, SMini) are card-format releases with no CD, at half a normal album (400 g). Without that split they would be matched at 800 g and be 2x wrong. platform-album must be tested before album, because "POCA ALBUM" contains "album".\n'
      + '\n'
      + 'Match words include both Japanese (as seen in auction titles) and English. \'cd\' was dropped from album as too short to be safe, leaving only \'album\' and its Japanese equivalent; \'ost\' was dropped because it matches \'post\'. \'dvd\' is only three characters but rarely hides inside other words, so it was kept.\n'
      + '\n'
      + 'Limits. (1) Only three of the four adopted shops are independent — kpopmerch.jp and kpopmerch.com are the same operator, so the latter is excluded. (2) Most of dkshop\'s catalogue is K-fashion and cosmetics; only the K-Pop product_types were used. (3) A few kpopmerch.jp albums carry 181,437 g, 272,155 g and 408,233 g, apparently pounds entered as grams, so everything above 20,000 g was excluded. (4) Lightsticks have a spread of 3.0 because official lightstick boxes differ per group; the 500-1,500 g range is shown as it is. (5) fallbackG 700 is the median of all 19,709 rows across the three K-Pop specialists (kpopmerch.jp, kpopalbums, cokodive).',
  },
  {
    category: 'used-luxury',
    labelEn: 'Used luxury goods',
    labelJa: '中古ブランド品',
    checkedOn: '2026-09-06',
    measured: false,
    sources: [
      {
        domain: 'www.tokyourluxury.com',
        url: 'https://www.tokyourluxury.com/products.json?limit=250&page=1',
        products: 1673,
        variantsWithGrams: 129,
        verdict: 'usable',
        reason: 'distinct=126 (97.7%), top value 2%, multiples of 100: 2%. Adopted as the core of the lines. Values run 47 g to 1,876 g with 1 g precision (866 g, 675 g, 89 g, 615 g), which reads as each item actually being put on a scale. Second-hand designer bags only. Note that only 129 of 1,673 products carry grams — the weighing appears to have started partway through.',
      },
      {
        domain: 'www.rookjapan.com',
        url: 'https://www.rookjapan.com/products.json?limit=250&page=1',
        products: 4313,
        variantsWithGrams: 3813,
        verdict: 'usable',
        reason: 'distinct=262 (6.9%), top value 5%, multiples of 100: 8%. Adopted for the watch line only. product_type=Luxury Watch has n=834, median 839 g, spread 1.47x, with values that move per model (762 g, 1,120 g). It is a watch shop selling mostly new stock, not a second-hand designer shop, and the values look like packed weight including the presentation box.',
      },
      {
        domain: 'luxlux.jp',
        url: 'https://luxlux.jp/products.json?limit=250&page=1',
        products: 1860,
        variantsWithGrams: 1854,
        verdict: 'suspect',
        reason: 'distinct ratio 0.3%, multiples of 100: 100%, of 500: 100%. Numbers not adopted: only five values exist (1,000 / 3,000 / 6,000 / 9,000 / 18,000 g), which is a shipping band table — a 6 kg handbag is not a physical weight. The ordering of the bands (wallets and accessories 1 kg < shoulder 3 kg < handbag and tote 6 kg < boston 9 kg) does match tokyourluxury\'s measured ordering, so it was used to corroborate how the lines are split.',
      },
      {
        domain: 'gracejapanluxuybrand.myshopify.com',
        url: 'https://gracejapanluxuybrand.myshopify.com/products.json?limit=250&page=1',
        products: 3221,
        variantsWithGrams: 1032,
        verdict: 'suspect',
        reason: 'distinct ratio 0.8%, multiples of 100: 100%, of 500: 100%. Numbers not adopted: steps of 1,000 / 2,000 / 3,000 / 4,000 g. product_type is in Japanese (shoulder bag 3 kg / handbag 3 kg / wallet 2 kg / watch 2 kg / necklace 1 kg), and it too was used only to corroborate the ordering.',
      },
      {
        domain: 'luxuness.com',
        url: 'https://luxuness.com/products.json?limit=250&page=1',
        products: 5000,
        variantsWithGrams: 5000,
        verdict: 'pseudo',
        reason: 'distinct=1, top value 100% of all rows. Not adopted: all 5,000 rows are a constant 500 g.',
      },
      {
        domain: 'world.reclo.jp',
        url: 'https://world.reclo.jp/products.json?limit=250&page=1',
        products: 5000,
        variantsWithGrams: 5000,
        verdict: 'pseudo',
        reason: 'distinct=1, top value 100% of all rows. Not adopted: bags, wallets, wrist watches and shoes are all 3,000 g.',
      },
      {
        domain: 'brandoffbuyingclub.com',
        url: 'https://brandoffbuyingclub.com/products.json?limit=250&page=1',
        products: 5000,
        variantsWithGrams: 5000,
        verdict: 'pseudo',
        reason: 'distinct=1, top value 100% of all rows. Not adopted: everything is 3,000 g. Row counts and the per-product_type breakdown match world.reclo.jp exactly, so it is the same catalogue on another domain and must not be counted as a second shop.',
      },
      {
        domain: 'hannari-shop.net',
        url: 'https://hannari-shop.net/products.json?limit=250&page=1',
        products: 244,
        variantsWithGrams: 86,
        verdict: 'pseudo',
        reason: 'distinct=1, top value 100% of all rows. Not adopted: mens watches and shoulder bags alike are 1,000 g.',
      },
      {
        domain: 'www.ippojapanwatch.com',
        url: 'https://www.ippojapanwatch.com/products.json?limit=250&page=1',
        products: 5000,
        variantsWithGrams: 4477,
        verdict: 'pseudo',
        reason: 'distinct=1, top value 100% of all rows. Not adopted: watches and spare bracelet links are all 300 g.',
      },
      {
        domain: 'cjluxury.com',
        url: 'https://cjluxury.com/products.json?limit=250&page=1',
        products: 477,
        variantsWithGrams: 7,
        verdict: 'insufficient',
        reason: 'Only n=7 weighted rows, below our threshold of 50.',
      },
      {
        domain: 'vintagelacharme.com',
        url: 'https://vintagelacharme.com/products.json?limit=250&page=1',
        products: 2570,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'Shopify, but grams is 0 on every row — no weights entered.',
      },
      {
        domain: 'dct-ep-vintageluxurystore.com',
        url: 'https://dct-ep-vintageluxurystore.com/products.json?limit=250&page=1',
        products: 5000,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'Shopify, but grams is 0 on every row — no weights entered.',
      },
      {
        domain: 'amorevintagejapan.com',
        url: 'https://amorevintagejapan.com/products.json?limit=250&page=1',
        products: 5000,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'Shopify, but grams is 0 on every row — no weights entered.',
      },
      {
        domain: 'myluxury-store.com',
        url: 'https://myluxury-store.com/products.json?limit=250&page=1',
        products: 4419,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'A second-hand luxury watch shop. Shopify, but grams is 0 on every row.',
      },
      {
        domain: 'weeklyluxdrop.com',
        url: 'https://weeklyluxdrop.com/products.json?limit=250&page=1',
        products: 5000,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'Shopify, but grams is 0 on every row — no weights entered.',
      },
      {
        domain: 'brandstreettokyo.com',
        url: 'https://brandstreettokyo.com/products.json?limit=250&page=1',
        products: 5000,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'Shopify, but grams is 0 on every row — no weights entered.',
      },
      {
        domain: 'jash.co.jp',
        url: 'https://jash.co.jp/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'products.json returns {"products":[]} — the public JSON is switched off. tomodachi.fun and arigatousharejapan.biz behave identically and belong to the same wholesale group.',
      },
      {
        domain: 'brandbagworld.com',
        url: 'https://brandbagworld.com/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'products.json returns 404 — not a Shopify store. j-ports.com, vintagequeenjapan.com, brandluxjp.com, sekinevintage.com, timepeaks.com, luxjpn.com, www.thewatchcompany.com, watchnian.com and brashel.jp also return 404; atlantisvintagetokyo.com and www.daikokuya78.com return 403; shop.zenplus.jp, zenluxe.jp, allu-official.com, gc-yukizaki.com and store.komehyo.jp are not Shopify.',
      },
    ],
    lines: [
      { id: 'boston-duffle', labelEn: 'Boston / duffle / travel bag', match: ['boston bag', 'keepall', 'duffle', 'duffel', 'ボストンバッグ', 'キーポル', '旅行バッグ'], medianG: 1025, p25: 874, p75: 1085, n: 8, spread: 1.24, tier: 'estimate' },
      { id: 'tote', labelEn: 'Tote bag', match: ['tote', 'トートバッグ', 'トートバック'], medianG: 805, p25: 690, p75: 897, n: 25, spread: 1.3, tier: 'estimate' },
      { id: 'shoulder-crossbody', labelEn: 'Shoulder / crossbody bag', match: ['shoulder bag', 'crossbody', 'cross body', 'messenger bag', 'body bag', 'ショルダーバッグ', 'ショルダーバック', '斜めがけ', 'ボディバッグ', 'メッセンジャーバッグ'], medianG: 657, p25: 475, p75: 860, n: 34, spread: 1.81, tier: 'estimate' },
      { id: 'handbag', labelEn: 'Handbag / top-handle bag', match: ['handbag', 'hand bag', 'top handle', 'ハンドバッグ', 'ハンドバック', 'トップハンドル', '手提げバッグ'], medianG: 576, p25: 439, p75: 690, n: 15, spread: 1.57, tier: 'estimate' },
      { id: 'pouch-clutch', labelEn: 'Pouch / clutch / vanity', match: ['clutch', 'pochette', 'pouch', 'vanity case', 'クラッチバッグ', 'ポシェット', 'ポーチ', 'バニティ'], medianG: 329, p25: 155, p75: 425, n: 13, spread: 2.74, tier: 'estimate' },
      { id: 'wallet-small-leather', labelEn: 'Wallet / small leather goods', match: ['wallet', 'card case', 'card holder', 'key case', 'coin case', '財布', 'カードケース', 'キーケース', 'コインケース', '名刺入れ'], medianG: 235, p25: 182, p75: 353, n: 23, spread: 1.94, tier: 'estimate' },
      { id: 'luxury-watch', labelEn: 'Luxury wristwatch (boxed)', match: ['腕時計', 'wristwatch', 'wrist watch', 'ウォッチ'], medianG: 839, p25: 762, p75: 1120, n: 834, spread: 1.47, tier: 'estimate' },
    ],
    fallbackG: 584,
    fallbackTier: 'estimate',
    notes: 
      'Two shops adopted. The numbers rest on www.tokyourluxury.com — second-hand designer bags only, n=129, distinct ratio 97.7% — where values run from 47 g to 1,876 g with odd figures throughout, which reads as each item having been weighed. No second-hand shop carried real watch weights, so watches are stood in for by www.rookjapan.com\'s product_type Luxury Watch (n=834).\n'
      + '\n'
      + 'Three limits. (1) tokyourluxury\'s values are most likely the item alone, without padding or a box — an LV Mini Papillon at 89 g. Used as a shipping weight they need packing added, which is what measured: false means here. (2) The per-line n is thin, between 8 and 34; boston at n=8 and pouch at n=13 are especially uncertain. (3) The 839 g watch figure comes from a shop selling mostly new watches with the presentation box, which is a different object from a used watch shipped without one (a Rolex head alone is around 150 g). None of these three could be filled in from another shop.\n'
      + '\n'
      + 'Most second-hand luxury shops are useless here: luxuness is a flat 500 g, world.reclo and brandoffbuyingclub a flat 3,000 g, hannari a flat 1,000 g, and many Shopify shops simply leave grams at 0 (vintagelacharme, dct-ep, amorevintagejapan, myluxury-store, weeklyluxdrop, brandstreettokyo). On the other hand, the shipping bands at luxlux.jp and gracejapanluxuybrand order themselves as wallet < shoulder < handbag and tote < boston, which matches tokyourluxury\'s measured ordering — so the way the lines are cut is corroborated by two independent sources even though their numbers are not.\n'
      + '\n'
      + 'fallbackG 584 is the median of all 129 tokyourluxury rows.',
  },
  {
    category: 'sneakers',
    labelEn: 'Sneakers',
    labelJa: 'スニーカー',
    checkedOn: '2026-09-06',
    measured: false,
    sources: [
      {
        domain: 'store.japan-zone.com',
        url: 'https://store.japan-zone.com/products.json?limit=250&page=1',
        products: 553,
        variantsWithGrams: 3462,
        verdict: 'usable',
        reason: 'distinct=119 (3.4%), top value 9%, multiples of 100: 8%. Traditional and work footwear (jika-tabi, tabi sneakers, setta) shipped worldwide. Values move per model (Marugo Air Jog V 6 = 830 g / V 12 = 1,010 g / III 6 = 730 g; Matsuri Jog 6 = 560 g / 12 = 760 g) and some move per size as well (Soukaido VO-80F 24 cm = 1,360 g up to 29 cm = 1,760 g, about +50 g per 0.5 cm). Packed weights, but they track the product, so adopted.',
      },
      {
        domain: 'japan-clothing.com',
        url: 'https://japan-clothing.com/products.json?limit=250&page=1',
        products: 1018,
        variantsWithGrams: 1979,
        verdict: 'usable',
        reason: 'distinct=58 (2.9%), top value 10%, multiples of 100: 44%. Nine casual sneaker models at 600 / 650 / 700 / 750 / 800 g, one value per model (n=197 variants). Values never move across sizes 36-43, so we read them as per-model weights without a shoebox, and adopted them.',
      },
      {
        domain: 'tabiji.co.jp',
        url: 'https://tabiji.co.jp/products.json?limit=250&page=1',
        products: 94,
        variantsWithGrams: 912,
        verdict: 'suspect',
        reason: 'distinct ratio 1.2%, multiples of 100: 63%, of 500: 28%. product_type \'tabi sneakers\' n=570, but the values are only two — 400 g (46%) and 500 g (45%) — and never move by size (all 30 products flat). Strong smell of a shipping band. It is 2x away from japan-zone\'s comparable 830 g, so it is recorded for reference only and not used in any line.',
      },
      {
        domain: 'nubiantokyo.com',
        url: 'https://nubiantokyo.com/products.json?limit=250&page=1',
        products: 5000,
        variantsWithGrams: 13986,
        verdict: 'suspect',
        reason: 'Suspect for the shop as a whole (distinct ratio 0.7%, multiples of 100: 99%), but within product_type \'Footwear\' n=2,360 the value 4,000 g covers 2,302 rows — 97.5%, flat across sizes, 390 of 393 products identical. For shoes it is pseudo, so not adopted. Recorded because it documents a major Japanese select shop billing all footwear in a flat 4 kg band.',
      },
      {
        domain: 'kickslab.com',
        url: 'https://kickslab.com/products.json?limit=250&page=1',
        products: 1519,
        variantsWithGrams: 20686,
        verdict: 'pseudo',
        reason: 'distinct=2, top value 99% of all rows. All 18,915 SNEAKER variants are 3,000 g, as are BOOTS, SANDALS and CAPS & HATS, and nothing moves by size. A flat shipping input, so not adopted.',
      },
      {
        domain: 'wormtokyo.com',
        url: 'https://wormtokyo.com/products.json?limit=250&page=1',
        products: 4588,
        variantsWithGrams: 4475,
        verdict: 'pseudo',
        reason: 'distinct=2, top value 100% of all rows. 4,474 of 4,475 variants are 1,000 g. A second-hand sneaker shop that does ship abroad, but grams is a pure constant, so not adopted.',
      },
      {
        domain: 'kinetics-tokyo.com',
        url: 'https://kinetics-tokyo.com/products.json?limit=250&page=1',
        products: 5000,
        variantsWithGrams: 31199,
        verdict: 'pseudo',
        reason: 'distinct=1, top value 100% of all rows. All 31,199 variants are 100 g, including 14,344 SHOES (MEN). A 100 g shoe is impossible, which is proof the field is not used for shipping. Not adopted.',
      },
      {
        domain: 'sousou.co.jp',
        url: 'https://sousou.co.jp/products.json?limit=250&page=1',
        products: 5000,
        variantsWithGrams: 15245,
        verdict: 'pseudo',
        reason: 'distinct=2, top value 100% of all rows. 15,238 rows are 600 g — jika-tabi (n=275), floor cushions and clothing alike. Not adopted.',
      },
      {
        domain: 'tabifootwear.com',
        url: 'https://tabifootwear.com/products.json?limit=250&page=1',
        products: 70,
        variantsWithGrams: 434,
        verdict: 'pseudo',
        reason: 'distinct=3, top value 94% of all rows. Hightops, Shoes, Sandals and Mules are all 400 g; only socks differ at 100/200 g. Not adopted.',
      },
      {
        domain: 'taiko-shop.com',
        url: 'https://taiko-shop.com/products.json?limit=250&page=1',
        products: 5000,
        variantsWithGrams: 6245,
        verdict: 'pseudo',
        reason: 'distinct=77, but the top value of 490 g covers 69% of all rows. A taiko drum shop that also sells tabi and ninja tabi; the values are packing-class constants. Not adopted.',
      },
      {
        domain: 'komarijp.com',
        url: 'https://komarijp.com/products.json?limit=250&page=1',
        products: 171,
        variantsWithGrams: 273,
        verdict: 'usable',
        reason: 'Usable for the shop as a whole (knives run 120-298 g and move like real measurements), but product_type \'Tabi shoes\' n=104 is a flat 500 g, so for footwear it is a constant. Not used for any line; kept as support for tabiji\'s 400/500 g band.',
      },
      {
        domain: 'japanesetaste.com',
        url: 'https://japanesetaste.com/products.json?limit=250&page=1',
        products: 5084,
        variantsWithGrams: 5156,
        verdict: 'usable',
        reason: 'distinct=1,010 (19.6%), so the grams are real, but there is no shoe or footwear product_type at all. Unusable for this category.',
      },
      {
        domain: 'kokorojapanstore.com',
        url: 'https://kokorojapanstore.com/products.json?limit=250&page=1',
        products: 2000,
        variantsWithGrams: 2138,
        verdict: 'usable',
        reason: 'distinct=343 (16.0%), so the grams are real, but there is no footwear product_type (Foot Patch is a foot-care sheet). Unusable for this category.',
      },
      {
        domain: 'mita-sneakers.co.jp',
        url: 'https://mita-sneakers.co.jp/products.json?limit=250&page=1',
        products: 5000,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'Shopify, but grams is 0 on every row (n=0, below our threshold of 50). Flat domestic shipping, so no weights are entered.',
      },
      {
        domain: 'uniontokyo.jp',
        url: 'https://uniontokyo.jp/products.json?limit=250&page=1',
        products: 500,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'Shopify, but grams is 0 on every row (n=0, below our threshold of 50).',
      },
      {
        domain: 'undefeated.jp',
        url: 'https://undefeated.jp/products.json?limit=250&page=1',
        products: 499,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'Shopify, but grams is 0 on every row (n=0, below our threshold of 50).',
      },
      {
        domain: 'snobasia.com',
        url: 'https://snobasia.com/products.json?limit=250&page=1',
        products: 250,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'Shopify and ships abroad, but grams is 0 on every row (n=0, below our threshold of 50).',
      },
      {
        domain: 'spingle.jp',
        url: 'https://spingle.jp/products.json?limit=250&page=1',
        products: 841,
        variantsWithGrams: 31,
        verdict: 'insufficient',
        reason: 'A domestic sneaker maker in Hiroshima. Shopify, but only 31 variants carry grams (n=31, below our threshold of 50).',
      },
      {
        domain: 'blueover.jp',
        url: 'https://blueover.jp/products.json?limit=250&page=1',
        products: 86,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'A domestic sneaker brand. Shopify, but grams is 0 on every row.',
      },
      {
        domain: 'corlection.com',
        url: 'https://corlection.com/products.json?limit=250&page=1',
        products: 1552,
        variantsWithGrams: 2,
        verdict: 'insufficient',
        reason: 'Shopify, but grams is 0 on almost every row (n=2, below our threshold of 50).',
      },
      {
        domain: 'shop.moonstar-usa.com',
        url: 'https://shop.moonstar-usa.com/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'Moonstar\'s North American arm. All 147 variants on page one have grams of 0, and it ships within the US rather than from Japan.',
      },
      {
        domain: 'www.atmos-tokyo.com',
        url: 'https://www.atmos-tokyo.com/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'HTTP 403 — the shop blocks automated requests, so products.json could not be read.',
      },
      {
        domain: 'abc-mart.net',
        url: 'https://abc-mart.net/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'HTTP 403 — not a Shopify store.',
      },
      {
        domain: 'fascinate-online.com',
        url: 'https://fascinate-online.com/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'products.json returns 404 — not a Shopify store.',
      },
      {
        domain: 'billys-tokyo.net',
        url: 'https://billys-tokyo.net/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'Returns a 404 HTML page — not a Shopify store.',
      },
      {
        domain: 'www.lowtex.jp',
        url: 'https://www.lowtex.jp/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'HTTP 404 — not a Shopify store.',
      },
      {
        domain: '1ldkshop.com',
        url: 'https://1ldkshop.com/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'products.json returns 404 — not a Shopify store.',
      },
      {
        domain: 'en.spingle.jp',
        url: 'https://en.spingle.jp/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'The same catalogue as spingle.jp, with grams almost all 0. Not counted separately to avoid double-counting.',
      },
      {
        domain: 'japantrendshop.com',
        url: 'https://japantrendshop.com/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'HTTP 403 — not a Shopify store.',
      },
      {
        domain: 'zenplus.jp',
        url: 'https://zenplus.jp/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'HTTP 403 — not a Shopify store.',
      },
    ],
    lines: [
      { id: 'safety-jikatabi', labelEn: 'Safety jika-tabi boots (steel toe / spike sole)', match: ['安全地下足袋', 'スパイク足袋', 'スパイク地下足袋', '鋼製先芯', '先芯入り地下足袋', '安全靴 足袋', 'spike tabi', 'steel-toe tabi'], medianG: 1760, p25: 1660, p75: 1960, n: 190, spread: 1.18, tier: 'estimate' },
      { id: 'tabi-sneaker-kids', labelEn: 'Kids tabi sneaker / kids jika-tabi', match: ['キッズ地下足袋', '子供用地下足袋', 'こども地下足袋', 'キッズ祭り足袋', 'kids jikatabi', 'kids tabi'], medianG: 360, p25: 360, p75: 360, n: 195, spread: 1, tier: 'estimate' },
      { id: 'tabi-sneaker', labelEn: 'Tabi sneaker / jika-tabi sneaker (adult)', match: ['足袋スニーカー', '地下足袋', 'エアジョグ', 'エアージョグ', 'スポーツジョグ', '丸五', 'マルゴ', 'ラフィート', 'jikatabi', 'jika-tabi', 'tabi sneaker', 'air jog', 'sports jog'], medianG: 830, p25: 760, p75: 910, n: 361, spread: 1.2, tier: 'estimate' },
      { id: 'work-tabi', labelEn: 'Work / festival jika-tabi (soft sole)', match: ['祭り足袋', '祭足袋', '作業足袋', '力王', '荘快堂', 'たびぐつ', 'rikio', 'soukaido'], medianG: 560, p25: 460, p75: 660, n: 743, spread: 1.43, tier: 'estimate' },
      { id: 'sneaker-casual', labelEn: 'Sneaker, casual / low-cut (shoes only, no box)', match: ['スニーカー', 'ローカット', 'ハイカット', 'キャンバススニーカー', 'sneaker', 'sneakers', 'trainers'], medianG: 750, p25: 700, p75: 750, n: 197, spread: 1.07, tier: 'unverified' },
    ],
    fallbackG: 750,
    fallbackTier: 'unverified',
    notes: 
      'Two shops adopted (store.japan-zone.com, japan-clothing.com) plus one for reference (tabiji.co.jp). The lines are evaluated top to bottom — jika-tabi must be tested before the generic sneaker line, or it is swallowed by it.\n'
      + '\n'
      + 'The biggest limitation: we could not obtain real weights for ordinary athletic shoes — Nike, Adidas, New Balance and the like. More than ten specialists were probed, and every one that fills in grams bills footwear in a flat band: kickslab 3,000 g on all rows, nubiantokyo 4,000 g on 97.5% of Footwear, wormtokyo 1,000 g on all rows, kinetics-tokyo 100 g on all rows, sousou 600 g on all rows. All score pseudo, so none of their numbers were used. mita-sneakers, undefeated.jp, uniontokyo, spingle and blueover are Shopify but leave grams at 0, because flat domestic postage means the field is never needed. atmos and ABC-MART return 403, so products.json cannot be read at all.\n'
      + '\n'
      + 'Does grams move across size variants? That was the question for this category.\n'
      + '(1) Overwhelmingly, no. japan-clothing\'s sneakers are identical from size 36 to 43 across all nine models; tabiji\'s tabi sneakers are flat across all 30 products; kickslab, nubian, wormtokyo and kinetics do not even move between products.\n'
      + '(2) The exception is part of store.japan-zone.com\'s work footwear. Soukaido VO-80F runs 1,360 g at 24 cm to 1,760 g at 29 cm — about +50 g per half size, 1.29x end to end — and Toraichi Magic Long Safety Boots run 1,980 g at 24.5 cm to 2,280 g at 27 cm. Only 4 of 105 footwear products move with size.\n'
      + '(3) In practice one weight per product is a fair model, but whether that weight includes the shoebox differs from shop to shop.\n'
      + '\n'
      + 'Boxed or unboxed:\n'
      + '(4) japan-clothing\'s 600-800 g is the true weight of one canvas sneaker with no shoebox (a box adds roughly 250-500 g). kickslab\'s 3,000 g and nubiantokyo\'s 4,000 g are bands that assume box, outer carton and headroom. The same word "sneaker" spans 750 g to 4,000 g — a factor of 5.3. Auction listings usually ship with the box, so fallbackG 750 will understate a boxed listing, which is why fallbackTier is unverified.\n'
      + '(5) sneaker-casual\'s n=197 counts variants; there are really only nine models and five distinct weights behind it. Statistically thin.\n'
      + '\n'
      + 'Other notes:\n'
      + '(6) tabi-sneaker takes japan-zone\'s 830 g. tabiji.co.jp puts the same kind of shoe at 400/500 g, a 2x disagreement, but tabiji has only two bands and scores suspect, so japan-zone wins. komarijp.com\'s Tabi shoes are a flat 500 g, which supports tabiji\'s side, but both are constants and neither was used numerically.\n'
      + '(7) japan-zone is a specialist in traditional and work footwear and does not stock ordinary athletic shoes. The safety-jikatabi, work-tabi and tabi-sneaker lines rest on this one shop with no independent corroboration.\n'
      + '(8) None of these grams are measurements; they are inputs to a shipping calculator. Hence measured: false.',
  },
  {
    category: 'food-tea-sake',
    labelEn: 'Food, tea and sake',
    labelJa: '食品・茶・酒',
    checkedOn: '2026-09-06',
    measured: false,
    sources: [
      {
        domain: 'www.saketora.com',
        url: 'https://www.saketora.com/products.json?limit=250&page=1',
        products: 5000,
        variantsWithGrams: 4955,
        verdict: 'usable',
        reason: 'distinct=929 (18.7%), top value 2%, multiples of 100: 17%. Adopted. Sake specialist; product_type splits into sake / shochu / beer / wine / whisky / umeshu, and bottle size appears in the title, so 720 ml, 1800 ml and 300 ml could be separated.',
      },
      {
        domain: 'japanesetaste.com',
        url: 'https://japanesetaste.com/products.json?limit=250&page=1',
        products: 5000,
        variantsWithGrams: 5070,
        verdict: 'usable',
        reason: 'distinct=1010 (19.9%), top value 1%, multiples of 100: 2%. Adopted. A 20% distinct ratio is the best of everything we probed. product_type is hierarchical (\'grocery / food / sauces & condiments\'), so food can be isolated.',
      },
      {
        domain: 'www.sugoimart.com',
        url: 'https://www.sugoimart.com/products.json?limit=250&page=1',
        products: 5000,
        variantsWithGrams: 4988,
        verdict: 'usable',
        reason: 'distinct=408 (8.2%), top value 4%, multiples of 100: 6%. Adopted. Mostly small single items (convenience-store snacks, cup noodles); it supplied the bulk of the snack line.',
      },
      {
        domain: 'bokksumarket.com',
        url: 'https://bokksumarket.com/products.json?limit=250&page=1',
        products: 638,
        variantsWithGrams: 595,
        verdict: 'usable',
        reason: 'distinct=146 (24.5%), top value 6%, multiples of 100: 3%. Adopted. Snacks n=425, median 91 g — independently consistent with sugoimart\'s 70 g.',
      },
      {
        domain: 'www.japanesegreenteashops.com',
        url: 'https://www.japanesegreenteashops.com/products.json?limit=250&page=1',
        products: 507,
        variantsWithGrams: 507,
        verdict: 'usable',
        reason: 'distinct=109 (21.5%), top value 7%, multiples of 100: 6%. Adopted. Tea n=125, median 125 g, spread 1.7x.',
      },
      {
        domain: 'www.akazuki.com',
        url: 'https://www.akazuki.com/products.json?limit=250&page=1',
        products: 1000,
        variantsWithGrams: 1802,
        verdict: 'usable',
        reason: 'distinct=60 (3.3%), top value 15%, multiples of 100: 69%. Adopted but weighted lightly: values cluster on 100 / 300 / 500, so it reads closer to suspect than the verdict suggests. Only product_type=\'food\' (n=119) is food; the rest is tableware and homeware.',
      },
      {
        domain: 'global.fukujuen.com',
        url: 'https://global.fukujuen.com/products.json?limit=250&page=1',
        products: 82,
        variantsWithGrams: 88,
        verdict: 'usable',
        reason: 'distinct=20 (22.7%), top value 16%, multiples of 100: 10%. Adopted. Fukujuen of Kyoto, tea only. Tea n=79, median 120 g.',
      },
      {
        domain: 'ippodotea.com',
        url: 'https://ippodotea.com/products.json?limit=250&page=1',
        products: 82,
        variantsWithGrams: 81,
        verdict: 'usable',
        reason: 'distinct=46 (56.8%), top value 9%, multiples of 100: 0%. Adopted. A 57% distinct ratio is the highest of any shop. Tea n=65, median 88 g.',
      },
      {
        domain: 'www.chadoteahouse.com',
        url: 'https://www.chadoteahouse.com/products.json?limit=250&page=1',
        products: 76,
        variantsWithGrams: 75,
        verdict: 'usable',
        reason: 'distinct=25 (33.3%), top value 23%, multiples of 100: 13%. Adopted. Tea n=70, median 110 g, spread 1.4x.',
      },
      {
        domain: 'www.japanesegreenteain.com',
        url: 'https://www.japanesegreenteain.com/products.json?limit=250&page=1',
        products: 38,
        variantsWithGrams: 54,
        verdict: 'usable',
        reason: 'distinct=36 (66.7%), top value 9%, multiples of 100: 0%. Adopted. Small sample, but tea n=43 with median 109 g agrees with the other tea specialists.',
      },
      {
        domain: 'www.kurashu.jp',
        url: 'https://www.kurashu.jp/products.json?limit=250&page=1',
        products: 44,
        variantsWithGrams: 66,
        verdict: 'usable',
        reason: 'distinct=24 (36.4%), top value 21%, multiples of 100: 62%. Adopted. Unlike saketora the bottle size sits in the variant title. 720 ml n=37 has median 1,890 g — heavier than saketora, which marks the upper end of shop-to-shop variation.',
      },
      {
        domain: 'wabisabi-store.jp',
        url: 'https://wabisabi-store.jp/products.json?limit=250&page=1',
        products: 212,
        variantsWithGrams: 440,
        verdict: 'usable',
        reason: 'distinct=74 (16.8%), top value 10%, multiples of 100: 31%. The shop itself is usable, but despite surfacing as a seasoning shop its stock is mostly cosmetics, parasols and school bags, with almost no food rows. Not used for any line.',
      },
      {
        domain: 'www.tippsysake.com',
        url: 'https://www.tippsysake.com/products.json?limit=250&page=1',
        products: 914,
        variantsWithGrams: 913,
        verdict: 'pseudo',
        reason: 'distinct=92, top value 73% of all rows. Not adopted: 662 of 913 are exactly 1,361 g, which is 3 lb — a constant. It does corroborate the total weight of one 720 ml bottle, since 1,361 g is close to saketora\'s 1,400 g median.',
      },
      {
        domain: 'jsake.com',
        url: 'https://jsake.com/products.json?limit=250&page=1',
        products: 142,
        variantsWithGrams: 140,
        verdict: 'pseudo',
        reason: 'distinct=8, top value 66% of all rows. Not adopted: only eight distinct values, which is a shipping band table.',
      },
      {
        domain: 'japanesegreenteaonline.com',
        url: 'https://japanesegreenteaonline.com/products.json?limit=250&page=1',
        products: 8,
        variantsWithGrams: 8,
        verdict: 'insufficient',
        reason: 'Only n=8 weighted rows, below our threshold of 50.',
      },
      {
        domain: 'ujimatchatea.com',
        url: 'https://ujimatchatea.com/products.json?limit=250&page=1',
        products: 23,
        variantsWithGrams: 24,
        verdict: 'insufficient',
        reason: 'n=24 < 50',
      },
      {
        domain: 'www.o-cha.com',
        url: 'https://www.o-cha.com/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'Not a Shopify store; products.json returns HTTP 404.',
      },
      {
        domain: 'www.hibiki-an.com',
        url: 'https://www.hibiki-an.com/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'Not a Shopify store; products.json returns HTTP 404.',
      },
      {
        domain: 'ikkyu-tea.com',
        url: 'https://ikkyu-tea.com/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'Not a Shopify store; products.json returns HTTP 404.',
      },
      {
        domain: 'www.plazajapan.com',
        url: 'https://www.plazajapan.com/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'Not a Shopify store; products.json returns HTTP 404.',
      },
      {
        domain: 'japan-snack.com',
        url: 'https://japan-snack.com/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'Not a Shopify store; products.json returns HTTP 404.',
      },
      {
        domain: 'the-nihonshu.com',
        url: 'https://the-nihonshu.com/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'Not a Shopify store; products.json returns HTTP 404.',
      },
      {
        domain: 'sakeyoi.com',
        url: 'https://sakeyoi.com/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'products.json returns HTML (content-type: text/html), so nothing could be read.',
      },
      {
        domain: 'nipponsake.com',
        url: 'https://nipponsake.com/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'products.json returns HTML (content-type: text/html), so nothing could be read.',
      },
      {
        domain: 'sakeinn.com',
        url: 'https://sakeinn.com/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'fetch failed on two attempts — could not connect.',
      },
    ],
    lines: [
      { id: 'sake-1800ml', labelEn: 'Sake / shochu, 1.8L bottle (isshobin)', match: ['1800ml', '1,800ml', '1.8l', '1800ｍｌ', '一升瓶', '一升'], medianG: 3300, p25: 2200, p75: 3355, n: 583, spread: 1.52, tier: 'estimate' },
      { id: 'sake-720ml', labelEn: 'Sake / spirits, 700-750ml bottle', match: ['720ml', '750ml', '700ml', '720ｍｌ', '四合瓶', '四合'], medianG: 1420, p25: 1320, p75: 1540, n: 1754, spread: 1.17, tier: 'estimate' },
      { id: 'sake-300ml', labelEn: 'Sake, 300ml bottle', match: ['300ml', '300ｍｌ', 'カップ酒'], medianG: 607, p25: 459, p75: 688, n: 335, spread: 1.5, tier: 'estimate' },
      { id: 'noodle', labelEn: 'Instant and dried noodles', match: ['ラーメン', 'ramen', 'うどん', 'udon', '焼きそば', 'yakisoba', 'カップ麺', 'instant noodle', 'そうめん', 'somen', 'そば', 'soba'], medianG: 122, p25: 89, p75: 208, n: 349, spread: 2.34, tier: 'estimate' },
      { id: 'snack-sweets', labelEn: 'Snacks, sweets and candy', match: ['せんべい', 'senbei', 'rice cracker', 'クッキー', 'cookie', 'チョコレート', 'chocolate', 'キャンディ', 'candy', 'グミ', 'gummy', '餅', 'mochi', 'ポッキー', 'pocky', 'kit kat', 'kitkat', 'ポテトチップス', 'chips', 'スナック', 'snack', 'キャラメル', 'caramel', 'どら焼き', 'dorayaki', '最中', 'monaka', '羊羹', 'yokan', '饅頭', 'manju', '大福', 'daifuku', '駄菓子'], medianG: 90, p25: 58, p75: 180, n: 2837, spread: 3.1, tier: 'estimate' },
      { id: 'seasoning-bottle', labelEn: 'Bottled seasoning (soy sauce, ponzu, mirin)', match: ['醤油', 'soy sauce', 'shoyu', 'ポン酢', 'ponzu', 'みりん', 'mirin', 'めんつゆ', 'tsuyu', 'ドレッシング', 'dressing', 'ごま油', 'sesame oil', '米酢', 'rice vinegar'], medianG: 484, p25: 299, p75: 777, n: 186, spread: 2.6, tier: 'estimate' },
      { id: 'tea-leaf', labelEn: 'Japanese tea (leaf, matcha, tea bags)', match: ['抹茶', 'matcha', '煎茶', 'sencha', '玉露', 'gyokuro', 'ほうじ茶', 'hojicha', 'houjicha', '玄米茶', 'genmaicha', '番茶', 'bancha', '茎茶', 'kukicha', 'green tea', '茶葉', 'ティーバッグ', 'tea bag', 'teabag'], medianG: 113, p25: 75, p75: 198, n: 631, spread: 2.64, tier: 'estimate' },
    ],
    fallbackG: 190,
    fallbackTier: 'estimate',
    notes: 
      'Eleven shops adopted (saketora, japanesetaste, sugoimart, bokksumarket, japanesegreenteashops, akazuki, fukujuen, ippodotea, chadoteahouse, japanesegreenteain, kurashu), all with verdict usable. grams is an input to a shipping calculator, not a measurement, so measured: false. Every shop we could reach allowed /products.json for User-agent: * in robots.txt.\n'
      + '\n'
      + 'Sake came out cleanest. Bottle size is in the product title, so cutting on it gives one 720 ml bottle a median of 1,420 g with a spread of 1.17x — the tightest line after 1/7 scale figures (1.0x), tight enough to treat as effectively settled. It corroborates independently: the rejected tippsysake.com has 662 of 913 rows at exactly 1,361 g, which is 3 lb and almost the same figure. It also decomposes sensibly — 720 g of liquid plus roughly 700 g of bottle, label and presentation box. A 1.8 L isshobin is 3,300 g.\n'
      + '\n'
      + 'Two traps in the sake data. First, some saketora rows have grams equal to the volume in ml (62 rows, 3.5% of 720 ml) — the bottle\'s own weight was left out. That does not move the median, but treat any 720 ml under 1,000 g as suspect. Second, most of saketora\'s stock is case packs ([1CS] 6 bottles, [2CS] 12 bottles); we read the bottle count from the title and divided back to one bottle. Without that the median would be 4,620 g. kurashu.jp\'s 720 ml median is 1,890 g, 33% heavier than saketora — that is the ceiling of shop-to-shop variation, and it is what a shop that packs heavily for export looks like.\n'
      + '\n'
      + 'Alcohol cannot be posted to some countries. Japan Post accepts alcoholic drinks but treats them as prohibited depending on the destination: anything over 24% ABV is barred outright as dangerous goods by air, and many destinations bar it below that too (the United States effectively bars alcohol sent to an individual; Australia, New Zealand and several Middle Eastern countries also bar it). For sake-1800ml, sake-720ml and sake-300ml the weight can be produced but the shipment may not be possible at all, so an estimate screen has to answer "can this go?" before it answers "what does it weigh?".\n'
      + '\n'
      + 'On the food side, snacks split by what each shop stocks: sugoimart 70 g, bokksumarket 91 g, japanesegreenteashops 115 g, japanesetaste 240 g, akazuki 300 g. The first two sell single convenience-store bags; the last two sell boxed gift confectionery. The pooled 90 g is pulled toward the first group, and the 3.1x spread reflects exactly that — this line is less dependable than the others.\n'
      + '\n'
      + 'Tea did the opposite: seven shops agreed independently (ippodotea 88 g, japanesegreenteain 109 g, chadoteahouse 110 g, japanesetaste 111 g, fukujuen 120 g, japanesegreenteashops 125 g, sugoimart 141 g). That is the standard Japanese 100 g tin or pouch showing through. The 113 g median can be trusted.\n'
      + '\n'
      + 'Bottled seasoning is thin at n=186 and spans 1 L soy sauce down to 100 ml yuzu kosho, hence the 2.6x spread.\n'
      + '\n'
      + 'Match order is sake-1800ml, sake-720ml, sake-300ml, noodle, snack-sweets, seasoning-bottle, tea-leaf. Two reasons: a volume in the title is stronger evidence than any other word, so sake is tested first; and "soy sauce senbei" is a snack rather than a seasoning while "matcha chocolate" is a snack rather than tea, so snack-sweets must come before seasoning-bottle and tea-leaf.\n'
      + '\n'
      + 'Limits. The Japanese match words are unverified by this survey: every adopted shop titles its products in English, and the Japanese terms were mapped by hand onto lines that were matched in English. Their hit rate against Japanese auction titles still needs checking. Short words that misfire were left out; \'cd\' is an example of one we refused. Chilled, frozen and fresh goods are absent entirely, because Shopify shops that export from Japan stock only ambient goods — fresh fish, wagyu and namagashi cannot be reached by this method at all. fallbackG 190 is the rounded 188 g median of the 2,061 food rows in adopted shops that matched no line.',
  },
  {
    category: 'fishing-tackle',
    labelEn: 'Fishing tackle',
    labelJa: '釣具',
    checkedOn: '2026-09-06',
    measured: false,
    sources: [
      {
        domain: 'asianportal-fishing.com',
        url: 'https://asianportal-fishing.com/products.json?limit=250&page=1',
        products: 5000,
        variantsWithGrams: 4999,
        verdict: 'usable',
        reason: 'distinct=198 (4.0%), top value 15%, multiples of 100: 19%. product_type is sorted into lures / rods / reels / line. Rod values fall as the number of sections rises (1-piece 9,780 g > 2-piece 6,660 g > 5-piece 2,560 g), so we read them as volumetric weight from packed length rather than mass, and adopted them on that basis.',
      },
      {
        domain: 'jdmreelhub.com',
        url: 'https://jdmreelhub.com/products.json?limit=250&page=1',
        products: 1298,
        variantsWithGrams: 1091,
        verdict: 'usable',
        reason: 'distinct=29 (2.7%), top value 34%, multiples of 100: 98%. Reels only. Values sit on 100 g packing bands but move per model, and the bands separate: electric reels 1,400 g, spinning and baitcasting 600 g.',
      },
      {
        domain: 'jdmtackleheaven.com',
        url: 'https://jdmtackleheaven.com/products.json?limit=250&page=1',
        products: 5000,
        variantsWithGrams: 9669,
        verdict: 'usable',
        reason: 'distinct=244 (2.5%), top value 7%, multiples of 100: 6%. Lures adopted. 760 rod entries carried 1,000,970 g and 3,199,970 g (1 t and 3.2 t) — a size limit stuffed into the weight field — so everything above 30,000 g was dropped.',
      },
      {
        domain: 'jpnfishingtackle.com',
        url: 'https://jpnfishingtackle.com/products.json?limit=250&page=1',
        products: 5000,
        variantsWithGrams: 6535,
        verdict: 'suspect',
        reason: 'distinct ratio 1.1%, multiples of 100: 0%. Median 13 g, most common 14 g / 7 g / 21 g — these are lure masses (1/2 oz, 1/4 oz), not shipping weights. Not adopted: the same crankbait is 67-100 g packed at other shops.',
      },
      {
        domain: 'japamart.com',
        url: 'https://japamart.com/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'products.json returns 404 — not a Shopify store.',
      },
      {
        domain: 'www.ichibantackle.com',
        url: 'https://www.ichibantackle.com/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'HTTP 403 — not a Shopify store.',
      },
      {
        domain: 'japantackle.com',
        url: 'https://japantackle.com/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'products.json returns 404 — not a Shopify store.',
      },
      {
        domain: 'www.kkjapanlure.com',
        url: 'https://www.kkjapanlure.com/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'products.json returns 404 — not a Shopify store.',
      },
      {
        domain: 'www.plat.co.jp',
        url: 'https://www.plat.co.jp/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'Could not connect.',
      },
      {
        domain: 'www.fishing-otsuka.co.jp',
        url: 'https://www.fishing-otsuka.co.jp/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'HTTP 403 — not a Shopify store.',
      },
      {
        domain: 'japanlureshop.com',
        url: 'https://japanlureshop.com/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'products.json returns 404 — not a Shopify store.',
      },
      {
        domain: 'www.digitaka.com',
        url: 'https://www.digitaka.com/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'Redirects (302) and never returns JSON.',
      },
      {
        domain: 'www.itacklesjapan.com',
        url: 'https://www.itacklesjapan.com/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'products.json returns 404 — not a Shopify store.',
      },
      {
        domain: 'jdmbasstackle.com',
        url: 'https://jdmbasstackle.com/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'products.json returns 404 — not a Shopify store.',
      },
      {
        domain: 'northonetackle.com',
        url: 'https://northonetackle.com/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'Could not connect.',
      },
    ],
    lines: [
      { id: 'electric-reel', labelEn: 'Electric reel', match: ['電動リール', 'electric reel', 'シーボーグ', 'フォースマスター', 'ビーストマスター', 'seaborg', 'forcemaster', 'beastmaster'], medianG: 1400, p25: 1200, p75: 1800, n: 75, spread: 1.5, tier: 'estimate' },
      { id: 'rod-1piece', labelEn: 'Rod, 1-piece', match: ['1ピース', '1 piece', 'ワンピースロッド'], medianG: 9780, p25: 9630, p75: 10520, n: 55, spread: 1.09, tier: 'estimate' },
      { id: 'rod-2piece', labelEn: 'Rod, 2-piece', match: ['2ピース', '2本継', '2 piece'], medianG: 6660, p25: 5480, p75: 7680, n: 498, spread: 1.4, tier: 'estimate' },
      { id: 'rod-multipiece', labelEn: 'Rod, 3-piece or more / telescopic', match: ['3ピース', '4ピース', '5ピース', '3本継', '4本継', '振出', 'パックロッド', 'モバイルロッド', '3 piece', '4 piece', '5 piece', 'telescopic'], medianG: 5890, p25: 3790, p75: 6250, n: 104, spread: 1.65, tier: 'estimate' },
      { id: 'rod', labelEn: 'Rod (piece count unknown)', match: ['ロッド', '釣竿', 'つりざお', 'fishing rod'], medianG: 6660, p25: 5480, p75: 8040, n: 657, spread: 1.47, tier: 'estimate' },
      { id: 'spinning-reel', labelEn: 'Spinning reel', match: ['スピニングリール', 'spinning reel', 'ステラ', 'ヴァンキッシュ', 'イグジスト', 'stella', 'vanquish', 'exist'], medianG: 770, p25: 600, p75: 800, n: 821, spread: 1.33, tier: 'estimate' },
      { id: 'baitcasting-reel', labelEn: 'Baitcasting / conventional reel', match: ['ベイトリール', '両軸リール', '両軸受リール', 'baitcasting reel', 'baitcast reel', 'アンタレス', 'メタニウム', 'antares', 'metanium'], medianG: 600, p25: 600, p75: 770, n: 792, spread: 1.28, tier: 'estimate' },
      { id: 'reel', labelEn: 'Reel (type unknown)', match: ['リール', 'reel'], medianG: 700, p25: 600, p75: 800, n: 1613, spread: 1.33, tier: 'estimate' },
      { id: 'squid-jig', labelEn: 'Squid jig / tai rubber', match: ['エギング', 'エギ', '餌木', 'タイラバ', '鯛ラバ', 'スッテ', 'squid jig', 'tai rubber'], medianG: 140, p25: 100, p75: 144, n: 154, spread: 1.44, tier: 'estimate' },
      { id: 'metal-jig', labelEn: 'Metal jig', match: ['メタルジグ', 'metal jig', 'ジギング', 'jigging'], medianG: 73, p25: 50, p75: 120, n: 342, spread: 2.4, tier: 'estimate' },
      { id: 'jig-head', labelEn: 'Jig head / rubber jig', match: ['ジグヘッド', 'ラバージグ', 'jig head', 'jighead', 'rubber jig'], medianG: 100, p25: 20, p75: 140, n: 617, spread: 7, tier: 'unverified' },
      { id: 'soft-bait', labelEn: 'Soft bait / worm', match: ['ワーム', 'ソフトベイト', 'ソフトルアー', 'soft bait', 'softbait', 'worm'], medianG: 166, p25: 58, p75: 250, n: 1180, spread: 4.31, tier: 'estimate' },
      { id: 'hard-lure', labelEn: 'Hard lure (minnow, crank, spoon, topwater)', match: ['ミノー', 'クランクベイト', 'バイブレーション', 'ポッパー', 'スピナー', 'トップウォーター', 'ルアー', 'minnow', 'crankbait', 'popper', 'swimbait', 'topwater', 'hard lure'], medianG: 80, p25: 50, p75: 125, n: 8111, spread: 2.5, tier: 'estimate' },
      { id: 'fishing-line', labelEn: 'Fishing line', match: ['peライン', 'フロロカーボン', 'ナイロンライン', 'エステルライン', '釣り糸', '道糸', 'pe line', 'fishing line'], medianG: 87, p25: 30, p75: 168, n: 390, spread: 5.6, tier: 'unverified' },
      { id: 'terminal-tackle', labelEn: 'Terminal tackle and small accessories', match: ['釣り針', 'シンカー', 'オモリ', 'スイベル', 'sinker', 'swivel', 'terminal tackle'], medianG: 30, p25: 30, p75: 40, n: 732, spread: 1.33, tier: 'estimate' },
    ],
    fallbackG: 100,
    fallbackTier: 'estimate',
    notes: 
      'Three shops adopted, 14,999 variants (after dropping 760 pseudo rows above 30,000 g). The lines are evaluated top to bottom — rods must be tested before squid jigs, or an "eging rod" is caught by squid-jig. Classification uses each shop\'s own product_type: the shop\'s own category misfires far less often than words in the title.\n'
      + '\n'
      + 'Limits that matter:\n'
      + '\n'
      + '(1) None of these grams are measurements. They are packing classes — jdmreelhub is on 100 g steps for 98% of rows, and every line item at asianportal is 30 g. Hence measured: false.\n'
      + '\n'
      + '(2) Rods come from asianportal only. Its values fall as the number of sections rises (1-piece 9,780 g, 2-piece 6,660 g, 3-piece and up 5,890 g, 5-piece 2,560 g), so this is volumetric weight from packed length, not mass — a 4\'8" ultralight trout rod carries 3,790 g. Since a rod\'s international shipping cost is driven by length rather than mass, that figure actually suits a cost estimate better. jdmtackleheaven puts 1,220 g on the same rod, close to true mass; the two shops disagree by 5.5x, and which one you take changes the postage a lot.\n'
      + '\n'
      + '(3) A rod hits a size limit before it hits a weight step. EMS caps length at 1.5 m and length plus girth at 3 m, so a one-piece rod (usually over 2 m) cannot go by EMS at all, and even a two-piece packs to 1.3-1.6 m, into courier long-parcel surcharge territory. Estimating a rod by weight alone will always be wrong, so the screen should say a rod is not decided by a weight step.\n'
      + '\n'
      + '(4) Hard lures disagree between shops (asianportal 120 g, jdmtackleheaven 56 g), most likely blister pack versus carded packaging. The pooled median of 80 g is only the midpoint.\n'
      + '\n'
      + '(5) jpnfishingtackle.com puts the lure\'s own mass in grams (14 g and so on), not a shipping weight, so it was rejected. Adopting its 13 g median would understate postage badly.\n'
      + '\n'
      + '(6) fallbackG 100 is the median across all three adopted shops, but their catalogues are lure-heavy, so it skews small. If a rod or reel fails to match a line, it will understate badly.\n'
      + '\n'
      + '(7) Landing nets (median 10,970 g, n=7) had too few rows to make a line.',
  },
  {
    category: 'sports-goods',
    labelEn: 'Sports equipment',
    labelJa: 'スポーツ用品',
    checkedOn: '2026-09-06',
    measured: false,
    sources: [
      {
        domain: 'tozandoshop.com',
        url: 'https://tozandoshop.com/products.json?limit=250&page=1',
        products: 1160,
        variantsWithGrams: 4917,
        verdict: 'suspect',
        reason: 'distinct ratio 0.9%, multiples of 100: 98%, of 500: 78%. Tozando of Kyoto, export storefront. product_type separates men / kote / do / tare / bogu set / hakama / shinai / bokuto / iaito / yumi, which makes the product lines easy to cut. Values sit on 500 g packing steps, but the steps differ per item (yumi 7,000 g, bogu set 5,000 g, men 2,500 g, tare 1,500 g, tenugui 100 g), so adopted.',
      },
      {
        domain: 'www.seidoshop.com',
        url: 'https://www.seidoshop.com/products.json?limit=250&page=1',
        products: 675,
        variantsWithGrams: 4199,
        verdict: 'suspect',
        reason: 'distinct ratio 0.7%, multiples of 100: 52%, of 500: 26%. Aikido and koryu budo, shipped from Japan. 1,800 rows are embroidery, crest and alteration services — all 10 g, not products — and were excluded. The rest is uniforms, hakama, obi and bokuto, and its steps agree with Tozando\'s.',
      },
      {
        domain: 'kendostar.com',
        url: 'https://kendostar.com/products.json?limit=250&page=1',
        products: 486,
        variantsWithGrams: 131,
        verdict: 'suspect',
        reason: 'distinct ratio 6.1%, multiples of 100: 100%, of 500: 87%. Only 131 of 486 products carry grams. Small, but bogu 4,000 g and shinai 3,000 g are close to Tozando\'s steps, so it was adopted to add sample size for shinai and bogu sets.',
      },
      {
        domain: 'www.kendo.co.jp',
        url: 'https://www.kendo.co.jp/products.json?limit=250&page=1',
        products: 461,
        variantsWithGrams: 2528,
        verdict: 'suspect',
        reason: 'The script scores this suspect, but it is not adopted. Shinai carry 200,000 g (200 kg) and bogu sets 600,000 g — a factor of 1,000 out, as if a price or another unit were typed into the weight field. The maximum is 5,000,000 g. The ratios between items look right, but the absolute values are unusable.',
      },
      {
        domain: 'japangolfclubs.com',
        url: 'https://japangolfclubs.com/products.json?limit=250&page=1',
        products: 5000,
        variantsWithGrams: 2592,
        verdict: 'pseudo',
        reason: 'distinct=9, top value 78% of all rows. Drivers and iron sets alike are fixed at 2,268 g (5 lb). A flat packing class in pounds, with no difference between club types.',
      },
      {
        domain: 'golfpartnerusa.com',
        url: 'https://golfpartnerusa.com/products.json?limit=250&page=1',
        products: 4944,
        variantsWithGrams: 45,
        verdict: 'insufficient',
        reason: 'Only 45 of 4,944 products carry grams, and all of them are 1,361 g (3 lb). Below n=50 to judge, and pseudo anyway.',
      },
      {
        domain: 'japangolfimport.com',
        url: 'https://japangolfimport.com/products.json?limit=250&page=1',
        products: 2,
        variantsWithGrams: 72,
        verdict: 'pseudo',
        reason: 'distinct=1, all rows 4,000 g. Effectively two products (variations of one custom iron).',
      },
      {
        domain: 'taiwanbaseball.com.tw',
        url: 'https://taiwanbaseball.com.tw/products.json?limit=250&page=1',
        products: 156,
        variantsWithGrams: 168,
        verdict: 'pseudo',
        reason: 'distinct=4, top value 91%. A Taiwanese shop that ships Japanese brands (ZETT, SSK, Hi-Gold) worldwide. Gloves, mitts and protective gear are all fixed at 1,000 g, and it is not a Japanese shop, so not adopted.',
      },
      {
        domain: 'ballgloveblueprint.com',
        url: 'https://ballgloveblueprint.com/products.json?limit=250&page=1',
        products: 114,
        variantsWithGrams: 133,
        verdict: 'pseudo',
        reason: 'distinct=2, top value 99%. Sells Japanese gloves (ATOMS, Wagyu-JB) but is a US shop. Every row is 907 g (2 lb).',
      },
      {
        domain: 'japan-ballpark.com',
        url: 'https://japan-ballpark.com/products.json?limit=250&page=1',
        products: 250,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'Shopify returns JSON, but grams is 0 on every row — no weights entered.',
      },
      {
        domain: 'katanajp.co',
        url: 'https://katanajp.co/products.json?limit=250&page=1',
        products: 72,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'A hard-ball glove maker in Osaka. Shopify, but grams is 0 on every row.',
      },
      {
        domain: 'en.kyujisensei.com',
        url: 'https://en.kyujisensei.com/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'products.json returns 404 — not a Shopify store. A second-hand baseball shop in Osaka.',
      },
      {
        domain: 'www.yabaibaseball.com',
        url: 'https://www.yabaibaseball.com/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'HTTP 400 — not a Shopify store.',
      },
      {
        domain: 'www.hatakeyama-jp.com',
        url: 'https://www.hatakeyama-jp.com/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'HTTP 404 — not a Shopify store.',
      },
      {
        domain: 'sskbaseballshop.com',
        url: 'https://sskbaseballshop.com/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'HTTP 404 — not a Shopify store.',
      },
      {
        domain: 'www.kozuji.com',
        url: 'https://www.kozuji.com/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'HTTP 403 — the shop blocks automated requests.',
      },
      {
        domain: 'www.nishohi.com',
        url: 'https://www.nishohi.com/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'HTTP 403 — the shop blocks automated requests.',
      },
      {
        domain: 'www.tourspecgolf.com',
        url: 'https://www.tourspecgolf.com/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'HTTP 404 — not a Shopify store.',
      },
      {
        domain: 'shop.golfdigest.co.jp',
        url: 'https://shop.golfdigest.co.jp/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'HTTP 403 — not a Shopify store.',
      },
      {
        domain: 'japansoccer-jersey.com',
        url: 'https://japansoccer-jersey.com/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'HTTP 404 — not a Shopify store. Ships J.League kit worldwide.',
      },
      {
        domain: 'footballshop-fcfa.com',
        url: 'https://footballshop-fcfa.com/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'Could not connect — not a Shopify store.',
      },
      {
        domain: 'www.sports-ws.com',
        url: 'https://www.sports-ws.com/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'HTTP 404 — not a Shopify store.',
      },
      {
        domain: 'zennihonbudougu.com',
        url: 'https://zennihonbudougu.com/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'HTTP 404 — not a Shopify store.',
      },
      {
        domain: 'www.e-bogu.jp',
        url: 'https://www.e-bogu.jp/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'HTTP 404 — not a Shopify store.',
      },
      {
        domain: 'www.f-budogu.jp',
        url: 'https://www.f-budogu.jp/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'HTTP 404 — not a Shopify store.',
      },
      {
        domain: 'kendoshop.com',
        url: 'https://kendoshop.com/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'HTTP 404 — not a Shopify store.',
      },
      {
        domain: 'tanabesports.net',
        url: 'https://tanabesports.net/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'HTTP 403 — the shop blocks automated requests.',
      },
      {
        domain: 'jpn.mizuno.com',
        url: 'https://jpn.mizuno.com/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'HTTP 404 — not a Shopify store.',
      },
      {
        domain: 'www.himaraya.co.jp',
        url: 'https://www.himaraya.co.jp/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'HTTP 403 — not a Shopify store.',
      },
    ],
    lines: [
      { id: 'budo-bag', labelEn: 'Bogu bag / shinai bag / weapon case', match: ['防具袋', '防具バッグ', '竹刀袋', '木刀袋', '刀袋', 'bogu bag', 'shinai bag'], medianG: 800, p25: 500, p75: 1500, n: 156, spread: 3, tier: 'unverified' },
      { id: 'budo-small-parts', labelEn: 'Small parts and accessories (tenugui, tsuba, sageo, himo)', match: ['手ぬぐい', '手拭い', '面手ぬぐい', '面紐', '胴紐', '乳革', '下緒', '鍔', '柄糸', '目貫', 'tenugui', 'tsuba', 'sageo'], medianG: 200, p25: 100, p75: 200, n: 1073, spread: 2, tier: 'estimate' },
      { id: 'kendo-bogu-set', labelEn: 'Kendo bogu, full set', match: ['防具セット', '剣道防具セット', 'bogu set', 'kendo bogu set'], medianG: 5000, p25: 4250, p75: 5000, n: 54, spread: 1.18, tier: 'estimate' },
      { id: 'kendo-men', labelEn: 'Kendo men (helmet), single piece', match: ['面単品', '剣道面', '面 単品', 'kendo men'], medianG: 2500, p25: 2500, p75: 2500, n: 198, spread: 1, tier: 'estimate' },
      { id: 'kendo-kote', labelEn: 'Kendo kote (gauntlets)', match: ['小手', '甲手', 'kote'], medianG: 2000, p25: 1500, p75: 2500, n: 187, spread: 1.67, tier: 'estimate' },
      { id: 'kendo-do', labelEn: 'Kendo do (torso armour)', match: ['胴単品', '剣道胴', '胴台', '胴 単品'], medianG: 2000, p25: 1500, p75: 7500, n: 97, spread: 5, tier: 'unverified' },
      { id: 'kendo-tare', labelEn: 'Kendo tare (waist protector)', match: ['垂単品', '剣道垂', '垂 単品', 'tare'], medianG: 1500, p25: 1500, p75: 1500, n: 67, spread: 1, tier: 'estimate' },
      { id: 'budo-uniform-set', labelEn: 'Budo uniform, jacket and hakama/pants set', match: ['上下セット', '道着セット', '剣道着セット', '空手着セット', '柔道着セット', '上下組', 'uniform set'], medianG: 2500, p25: 2000, p75: 2500, n: 792, spread: 1.25, tier: 'estimate' },
      { id: 'budo-pants', labelEn: 'Budo uniform pants (karate/judo bottoms)', match: ['道着ズボン', '空手ズボン', '柔道ズボン', '空手着ズボン', '下衣', 'karate pants', 'judo pants'], medianG: 2100, p25: 800, p75: 2200, n: 185, spread: 2.75, tier: 'unverified' },
      { id: 'budo-jacket', labelEn: 'Budo uniform jacket (keikogi, karategi, judogi, kendogi)', match: ['剣道着', '空手着', '柔道着', '合気道着', '稽古着', '道着', '上衣', 'keikogi', 'karategi', 'judogi', 'kendogi', 'dogi'], medianG: 2200, p25: 1500, p75: 2500, n: 691, spread: 1.67, tier: 'estimate' },
      { id: 'hakama', labelEn: 'Hakama', match: ['袴', 'hakama'], medianG: 1500, p25: 1500, p75: 2500, n: 1696, spread: 1.67, tier: 'estimate' },
      { id: 'budo-obi', labelEn: 'Obi / belt', match: ['黒帯', '色帯', '角帯', '武道帯', '空手帯', '柔道帯', 'obi'], medianG: 400, p25: 400, p75: 500, n: 291, spread: 1.25, tier: 'estimate' },
      { id: 'budo-tabi', labelEn: 'Tabi / setta (footwear)', match: ['足袋', '雪駄', 'tabi', 'setta'], medianG: 500, p25: 300, p75: 500, n: 151, spread: 1.67, tier: 'estimate' },
      { id: 'shinai', labelEn: 'Shinai (bamboo sword)', match: ['竹刀', 'shinai'], medianG: 3000, p25: 1500, p75: 3000, n: 202, spread: 2, tier: 'estimate' },
      { id: 'bokuto', labelEn: 'Bokuto / bokken / jo (wooden weapon)', match: ['木刀', '木剣', '杖', 'bokuto', 'bokken', 'jo staff'], medianG: 2000, p25: 2000, p75: 2000, n: 250, spread: 1, tier: 'estimate' },
      { id: 'iaito', labelEn: 'Iaito (practice sword)', match: ['居合刀', '模擬刀', 'iaito', 'mogito'], medianG: 2500, p25: 2000, p75: 3500, n: 143, spread: 1.75, tier: 'estimate' },
      { id: 'kyudo-yumi', labelEn: 'Kyudo yumi (bow)', match: ['和弓', '弓道 弓', 'グラス弓', 'カーボン弓', 'yumi', 'kyudo bow'], medianG: 7000, p25: 7000, p75: 7000, n: 270, spread: 1, tier: 'estimate' },
    ],
    fallbackG: 2000,
    fallbackTier: 'unverified',
    notes: 
      'Three shops adopted, 6,503 variants (after removing the 10 g rows that are alteration services rather than products). The lines are evaluated top to bottom — a shinai bag must be tested before shinai, and karate trousers before budo-jacket. Classification uses each shop\'s own product_type: the shop\'s own category misfires far less often than words in the title.\n'
      + '\n'
      + 'Limits that matter:\n'
      + '\n'
      + '(1) What we obtained is budo equipment, not the category as named. Not one baseball, football or golf shop yielded data. In baseball, japan-ballpark.com and katanajp.co are Shopify but leave grams at 0, while taiwanbaseball (Taiwan) and ballgloveblueprint (US) are fixed at 1,000 g and 907 g. In golf, japangolfclubs is fixed at 2,268 g (5 lb), golfpartnerusa at 1,361 g (3 lb) and japangolfimport at 4,000 g — all flat pound-denominated classes. For football we could not find a Japanese Shopify shop at all (fcFA, SWS and japansoccer-jersey are on other platforms). So the weight difference between a glove, a bat and a jersey is not covered by this data.\n'
      + '\n'
      + '(2) These grams are packing classes, not measurements. All three shops put 78-90% of rows on 500 g steps; all 198 of Tozando\'s men are 2,500 g and all 270 of its yumi are 7,000 g. Hence measured: false. Good enough to pick an EMS step, never to be presented as a measured weight.\n'
      + '\n'
      + '(3) The same item sits on different steps at different shops. Hakama is 2,500 g at Tozando and 1,500 g at Seido; shinai is 2,500 g at Tozando and 3,000 g at KendoStar. The pooled median is only somewhere in between.\n'
      + '\n'
      + '(4) kendo-do has a spread of 5.0 (p25 1,500 g, p75 7,500 g) because a bare do and a full do-with-dodai set share one product_type. It is not dependable, so its tier is unverified.\n'
      + '\n'
      + '(5) Shinai (3,000 g), bokuto (2,000 g) and yumi (7,000 g) look like long-parcel packing values rather than mass — a shinai actually weighs about 500 g. International shipping hits the 1.5 m length limit first, so a weight-only estimate will be wrong, and a yumi is over 2 m and cannot go by EMS at all.\n'
      + '\n'
      + '(6) Shinai and bokuto listings include ten-packs (26,000 g, 25,000 g), which lift the upper tail.\n'
      + '\n'
      + '(7) www.kendo.co.jp scores suspect but was rejected: its figures are out by a factor of 1,000 (shinai at 200,000 g). Dividing by 1,000 was considered and refused — that would be a correction with nothing behind it.\n'
      + '\n'
      + '(8) fallbackG 2,000 is the overall median of the three adopted shops. Their catalogues are uniform- and armour-heavy, so applying it to non-budo sports goods (balls, apparel, small accessories) will overstate badly.',
  },
  {
    category: 'games',
    labelEn: 'Video games',
    labelJa: 'ゲーム',
    checkedOn: '2026-09-07',
    measured: false,
    sources: [
      {
        domain: 'www.retroasia.com',
        url: 'https://www.retroasia.com/products.json?limit=250&page=1',
        products: 591,
        variantsWithGrams: 692,
        verdict: 'usable',
        reason: 'distinct=81 (11.7%), top value 11%, multiples of 100: 69%. Adopted for the console line. Sliced to console listings (title or type naming a system or a set) it is n=587, median 3,350 g, p25 2,750 / p75 3,700, spread 1.35. Product types are console families: Famicom 185, Nintendo 64 133, Neogeo 50, Saturn 50, Dreamcast 45, Panasonic Q 42, Playstation 29, PC Engine 28, Megadrive 20. Every unit is sold as a refurbished set with cables, a controller and often a video-output mod, so the figure is a boxed set and not a bare console.',
      },
      {
        domain: 'japan-figure.com',
        url: 'https://japan-figure.com/products.json?limit=250&page=1',
        products: 5000,
        variantsWithGrams: 9078,
        verdict: 'usable',
        reason: 'distinct=437 (4.8%), top value 9%, multiples of 100: 27%. Adopted for the software line. product_type=\'Video Games New\' is n=1,691, but it mixes software with pouches, cases, grips and card holders; with those words removed the slice is n=1,495, median 190 g, p25 160 / p75 250, spread 1.56, and only 5% of the values are round hundreds.',
      },
      {
        domain: 'www.emporiumretrogamingshop.com',
        url: 'https://www.emporiumretrogamingshop.com/products.json?limit=250&page=1',
        products: 1000,
        variantsWithGrams: 1000,
        verdict: 'pseudo',
        reason: 'distinct=33, top value 66% of all rows. Not adopted: two thirds of the catalogue carries the same number.',
      },
      {
        domain: 'hakushin-retro-game-shop.myshopify.com',
        url: 'https://hakushin-retro-game-shop.myshopify.com/products.json?limit=250&page=1',
        products: 1000,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: '1,000 products and not one of them carries grams.',
      },
      {
        domain: 'nin-nin-game.com',
        url: 'https://nin-nin-game.com/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'products.json returns HTML, not JSON. Not a Shopify catalogue we can read.',
      },
      {
        domain: 'www.retrogamecity.com',
        url: 'https://www.retrogamecity.com/products.json?limit=250&page=1',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'insufficient',
        reason: 'products.json returns HTTP 400.',
      },
    ],
    lines: [
      { id: 'home-console', labelEn: 'Home console, boxed set', match: ['ファミコン', 'famicom', 'ニンテンドー64', 'nintendo 64', 'ゲームキューブ', 'gamecube', 'ドリームキャスト', 'dreamcast', 'セガサターン', 'sega saturn', 'ネオジオ', 'neogeo', 'neo geo', 'pcエンジン', 'pc engine', 'pc-fx', 'pcfx', 'メガドライブ', 'mega drive', 'megadrive', 'プレイステーション', 'playstation', 'プレステ'], medianG: 3350, p25: 2750, p75: 3700, n: 587, spread: 1.35, tier: 'estimate', sourceDomain: 'www.retroasia.com' },
      { id: 'game-software', labelEn: 'Video game, software', match: ['ゲームソフト', 'video game', 'video games', 'game software'], medianG: 190, p25: 160, p75: 250, n: 1495, spread: 1.56, tier: 'estimate', sourceDomain: 'japan-figure.com' },
    ],
    fallbackG: null,
    fallbackTier: 'none',
    notes: 
      'Two shops adopted: www.retroasia.com (usable) for hardware and japan-figure.com (usable) for software. grams is an input to a shipping calculator, not a measurement, so measured: false. This category was listed as not obtained until 2026-09-07.\n'
      + '\n'
      + 'The two lines are 18 times apart, which is the point of splitting them: a console and a game for that console are not the same parcel. There is no category average, because averaging 3,350 g and 190 g would produce a number describing nothing. fallbackG is null.\n'
      + '\n'
      + 'The console line is the weaker of the two and its limit has to be read with it. Every retroasia unit is a refurbished set — console, cables, a controller, usually a video-output mod — packed for export. So 3,350 g is a boxed set, not a bare console, and a used bare Famicom off an auction site is far lighter. The value is on the heavy side rather than the light side, which is the safe direction for a postage estimate, but it is not the weight of the machine. It is also one shop; no second catalogue publishing console grams was found.\n'
      + '\n'
      + 'Because the console line would be badly wrong on the wrong listing (a Famicom game is 100 g, not 3,350 g), src/lib/pricing/weights.ts requires a corroborating word — 本体, ゲーム機, console or system — before any system name resolves to it. A title that only says \'ファミコン ソフト\' resolves to nothing.\n'
      + '\n'
      + 'Not obtained: handheld consoles and current-generation consoles. retroasia has 26 handheld rows, under the threshold of 50, spanning 400 g to 4,100 g — a Chinese pocket handheld and a boxed Game Boy in one bucket, with nothing to separate them. Rather than average them, handhelds are left out of the table, and a handheld listing falls back to the calculator\'s assumed weight.',
  },
];

// 叩いたが商品ごとの重量が取れなかったカテゴリ。/weights はこれも出す。
export const WEIGHT_CATEGORIES_NOT_OBTAINED: MissingWeightCategory[] = [
  {
    id: 'instruments',
    labelEn: 'Musical instruments',
    labelJa: '楽器',
    reason: 'No public catalogue carries a per-product weight. The stores that do publish grams charge a flat band (a guitar came back as 180 kg).',
  },
  {
    id: 'webcams-pc-peripherals',
    labelEn: 'Webcams and PC peripherals',
    labelJa: 'webカメラ・PC周辺機器',
    reason: 'The used-camera catalogue behind the cameras category carries no webcam, and no other shop publishing a per-product weight for one was found. Sixteen live titles ask about them.',
  },
  {
    id: 'home-appliances',
    labelEn: 'Home appliances and consumer audio',
    labelJa: '家電・オーディオ',
    reason: 'Not obtained. Rice cookers, vacuum cleaners, hair dryers, earphones, record players and Apple Watch straps are all in the live search and none of them is in any catalogue that publishes per-product grams.',
  },
  {
    id: 'power-tools',
    labelEn: 'Power tools and sewing machines',
    labelJa: '電動工具・ミシン',
    reason: 'Never attempted, and no Shopify catalogue carrying them with per-product grams was found. Tool sets are multi-piece anyway, which no single weight would answer.',
  },
  {
    id: 'stationery',
    labelEn: 'Stationery',
    labelJa: '文房具',
    reason: 'Measured and rejected. japanesetaste.com carries 285 office-supply rows, but the slice spans a 2 g refill to a 1,208 g paper pack: writing supplies n=113 spread 6.3, paper n=83 spread 46.8. Nothing in a title separates a pen from a ream.',
  },
  {
    id: 'supplements',
    labelEn: 'Supplements',
    labelJa: 'サプリメント',
    reason: 'Measured and rejected. kokorojapanstore.com n=163 median 90 g spread 5.0, japanesetaste.com n=149 median 174 g spread 6.6. A 30-day pouch of capsules and a 3.4 kg tub of protein powder sit in one slice and a title does not say which it is.',
  },
];

export const WEIGHTS_CHECKED_ON = '2026-09-08';
