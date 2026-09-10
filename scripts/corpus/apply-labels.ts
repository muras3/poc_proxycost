// ラベルを母数に流し込む。
//
//   npx tsx scripts/corpus/apply-labels.ts <labels.tsv>
//
// TSV の列は  id \t kind \t expectLine \t note  （expectLine は '-' で null）。
// **既に付いているラベルを黙って上書きしない。**変えるときは --force を付ける
// （率を上げるためにラベルを書き換えるのは捏造なので、差分が目に見えるようにする）。

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WEIGHT_CATEGORIES } from '../../src/data/weights';
import type { Corpus, Kind } from './merge.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CORPUS = join(ROOT, 'data', 'weights-corpus.json');
const KINDS: Kind[] = ['listing', 'listing-no-data', 'off-target'];
const LINES = new Set(WEIGHT_CATEGORIES.flatMap((c) => c.lines.map((l) => l.id)));

const file = process.argv[2];
if (!file) throw new Error('usage: apply-labels.ts <labels.tsv> [--force]');
const force = process.argv.includes('--force');

const corpus = JSON.parse(readFileSync(CORPUS, 'utf8')) as Corpus;
const byId = new Map(corpus.titles.map((t) => [t.id, t]));

let applied = 0, changed = 0;
for (const raw of readFileSync(file, 'utf8').split('\n')) {
  const line = raw.trimEnd();
  if (!line || line.startsWith('#')) continue;
  const [id, kind, expect, ...rest] = line.split('\t');
  const row = byId.get(id ?? '');
  if (!row) throw new Error(`unknown id: ${id}`);
  if (!KINDS.includes(kind as Kind)) throw new Error(`bad kind for ${id}: ${kind}`);
  const expectLine = !expect || expect === '-' ? null : expect;
  if (expectLine !== null && !LINES.has(expectLine)) throw new Error(`no such line for ${id}: ${expectLine}`);
  if (kind !== 'listing' && expectLine !== null) throw new Error(`${id}: only kind "listing" may name a line`);
  if (row.kind !== 'unlabelled') {
    if (!force) throw new Error(`${id} is already labelled ${row.kind}/${row.expectLine} — pass --force to change it`);
    changed++;
  }
  row.kind = kind as Kind;
  row.expectLine = expectLine;
  row.note = rest.join(' ').trim();
  applied++;
}

writeFileSync(CORPUS, `${JSON.stringify(corpus, null, 2)}\n`);
const left = corpus.titles.filter((t) => t.kind === 'unlabelled').length;
console.log(`${applied} labelled (${changed} overwritten), ${left} still unlabelled`);
