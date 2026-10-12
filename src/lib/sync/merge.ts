import { NOTE_KINDS, type Note, type NoteKind } from "../types";

/** Row shape of public.notes in Supabase (see supabase/migrations). */
export interface RemoteNote {
  id: string;
  title: string;
  body: string;
  kind: string;
  tags: string[] | null;
  source_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  server_updated_at?: string;
}

const iso = (ms: number) => new Date(ms).toISOString();

export function toRemote(n: Note): Omit<RemoteNote, "server_updated_at"> {
  return {
    id: n.id,
    title: n.title,
    body: n.body,
    kind: n.kind,
    tags: n.tags,
    source_id: n.sourceId ?? null,
    created_at: iso(n.createdAt),
    updated_at: iso(n.updatedAt),
    deleted_at: n.deletedAt ? iso(n.deletedAt) : null,
  };
}

export function fromRemote(r: RemoteNote): Note {
  const kind = (NOTE_KINDS as readonly string[]).includes(r.kind) ? (r.kind as NoteKind) : "note";
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    kind,
    tags: r.tags ?? [],
    sourceId: r.source_id,
    createdAt: Date.parse(r.created_at),
    updatedAt: Date.parse(r.updated_at),
    deletedAt: r.deleted_at ? Date.parse(r.deleted_at) : null,
    dirty: 0,
  };
}

/**
 * Last-write-wins on the edit timestamp. A remote copy replaces the local one
 * when it is strictly newer, or equally new and we have nothing unsynced.
 */
export function shouldApplyRemote(local: Note | undefined, remote: Note): boolean {
  if (!local) return true;
  if (remote.updatedAt > local.updatedAt) return true;
  return remote.updatedAt === local.updatedAt && local.dirty === 0;
}
