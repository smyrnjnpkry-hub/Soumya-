import type { Note } from "./types";

export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}#]+/u)
    .map((t) => t.replace(/^#/, ""))
    .filter((t) => t.length > 1);
}

/** 0..1 — share of query terms found, with title and tag hits weighted higher. */
export function keywordScore(note: Note, terms: string[]): number {
  if (terms.length === 0) return 0;
  const title = note.title.toLowerCase();
  const body = note.body.toLowerCase();
  const tags = note.tags.join(" ");
  let score = 0;
  for (const term of terms) {
    if (title.includes(term)) score += 1;
    else if (tags.includes(term)) score += 0.9;
    else if (body.includes(term)) score += 0.6;
  }
  return score / terms.length;
}

export interface RankedNote {
  note: Note;
  score: number;
  keyword: number;
  semantic: number | null;
}

/**
 * Similarity below this is treated as unrelated. Small embedding models put
 * unrelated short texts around 0.1–0.25, so anything under the floor only
 * shows up if it also matches a keyword.
 */
export const SEMANTIC_FLOOR = 0.28;

export interface RankOptions {
  queryVector?: Float32Array | null;
  vectors?: Map<string, Float32Array>;
  limit?: number;
}

/**
 * Hybrid ranking: semantic similarity when vectors are available, keyword
 * overlap always. Falls back to pure keyword search offline or with no
 * embedding provider configured.
 */
export function rankNotes(notes: Note[], query: string, opts: RankOptions = {}): RankedNote[] {
  const limit = opts.limit ?? 50;
  const terms = tokenize(query);
  if (terms.length === 0) {
    return [...notes]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit)
      .map((note) => ({ note, score: 0, keyword: 0, semantic: null }));
  }

  const ranked: RankedNote[] = [];
  for (const note of notes) {
    const keyword = keywordScore(note, terms);
    const vec = opts.queryVector ? opts.vectors?.get(note.id) : undefined;
    const semantic = vec && opts.queryVector ? cosine(opts.queryVector, vec) : null;

    let score: number;
    if (semantic === null) {
      if (keyword === 0) continue;
      score = keyword;
    } else {
      if (keyword === 0 && semantic < SEMANTIC_FLOOR) continue;
      score = 0.7 * semantic + 0.3 * keyword;
    }
    ranked.push({ note, score, keyword, semantic });
  }
  return ranked.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Nearest neighbours of one note, for the "related ideas" panel. */
export function relatedNotes(
  target: Note,
  notes: Note[],
  vectors: Map<string, Float32Array>,
  limit = 5,
): RankedNote[] {
  const base = vectors.get(target.id);
  if (!base) return [];
  const out: RankedNote[] = [];
  for (const note of notes) {
    if (note.id === target.id) continue;
    const vec = vectors.get(note.id);
    if (!vec) continue;
    const semantic = cosine(base, vec);
    if (semantic >= SEMANTIC_FLOOR) out.push({ note, score: semantic, keyword: 0, semantic });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** FNV-1a — cheap content hash to detect when a note needs re-embedding. */
export function hashText(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}
