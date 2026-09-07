import { WEIGHT_CATEGORIES, type WeightCategory, type WeightLine } from '@/data/weights';
import { UNKNOWN_WEIGHT_STEPS_G } from './ems';
import type { Item, Tier } from './types';

export interface WeightResolution {
  grams: number | null;
  tier: Tier;
  /** '1/7 scale · n=647 · Solaris Japan' */
  source: string | null;
  categoryId: string | null;
  lineId: string | null;
  /** ラインの P25–P75。ラインに当たったときだけ。カテゴリ平均には幅が無いので null。 */
  rangeG: [number, number] | null;
}

const UNRESOLVED: WeightResolution = {
  grams: null, tier: 'none', source: null, categoryId: null, lineId: null, rangeG: null,
};

function describe(cat: WeightCategory, line: WeightLine): string {
  // 行ごとに出所が違うカテゴリがある（games は本体と ソフトで別の店）。
  // 行が名乗っていればそれを、無ければカテゴリの1店目を出す。
  const domain = line.sourceDomain ?? cat.sources[0]?.domain ?? 'unknown source';
  const spread = line.spread === 1 ? '1.0x' : `${line.spread}x`;
  // n=0 は「0件で測った」ではなく「件数を記録していない」。0 と書くと嘘になる。
  const n = line.n > 0 ? `n=${line.n}` : 'sample size not recorded';
  return `${line.labelEn} · ${n} · ${spread} · ${domain}`;
}

/**
 * 商品タイトルから重量を引く。**推測でフォールバックを返さない。**
 * どのラインにも当たらなければ null を返し、呼び出し側は「段ごとの総額」に落ちる。
 * カテゴリを明示されたときだけ、そのカテゴリのフォールバックを使う。
 */
export function resolveWeight(title: string, categoryId?: string | null): WeightResolution {
  const t = title.toLowerCase();

  // 段0: 出品ではない題名（店頭・カテゴリ・検索結果）。**語ではなく形で見る。**
  if (isNotOneListing(title)) return UNRESOLVED;

  const search = categoryId
    ? WEIGHT_CATEGORIES.filter((c) => c.category === categoryId)
    : WEIGHT_CATEGORIES;

  // **実際に当たった語**が長いものを採る。行が持つ最長語で並べると、
  // 'ねんどろいど CD' が cd（3文字で命中）ではなく nendoroid 行の
  // 最長語 'ねんどろいど' に負ける、といった取り違えが起きる。
  //
  // ただし総称ライン（generic）は長さで competing させない。'フィギュア' は '1/7' より
  // 長いので、同じ土俵に載せると総称がスケール行を全部食う。**先に個別ラインだけで探し、
  // 1本も当たらなかったときだけ総称ラインを見る。**段階で分ける。
  const best = pick(t, search, false) ?? pick(t, search, true);
  if (best) {
    const { cat, line } = best;
    return {
      grams: line.medianG,
      tier: line.tier,
      source: describe(cat, line),
      categoryId: cat.category,
      lineId: line.id,
      rangeG: [line.p25, line.p75],
    };
  }

  if (categoryId) {
    const cat = WEIGHT_CATEGORIES.find((c) => c.category === categoryId);
    if (cat && cat.fallbackG != null) {
      return {
        grams: cat.fallbackG,
        tier: cat.fallbackTier === 'none' ? 'none' : 'estimate',
        source: `${cat.labelEn} category average`,
        categoryId: cat.category,
        lineId: null,
        rangeG: null,
      };
    }
  }

  return UNRESOLVED;
}

/** generic が一致するラインだけを見て、当たった語が一番長いものを返す。 */
function pick(
  t: string, search: readonly WeightCategory[], generic: boolean,
): { cat: WeightCategory; line: WeightLine } | null {
  let best: { cat: WeightCategory; line: WeightLine; hit: number } | null = null;
  for (const cat of search) {
    for (const line of cat.lines) {
      if ((line.generic === true) !== generic) continue;
      if (namesSomethingElse(t, cat, line)) continue;
      for (const m of [...line.match, ...extraWordsFor(line.id)]) {
        const hit = hitLength(t, m);
        if (hit === null) continue;
        if (!corroborated(t, m, line.id)) continue;
        if (!best || hit > best.hit) best = { cat, line, hit };
      }
    }
  }
  return best;
}


// 短い語の誤爆を防ぐ。'lp' は 'sculpture' に、'cd' は語中に当たってしまう。
// ASCII の語は前後が「同じ種類の文字」でないことを要求し、日本語のようにスペースで
// 切れない語はそのまま部分一致で見る（\b が効かないため）。
//
// 英字と数字の切れ目も境界とみなす。出品は 'PSA10' 'BGS9.5' と詰めて書くので、
// 前後を英数字ひとまとめで禁じると鑑定済みカードに当たらない（docs/audit/logic.md 第5節
// の取りこぼし）。同じ種類の文字が続くときだけ弾けば 'sculpture' の 'lp'、
// '11/4' の中の '1/4' は今までどおり落ちる。
const ASCII = /^[\x20-\x7e]+$/;
function matches(title: string, raw: Word): boolean {
  return hitLength(title, raw) !== null;
}

/**
 * 当たったなら**題名の中で実際に当たった文字数**、当たらなければ null。
 * 長さを語の長さではなく当たった長さで測るのは、'complete 42 volume' のような
 * 形（正規表現）も語と同じ土俵で競わせるため。
 */
function hitLength(title: string, raw: Word): number | null {
  if (raw instanceof RegExp) {
    const m = raw.exec(title);
    return m ? m[0].length : null;
  }
  const m = raw.trim().toLowerCase();
  if (!m) return null;
  if (!ASCII.test(m)) return title.includes(m) ? m.length : null;
  const esc = m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const left = boundary(m[0]!, 'left');
  const right = boundary(m[m.length - 1]!, 'right');
  return new RegExp(`${left}${esc}${right}`, 'i').test(title) ? m.length : null;
}

/** 語の端が英字なら英字を、数字なら数字を隣に許さない。記号なら何も要求しない。 */
function boundary(char: string, side: 'left' | 'right'): string {
  const cls = /[a-z]/i.test(char) ? '[a-z]' : /[0-9]/.test(char) ? '[0-9]' : null;
  if (!cls) return '';
  return side === 'left' ? `(?<!${cls})` : `(?!${cls})`;
}

/** 表の語も、ここで足す語も、同じ扱い。正規表現は「語では書けない形」のときだけ。 */
type Word = string | RegExp;

// ── 追加の語彙。**数値はここに置かない。**行 id と語だけで、重量は表のまま。
//
// data/weights/*.json は shopify-probe の測定結果で、そこに載る `match` は
// 「その店でその区分を切り出した語」。**本番の題名がその物をどう呼ぶか**は別の知識で、
// 母数（data/weights-corpus.json）を見て人が決める judgement なので、
// 「データは判断を持たない、判断はコード」（docs/DESIGN-FEES-DATA.md §2）に従ってここに置く。
// 語が増えて安定したら、データ側の担当が JSON に畳んでよい。
interface ExtraWords {
  lineId: string;
  match: Word[];
  /** なぜこの語がこの行を指すのか。母数のどの取りこぼしから足したか。 */
  why: string;
}

const EXTRA_WORDS: ExtraWords[] = [
  {
    // 表の語は 'トレカ' 'シングル' などの総称だけで、**遊戯王・ポケカと名乗る題名に当たらない**。
    // 母数 dev で 6 件が黙っていた（遊戯王のレリーフ 3 件、ポケカの英語題名 2 件、楽天 1 件）。
    lineId: 'single-card',
    match: [
      '遊戯王', 'yugioh', 'yu-gi-oh', 'ポケモンカード', 'ポケカ', 'pokemon card', 'pokémon card',
      'デュエマ', 'デュエル・マスターズ', 'ワンピースカード', 'ヴァイスシュヴァルツ',
      'バトルスピリッツ', 'カードファイト', 'mtg',
    ],
    why: 'The game names say the object is a trading-card single',
  },
  {
    // 'トレカ' は K-POP の題名ではフォトカード（28 g）を指す。TCG のシングル（50 g）ではない。
    // 単独では決められないので、K-POP の文脈を裏付けに要求する（REQUIRES_CORROBORATION）。
    lineId: 'photocard',
    match: ['トレカ', 'トレーディングカード'],
    why: 'In a K-pop title トレカ is the photocard, which is where the 28 g was measured',
  },
  {
    // 表の語 'weverse album' は 'Weverse **Albums** Ver.' に当たらない（英字の境界で落ちる）。
    // 母数 dev で 3 件がこれ（2 件は 800 g の album に流れ、1 件は黙っていた）。
    lineId: 'platform-album',
    match: ['weverse'],
    why: 'Weverse editions write "Weverse Albums Ver."',
  },
  {
    // 'CD+写真集' は写真集（1,000 g）ではなく、写真集を同梱したアルバムの箱（800 g）。
    lineId: 'album',
    match: ['cd+写真集', 'cd＋写真集', 'cd+photobook', 'cd+photo book', 'cd＋photobook'],
    why: 'A disc bundled with a book is the album package, not the book',
  },
  {
    // K-POP の外では「アルバム」はただのCD。'初音ミク … OFFICIAL ALBUM' に
    // K-POP アルバムの 800 g が付いていた（8 倍）。K-POP の題名では逆に cd を閉じる（EXCLUSIONS）。
    lineId: 'cd',
    match: ['アルバム', 'album'],
    why: 'Outside K-pop an album is a disc in a case, not the 800 g K-pop package',
  },
  {
    // 英語の全巻セットの形。'Complete 42 Volume First Edition Set'、'Complete Volume Set'、
    // 'The Complete Manga Collection'。表の 'complete set' はどれにも当たらない。
    lineId: 'manga-set',
    match: [/complete\s+(\d+\s+)?(manga\s+)?(volumes?|collection|series|set)/],
    why: 'English listings write the complete set in a dozen ways around "complete"',
  },
  {
    // 'ファミコンソフト' は本体（3,350 g）ではなくカセット（190 g）。表の語は 'ゲームソフト' だけ。
    lineId: 'game-software',
    match: [
      'ファミコンソフト', 'スーファミソフト', 'スーパーファミコンソフト', 'ゲームカセット',
      'psソフト', 'ps2ソフト', 'ps3ソフト', 'ps4ソフト', 'ps5ソフト', 'switchソフト', 'ソフト 中古',
    ],
    why: 'A platform name glued to ソフト names the cartridge, not the machine',
  },
  {
    // 型番だけの靴。ブランド名（ナイキ）は鞄にも服にも付くので**型名**だけを採る。
    lineId: 'sneaker-casual',
    match: [
      'エアジョーダン', 'air jordan', 'エアフォース', 'air force 1', 'エアマックス', 'air max',
      'ダンク ロー', 'dunk low', 'ニューバランス', 'new balance', 'スタンスミス', 'stan smith',
    ],
    why: 'A shoe model name is on shoes only; the brand name alone is on bags and shirts too',
  },
  {
    // 'グラスファイバー弓 「直心 1」 並寸【付属品付き 弓具 弓道】'。表は 'グラス弓' しか持たない。
    lineId: 'kyudo-yumi',
    match: ['グラスファイバー弓', 'カーボンファイバー弓', '弓具'],
    why: 'The bow is written in more ways than the two the slice used',
  },
];

const EXTRA_BY_LINE = new Map<string, Word[]>();
for (const e of EXTRA_WORDS) EXTRA_BY_LINE.set(e.lineId, [...(EXTRA_BY_LINE.get(e.lineId) ?? []), ...e.match]);
function extraWordsFor(lineId: string): readonly Word[] {
  return EXTRA_BY_LINE.get(lineId) ?? [];
}

// ── 段0の門。**題名が1点の商品を指していない**とき、どの行にも当てない。
//
// 語ではなく **形**（末尾・区切り・パンくず）で見る。'スニーカー' や 'フィギュア' は
// 商品にも店頭にも出るので、語では店頭と商品を分けられない（docs/DESIGN-WEIGHT-MATCH.md §1.4）。
// 各サイトが店頭・カテゴリ・検索結果に付ける定型の形だけを列挙する。
//
// 商品ページの形と衝突しないことを母数で確かめてある:
//   Yahoo!ショッピングの商品は '… : 店名 - 通販 - Yahoo!ショッピング'（半角ハイフン、'通販' 付き）、
//   店頭は '店名 - カテゴリ｜Yahoo!ショッピング'（全角の縦棒）。
//   楽天の商品は '【楽天市場】商品名：店名'（'】' の直後から商品名）、
//   カテゴリは '【楽天市場】 …' か 'A > B：店名' のパンくず。
interface StorefrontForm {
  /** 題名がこの形なら、1点の商品ではない。 */
  is: (title: string) => boolean;
  why: string;
}

const NOT_ONE_LISTING: StorefrontForm[] = [
  {
    // 'スニーカー - ハニーズ Yahoo!店'、'駿河屋Yahoo!店 - フィギュア'。
    // 商品ページも店名に 'Yahoo!店' を含むが、そちらは必ず ' - 通販 - ' を挟む。
    is: (t) => t.includes('Yahoo!店') && !t.includes('通販'),
    why: 'A Yahoo shop name with no 通販 marker is the shop front, not one of its items',
  },
  {
    // 'サンワダイレクト - ボックス収納ケース｜Yahoo!ショッピング'。全角の縦棒が店頭の形。
    is: (t) => t.includes('｜Yahoo!ショッピング'),
    why: 'The full-width bar form is a Yahoo category page; items use " - 通販 - Yahoo!ショッピング"',
  },
  {
    // '【楽天市場】シューズ・靴 > スニーカー：SHOPLIST'。'>' は楽天のパンくず。
    is: (t) => t.includes('【楽天市場】') && t.includes(' > '),
    why: 'A breadcrumb inside a Rakuten title is a category page',
  },
  {
    // '【楽天市場】 PEライン/釣り糸 : SOZOKI'。商品名は '】' の直後から始まる。
    is: (t) => t.includes('【楽天市場】 '),
    why: 'A Rakuten item title starts right after the bracket; a space means a category page',
  },
  {
    // '【2026年最新】Yahoo!オークション -禰豆子 フィギュアの中古品・新品・未使用品一覧'。
    is: (t) => t.includes('中古品・新品・未使用品') || t.includes('商品一覧'),
    why: 'A Yahoo Auctions search result page lists many items',
  },
  {
    // '五番街〜バッグ・財布のお店'。
    is: (t) => t.includes('のお店'),
    why: 'The title names a shop, not a thing the shop sells',
  },
];

/** 題名が1点の商品を指していないか。 */
function isNotOneListing(title: string): boolean {
  return NOT_ONE_LISTING.some((f) => f.is(title));
}

// ── ここから下は「当て方」の門。docs/audit/logic.md 第5節の誤爆一覧への対処。
// 重量の数値は一切いじらない。**当たる条件を狭めるだけ。**
// src/data/weights.ts は scripts/weights-build.ts の生成物なので、
// 「この語だけでは決められない」という判断はデータではなくここに置く。

interface Corroboration {
  /** この語で当たったとき、 */
  tokens: string[];
  /** タイトルに needs のどれかが無ければ当てない。 */
  needs: string[];
  /** 名指した行だけに効かせる（同じ語が別の行では裏付け無しで正しいとき）。 */
  lineIds?: string[];
  why: string;
}

/**
 * **K-POP の題名だと分かる語。**グループ名と、その界隈にしかない物の名前だけを置く。
 * 'アルバム' 'トレカ' のような、どちらの世界にも出る語は入れない（裏付けにならない）。
 *
 * K-POP の行（album 800 g・dvd-bluray 1,750 g・photocard 28 g）は K-POP 専門店で
 * 測った値で、同じ言葉で呼ばれる日本の CD（100 g）やTCGのシングル（50 g）とは別の物。
 * **どちらの世界の題名かを決めるのはこの一覧だけ**なので、増やすときは母数で測ること。
 */
const KPOP_CONTEXT = [
  'kpop', 'k-pop', 'ケイポップ', '韓流', 'weverse', 'ウィバース', 'ペンライト', 'lightstick',
  'フォトカード', 'photocard', 'photo card', '会報', 'ヨントン', 'サノク',
  'bts', '防弾少年団', 'バンタン', 'twice', 'トゥワイス', 'blackpink', 'ブラックピンク',
  'seventeen', 'セブチ', 'セブンティーン', 'nct', 'enhypen', 'エンハイプン',
  'le sserafim', 'ルセラフィム', 'newjeans', 'ニュージーンズ', 'aespa', 'エスパ',
  'stray kids', 'straykids', 'ストレイキッズ', 'スキズ', 'ateez', 'riize',
  'boynextdoor', 'ボネクド', 'ボイネク', 'zerobaseone', 'ゼベワン', 'illit',
  'red velvet', 'レッドベルベット', 'exo', 'shinee', 'super junior', 'kep1er', 'ケプラー',
  'nmixx', 'itzy', 'ボイプラ', '超特急',
];

/**
 * その語だけでは行を決められないもの。**裏付けの語を同じタイトルに要求する。**
 * 無ければ当てずに null に落とす（段ごとの総額に戻る）。当てて 30 倍外すより安全。
 */
const REQUIRES_CORROBORATION: Corroboration[] = [
  {
    // '【1/7(火)まで】' は締切、'2024/1/8' は発売日。どちらも 1/7・1/8 スケールではない。
    tokens: ['1/4', '1/6', '1/7', '1/8'],
    needs: ['scale', 'スケール', 'figure', 'figures', 'フィギュア', 'フィギア', '完成品'],
    why: 'A bare fraction is a date or a deadline as often as it is a figure scale',
  },
  {
    // 'ジュース 700ml' を四合瓶（1,420 g）として読んでいた。容量は酒に限らない。
    tokens: ['1800ml', '1,800ml', '1.8l', '1800ｍｌ', '720ml', '750ml', '700ml', '720ｍｌ', '300ml', '300ｍｌ'],
    needs: [
      '日本酒', 'sake', '酒', '焼酎', 'shochu', '梅酒', 'ウイスキー', 'ウィスキー', 'whisky', 'whiskey',
      '純米', '吟醸', '本醸造', '原酒', '清酒', 'リキュール', 'liqueur', 'ワイン', 'wine', '泡盛', 'awamori',
    ],
    why: 'A bottle size alone does not say the bottle holds sake',
  },
  {
    // 'SSR ウマ娘 缶バッジ' はカードではない。SSR/SAR/CSR はレア度の記号でしかない。
    tokens: ['sar', 'csr', 'ssr'],
    needs: ['カード', 'card', 'cards', 'トレカ', 'シングル', 'ポケカ', 'tcg'],
    why: 'A rarity code names the print run, not the object being sold',
  },
  {
    // '杖 ステッキ 高齢者用' は介護用の杖であって杖道の杖（2,000 g）ではない。
    tokens: ['杖'],
    needs: ['杖道', '杖術', '木刀', '木剣', '武道', '剣道', '合気道', 'jodo', 'bokuto', 'bokken'],
    why: 'On its own the character means a walking cane, not a martial-arts staff',
  },
  {
    // 'OBI 帯のみ' はレコードの帯（数 g）。武道の帯（400 g）と綴りが同じ。
    tokens: ['obi'],
    needs: ['空手', '柔道', '剣道', '合気道', '武道', '道着', 'karate', 'judo', 'kendo', 'aikido', 'martial'],
    why: 'A record obi strip and a martial-arts belt share the same romanisation',
  },
  {
    // 'ファミコン ソフト マリオ' は 100 g のカセット。本体（3,350 g）ではない。
    // 本体ラインの出典は改造済みの箱入りセットなので、当てる相手を間違えると 30 倍外す。
    tokens: [
      'ファミコン', 'famicom', 'ニンテンドー64', 'nintendo 64', 'ゲームキューブ', 'gamecube',
      'ドリームキャスト', 'dreamcast', 'セガサターン', 'sega saturn', 'ネオジオ', 'neogeo', 'neo geo',
      'pcエンジン', 'pc engine', 'pc-fx', 'pcfx', 'メガドライブ', 'mega drive', 'megadrive',
      'プレイステーション', 'playstation', 'プレステ',
    ],
    needs: ['本体', 'ゲーム機', 'console', 'system', 'コンソール'],
    why: 'A system name is on the game as much as on the machine; only the machine is 3.35 kg',
  },
  {
    // 'カメラを止めるな! [DVD]' に 1,750 g が付いていた（本番検索の実タイトル、2件）。
    // 1,750 g は K-POP 専門店で測った DVD/Blu-ray の値で、中身はライブ映像の箱
    // （写真集込み）。映画のディスク1枚とは別の物で、17倍ちがう。
    // **映像ディスク一般の重量は取れていない**（data/weights/index.json partialGaps: kpop）。
    // K-POP の文脈を示す語が同じタイトルに無ければ、当てずに仮置きへ落とす。
    tokens: ['dvd', 'ブルーレイ', 'blu-ray', 'bluray'],
    needs: [
      ...KPOP_CONTEXT, 'アルバム', 'album', 'トレカ',
      'コンサート', 'concert', 'ワールドツアー', 'world tour', 'ファンミ', 'fanmeeting',
    ],
    why: 'The 1,750 g came from K-pop concert releases; a film on one disc is not that object',
  },
  {
    // '静岡 煎茶 … シングルオリジン 酔える茶葉' にカード 50 g が付いていた。
    // 'シングル' はカードの枚数にも、CD の形式にも、コーヒー・茶の産地にも使う。
    tokens: ['シングル', 'single card'],
    needs: ['カード', 'card', 'cards', 'トレカ', 'ポケカ', '遊戯王', 'tcg'],
    why: 'シングル on its own says nothing about cards — single origin tea uses the same word',
  },
  {
    // K-POP のアルバム（800 g）は専門店で測った箱で、日本の CD（100 g）とは別の物。
    // K-POP と分かる語が無ければこの行は名乗れない。無ければ cd の 100 g に落ちる。
    tokens: ['アルバム', 'album'],
    lineIds: ['album'],
    needs: KPOP_CONTEXT,
    why: 'The 800 g album was measured at a K-pop shop; a Japanese CD album is not that package',
  },
  {
    // 追加語の 'トレカ' は photocard のときだけ、K-POP の裏付けを要る。
    // TCG の題名では表の 'トレカ'（single-card）がそのまま正しい。
    tokens: ['トレカ', 'トレーディングカード'],
    lineIds: ['photocard'],
    needs: KPOP_CONTEXT,
    why: 'トレカ is a photocard only when the title is a K-pop one',
  },
];

interface Exclusion {
  /** 効かせる行。行 id で名指すか、カテゴリごと（except で穴を開ける）。 */
  lineIds?: string[];
  categoryId?: string;
  categoryIds?: string[];
  exceptLineIds?: string[];
  /** 全カテゴリに効かせる。exceptCategoryIds のカテゴリだけ免れる。 */
  allCategories?: true;
  exceptCategoryIds?: string[];
  /** タイトルがこの語を持つなら、その行は当てない。 */
  when: string[];
  /** 語では書けない**形**（数量＋助数詞など）。when と同じ扱いで、どれか一致すれば閉じる。 */
  pattern?: RegExp[];
  /** when に加えて、こちらの語も同じタイトルに要る（2つ揃って初めて意味を持つ形）。 */
  and?: string[];
  /** ただしこの語があるなら、when の一致は説明が付くので門を開ける。 */
  unless?: string[];
  why: string;
}

/**
 * 行には当たったが、**タイトルが別の物を名指ししている**とき。
 * 中身ではなく容れ物・機械・付属品・別サイズを売っている出品を落とす。
 */
const EXCLUSIONS: Exclusion[] = [
  {
    // 'compact disc player' は 2 kg 前後の機械、'Vinyl sticker' は 30 g のシール。
    lineIds: ['cd', 'lp'],
    when: [
      'player', 'プレーヤー', 'プレイヤー', 'turntable', 'ターンテーブル', 'deck', 'デッキ',
      'case', 'ケース', 'rack', 'ラック', 'stand', 'スタンド', 'sleeve', 'スリーブ',
      'sticker', 'ステッカー', 'cleaner', 'クリーナー', '収納',
    ],
    why: 'The listing sells the machine, the case or the sticker, not the disc',
  },
  {
    // 'snack box japan' は詰め合わせ。1 個 90 g の菓子ではない。
    lineIds: ['snack-sweets'],
    when: ['box', 'ボックス', '詰め合わせ', '詰合せ', 'assortment', 'assorted', 'variety pack', 'bulk'],
    why: 'An assortment box is many snacks, and we have no count to multiply by',
  },
  {
    // '空手着 上下セット 女児 120cm' に大人用の 2,500 g を当てていた。
    // 帯・袋・小物は寸法でほとんど変わらないので、そこには効かせない。
    categoryId: 'sports-goods',
    exceptLineIds: ['budo-bag', 'budo-small-parts', 'budo-obi'],
    when: ['女児', '男児', '子供', '子ども', 'こども', 'キッズ', 'ジュニア', '幼児', '小学生', 'kids', 'junior', 'youth'],
    // 'こどもの日' は端午の節句の飾りとしての売り文句で、寸法ではない。
    // これで大人向けの居合刀 2 件が黙っていた（母数 h-18029f11・h-6b0bb9c3）。
    unless: ['こどもの日', '子供の日', 'こどもの日', '端午の節句'],
    why: 'Every median in this category was taken from adult sizes',
  },
  {
    // 'PSA10 SAR リザードン' はスラブ（100 g）。生カードの語も同時に持つので、当たった語の
    // 長さで single-card に流れると 50 g になる。data/weights/tcg-singles.json の
    // 「マッチ順は graded-slab を先に見ること」を、語の長さに依存しない形で書き下したもの。
    // when は graded-slab が実際に持つ語だけにする。持っていない語を書くと、
    // single-card を落としたあと受け皿が無くて null に落ちる。
    lineIds: ['single-card'],
    when: ['psa', 'bgs', 'cgc'],
    why: 'A graded slab carries the raw-card words too; the grading service decides which it is',
  },
  {
    // 大判の本と手引き書。**図鑑・教科書・ムックの重量は取れていない**
    // （books-manga が持っているのは小説 408 g と漫画の単巻 210 g で、別の物。
    // index.json partialGaps 参照）。書籍カテゴリにも当てさせない。
    // これで「腕時計の図鑑」に腕時計の 839 g が付くのも止まる。
    allCategories: true,
    // 「フィギュアの達人 初級編」は塞がっていたが、「フィギュアの作り方 入門書」は
    // 語が1つ違うだけで通り抜けて 800 g（フィギュア本体）を名乗っていた。
    // 同じ手引き書なので、同じ門で塞ぐ。
    when: [
      '図鑑', '教科書', '入門編', '上級編', '初級編', '攻略本', 'ムック',
      '入門書', '作り方', '描き方', '解説書', 'ガイドブック', '設定資料集',
    ],
    why: 'A large-format or how-to book is not the thing it is about, and not the novel we measured',
  },
  {
    // 出品が「これは本だ」と名乗っているとき。**X についての本は X ではない。**
    // 実測37件のうち4件がこれ。ここは書籍のラインだけ通す（そこには実データがある）。
    allCategories: true,
    exceptCategoryIds: ['books-manga'],
    // Amazon 日本のパンくず。'本' 単独は「日本」「本体」「3本」に当たるので使えない。
    when: ['本 | 通販', '|本 |', '｜本｜', '単行本'],
    why: 'The listing says it is a book, so only the book lines may claim it',
  },
  {
    // 'フィギュアスケート' は競技であって完成品フィギュアではない。
    lineIds: ['figure-generic'],
    when: ['スケート', 'skating', 'skate'],
    why: 'Figure skating is not a figure',
  },
  {
    // **容れ物を売っている出品。**総称の 'フィギュア' 'トレカ' を表に入れた副作用で、
    // 「フィギュア用アクリルケース」に 800 g、「トレカ用スリーブ 100枚」に 50 g が
    // 付くようになった（この変更より前は両方 null）。中身の重量は容れ物の重量ではない。
    // cd / lp に既に在る同じ門を、フィギュアとカードのラインにも効かせる
    // （スケール行も、'1/7 スケール アクリルケース' で裏付けが揃ってしまうので同じ扱い）。
    // **容れ物そのものの重量は取れていない**ので、当てずに仮置きへ落とす。
    // 2026-09-07 追記: 同じ門が K-POP・ゲーム・音楽の行にも要る。
    // 'Photo Card Binder' に 28 g、'CD・DVDケース … ゲームソフト収納' に 190 g が付いていた。
    // used-luxury（鞄・財布・カードケース）は容れ物そのものが商品なので入れない。
    categoryIds: ['figures', 'tcg-singles', 'kpop', 'games'],
    lineIds: ['single-card', 'graded-slab'],
    when: [
      'ケース', 'case', 'ボックス', 'スリーブ', 'sleeve', 'ローダー', 'loader',
      'バインダー', 'binder', 'ホルダー', 'holder', '収納', '台座', 'スタンド', 'stand',
      'ディスプレイ', 'display', 'アクリル', 'acrylic', 'プロテクター', 'protector',
    ],
    why: 'The listing sells the case, the sleeve or the stand, and we have no weight for those',
  },
  {
    // 'スニーカーボックス 収納ケース' は箱、'スニーカー用シューキーパー' は木型。
    // どちらも 750 g（靴そのもの）ではない。この2件は総称を入れる前から在った誤爆。
    categoryId: 'sneakers',
    when: [
      'ケース', 'case', 'ボックス', '収納', 'スタンド', 'stand', 'ラック', 'rack',
      'シューキーパー', 'シューツリー', 'shoe keeper', 'shoe tree', 'インソール', 'insole',
      '靴紐', '靴ひも', 'シューレース', 'shoelace', 'shoe laces', 'クリーナー', 'cleaner',
    ],
    why: 'A shoe box, a shoe tree or a lace is not the shoe we weighed',
  },
  {
    // 'ワンピース 全巻セット' は 2,000 g の箱で、210 g の単巻ではない。
    // いまは語の長さでもラインの並び順でもセット行が勝つが、**どちらも偶然**なので
    // 「セットの語があるなら単巻には当てない」をここに書いて固定する。
    lineIds: ['manga-volume'],
    when: ['全巻', 'complete set', 'コミックセット'],
    why: 'A complete set is not one volume, and the set has its own line',
  },
  {
    // 'アニメ DVD 全巻セット' は円盤の箱。2,000 g は BOOKOFF USA の**漫画**の全巻セットで
    // 測った値なので、当てると画面が「漫画の店で読んだ」と名乗る。数字が近くても出所が嘘になる。
    // 映像ディスクの箱の重量は取れていない。
    lineIds: ['manga-set'],
    when: ['dvd', 'ブルーレイ', 'blu-ray', 'bluray', 'cd'],
    why: 'A disc box set is not a manga box set, and the number would carry a bookshop as its source',
  },
  {
    // **1点ではなく口数の出品。**'ファミコン ソフト まとめ売り 19本セット' は 190 g × 19、
    // 'カップ麺 12種類 詰め合わせ' は 122 g × 12。題名から個数を取り出して掛ける処理は
    // 持っていないし、持つべきでもない（外れたときに 19 倍外れる — DESIGN-WEIGHT-MATCH §9）。
    // 数量そのものは語ではなく**形**（数字＋助数詞＋まとめ言葉）で見る。
    // 全巻セット・道着の上下セット・防具セットは「口数」ではなく**その形で1つの商品**なので免れる。
    allCategories: true,
    exceptLineIds: ['manga-set', 'budo-uniform-set', 'kendo-bogu-set'],
    when: ['まとめ売り', 'まとめ買い', '詰め合わせ', '詰合せ', '詰め合せ', '詰合わせ', 'アソート'],
    pattern: [/[0-9０-９]+\s*(個|本|枚|点|冊|種|種類|袋|缶|パック|足|膳)\s*(セット|組|入|まとめ|アソート)/],
    why: 'A lot of N items weighs N times the line, and we have no count we trust to multiply by',
  },
  {
    // 中身が無い出品。'【空箱のみ】… スケールフィギュア' は箱だけで、フィギュアではない。
    allCategories: true,
    when: ['空箱', '箱のみ', '外箱のみ', 'パッケージのみ', '説明書のみ'],
    why: 'The listing sells the packaging with nothing in it',
  },
  {
    // 部品だけの出品。'1/6 フィギュア ドール 用 ヘッド 植毛タイプ' は頭部だけ。
    // '素体' は入れない——素体はドール1体で、部品ではない（母数 h-...: 1/6 素体セット）。
    categoryId: 'figures',
    when: ['植毛', 'ヘッドのみ', '頭部のみ', 'パーツのみ', '交換用ヘッド'],
    why: 'A doll head on its own is a part, and we have no line for parts',
  },
  {
    // 'スーパーファミコン 本体 互換機 … SFC互換' は他社の互換機。
    // 3,350 g は整備済みの純正本体で測った値で、別の物。
    lineIds: ['home-console'],
    when: ['互換機', '互換'],
    why: 'A third-party clone is not the original console the line was measured on',
  },
  {
    // 'タミヤ ラッカー塗料 LP-70' の 'LP' は塗料の品番。レコードではない。
    lineIds: ['lp', 'cd'],
    when: ['塗料', 'ラッカー', 'スプレー缶', 'プラモデル'],
    why: 'LP-70 is a paint code, not a record',
  },
  {
    // 'クロス西洋剣 模造刀 … 居合刀' は西洋剣。居合刀の 2,500 g は日本の模擬刀で測った値。
    lineIds: ['iaito'],
    when: ['西洋剣', 'レイピア', 'サーベル'],
    why: 'The iaito line was measured on Japanese practice swords',
  },
  {
    // 'Kpop Photo Card Binder … Photo Card Holder' に革のカードケース 235 g が付いていた。
    // 'card holder' は両方の言葉。トレカの文脈ならバインダーであって財布ではない。
    lineIds: ['wallet-small-leather'],
    when: ['photo card', 'photocard', 'フォトカード', 'トレカ', 'kpop', 'k-pop'],
    why: 'A photocard binder shares the words with a leather card case but is not one',
  },
  {
    // 未開封の BOX・パックは1枚のシングルではない。'ポケモンカード151 BOX シュリンク付き' は
    // 30 パック入りの箱。**BOX の重量は取れていない**ので当てずに黙る。
    categoryId: 'tcg-singles',
    when: ['未開封', 'シュリンク', '拡張パック', '強化拡張パック', 'booster', 'オリパ', '福袋', 'unopened'],
    why: 'A sealed box or pack is not the single card we measured',
  },
  {
    // '遊戯王 ブラックマジシャン ユニクロ Tシャツ' はTシャツ。作品名はグッズにも付く。
    categoryIds: ['figures', 'tcg-singles', 'kpop'],
    when: [
      // 'ぬいぐるみ' は入れない。figures に plush の行があり、**それ自体が商品**。
      'tシャツ', 't-shirt', 'ティーシャツ', 'パーカー', 'マグカップ', 'キーホルダー',
      'クリアファイル', '缶バッジ', 'タペストリー',
    ],
    why: 'The character is on the merchandise as much as on the thing we weighed',
  },
  {
    // '【付録完備】ONE PIECE ワンピース マガジン 漫画 全巻 セット' はムックの揃い。
    // 大判のムック・雑誌の揃いは記録済みの穴（index.json partialGaps）。
    // 定期刊行物の語と揃いの語が**両方**あるときだけ閉じる。片方だけなら普通の巻・普通の号。
    lineIds: ['manga-set', 'manga-volume', 'magazine'],
    when: ['マガジン', '雑誌', 'ムック', 'magazine'],
    and: ['全巻', 'セット', 'バックナンバー'],
    why: 'A run of a magazine or mook is not a manga set and not one issue',
  },
  {
    // '漫画 全巻 まとめ セット 137冊' は複数の作品の口数で、1作品の揃い（2,000 g）ではない。
    // 揃いの行は数量の門から外してあるので、'まとめ' の形だけここで別に閉じる。
    lineIds: ['manga-set'],
    when: ['まとめ売り', 'まとめ セット', 'まとめセット', 'まとめ出品'],
    why: 'A mixed lot of complete sets is not one complete set',
  },
  {
    // K-POP の題名の 'CD' は、写真集やフォトカードの入ったアルバムの箱（800 g）で、
    // 100 g のディスク1枚ではない。**同じ 'CD' が世界によって別の物を指す。**
    lineIds: ['cd', 'lp'],
    when: KPOP_CONTEXT,
    why: 'A disc in a K-pop title ships as the album package, not as a bare CD',
  },
  {
    // K-POP の題名の 'トレカ' はフォトカード（28 g）で、TCG のシングル（50 g）ではない。
    lineIds: ['single-card'],
    when: KPOP_CONTEXT,
    why: 'K-pop トレカ is a photocard; the tcg single line was measured on game cards',
  },
  {
    // ガシャポン・食玩の小さい人形。総称の 800 g は 1/7 前後の完成品で測った値で、
    // 20〜50 g のミニフィギュアとは 20 倍ちがう。**小さい人形の重量は取れていない。**
    // 'SDガンダムフルカラー' は食玩の商品名（母数 h-5be50c17）。一番くじ・プライズは
    // 大きさがまちまちで、母数では総称に当てて正しかったので入れない。
    categoryId: 'figures',
    when: [
      'ガシャポン', 'ガチャガチャ', 'カプセルトイ', '食玩', 'ミニフィギュア', 'minifigure',
      'sdガンダムフルカラー',
    ],
    why: 'A capsule-toy figure is nothing like the 800 g the generic line was measured on',
  },
];

/** 当たった語に裏付けが要るなら、それがタイトルにあるか。 */
function corroborated(title: string, raw: Word, lineId: string): boolean {
  if (raw instanceof RegExp) return true;
  const m = raw.trim().toLowerCase();
  const rule = REQUIRES_CORROBORATION.find(
    (r) => r.tokens.includes(m) && (r.lineIds === undefined || r.lineIds.includes(lineId)),
  );
  if (!rule) return true;
  return rule.needs.some((w) => matches(title, w));
}

/** タイトルがこの行とは別の物を名指ししていないか。 */
function namesSomethingElse(title: string, cat: WeightCategory, line: WeightLine): boolean {
  for (const rule of EXCLUSIONS) {
    // exceptLineIds はカテゴリ指定・全カテゴリ指定のどちらにも効く（行を名指しした穴）。
    const spared = rule.exceptLineIds?.includes(line.id) === true;
    const byCategory = (rule.categoryId === cat.category || rule.categoryIds?.includes(cat.category) === true)
      && !spared;
    const byAll = rule.allCategories === true
      && rule.exceptCategoryIds?.includes(cat.category) !== true && !spared;
    const named = rule.lineIds?.includes(line.id) === true || byCategory || byAll;
    if (!named) continue;
    const hit = rule.when.some((w) => matches(title, w))
      || (rule.pattern?.some((re) => re.test(title)) ?? false);
    if (!hit) continue;
    if (rule.and && !rule.and.some((w) => matches(title, w))) continue;
    if (rule.unless?.some((w) => matches(title, w))) continue;
    return true;
  }
  return false;
}


/**
 * 重量表に当たらないときの仮置き（g／点）。**実測でも統計でもない。**
 * 1,000 g にした理由:
 *  - EMS の段そのものの丸い数字なので、画面で「~1,000 g assumed」と出たとき測った値には見えない
 *    （584 g のような値は測ったように読まれる）。
 *  - 2〜5点のカートで1位が入れ替わる 1,150〜1,625 g／点のすぐ下にある。×1/3〜×3 の判定
 *    （333〜3,000 g）がその交差点を必ず跨ぐので、何も知らないカートで「安定」と出ることがない。
 *  - 表に当たった品と同じ入力欄に入り、その場で直せる（docs/UI-DESIGN.md §4）。
 * 単独の1点なら 500 g〜10 kg のどこでも1位は動かない（2026-09-06 実測）ので、
 * この数字が1位を決めるのは複数点のときだけで、そのときは画面がそう言う。
 */
export const ASSUMED_WEIGHT_G = 1000;

/** 仮置きの重量を動かして見る幅。段表と同じ 500 g〜10 kg（UNKNOWN_WEIGHT_STEPS_G の両端）。 */
export const ASSUMED_WEIGHT_RANGE_G: [number, number] = [
  UNKNOWN_WEIGHT_STEPS_G[0],
  UNKNOWN_WEIGHT_STEPS_G[UNKNOWN_WEIGHT_STEPS_G.length - 1]!,
];

export type ItemWeightFields = Pick<
  Item, 'weightG' | 'weightTier' | 'weightSource' | 'weightOrigin' | 'weightRangeG' | 'weightLineId'
>;

/**
 * 計算機がカートの1点に入れる重量。**null を返さない。**
 * 重量表のラインに当たればその中央値と P25–P75、当たらなければ ASSUMED_WEIGHT_G を
 * 'assumed' として入れる。どちらも tier は 'estimate' — 確定値のふりはしない。
 * 「重量不明なら段ごとの総額」から「推定値を既定で埋め、直してもらう」への変更
 * （docs/UI-DESIGN.md §4）。resolveWeight 自体は今もフォールバックを返さない。
 */
export function weightFieldsFor(title: string): ItemWeightFields {
  const w = resolveWeight(title);
  if (w.grams != null) {
    return {
      weightG: w.grams,
      weightTier: w.tier,
      weightSource: w.source,
      weightOrigin: 'table',
      weightRangeG: w.rangeG,
      weightLineId: w.lineId,
    };
  }
  return {
    weightG: ASSUMED_WEIGHT_G,
    weightTier: 'estimate',
    weightSource: null,
    weightOrigin: 'assumed',
    weightRangeG: null,
    weightLineId: null,
  };
}

export function categoryById(id: string): WeightCategory | undefined {
  return WEIGHT_CATEGORIES.find((c) => c.category === id);
}

export { WEIGHT_CATEGORIES };
