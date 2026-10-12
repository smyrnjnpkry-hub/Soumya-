"use client";

import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Brain, Search } from "lucide-react";
import { NoteCard } from "@/components/note-card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { embedQuery, embeddingModelId, indexNotes, loadVectors } from "@/lib/embeddings";
import { liveNotes } from "@/lib/notes";
import { rankNotes } from "@/lib/search";
import { useSettings } from "@/lib/settings";
import { KIND_LABELS, NOTE_KINDS, type NoteKind } from "@/lib/types";
import { cn } from "@/lib/utils";

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function LibraryPage() {
  const settings = useSettings();
  const notes = useLiveQuery(liveNotes, []);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<NoteKind | "all">("all");
  const [vectors, setVectors] = useState<Map<string, Float32Array>>(new Map());
  const [queryVec, setQueryVec] = useState<{ q: string; v: Float32Array | null }>({ q: "", v: null });
  const [indexing, setIndexing] = useState<string | null>(null);
  const debounced = useDebounced(query.trim(), 300);
  const semantic = settings ? embeddingModelId(settings) !== null : false;

  // Keep embeddings fresh in the background whenever notes change.
  const notesKey = notes?.map((n) => `${n.id}:${n.updatedAt}`).join("|");
  useEffect(() => {
    if (!settings || !notes || !semantic) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        await indexNotes(settings, {
          notes,
          onProgress: (done, total) => !cancelled && setIndexing(`Indexing ${done}/${total}…`),
        });
      } catch {
        // Offline or bad key: keyword search still works.
      } finally {
        if (!cancelled) {
          setIndexing(null);
          setVectors(await loadVectors(settings));
        }
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- notesKey captures note changes
  }, [settings, notesKey, semantic]);

  useEffect(() => {
    if (!settings || !debounced || !semantic) return;
    let cancelled = false;
    embedQuery(settings, debounced).then((v) => !cancelled && setQueryVec({ q: debounced, v }));
    return () => {
      cancelled = true;
    };
  }, [settings, debounced, semantic]);

  const results = useMemo(() => {
    if (!notes) return undefined;
    const pool = kind === "all" ? notes : notes.filter((n) => n.kind === kind);
    const qv = queryVec.q === debounced ? queryVec.v : null;
    return rankNotes(pool, debounced, { queryVector: qv, vectors, limit: 100 });
  }, [notes, kind, debounced, queryVec, vectors]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
        <p className="text-sm text-muted-foreground">
          {notes ? `${notes.length} saved` : "Loading…"}
          {semantic && " · searches by meaning, not just words"}
        </p>
      </div>

      <div className="relative">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={semantic ? 'Try "videos about saving money as a student"' : "Search your ideas"}
          className="h-10 pl-9"
          aria-label="Search notes"
        />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {(["all", ...NOTE_KINDS] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted",
              kind === k && "border-primary bg-primary/10 text-foreground",
            )}
          >
            {k === "all" ? "All" : KIND_LABELS[k]}
          </button>
        ))}
        {indexing && (
          <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
            <Brain className="size-3" /> {indexing}
          </span>
        )}
      </div>

      {results === undefined ? (
        <div className="space-y-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : results.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          {debounced ? "No matches. Try different words." : "No notes here yet."}
        </p>
      ) : (
        <div className="grid gap-3">
          {results.map((r) => (
            <NoteCard key={r.note.id} note={r.note} match={debounced ? r.semantic : null} />
          ))}
        </div>
      )}
    </div>
  );
}
