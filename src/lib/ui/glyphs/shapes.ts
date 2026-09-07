// 引き当て表。**1行1品目、パラメータだけ。**形は固定のルックアップで、生成はしない
// （プロダクトの規約）。同じ id は必ず同じ形になる。
// id は src/data/weights.ts の重量ライン id。69ライン全部をここが覆う
// （glyphs.test.ts が WEIGHT_CATEGORIES を回して固定している）。

export interface BoxP {
  fam: 'box';
  w: number; h: number; d: number;
  /** 正面の窓 [x, y, w, h]（面に対する比）。 */
  win?: [number, number, number, number];
  band?: 'top' | 'bottom';
  mark?: string;
  lid?: boolean;
}
export interface CardP {
  fam: 'card';
  kind: 'photo' | 'sleeve' | 'slab';
  w: number; h: number; d: number; r: number;
}
export interface MediaP {
  fam: 'media';
  w: number; h: number; d: number;
  disc?: 'ring' | 'label';
  qr?: boolean; band?: boolean; topband?: boolean; spine?: boolean; masthead?: boolean;
}
export interface BagP {
  fam: 'bag';
  kind: 'wallet' | 'pouch' | 'handbag' | 'shoulder' | 'tote' | 'boston' | 'weaponbag';
}
export interface ShoeP {
  fam: 'shoe';
  len: number; h: number; sole: number;
  split: boolean; kohaze?: number; laces?: boolean; whitesole?: boolean;
  toecap?: boolean; lugs?: boolean; tone?: 'l' | 'p';
}
export interface BottleP {
  fam: 'bottle';
  w: number; h: number; neckW: number; neckH: number; shoulder: number;
  cap: number; round?: boolean; label: [number, number];
}
export interface PacketP {
  fam: 'packet';
  kind: 'pillow' | 'standup' | 'brick' | 'zip' | 'parts';
}
export interface BlisterP {
  fam: 'blister';
  w: number; h: number; bub: [number, number];
  content: 'terminal' | 'jig' | 'minnow' | 'jighead' | 'egi' | 'spool';
}
export interface ReelP {
  fam: 'reel';
  kind: 'unknown' | 'spinning' | 'bait' | 'electric';
}
export interface LongP {
  fam: 'long';
  kind: 'lightstick' | 'bokuto' | 'shinai' | 'iaito' | 'yumi' | 'rod';
  len?: number; ferrules?: number; guides?: number;
  /** 種類が不明。決め手を剥ぎ取って点線で描く。 */
  unknown?: boolean;
  /** 送れる長さかどうかが怪しい。上端に赤い破線を引く。 */
  lengthCheck?: boolean;
}
export interface GarmentP {
  fam: 'garment';
  kind: 'obi' | 'hakama' | 'pants' | 'jacket' | 'set';
}
export interface BoguP {
  fam: 'bogu';
  kind: 'tare' | 'kote' | 'do' | 'men' | 'set';
}

export type GlyphShape =
  | BoxP | CardP | MediaP | BagP | ShoeP | BottleP
  | PacketP | BlisterP | ReelP | LongP | GarmentP | BoguP;

export const SHAPES: Record<string, GlyphShape> = {
  // Box — 立てた化粧箱。窓の位置・底帯・比率で振る。
  'nendoroid': { fam: 'box', w: 40, h: 44, d: 16, win: [0.14, 0.14, 0.72, 0.58] },
  'figma': { fam: 'box', w: 28, h: 62, d: 10, win: [0.1, 0.14, 0.56, 0.72], band: 'top' },
  'pop-up-parade': { fam: 'box', w: 30, h: 70, d: 12, win: [0.2, 0.1, 0.6, 0.7], band: 'bottom' },
  'scale-1-8': { fam: 'box', w: 44, h: 74, d: 20, win: [0.12, 0.1, 0.76, 0.7], band: 'bottom', mark: '1/8' },
  'scale-1-7': { fam: 'box', w: 48, h: 82, d: 22, win: [0.12, 0.1, 0.76, 0.7], band: 'bottom', mark: '1/7' },
  'scale-1-6': { fam: 'box', w: 52, h: 90, d: 24, win: [0.12, 0.1, 0.76, 0.7], band: 'bottom', mark: '1/6' },
  'scale-1-4': { fam: 'box', w: 62, h: 104, d: 30, win: [0.12, 0.1, 0.76, 0.7], band: 'bottom', mark: '1/4' },
  'luxury-watch': { fam: 'box', w: 40, h: 34, d: 24, lid: true },
  // Card — 1枚のカード。むき出し／スリーブ／鑑定済スラブ。
  'photocard': { fam: 'card', kind: 'photo', w: 30, h: 44, d: 1.6, r: 3 },
  'single-card': { fam: 'card', kind: 'sleeve', w: 32, h: 46, d: 2, r: 1.5 },
  'graded-slab': { fam: 'card', kind: 'slab', w: 46, h: 66, d: 7, r: 2.5 },
  // Flat media — 棚に挿す平物。
  'cd': { fam: 'media', w: 36, h: 36, d: 3, disc: 'ring' },
  'lp': { fam: 'media', w: 62, h: 62, d: 1.4, disc: 'label' },
  'platform-album': { fam: 'media', w: 26, h: 38, d: 4, qr: true },
  'album': { fam: 'media', w: 46, h: 46, d: 11, band: true },
  'dvd-bluray': { fam: 'media', w: 34, h: 50, d: 5, topband: true },
  'photobook': { fam: 'media', w: 42, h: 58, d: 6, spine: true },
  'magazine': { fam: 'media', w: 40, h: 58, d: 2.4, masthead: true },
  // Bag — 柔らかい胴。持ち手が種類を言う。
  'wallet-small-leather': { fam: 'bag', kind: 'wallet' },
  'pouch-clutch': { fam: 'bag', kind: 'pouch' },
  'handbag': { fam: 'bag', kind: 'handbag' },
  'shoulder-crossbody': { fam: 'bag', kind: 'shoulder' },
  'tote': { fam: 'bag', kind: 'tote' },
  'boston-duffle': { fam: 'bag', kind: 'boston' },
  'budo-bag': { fam: 'bag', kind: 'weaponbag' },
  // Footwear — 横から見た片足、つま先は左。
  'tabi-sneaker-kids': { fam: 'shoe', len: 40, h: 16, sole: 3, split: true, kohaze: 2, tone: 'l' },
  'work-tabi': { fam: 'shoe', len: 52, h: 26, sole: 2.5, split: true, kohaze: 3 },
  'sneaker-casual': { fam: 'shoe', len: 56, h: 18, sole: 7, split: false, laces: true, whitesole: true },
  'tabi-sneaker': { fam: 'shoe', len: 56, h: 22, sole: 6, split: true, kohaze: 3, whitesole: true },
  'safety-jikatabi': { fam: 'shoe', len: 56, h: 34, sole: 8, split: true, kohaze: 4, toecap: true, lugs: true },
  'budo-tabi': { fam: 'shoe', len: 50, h: 14, sole: 1.2, split: true, kohaze: 2, tone: 'p' },
  // Bottle — 立てた瓶。肩・首・ラベルで振る。
  'seasoning-bottle': { fam: 'bottle', w: 24, h: 58, neckW: 10, neckH: 10, shoulder: 10, round: true, cap: 5, label: [0.42, 0.34] },
  'sake-300ml': { fam: 'bottle', w: 20, h: 52, neckW: 9, neckH: 12, shoulder: 10, cap: 4, label: [0.4, 0.3] },
  'sake-720ml': { fam: 'bottle', w: 24, h: 80, neckW: 9, neckH: 20, shoulder: 14, cap: 4, label: [0.36, 0.32] },
  'sake-1800ml': { fam: 'bottle', w: 30, h: 108, neckW: 10, neckH: 26, shoulder: 18, cap: 5, label: [0.34, 0.38] },
  // Packet — 柔らかい袋。封の作りが種類を言う。
  'snack-sweets': { fam: 'packet', kind: 'pillow' },
  'tea-leaf': { fam: 'packet', kind: 'standup' },
  'noodle': { fam: 'packet', kind: 'brick' },
  'soft-bait': { fam: 'packet', kind: 'zip' },
  'budo-small-parts': { fam: 'packet', kind: 'parts' },
  // Blister card — 吊り下げ台紙。**変わるのはブリスターの中身だけ。**
  'terminal-tackle': { fam: 'blister', w: 28, h: 40, bub: [20, 22], content: 'terminal' },
  'metal-jig': { fam: 'blister', w: 28, h: 66, bub: [14, 50], content: 'jig' },
  'hard-lure': { fam: 'blister', w: 36, h: 56, bub: [28, 36], content: 'minnow' },
  'jig-head': { fam: 'blister', w: 30, h: 46, bub: [22, 28], content: 'jighead' },
  'squid-jig': { fam: 'blister', w: 30, h: 64, bub: [18, 48], content: 'egi' },
  'fishing-line': { fam: 'blister', w: 40, h: 50, bub: [32, 32], content: 'spool' },
  // Reel — 足で立つリール。種類不明はシルエットだけ・点線。
  'reel': { fam: 'reel', kind: 'unknown' },
  'spinning-reel': { fam: 'reel', kind: 'spinning' },
  'baitcasting-reel': { fam: 'reel', kind: 'bait' },
  'electric-reel': { fam: 'reel', kind: 'electric' },
  // Long — 幅より長いものを立てる。長さが主軸。
  'lightstick': { fam: 'long', kind: 'lightstick' },
  'bokuto': { fam: 'long', kind: 'bokuto' },
  'shinai': { fam: 'long', kind: 'shinai' },
  'iaito': { fam: 'long', kind: 'iaito' },
  'kyudo-yumi': { fam: 'long', kind: 'yumi', lengthCheck: true },
  'rod-multipiece': { fam: 'long', kind: 'rod', len: 62, ferrules: 3, guides: 0 },
  'rod-2piece': { fam: 'long', kind: 'rod', len: 100, ferrules: 1, guides: 5 },
  'rod': { fam: 'long', kind: 'rod', len: 100, ferrules: 0, guides: 0, unknown: true },
  'rod-1piece': { fam: 'long', kind: 'rod', len: 116, ferrules: 0, guides: 6, lengthCheck: true },
  // Folded garment — 畳んだ武道衣。
  'budo-obi': { fam: 'garment', kind: 'obi' },
  'hakama': { fam: 'garment', kind: 'hakama' },
  'budo-pants': { fam: 'garment', kind: 'pants' },
  'budo-jacket': { fam: 'garment', kind: 'jacket' },
  'budo-uniform-set': { fam: 'garment', kind: 'set' },
  // Bogu — **ここだけシルエットではなく藍と漆の材質言語で括っている。**
  'kendo-tare': { fam: 'bogu', kind: 'tare' },
  'kendo-kote': { fam: 'bogu', kind: 'kote' },
  'kendo-do': { fam: 'bogu', kind: 'do' },
  'kendo-men': { fam: 'bogu', kind: 'men' },
  'kendo-bogu-set': { fam: 'bogu', kind: 'set' },
};
