// 12家族。**店のカテゴリではなく「梱包される物として何か」**で切る。だからカテゴリを跨ぐ。
// 69個を一点物として描かず、家族 × 見分けるための差分で覆う。

export const FAMILY_ORDER = [
  'box', 'card', 'media', 'bag', 'shoe', 'bottle',
  'packet', 'blister', 'reel', 'long', 'garment', 'bogu',
] as const;

export type Family = (typeof FAMILY_ORDER)[number];

/** 家族の色。**リテラルの Tailwind クラスで持つ**（v4 はソースを走査するので動的合成は消える）。
 *  グリフの中は currentColor の濃度段だけで塗るので、色の指定はここ一箇所で済む。 */
export const familyTone: Record<Family | 'unknown', string> = {
  box: 'text-sky-700 dark:text-sky-300',
  card: 'text-yellow-700 dark:text-yellow-300',
  media: 'text-purple-700 dark:text-purple-300',
  bag: 'text-rose-800 dark:text-rose-300',
  shoe: 'text-orange-700 dark:text-orange-300',
  bottle: 'text-emerald-700 dark:text-emerald-300',
  packet: 'text-teal-700 dark:text-teal-300',
  blister: 'text-cyan-700 dark:text-cyan-300',
  reel: 'text-slate-600 dark:text-slate-300',
  long: 'text-amber-800 dark:text-amber-300',
  garment: 'text-violet-600 dark:text-violet-300',
  bogu: 'text-indigo-800 dark:text-indigo-300',
  // 引き当たらなかった品。確度4段階の「未取得」と同じ dim を使う。
  unknown: 'text-neutral-500 dark:text-neutral-400',
};

export const familyName: Record<Family | 'unknown', string> = {
  box: 'Box',
  card: 'Card',
  media: 'Flat media',
  bag: 'Bag',
  shoe: 'Footwear',
  bottle: 'Bottle',
  packet: 'Packet',
  blister: 'Blister card',
  reel: 'Reel',
  long: 'Long',
  garment: 'Folded garment',
  bogu: 'Bogu',
  unknown: 'Unknown kind',
};
