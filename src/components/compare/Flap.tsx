'use client';

import { useLayoutEffect, useRef } from 'react';

/**
 * 差額の文字（Mock v3 `flapHTML`／`runFlaps`）。値が変わった桁だけを、新しい文字へ
 * まっすぐ「めくる」（ランダムな文字を経由しない）。`prefers-reduced-motion` では
 * CSS 側で animation が切れる。
 */
export function Flap({ text, className }: { text: string; className: string }) {
  const prev = useRef<string | null>(null);
  const root = useRef<HTMLSpanElement | null>(null);
  const chars = [...text];

  // どの桁が変わったかは描画後に前回の文字列と比べて決める（描画中に ref を読まない）。
  useLayoutEffect(() => {
    const el = root.current;
    const before = prev.current;
    prev.current = text;
    if (!el || before === null || before === text) return;
    el.querySelectorAll<HTMLElement>('.c').forEach((c, i) => {
      if (before[i] === text[i]) return;
      c.classList.remove('flip');
      void c.offsetWidth;
      c.classList.add('flip');
    });
  }, [text]);

  return (
    <span className={`flap ${className}`} aria-label={text} ref={root}>
      <span aria-hidden="true" style={{ display: 'inline-flex', gap: 1 }}>
        {chars.map((ch, i) => (
          <span key={i} className={`c${ch === ' ' ? ' sp' : ''}`}>{ch}</span>
        ))}
      </span>
    </span>
  );
}
