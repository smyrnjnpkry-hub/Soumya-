export const NOTE_KINDS = ["idea", "hook", "script", "note"] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

export const KIND_LABELS: Record<NoteKind, string> = {
  idea: "Idea",
  hook: "Hook",
  script: "Script",
  note: "Note",
};

export interface Note {
  id: string;
  title: string;
  body: string;
  kind: NoteKind;
  tags: string[];
  /** The note this one was generated from (e.g. a script made from an idea). */
  sourceId?: string | null;
  createdAt: number;
  updatedAt: number;
  /** Tombstone so deletes can sync to other devices. */
  deletedAt?: number | null;
  /** 1 when changed locally since the last successful sync. */
  dirty: 0 | 1;
}

export interface NoteEmbedding {
  noteId: string;
  /** Provider-qualified model, e.g. "openai:text-embedding-3-small". */
  model: string;
  /** Hash of the embedded text, so edits trigger a re-embed. */
  hash: string;
  vector: Float32Array;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
