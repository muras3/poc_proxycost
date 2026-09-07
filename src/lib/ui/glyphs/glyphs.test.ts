import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { WEIGHT_CATEGORIES } from '@/data/weights';
import { Glyph, SHAPES, FAMILY_ORDER, familyTone, familyName, glyphFamily, hasGlyph } from '.';

const ALL_LINES = WEIGHT_CATEGORIES.flatMap((c) => c.lines);
/** 「種類が不明」の点線。長さ警告の赤い破線（3 2）とは別物。 */
const DOTTED = 'stroke-dasharray="2 1.4"';
const render = (props: Parameters<typeof Glyph>[0]) =>
  renderToStaticMarkup(createElement(Glyph, props));

describe('glyph coverage', () => {
  // **重量表のラインを足したらここが落ちる。**形の無い品を画面に出さないための門。
  it('every weight-table line has a shape', () => {
    const missing = ALL_LINES.filter((l) => !hasGlyph(l.id)).map((l) => l.id);
    expect(missing).toEqual([]);
  });

  it('covers all 75 lines and nothing else', () => {
    expect(ALL_LINES).toHaveLength(75);
    const ids = new Set(ALL_LINES.map((l) => l.id));
    // 重量表から消えたラインの形が残り続けないようにする。
    const orphans = Object.keys(SHAPES).filter((id) => !ids.has(id));
    expect(orphans).toEqual([]);
  });

  it('every line renders a non-empty drawing', () => {
    for (const l of ALL_LINES) {
      const svg = render({ lineId: l.id, label: l.labelEn });
      expect(svg, l.id).toContain('<svg');
      // 接地線だけ、では描けていない。中身が1要素以上あること。
      const shapes = svg.match(/<(rect|path|circle|ellipse|line|text)\b/g) ?? [];
      expect(shapes.length, l.id).toBeGreaterThan(1);
    }
  });

  it('assigns every line to one of the 12 families', () => {
    for (const l of ALL_LINES) {
      expect(FAMILY_ORDER, l.id).toContain(glyphFamily(l.id));
    }
  });

  it('uses all 12 families', () => {
    const used = new Set(ALL_LINES.map((l) => glyphFamily(l.id)));
    expect([...used].sort()).toEqual([...FAMILY_ORDER].sort());
  });

  it('gives the same id the same drawing every time', () => {
    for (const l of ALL_LINES.slice(0, 8)) {
      expect(render({ lineId: l.id })).toEqual(render({ lineId: l.id }));
    }
  });
});

describe('unknown is a state, not another item', () => {
  it('falls back to a dotted silhouette when the id is not in the weight table', () => {
    const svg = render({ lineId: 'no-such-line' });
    expect(svg).toContain(DOTTED);
    expect(svg).toContain(familyTone.unknown);
    expect(svg).toContain(familyName.unknown);
  });

  it('falls back the same way for a missing id', () => {
    expect(render({ lineId: null })).toEqual(render({ lineId: 'no-such-line' }));
  });

  it('draws the reel and rod of unknown subtype dotted, like the weight tiers do', () => {
    for (const id of ['reel', 'rod']) {
      expect(render({ lineId: id }), id).toContain(DOTTED);
    }
    // 種類が分かっている同族は点線にしない。
    for (const id of ['spinning-reel', 'rod-1piece']) {
      expect(render({ lineId: id }), id).not.toContain(DOTTED);
    }
  });
});

describe('estimated weight reads as uncertain', () => {
  it('is translucent only when the weight is an estimate', () => {
    expect(render({ lineId: 'nendoroid', estimated: true })).toContain('<g opacity="0.62">');
    expect(render({ lineId: 'nendoroid', estimated: false })).not.toContain('<g opacity');
  });
});

describe('theme safety', () => {
  // **ダーク／ライトで色を直書きするな。**塗りは currentColor とテーマトークンだけ。
  it('never hard-codes a colour', () => {
    for (const l of ALL_LINES) {
      const svg = render({ lineId: l.id });
      expect(svg, l.id).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(svg, l.id).not.toMatch(/\brgba?\(|\bhsla?\(/);
    }
  });

  it('paints with currentColor and the theme panel token', () => {
    const svg = render({ lineId: 'graded-slab' });
    expect(svg).toContain('currentColor');
    expect(svg).toContain('var(--panel)');
  });

  it('carries a light and a dark colour class for every family', () => {
    for (const fam of [...FAMILY_ORDER, 'unknown'] as const) {
      expect(familyTone[fam], fam).toMatch(/^text-\S+ dark:text-\S+$/);
    }
  });
});

describe('accessibility', () => {
  it('names the item for a screen reader', () => {
    const svg = render({ lineId: 'shinai', label: 'Shinai' });
    expect(svg).toContain('aria-label="Shinai"');
    expect(svg).toContain('<title>Shinai</title>');
  });

  it('hides itself when it is decoration next to a text label', () => {
    const svg = render({ lineId: 'shinai', decorative: true });
    expect(svg).toContain('aria-hidden="true"');
    expect(svg).not.toContain('<title>');
  });

  it('falls back to the family name when no label is given', () => {
    expect(render({ lineId: 'shinai' })).toContain('<title>Long</title>');
  });
});
