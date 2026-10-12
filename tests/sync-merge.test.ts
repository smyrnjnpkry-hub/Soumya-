import { describe, expect, it } from "vitest";
import { fromRemote, shouldApplyRemote, toRemote } from "@/lib/sync/merge";
import type { Note } from "@/lib/types";

const base: Note = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "T",
  body: "B",
  kind: "hook",
  tags: ["x"],
  sourceId: null,
  createdAt: Date.parse("2026-01-01T00:00:00Z"),
  updatedAt: Date.parse("2026-01-02T00:00:00Z"),
  deletedAt: null,
  dirty: 1,
};

describe("toRemote / fromRemote", () => {
  it("round-trips a note (clearing the dirty flag)", () => {
    expect(fromRemote({ ...toRemote(base) })).toEqual({ ...base, dirty: 0 });
  });
  it("maps unknown kinds to note", () => {
    expect(fromRemote({ ...toRemote(base), kind: "weird" }).kind).toBe("note");
  });
});

describe("shouldApplyRemote (last write wins)", () => {
  const remote = { ...base, dirty: 0 as const };
  it("applies when missing locally or remote is newer", () => {
    expect(shouldApplyRemote(undefined, remote)).toBe(true);
    expect(shouldApplyRemote({ ...base, updatedAt: base.updatedAt - 1 }, remote)).toBe(true);
  });
  it("keeps newer local edits", () => {
    expect(shouldApplyRemote({ ...base, updatedAt: base.updatedAt + 1 }, remote)).toBe(false);
  });
  it("on a tie, keeps unsynced local edits", () => {
    expect(shouldApplyRemote({ ...base, dirty: 1 }, remote)).toBe(false);
    expect(shouldApplyRemote({ ...base, dirty: 0 }, remote)).toBe(true);
  });
});
