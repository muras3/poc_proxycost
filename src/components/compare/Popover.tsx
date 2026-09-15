'use client';

import {
  createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode,
} from 'react';

/**
 * 段3の注釈（Mock v3 の `.mk` ＋ `#pop`）。画面に1つだけのポップオーバーを、
 * 押されたボタンの真下に絶対配置で出す。Esc・外側クリック・リサイズで閉じる。
 */

interface Note { title: string; body: ReactNode; label: string }
interface PopState { btn: HTMLElement; id: string; note: Note }

const Ctx = createContext<{
  toggle: (btn: HTMLElement, id: string, note: Note) => void;
  openId: string | null;
} | null>(null);

export function PopoverProvider({ children }: { children: ReactNode }) {
  const [pop, setPop] = useState<PopState | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number; width: number }>({ left: 12, top: 0, width: 340 });

  const close = useCallback((refocus: boolean) => {
    setPop((p) => {
      if (p && refocus && document.body.contains(p.btn)) p.btn.focus();
      return null;
    });
  }, []);

  // 位置は押した瞬間にボタンの矩形から決める。Mock `openPop` と同じ計算。
  const toggle = useCallback((btn: HTMLElement, id: string, note: Note) => {
    const r = btn.getBoundingClientRect();
    const w = Math.min(340, document.documentElement.clientWidth - 24);
    let left = r.left + window.scrollX;
    left = Math.max(12, Math.min(left, document.documentElement.clientWidth - w - 12));
    setPos({ left, top: r.bottom + window.scrollY + 8, width: w });
    setPop((p) => (p && p.id === id ? null : { btn, id, note }));
  }, []);

  useEffect(() => {
    if (pop) popRef.current?.querySelector<HTMLButtonElement>('.x')?.focus();
  }, [pop]);

  useEffect(() => {
    if (!pop) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(true); };
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (popRef.current?.contains(t) || pop.btn.contains(t)) return;
      close(false);
    };
    const onResize = () => close(false);
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onClick);
      window.removeEventListener('resize', onResize);
    };
  }, [pop, close]);

  return (
    <Ctx.Provider value={{ toggle, openId: pop?.id ?? null }}>
      {children}
      <div
        id="pop"
        ref={popRef}
        role="dialog"
        aria-modal="false"
        aria-label={pop?.note.title}
        hidden={!pop}
        style={{ left: pos.left, top: pos.top, width: pos.width }}
      >
        {pop && (
          <>
            <button type="button" className="x" aria-label="Close" onClick={() => close(true)}>close</button>
            <h4>{pop.note.title}</h4>
            {pop.note.body}
          </>
        )}
      </div>
    </Ctx.Provider>
  );
}

/**
 * 注釈を開くボタン。既定は Mock の `.mk`（§ の小さな枠）。`className` を渡せば
 * `.wmk`（秤の針）や `.ic`（常時アイコン）の器にもなる。
 */
export function NoteButton({
  title, body, label, className = 'mk', children, style, testId,
}: {
  title: string;
  body: ReactNode;
  /** aria-label。省略時は `About: <title>`。 */
  label?: string;
  className?: string;
  children?: ReactNode;
  style?: React.CSSProperties;
  testId?: string;
}) {
  const ctx = useContext(Ctx);
  const id = useId();
  const expanded = !!ctx && ctx.openId === id;
  const aria = label ?? `About: ${title}`;
  return (
    <button
      type="button"
      className={className}
      style={style}
      data-note={id}
      data-testid={testId}
      aria-expanded={expanded}
      aria-controls="pop"
      aria-label={aria}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        ctx?.toggle(e.currentTarget, id, { title, body, label: aria });
      }}
    >
      {children ?? '§'}
    </button>
  );
}

/** `.mk`（§）の短縮形。Mock の `mk(title, body, text, cls)`。 */
export function Mark({
  title, body, text = '§', q = false, testId, label,
}: { title: string; body: ReactNode; text?: string; q?: boolean; testId?: string; label?: string }) {
  return (
    <NoteButton title={title} body={body} label={label} className={q ? 'mk q' : 'mk'} testId={testId}>
      {text}
    </NoteButton>
  );
}
