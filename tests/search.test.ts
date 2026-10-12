import { describe, expect, it } from "vitest";
import { cosine, hashText, keywordScore, rankNotes, relatedNotes, tokenize } from "@/lib/search";
import type { Note } from "@/lib/types";

function note(id: string, title: string, body = "", extra: Partial<Note> = {}): Note {
  return { id, title, body, kind: "idea", tags: [], createdAt: 0, updatedAt: 0, dirty: 0, ...extra };
}

describe("cosine", () => {
  it("is 1 for identical direction and 0 for orthogonal", () => {
    expect(cosine([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBe(0);
  });
  it("returns 0 for mismatched or empty vectors", () => {
    expect(cosine([1, 2], [1, 2, 3])).toBe(0);
    expect(cosine([], [])).toBe(0);
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });
});

describe("tokenize / keywordScore", () => {
  it("lowercases, strips hashtags and drops 1-char tokens", () => {
    expect(tokenize("Cats & #Science a")).toEqual(["cats", "science"]);
  });
  it("weights title hits above body hits", () => {
    const inTitle = note("a", "Budget travel hacks", "");
    const inBody = note("b", "Misc", "some budget travel hacks");
    const terms = tokenize("budget travel");
    expect(keywordScore(inTitle, terms)).toBeGreaterThan(keywordScore(inBody, terms));
  });
});

describe("rankNotes", () => {
  const notes = [
    note("old", "Cheap trips for students", "", { updatedAt: 1 }),
    note("new", "Cat science facts", "", { updatedAt: 2 }),
    note("other", "Morning routine", "", { updatedAt: 3 }),
  ];

  it("returns newest first for an empty query", () => {
    expect(rankNotes(notes, "").map((r) => r.note.id)).toEqual(["other", "new", "old"]);
  });

  it("keyword-only search drops non-matching notes", () => {
    expect(rankNotes(notes, "cat").map((r) => r.note.id)).toEqual(["new"]);
  });

  it("semantic search finds a note with no shared words", () => {
    const vectors = new Map([
      ["old", Float32Array.from([1, 0, 0])],
      ["new", Float32Array.from([0, 1, 0])],
      ["other", Float32Array.from([0, 0, 1])],
    ]);
    const queryVector = Float32Array.from([0.9, 0.1, 0]); // "budget travel"
    const ranked = rankNotes(notes, "budget travel", { queryVector, vectors });
    expect(ranked[0].note.id).toBe("old");
    expect(ranked.find((r) => r.note.id === "other")).toBeUndefined();
  });
});

describe("relatedNotes", () => {
  it("excludes the note itself and weak matches", () => {
    const a = note("a", "A");
    const b = note("b", "B");
    const c = note("c", "C");
    const vectors = new Map([
      ["a", Float32Array.from([1, 0])],
      ["b", Float32Array.from([0.9, 0.1])],
      ["c", Float32Array.from([0, 1])],
    ]);
    expect(relatedNotes(a, [a, b, c], vectors).map((r) => r.note.id)).toEqual(["b"]);
  });
});

describe("hashText", () => {
  it("is stable and content-sensitive", () => {
    expect(hashText("hello")).toBe(hashText("hello"));
    expect(hashText("hello")).not.toBe(hashText("hello!"));
  });
});
