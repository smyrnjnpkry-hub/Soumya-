"use client";

import { db } from "./db";
import { normalizeTags } from "./notes";
import { NOTE_KINDS, type Note } from "./types";

interface BackupFile {
  app: "idea-vault";
  version: 1;
  exportedAt: string;
  notes: Note[];
}

export async function exportBackup(): Promise<Blob> {
  const notes = (await db.notes.toArray()).filter((n) => !n.deletedAt);
  const file: BackupFile = { app: "idea-vault", version: 1, exportedAt: new Date().toISOString(), notes };
  return new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
}

function isNote(x: unknown): x is Note {
  const n = x as Note;
  return (
    !!n &&
    typeof n.id === "string" &&
    typeof n.title === "string" &&
    typeof n.body === "string" &&
    (NOTE_KINDS as readonly string[]).includes(n.kind) &&
    typeof n.updatedAt === "number"
  );
}

/** Merges a backup into the vault; newer copies win. Returns notes imported. */
export async function importBackup(file: File): Promise<number> {
  const data = JSON.parse(await file.text()) as Partial<BackupFile>;
  if (data.app !== "idea-vault" || !Array.isArray(data.notes)) {
    throw new Error("That file isn't an Idea Vault backup.");
  }
  const incoming = data.notes.filter(isNote);
  let count = 0;
  await db.transaction("rw", db.notes, async () => {
    for (const n of incoming) {
      const local = await db.notes.get(n.id);
      if (local && local.updatedAt >= n.updatedAt) continue;
      await db.notes.put({
        ...n,
        tags: normalizeTags(Array.isArray(n.tags) ? n.tags : []),
        createdAt: typeof n.createdAt === "number" ? n.createdAt : n.updatedAt,
        deletedAt: null,
        dirty: 1,
      });
      count++;
    }
  });
  return count;
}
