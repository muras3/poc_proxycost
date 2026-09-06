// 検索まわりの型は src/lib/search/types.ts が唯一の正。
// 画面側で別に定義すると、片方だけ変えたときに静かにずれる。
export type { Candidate, ProductResponse, SearchResponse } from '@/lib/search/types';
