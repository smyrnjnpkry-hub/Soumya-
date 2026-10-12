"use client";

import { db } from "./db";
import { KEY_HEADER } from "./ai/providers";
import { liveNotes, noteText } from "./notes";
import { hashText } from "./search";
import type { Settings } from "./settings";
import type { Note } from "./types";

/** Ollama runs locally, so only the OpenAI path needs the internet. */
function canEmbedNow(s: Settings): boolean {
  return s.embeddingProvider === "ollama" || typeof navigator === "undefined" || navigator.onLine;
}

/** Provider-qualified model id, or null when semantic search is off. */
export function embeddingModelId(s: Settings): string | null {
  if (s.embeddingProvider === "openai" && s.keys.openai) return `openai:${s.embeddingModels.openai}`;
  if (s.embeddingProvider === "ollama") return `ollama:${s.embeddingModels.ollama}`;
  return null;
}

type Purpose = "document" | "query";

// nomic-embed-text expects task prefixes; other models ignore them harmlessly
// but we only add them where they're documented to help.
function prefixed(model: string, text: string, purpose: Purpose): string {
  if (!model.includes("nomic")) return text;
  return `${purpose === "query" ? "search_query" : "search_document"}: ${text}`;
}

const MAX_CHARS = 8000;

export async function embedTexts(s: Settings, texts: string[], purpose: Purpose): Promise<Float32Array[]> {
  const inputs = texts.map((t) => t.slice(0, MAX_CHARS));

  if (s.embeddingProvider === "openai") {
    const res = await fetch("/api/embed", {
      method: "POST",
      headers: { "content-type": "application/json", [KEY_HEADER]: s.keys.openai },
      body: JSON.stringify({ model: s.embeddingModels.openai, input: inputs }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(data?.error ?? `Embedding failed (${res.status})`);
    }
    const { vectors } = (await res.json()) as { vectors: number[][] };
    return vectors.map((v) => Float32Array.from(v));
  }

  if (s.embeddingProvider === "ollama") {
    const model = s.embeddingModels.ollama;
    const res = await fetch(`${s.ollamaUrl.replace(/\/$/, "")}/api/embed`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, input: inputs.map((t) => prefixed(model, t, purpose)) }),
    });
    if (!res.ok) throw new Error(`Ollama embedding failed (${res.status})`);
    const { embeddings } = (await res.json()) as { embeddings: number[][] };
    return embeddings.map((v) => Float32Array.from(v));
  }

  throw new Error("Semantic search is off. Pick an embedding provider in Settings.");
}

/** Notes whose stored embedding is missing, stale, or from another model. */
export async function staleNotes(s: Settings, notes?: Note[]): Promise<Note[]> {
  const model = embeddingModelId(s);
  if (!model) return [];
  const all = notes ?? (await liveNotes());
  const existing = new Map((await db.embeddings.toArray()).map((e) => [e.noteId, e]));
  return all.filter((n) => {
    const e = existing.get(n.id);
    return !e || e.model !== model || e.hash !== hashText(noteText(n));
  });
}

/** Embeds anything out of date. Safe to call often; does nothing offline. */
export async function indexNotes(
  s: Settings,
  opts: { notes?: Note[]; onProgress?: (done: number, total: number) => void } = {},
): Promise<number> {
  const model = embeddingModelId(s);
  if (!model || !canEmbedNow(s)) return 0;
  const todo = await staleNotes(s, opts.notes);
  const BATCH = 32;
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    const texts = batch.map(noteText);
    const vectors = await embedTexts(s, texts, "document");
    await db.embeddings.bulkPut(
      batch.map((n, j) => ({ noteId: n.id, model, hash: hashText(texts[j]), vector: vectors[j] })),
    );
    opts.onProgress?.(Math.min(i + BATCH, todo.length), todo.length);
  }
  return todo.length;
}

/** Vectors for the current model only, keyed by note id. */
export async function loadVectors(s: Settings): Promise<Map<string, Float32Array>> {
  const model = embeddingModelId(s);
  if (!model) return new Map();
  const rows = await db.embeddings.toArray();
  return new Map(rows.filter((r) => r.model === model).map((r) => [r.noteId, r.vector]));
}

export async function embedQuery(s: Settings, query: string): Promise<Float32Array | null> {
  if (!embeddingModelId(s) || !canEmbedNow(s)) return null;
  try {
    const [v] = await embedTexts(s, [query], "query");
    return v;
  } catch {
    return null; // keyword search still works
  }
}
