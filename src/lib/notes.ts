import { db } from "./db";
import type { Note, NoteKind } from "./types";

export function newId(): string {
  return crypto.randomUUID();
}

/** First non-empty line, stripped of markdown-ish prefixes, capped at 80 chars. */
export function titleFromBody(body: string): string {
  const line =
    body
      .split("\n")
      .map((l) => l.replace(/^[#>\-*\s]+/, "").trim())
      .find(Boolean) ?? "";
  return line.length > 80 ? `${line.slice(0, 77)}...` : line || "Untitled";
}

/** Pulls #hashtags out of text, lowercased and de-duplicated. */
export function extractTags(text: string): string[] {
  const found = text.match(/(?:^|\s)#([\p{L}\p{N}_-]{2,40})/gu) ?? [];
  return [...new Set(found.map((t) => t.trim().slice(1).toLowerCase()))];
}

export function normalizeTags(tags: string[]): string[] {
  return [
    ...new Set(
      tags
        .map((t) => t.trim().replace(/^#/, "").toLowerCase())
        .filter(Boolean),
    ),
  ];
}

export interface NoteInput {
  body: string;
  title?: string;
  kind?: NoteKind;
  tags?: string[];
  sourceId?: string | null;
}

export async function createNote(input: NoteInput): Promise<Note> {
  const now = Date.now();
  const note: Note = {
    id: newId(),
    title: input.title?.trim() || titleFromBody(input.body),
    body: input.body,
    kind: input.kind ?? "idea",
    tags: normalizeTags([...(input.tags ?? []), ...extractTags(input.body)]),
    sourceId: input.sourceId ?? null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    dirty: 1,
  };
  await db.notes.add(note);
  return note;
}

export async function updateNote(
  id: string,
  patch: Partial<Pick<Note, "title" | "body" | "kind" | "tags">>,
): Promise<void> {
  const changes: Partial<Note> = { ...patch, updatedAt: Date.now(), dirty: 1 };
  if (patch.tags) changes.tags = normalizeTags(patch.tags);
  await db.notes.update(id, changes);
}

/** Soft delete: keeps a tombstone so the delete reaches other devices. */
export async function deleteNote(id: string): Promise<void> {
  const now = Date.now();
  await db.transaction("rw", db.notes, db.embeddings, async () => {
    await db.notes.update(id, { deletedAt: now, updatedAt: now, dirty: 1 });
    await db.embeddings.delete(id);
  });
}

export async function liveNotes(): Promise<Note[]> {
  const all = await db.notes.orderBy("updatedAt").reverse().toArray();
  return all.filter((n) => !n.deletedAt);
}

export function noteText(note: Pick<Note, "title" | "body" | "tags">): string {
  const tags = note.tags.length ? `\n${note.tags.map((t) => `#${t}`).join(" ")}` : "";
  return `${note.title}\n${note.body}${tags}`.trim();
}
