import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createNote, deleteNote, extractTags, liveNotes, normalizeTags, titleFromBody, updateNote } from "@/lib/notes";

describe("note helpers", () => {
  it("titles from the first meaningful line", () => {
    expect(titleFromBody("\n# Why cats knock things over\nmore")).toBe("Why cats knock things over");
    expect(titleFromBody("")).toBe("Untitled");
    expect(titleFromBody("x".repeat(100))).toHaveLength(80);
  });
  it("extracts and normalizes hashtags", () => {
    expect(extractTags("Try this #Shorts idea #cats #cats")).toEqual(["shorts", "cats"]);
    expect(extractTags("email me at a#b")).toEqual([]);
    expect(normalizeTags(["#A", " a ", "", "b"])).toEqual(["a", "b"]);
  });
});

describe("note storage", () => {
  beforeEach(async () => {
    await db.notes.clear();
    await db.embeddings.clear();
  });

  it("creates, updates and soft-deletes with dirty flags for sync", async () => {
    const n = await createNote({ body: "Cat facts #science", tags: ["Cats"] });
    expect(n.tags).toEqual(["cats", "science"]);
    expect(n.dirty).toBe(1);

    await db.notes.update(n.id, { dirty: 0 });
    await updateNote(n.id, { title: "Renamed" });
    const updated = await db.notes.get(n.id);
    expect(updated?.title).toBe("Renamed");
    expect(updated?.dirty).toBe(1);

    await db.embeddings.put({ noteId: n.id, model: "m", hash: "h", vector: new Float32Array(2) });
    await deleteNote(n.id);
    expect(await liveNotes()).toHaveLength(0);
    expect((await db.notes.get(n.id))?.deletedAt).toBeTypeOf("number");
    expect(await db.embeddings.get(n.id)).toBeUndefined();
  });
});
