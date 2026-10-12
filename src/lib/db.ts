import Dexie, { type EntityTable } from "dexie";
import type { Note, NoteEmbedding } from "./types";

interface KV {
  key: string;
  value: unknown;
}

class VaultDB extends Dexie {
  notes!: EntityTable<Note, "id">;
  embeddings!: EntityTable<NoteEmbedding, "noteId">;
  kv!: EntityTable<KV, "key">;

  constructor() {
    super("idea-vault");
    this.version(1).stores({
      notes: "id, kind, updatedAt, dirty, *tags",
      embeddings: "noteId",
      kv: "key",
    });
  }
}

export const db = new VaultDB();

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const row = await db.kv.get(key);
  return row?.value as T | undefined;
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await db.kv.put({ key, value });
}
