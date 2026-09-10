import { describe, expect, test } from 'vitest';
import { UNKNOWN_WEIGHT_STEPS_G } from './ems';
import {
  ASSUMED_WEIGHT_G, ASSUMED_WEIGHT_RANGE_G, WEIGHT_CATEGORIES, categoryById, resolveWeight,
  weightFieldsFor,
} from './weights';

/** その行がいま表にあるか。**表は別担当が足したり外したりしている**ので、
 *  「この題名がこの行に当たる」は行がある前提でしか主張できない。 */
const hasLine = (id: string) => WEIGHT_CATEGORIES.some((c) => c.lines.some((l) => l.id === id));

describe('resolving a weight from a title', () => {
  test('a Nendoroid is 439 g, with the sample behind it', () => {
    const r = resolveWeight('Nendoroid Hatsune Miku');
    expect(r.grams).toBe(439);
    expect(r.tier).toBe('estimate');
    expect(r.categoryId).toBe('figures');
    expect(r.lineId).toBe('nendoroid');
    expect(r.source).toContain('Nendoroid');
    expect(r.source).toContain('n=426');
  });

  test('a 1/7 scale figure is 1,500 g', () => {
    const r = resolveWeight('1/7 scale figure');
    expect(r.grams).toBe(1500);
    expect(r.lineId).toBe('scale-1-7');
  });

  test('a line carries its P25–P75 — the range the winner may move in', () => {
    // ねんどろいどは 380–600 g。この幅だけで1位が替わるカートが実在する（compare.test.ts）。
    expect(resolveWeight('Nendoroid Hatsune Miku').rangeG).toEqual([380, 600]);
    // 1/7 は全件 1,500 g。幅が無いことも幅として返す（0 や null にしない）。
    expect(resolveWeight('1/7 scale figure').rangeG).toEqual([1500, 1500]);
    expect(resolveWeight('剣道胴 胴単品').rangeG).toEqual([1500, 7500]);
  });

  test('Japanese titles hit the same lines', () => {
    expect(resolveWeight('ねんどろいど 初音ミク').grams).toBe(439);
    expect(resolveWeight('ポップアップパレード ネズコ').lineId).toBe('pop-up-parade');
  });

  test('the longer word wins when two lines match', () => {
    // 'pop up parade' と '1/7' の両方に当たる。長い方を採る。
    const r = resolveWeight('Pop Up Parade 1/7 scale Rem');
    expect(r.lineId).toBe('pop-up-parade');
    expect(r.grams).toBe(800);
  });

  test('matching ignores case', () => {
    expect(resolveWeight('NENDOROID MIKU').grams).toBe(439);
    expect(resolveWeight('nendoroid miku').grams).toBe(439);
  });
});

// ── docs/audit/logic.md 第5節の誤爆。1つの数字が「確定した重量」として出て
//    段の表が消えるので、外すと 30 倍ずれたまま画面に残る。null か妥当値で固定する。
describe('titles that must not be read as a weight (audit logic.md §5)', () => {
  test('a date or a deadline is not a figure scale', () => {
    // 1/7(火) は締切、2024/1/8 は発売日。どちらも 1,500 g / 1,300 g のフィギュアではない。
    // 前2件は 'トレカ' を表に入れたので null ではなく 50 g（カード）に落ちる。
    // logic.md 第5節が「妥当な値 ~50 g」と書いていたのがこれで、null より強い固定になる。
    // ここで守るのは「スケールとして読まないこと」なので、行 id でそれを見る。
    for (const t of ['【1/7(火)まで】限定出品 トレカ', '2024/1/8 発売予定 トレーディングカード']) {
      const r = resolveWeight(t);
      expect(r.lineId).toBe('single-card');
      expect(r.grams).toBe(50);
      expect(r.categoryId).not.toBe('figures');
    }
    // カードの語が無ければ今までどおり何も出さない。
    expect(resolveWeight('11/4 発送 ポスター').grams).toBeNull();
    expect(resolveWeight('【1/7(火)まで】限定出品 ポスター').grams).toBeNull();
  });

  test('a scale without a figure is doll clothing, not the doll', () => {
    const r = resolveWeight('1/6 ドール 服');
    expect(r.grams).toBeNull();
    expect(r.lineId).toBeNull();
  });

  test('a bonus CD does not turn a Nendoroid into 100 g', () => {
    const r = resolveWeight('ねんどろいど 初音ミク 初回限定CD付き');
    expect(r.grams).toBe(439);
    expect(r.lineId).toBe('nendoroid');
  });

  test('the machine, the case and the sticker are not the disc', () => {
    expect(resolveWeight('compact disc player Sony').grams).toBeNull();
    expect(resolveWeight('Vinyl sticker 10 sheets').grams).toBeNull();
    expect(resolveWeight('レコード 収納 ラック').grams).toBeNull();
  });

  test('a cane for the elderly is not a jo staff', () => {
    expect(resolveWeight('杖 ステッキ 木製 高齢者用').grams).toBeNull();
  });

  test('a bottle size alone does not say the bottle holds sake', () => {
    // 700 ml のジュース 24 本を四合瓶 1,420 g として読んでいた。
    expect(resolveWeight('ジュース 700ml ペットボトル 24本').grams).toBeNull();
    expect(resolveWeight('ミネラルウォーター 1800ml').grams).toBeNull();
  });

  test('a rarity code on a badge is not a card', () => {
    expect(resolveWeight('SSR ウマ娘 缶バッジ 未開封').grams).toBeNull();
  });

  test('a kids uniform does not get the adult median', () => {
    // 表の中央値はすべて大人用の実測から取った（sports-goods）。
    expect(resolveWeight('空手着 上下セット 女児 120cm').grams).toBeNull();
    expect(resolveWeight('剣道 防具セット ジュニア').grams).toBeNull();
  });

  test('a record obi strip is not a martial-arts belt', () => {
    expect(resolveWeight('OBI 帯のみ').grams).toBeNull();
  });

  test('an assortment box is not one snack', () => {
    expect(resolveWeight('snack box japan').grams).toBeNull();
    expect(resolveWeight('お菓子 詰め合わせ').grams).toBeNull();
  });

  test('a book about a thing is not the thing', () => {
    // 「腕時計の図鑑」に腕時計の 839 g が付いていた（本番検索の実タイトル）。
    expect(resolveWeight('腕時計の図鑑 ~世界のハイブランドウォッチを1冊に収めた完全 ...').grams).toBeNull();
    expect(resolveWeight('フィギュアの達人 上級編 | 模型の王国 |本 | 通販 | Amazon').grams).toBeNull();
    expect(resolveWeight('フィギュアの教科書 原型入門編 | 模型の王国 |本 | 通販 | Amazon').grams).toBeNull();
    expect(resolveWeight('ポケモンカード 攻略本').grams).toBeNull();
    expect(resolveWeight('剣道 入門編 ムック').grams).toBeNull();
  });

  test('a large-format book is not the novel we measured either', () => {
    // 図鑑・教科書・ムックは大判で、books-manga が持つ小説 408 g / 漫画の単巻 210 g とも
    // 別の物（index.json partialGaps）。**書籍カテゴリにも当てさせない。**
    expect(resolveWeight('マンガ図鑑').grams).toBeNull();
    expect(resolveWeight('コミック 教科書 入門編').grams).toBeNull();
  });

  test('a disc box set does not borrow the manga box set', () => {
    // 2,000 g は BOOKOFF USA の**漫画**の全巻セットで測った値。数字が近くても、
    // アニメの円盤に当てると画面が「漫画の店で読んだ」と名乗る。
    expect(resolveWeight('アニメ DVD 全巻セット').grams).toBeNull();
    expect(resolveWeight('攻殻機動隊 Blu-ray BOX').grams).toBeNull();
    // 本の全巻セットは今までどおり当たる。
    expect(resolveWeight('進撃の巨人 全巻セット 1-34巻').lineId).toBe('manga-set');
  });

  test('a system name without the machine is the game, not the machine', () => {
    // 3,350 g は整備済みの箱入りセット。ソフトに当てると33倍ちがう。
    expect(resolveWeight('ファミコン ソフト スーパーマリオ').grams).toBeNull();
    expect(resolveWeight('プレイステーション2 ソフト ドラクエ').grams).toBeNull();
    // 本体だと名乗っていれば当たる。
    expect(resolveWeight('スーパーファミコン 本体 ジャンク').lineId).toBe('home-console');
    expect(resolveWeight('NEC PCFX PC-FX 日本電気ホームエレクトロニクス ゲーム機').grams).toBe(3350);
  });

  test('figure skating is not a figure', () => {
    expect(resolveWeight('フィギュアスケート 衣装').grams).toBeNull();
  });

  test('a how-to book about figures is not a figure either', () => {
    // 「フィギュアの達人 初級編」は '初級編' で塞がっていたのに、語が1つ違う
    // 「フィギュアの作り方 入門書」は総称ライン 800 g を名乗って通り抜けていた。
    for (const t of [
      'フィギュアの作り方 入門書', 'フィギュア製作 ガイドブック',
      'フィギュアの描き方 解説書', 'ねんどろいど 設定資料集',
    ]) {
      expect(resolveWeight(t).grams, t).toBeNull();
    }
  });

  test('the case, the sleeve and the stand are not the thing they hold', () => {
    // 総称の 'フィギュア' 'トレカ' を表に入れた副作用。中身の重量は容れ物の重量ではない。
    // **容れ物そのものの重量は取れていない**ので、当てずに仮置きへ落ちるのが正しい。
    for (const t of [
      'フィギュア用 アクリルケース 展示用', 'フィギュア ディスプレイケース 5体収納',
      'フィギュア台座 スタンド 10個', 'フィギュア収納ボックス', 'ねんどろいど 専用ケース',
      '1/7 スケール フィギュア用 アクリルケース',
      'トレカ用スリーブ 100枚', 'トレカ ケース ローダー 25枚', 'トレカ バインダー 収納',
      'スニーカーボックス 収納ケース', 'スニーカー用シューキーパー', 'スニーカー 靴紐 3足分',
    ]) {
      expect(resolveWeight(t).grams, t).toBeNull();
    }
    // デッキケースは容れ物。表に容れ物の行があればそれに当たり、無ければ黙る。
    // **どちらにせよ中身のシングル 50 g には流れない**——それがこの門の仕事。
    expect(resolveWeight('PSA トレカ デッキケース').lineId).not.toBe('single-card');
    expect(resolveWeight('PSA トレカ デッキケース').lineId).not.toBe('graded-slab');
    // **門は本物の出品を食わない。**中身を売っている出品は今までどおり当たる。
    expect(resolveWeight('ワンピース フィギュア ルフィ 正規品').lineId).toBe('figure-generic');
    expect(resolveWeight('トレカ プロモカード 5種11枚').lineId).toBe('single-card');
    expect(resolveWeight('レア 当時物 ヴィンテージ NIKE スニーカー').lineId).toBe('sneaker-casual');
    expect(resolveWeight('1/7 スケール フィギュア レム').lineId).toBe('scale-1-7');
  });

  test('a graded slab is never read as a raw single, whatever word is longest', () => {
    // 'トレーディングカード'(10文字) は 'psa'(3文字) より長い。語の長さで決めると
    // スラブ 100 g が生カード 50 g に流れる。tcg-singles.json の「graded-slab を先に見ること」。
    for (const t of ['PSA10 リザードン トレーディングカード', 'BGS9.5 トレカ', 'CGC9 single card']) {
      expect(resolveWeight(t).lineId).toBe('graded-slab');
      expect(resolveWeight(t).grams).toBe(100);
    }
  });

  test('a film on a disc does not get the weight of a K-pop concert box', () => {
    // 1,750 g は K-POP 専門店で測った DVD/Blu-ray の値（ライブ映像＋写真集の箱）。
    // 映画1枚に当てると17倍ちがう。本番検索が返した実タイトル2件がこれだった。
    expect(resolveWeight('Amazon.co.jp: カメラを止めるな! [DVD] : 濱津隆之: DVD').grams).toBeNull();
    expect(resolveWeight('君の名は。 Blu-ray 通常版').grams).toBeNull();
    // K-POP の文脈があれば今までどおり当たる。
    expect(resolveWeight('SEVENTEEN ワールドツアー DVD').lineId).toBe('dvd-bluray');
    expect(resolveWeight('BTS concert blu-ray').grams).toBe(1750);
  });

  test('a hakama listing still resolves — the guard must not eat the real hits', () => {
    expect(resolveWeight('袴 単品 男性用').lineId).toBe('hakama');
    expect(resolveWeight('剣道 袴 27号').lineId).toBe('hakama');
  });

  // ── 段0: 出品ではない題名。母数の off-target 49 件のうち 10 件に重量が付いていた。
  test('a shop front and a category page get nothing, whatever words they carry', () => {
    for (const t of [
      'スニーカー - ハニーズ Yahoo!店',
      '駿河屋Yahoo!店 - フィギュア',
      'ZOZOTOWN Yahoo!店 - スニーカー',
      '【楽天市場】シューズ・靴 > スニーカー：SHOPLIST',
      '【楽天市場】 PEライン/釣り糸 : SOZOKI',
      '三省堂書店 - 【楽天市場】 コミック全巻セット',
      'アイムロワ お菓子 カップ麺 詰め合わせ - お菓子｜Yahoo!ショッピング',
      '【2026年最新】Yahoo!オークション -禰豆子 フィギュアの中古品・新品・未使用品一覧',
      '五番街〜バッグ・財布のお店',
    ]) expect(resolveWeight(t).grams, t).toBeNull();
  });

  test('the shop-front gate reads the form, so real items from the same shops still resolve', () => {
    // 商品ページは ' - 通販 - ' を挟み、楽天は '】' の直後から商品名が始まる。
    expect(resolveWeight('シマノ 22 ステラ 2500S スピニングリール : つり具のマルニシYahoo!店 - 通販 - Yahoo!ショッピング').lineId)
      .toBe('spinning-reel');
    expect(resolveWeight('【楽天市場】初音ミク キョンシー Ver. 1/7 スケール フィギュア：chummys 楽天市場店').lineId)
      .toBe('scale-1-7');
  });

  // ── 口数の出品。個数を掛ける処理は持たないので、当てずに黙る。
  test('a lot of N things does not get the weight of one thing', () => {
    for (const t of [
      'ファミコン ソフト まとめ売り 19本セット - メルカリ',
      'PS4 ゲームソフト まとめ売り（10本） - メルカリ',
      'ワンピース 一番くじ プライズ フィギュア まとめ売り 9点',
      '人気 カップ麺 12種類 詰め合わせ セット 12個アソート',
      'ソフトルアー ワーム 10個セット ソフトベイト 疑似餌',
      '芋焼酎 1800ml 一升瓶 2本セット - メルカリ',
      'Amazon.co.jp: 漫画 全巻 まとめ セット 137冊 : Toys & Games',
    ]) expect(resolveWeight(t).grams, t).toBeNull();
  });

  test('a set that is one product keeps its own line', () => {
    // 全巻セット・上下セット・防具セットは口数ではなく、その形で1つの商品。
    expect(resolveWeight('ワンピース 1〜114巻セット 全巻 尾田栄一郎').lineId).toBe('manga-set');
    expect(resolveWeight('空手着 上下セット 空手衣 大人用').lineId).toBe('budo-uniform-set');
    expect(resolveWeight('剣道防具セット 一式').lineId).toBe('kendo-bogu-set');
  });

  test('packaging, parts, clones and paint codes are not the thing', () => {
    expect(resolveWeight('【空箱のみ】ぶいすぽっ！ スケールフィギュア GiGO').grams).toBeNull();
    expect(resolveWeight('1/6 フィギュア ドール 用 ヘッド 植毛タイプ 塗装済').grams).toBeNull();
    expect(resolveWeight('スーパーファミコン 本体 互換機 SFC互換 ゲーム機').grams).toBeNull();
    expect(resolveWeight('【楽天市場】タミヤ ラッカー塗料 LP-70 アルミシルバー 塗料').grams).toBeNull();
    expect(resolveWeight('クロス西洋剣 模造刀 模擬刀 日本刀 居合刀').grams).toBeNull();
    expect(resolveWeight('【中古】SDガンダムフルカラー ウォドム フィギュア').grams).toBeNull();
  });

  test('a sealed card box and a photocard binder are not one card', () => {
    // 未開封の箱は 30 パック入り。**シングル 50 g ではない**（7 倍）。箱の行が表に
    // 入れば箱の行に、無ければ黙る。ゲーム名の語を足した副作用をここで止めている。
    expect(resolveWeight('ポケモンカード151 BOX シュリンク付き 新品 未開封 ポケカ').lineId).not.toBe('single-card');
    expect(resolveWeight('Kpop Photo Card Binder with 6 Sticker Sheets & 50 Sleeves, Photo Card Holder').grams).toBeNull();
    // 作品名はグッズにも付く。カードの 50 g をシャツに付けない。
    expect(resolveWeight('遊戯王 ブラックマジシャン ユニクロ Tシャツ メンズ').lineId).not.toBe('single-card');
  });

  test('an accessory is not the thing it is for', () => {
    // 2026-09-08 に入った行（カメラ・プラモデル・化粧品）に付属品が流れ込んでいた。
    expect(resolveWeight('カメラストラップ 一眼レフ ミラーレス - メルカリ').grams).toBeNull();
    expect(resolveWeight('塗装作業ベース ホビー 塗装用具 プラモデル 模型 フィギュア 塗料').grams).toBeNull();
    expect(resolveWeight('ガンダムマーカー 塗装用 GSI クレオス 塗料 ラッカー プラモデル').grams).toBeNull();
    // 'ストレイトナー' の中の 'トナー' が化粧水に当たっていた。日本語に語の境界は無い。
    expect(resolveWeight('ダイソン Dyson Airstrait ストレイトナー ドライヤー ヘアアイロン').grams).toBeNull();
    // 門は本物の出品を食わない。**その行が表にある限り**、本体は今までどおり当たる
    // （カメラ・模型の行は 2026-09-08 現在まだ表に繋がったり外れたりしている）。
    if (hasLine('dslr-body')) expect(resolveWeight('Nikon D850 ボディ デジタル 一眼レフ カメラ 中古').lineId).toBe('dslr-body');
    if (hasLine('plastic-model')) expect(resolveWeight('HG 1/144 ハンブラビ 組み立て式プラモデル').lineId).toBe('plastic-model');
  });

  test('a run of a magazine is not a manga set and not one issue', () => {
    expect(resolveWeight('【付録完備】ONE PIECE ワンピース マガジン 漫画 全巻 セット').grams).toBeNull();
    // 片方だけなら普通の巻・普通の号。門は2つ揃ったときだけ閉じる。
    expect(resolveWeight('ONE PIECE 漫画 105巻').lineId).toBe('manga-volume');
    expect(resolveWeight('SEVENTEEN 雑誌 表紙').lineId).toBe('magazine');
  });

  test('こどもの日 is a season, not a size', () => {
    // 端午の節句の飾りとして売られる大人向けの居合刀が、子供サイズの門で黙っていた。
    expect(resolveWeight('居合刀 模造刀 日本刀 コスプレ 端午の節句 こどもの日 鑑賞用').lineId).toBe('iaito');
    // 寸法としての子供は今までどおり落ちる。
    expect(resolveWeight('空手着 上下セット 女児 120cm').grams).toBeNull();
  });
});

// ── 誤爆を潰すために当たるべきものまで落としていないか。**両方をここで固定する。**
describe('titles that must still resolve', () => {
  test('a graded slab written without a space (PSA10 / BGS9.5) is found', () => {
    // 出品は 'PSA10' と詰めて書く。英字と数字の切れ目を境界とみなさないと落ちる。
    for (const t of ['psa10 charizard', 'PSA10 リザードン', 'BGS9.5 リザードン', 'CGC9 pikachu']) {
      const r = resolveWeight(t);
      expect(r.lineId).toBe('graded-slab');
      expect(r.grams).toBe(100);
    }
    // 空けて書いても同じ行に当たる。
    expect(resolveWeight('PSA 10 Charizard').lineId).toBe('graded-slab');
  });

  test('a word inside a longer word is still not a hit', () => {
    // 'sculpture' の 'lp'、'11/4' の '1/4'。同じ種類の文字が続く側は境界にしない。
    expect(resolveWeight('sculpture stand').grams).toBeNull();
    expect(resolveWeight('mcdonalds toy').grams).toBeNull();
  });

  test('a scale with its scale word still resolves', () => {
    expect(resolveWeight('1/4 scale figure').lineId).toBe('scale-1-4');
    expect(resolveWeight('1/6 スケール フィギュア').lineId).toBe('scale-1-6');
    expect(resolveWeight('1/8スケール 完成品').lineId).toBe('scale-1-8');
  });

  test('a bottle size with an actual drink still resolves', () => {
    expect(resolveWeight('純米大吟醸 1800ml').lineId).toBe('sake-1800ml');
    expect(resolveWeight('日本酒 720ml 純米').grams).toBe(1420);
    expect(resolveWeight('梅酒 300ml 瓶').lineId).toBe('sake-300ml');
  });

  test('a rarity code next to a card word still resolves', () => {
    expect(resolveWeight('SSR ポケモンカード').lineId).toBe('single-card');
    expect(resolveWeight('SAR トレカ').grams).toBe(50);
  });

  test('トレカ resolves — the word the live search returns most', () => {
    // 実タイトル37件中7件がトレカの出品で、全部落ちていた。50 g は tcg-singles の
    // 梱包込み単カード中央値。
    for (const t of [
      'トレカ プロモカード 非売品カード 5種11枚 - メルカリ',
      'ポケモンカード トレーディングカード ピカチュウ',
      'One Piece trading card Luffy',
    ]) {
      const r = resolveWeight(t);
      expect(r.lineId).toBe('single-card');
      expect(r.grams).toBe(50);
    }
  });

  test('トレカ in a K-pop title is the photocard, not the tcg single', () => {
    // 母数の 6 件が「K-POP のトレカ」で、28 g のフォトカードに 50 g が付いていた。
    // 決めているのは KPOP_CONTEXT のグループ名だけ。**文脈が無ければ動かさない。**
    for (const t of [
      'RIIZE ソンチャン 会報 トレカ 紹介特典 - メルカリ',
      'BOYNEXTDOOR 新規入会 ボネクド トレカ 紹介',
      '超特急 リョウガ トレカ NO.135 サバイバー - メルカリ',
    ]) {
      const r = resolveWeight(t);
      expect(r.lineId, t).toBe('photocard');
      expect(r.grams, t).toBe(28);
    }
    // グループ名が無ければ今までどおり TCG のシングル。
    expect(resolveWeight('トレカ 1枚 美品 - メルカリ').lineId).toBe('single-card');
  });

  test('a disc is 100 g outside K-pop and the album package inside it', () => {
    // 同じ 'アルバム' が別の物を指す。8 倍ちがうので、どちらに倒すかは文脈で決める。
    expect(resolveWeight('初音ミク「マジカルミライ 2023」OFFICIAL ALBUM【限定盤】 | HMV&BOOKS online').lineId).toBe('cd');
    expect(resolveWeight('SEVENTEEN 11th Mini Album「SEVENTEENTH HEAVEN」').lineId).toBe('album');
    // Weverse 版はプラットフォームアルバム（400 g）で、通常盤の箱ではない。
    expect(resolveWeight('ARIRANG (Weverse Albums Ver.) : BTS | HMV&BOOKS online').lineId).toBe('platform-album');
    // ディスクと写真集の同梱はアルバムの箱。写真集単体（1,000 g）ではない。
    expect(resolveWeight('【中古:盤質A】 #TWICE 【初回限定盤A】 (CD+写真集)').lineId).toBe('album');
    expect(resolveWeight('TWICE サナ 写真集 Yes, I am Sana.').lineId).toBe('photobook');
  });

  test('the game names and the platform-plus-ソフト forms find the card and the cartridge', () => {
    expect(resolveWeight('遊戯王カード PSYフレームギア・δ レリーフ アルティメット').lineId).toBe('single-card');
    expect(resolveWeight('Pokemon Card Game s8a 25th Anniversary Collection Meu UR').lineId).toBe('single-card');
    expect(resolveWeight('ファミコンソフト - メルカリ').lineId).toBe('game-software');
    // 機種名だけなら今までどおり本体を名乗らせない。
    expect(resolveWeight('ファミコン 中古').grams).toBeNull();
  });

  test('an English complete set is the set, not one volume', () => {
    for (const t of [
      'Jump Comics/Akira Toriyama "Dragon Ball Complete 42 Volume First Edition Set"',
      'Manga WILD HALF Yuko Asami Complete Volume Set Complete 17 Volumes',
      'The Girl I Want is So Handsome! - The Complete Manga Collection',
    ]) expect(resolveWeight(t).lineId, t).toBe('manga-set');
    expect(resolveWeight('ONE PIECE 漫画 105巻').lineId).toBe('manga-volume');
  });

  test('the generic figure line catches the plain listings and loses to every specific one', () => {
    // logic.md 第5節の取りこぼし。日本語の総称トークンが1つも無かった。
    for (const t of ['フィギュア 初音ミク 未開封', 'ドラゴンボール 一番くじ フィギュア A賞']) {
      const r = resolveWeight(t);
      expect(r.lineId).toBe('figure-generic');
      expect(r.grams).toBe(800);
    }
    // **総称は個別ラインに勝たない。**語の長さでは 'フィギュア' が '1/7' に勝つので、
    // ここが崩れるとスケール行が全部 800 g になる。
    expect(resolveWeight('1/7 スケール フィギュア レム').lineId).toBe('scale-1-7');
    expect(resolveWeight('ねんどろいど フィギュア 初音ミク').lineId).toBe('nendoroid');
    expect(resolveWeight('figma フィギュア').lineId).toBe('figma');
  });

  test('a line names the shop it was read from, not the category first source', () => {
    // games は本体と ソフトで店が違う。sources[0] を常に名乗ると片方が嘘になる。
    expect(resolveWeight('スーパーファミコン 本体').source).toContain('www.retroasia.com');
    // 'まとめ売り' は口数の門で黙るようになったので、1本の題名で見る。
    expect(resolveWeight('ゲームソフト ドラゴンクエスト').source).toContain('japan-figure.com');
    expect(resolveWeight('ONE PIECE 漫画 105巻').source).toContain('jpbookstore.com');
    expect(resolveWeight('進撃の巨人 全巻セット').source).toContain('shop.bookoffusa.com');
  });

  test('a jo and an obi with their martial-arts word still resolve', () => {
    expect(resolveWeight('杖道 杖 樫').lineId).toBe('bokuto');
    expect(resolveWeight('karate obi black').lineId).toBe('budo-obi');
  });

  test('kids lines and size-free budo parts survive a kids title', () => {
    // キッズの行そのもの、および寸法でほとんど変わらない帯・袋には効かせない。
    expect(resolveWeight('キッズ地下足袋 24cm').lineId).toBe('tabi-sneaker-kids');
    expect(resolveWeight('剣道 防具袋 子供用').lineId).toBe('budo-bag');
    expect(resolveWeight('空手帯 子供').lineId).toBe('budo-obi');
  });

  test('every match word in the table still finds its own line on its own', () => {
    // 裏付けを要求した語だけが例外。ここが増えたら「絞りすぎ」を疑う。
    const gated = new Set([
      '1/4', '1/6', '1/7', '1/8',
      'sar', 'csr', 'ssr',
      '1800ml', '1,800ml', '1.8l', '1800ｍｌ', '720ml', '750ml', '700ml', '720ｍｌ', '300ml', '300ｍｌ',
      'obi', '杖',
      // 'シングル' はカードの枚数にも CD の形式にも、茶やコーヒーの産地にも使う。
      // 'single card' は語そのものが裏付け（'card' を含む）なので門を通る。
      'シングル',
      // 機種名。'ファミコン ソフト' は 100 g のカセットで、3,350 g の本体ではない。
      'ファミコン', 'famicom', 'ニンテンドー64', 'nintendo 64', 'ゲームキューブ', 'gamecube',
      'ドリームキャスト', 'dreamcast', 'セガサターン', 'sega saturn', 'ネオジオ', 'neogeo', 'neo geo',
      'pcエンジン', 'pc engine', 'pc-fx', 'pcfx', 'メガドライブ', 'mega drive', 'megadrive',
      'プレイステーション', 'playstation', 'プレステ',
      // 映像ディスク。1,750 g は K-POP のライブ箱の値で、映画の1枚とは別物。
      'dvd', 'ブルーレイ', 'blu-ray', 'bluray',
    ]);
    // 語だけなら**別の行が正しい**もの。K-POP のアルバム（800 g）と日本の CD（100 g）は
    // 8 倍ちがい、'アルバム' だけならディスク1枚と読むのが正しい。
    const rerouted: Record<string, string> = { 'アルバム': 'cd', 'album': 'cd' };
    const missed: string[] = [];
    for (const c of WEIGHT_CATEGORIES) {
      for (const l of c.lines) {
        for (const m of l.match) {
          if (gated.has(m)) {
            expect(resolveWeight(m).grams, m).toBeNull();
            continue;
          }
          if (m in rerouted) {
            expect(resolveWeight(m).lineId, m).toBe(rerouted[m]);
            continue;
          }
          if (resolveWeight(m).lineId !== l.id) missed.push(`${c.category}/${l.id}: "${m}"`);
        }
      }
    }
    expect(missed).toEqual([]);
  });
});

// ── 当たらないときに何かを返してはいけない。ここが崩れると総額が嘘になる。
describe('a title we cannot resolve stays unresolved', () => {
  test('no fallback, no guess, no zero', () => {
    const r = resolveWeight('この題名は表のどの行にも当たらない');
    expect(r.grams).toBeNull();
    expect(r.grams).not.toBe(0);
    expect(r.tier).toBe('none');
    expect(r.source).toBeNull();
    expect(r.categoryId).toBeNull();
    expect(r.lineId).toBeNull();
  });

  test('an unrelated title gets nothing either', () => {
    for (const title of ['qwertyuiop zxcvbnm', '', '   ']) {
      expect(resolveWeight(title).grams).toBeNull();
      expect(resolveWeight(title).tier).toBe('none');
    }
  });

  test('an unknown category id does not open a fallback', () => {
    const r = resolveWeight('ぬいぐるみ', 'plushies-we-never-measured');
    expect(r.grams).toBeNull();
    expect(r.tier).toBe('none');
    expect(r.rangeG).toBeNull();
  });
});

// ── 計算機がカートに入れる重量。**null は入れない。**当たらなければ仮置きと名乗る。
describe('the weight the calculator puts on a cart item', () => {
  test('a title on the table gets the line: median, P25–P75, origin table, link id', () => {
    const w = weightFieldsFor('Nendoroid Kagamine Rin (example)');
    expect(w).toEqual({
      weightG: 439,
      weightTier: 'estimate',
      weightSource: 'Nendoroid · n=426 · 1.6x · www.solarisjapan.com',
      weightOrigin: 'table',
      weightRangeG: [380, 600],
      weightLineId: 'nendoroid',
    });
  });

  test('a title off the table gets the assumed weight and says so', () => {
    const w = weightFieldsFor('この題名は表のどの行にも当たらない');
    expect(w.weightG).toBe(ASSUMED_WEIGHT_G);
    expect(w.weightG).not.toBeNull();
    expect(w.weightG).not.toBe(0);
    // 仮置きは推定。確定に見せない。'none' は「—」の段階で、数字が入る以上は使わない。
    expect(w.weightTier).toBe('estimate');
    expect(w.weightOrigin).toBe('assumed');
    // 出所・ライン・幅は無い。**でっち上げない。**
    expect(w.weightSource).toBeNull();
    expect(w.weightLineId).toBeNull();
    expect(w.weightRangeG).toBeNull();
  });

  test('the assumed weight is the 1 kg EMS step, and the range we test it over is the step table', () => {
    // 1,000 g: 丸い数字なので測った値に見えない。2〜5点で1位が替わる 1,150〜1,625 g のすぐ下に
    // あるので、×1/3〜×3 の判定（333〜3,000 g）が交差点を必ず跨ぐ（docs/UI-DESIGN.md §4）。
    expect(ASSUMED_WEIGHT_G).toBe(1000);
    expect(ASSUMED_WEIGHT_RANGE_G).toEqual([500, 10000]);
    expect(ASSUMED_WEIGHT_RANGE_G).toEqual([
      UNKNOWN_WEIGHT_STEPS_G[0], UNKNOWN_WEIGHT_STEPS_G[UNKNOWN_WEIGHT_STEPS_G.length - 1],
    ]);
  });

  test('resolveWeight itself still refuses to guess — the assumption lives one layer up', () => {
    expect(resolveWeight('この題名は表のどの行にも当たらない').grams).toBeNull();
    expect(weightFieldsFor('この題名は表のどの行にも当たらない').weightG).toBe(ASSUMED_WEIGHT_G);
  });
});

describe('a category the user picked by hand', () => {
  test('the category average is used only when the user names the category', () => {
    expect(resolveWeight('この題名は表のどの行にも当たらない').grams).toBeNull();
    const r = resolveWeight('この題名は表のどの行にも当たらない', 'figures');
    expect(r.grams).toBe(1000);
    expect(r.tier).toBe('estimate');
    expect(r.source).toBe('Figures category average');
    expect(r.categoryId).toBe('figures');
    expect(r.lineId).toBeNull();
  });

  test('a named category does not borrow lines from another one', () => {
    // 'cd' は music のライン。figures を指定したら当ててはいけない。
    expect(resolveWeight('CD box set').lineId).toBe('cd');
    const r = resolveWeight('CD box set', 'figures');
    expect(r.categoryId).toBe('figures');
    expect(r.lineId).toBeNull();
    expect(r.grams).toBe(1000);
  });

  test('a line inside the named category still wins over its average', () => {
    const r = resolveWeight('Nendoroid Miku', 'figures');
    expect(r.lineId).toBe('nendoroid');
    expect(r.grams).toBe(439);
  });
});

describe('the weight data itself', () => {
  test('categories are unique and carry their sources', () => {
    const ids = WEIGHT_CATEGORIES.map((c) => c.category);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('figures');
    expect(ids).toContain('music');
    for (const c of WEIGHT_CATEGORIES) {
      expect(c.lines.length).toBeGreaterThan(0);
      expect(c.sources.length).toBeGreaterThan(0);
      // Shopify の grams は実測ではない。measured を勝手に立てない。
      expect(typeof c.measured).toBe('boolean');
    }
  });

  test('every line has a usable median between its quartiles', () => {
    for (const c of WEIGHT_CATEGORIES) {
      for (const l of c.lines) {
        expect(l.medianG).toBeGreaterThan(0);
        expect(l.p25).toBeLessThanOrEqual(l.medianG);
        expect(l.p75).toBeGreaterThanOrEqual(l.medianG);
        expect(l.match.length).toBeGreaterThan(0);
        expect(l.match.every((m) => m.length > 0)).toBe(true);
      }
    }
  });

  test('a fallback is either a real number of grams or refused outright', () => {
    for (const c of WEIGHT_CATEGORIES) {
      if (c.fallbackG == null) expect(c.fallbackTier).toBe('none');
      else expect(c.fallbackG).toBeGreaterThan(0);
    }
  });

  test('categoryById finds what exists and nothing else', () => {
    expect(categoryById('figures')?.labelEn).toBe('Figures');
    expect(categoryById('music')?.lines.map((l) => l.id)).toEqual(['cd', 'lp']);
    expect(categoryById('nope')).toBeUndefined();
  });
});
