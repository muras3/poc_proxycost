import type { AnchorHTMLAttributes, ReactNode } from 'react';

/** プレビュー用の next/link の代役。実体は <a> なので挙動は変わらない。 */
export default function Link(
  { href, children, ...rest }: { href: string; children?: ReactNode }
    & AnchorHTMLAttributes<HTMLAnchorElement>,
) {
  return <a href={href} {...rest}>{children}</a>;
}
