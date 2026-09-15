import Link from 'next/link';

/**
 * マストヘッド。Mock v3 の `.mast`（ロゴ ＋ ナビ）をそのまま。
 * Mock の「⌘K change」コマンドバーは移していない——Mock 自身が
 * 「accelerator only; every command also has a visible control」と書いており、
 * 見える操作子（条件欄）がすべて揃っているので、本体には入れない。
 */
export function SiteHeader() {
  return (
    <header className="mast">
      <h1>
        <Link href="/" style={{ color: 'inherit', textDecoration: 'none' }}>
          proxy<i>cost</i>
        </Link>
      </h1>
      <nav aria-label="Site">
        <Link href="/weights">Weights</Link>
        <Link href="/sources">Sources</Link>
      </nav>
    </header>
  );
}
