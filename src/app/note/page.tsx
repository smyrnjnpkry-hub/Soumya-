"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, CornerUpLeft, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AiOutput } from "@/components/ai-output";
import { KindPicker } from "@/components/kind-picker";
import { NoteCard, relativeTime } from "@/components/note-card";
import { VoiceButton } from "@/components/voice-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useCompletion } from "@/hooks/use-completion";
import { CREATOR_TOOLS, creatorSystem, type CreatorTool } from "@/lib/ai/prompts";
import { db } from "@/lib/db";
import { indexNotes, loadVectors } from "@/lib/embeddings";
import { createNote, deleteNote, liveNotes, updateNote } from "@/lib/notes";
import { relatedNotes, type RankedNote } from "@/lib/search";
import { hasChatAccess, useSettings } from "@/lib/settings";
import type { Note, NoteKind } from "@/lib/types";

export default function NotePage() {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <NoteView />
    </Suspense>
  );
}

function NoteView() {
  const id = useSearchParams().get("id") ?? "";
  const note = useLiveQuery(async () => (await db.notes.get(id)) ?? null, [id]);

  if (note === undefined) return <Skeleton className="h-64" />;
  if (!note || note.deletedAt) {
    return (
      <div className="space-y-3 py-10 text-center">
        <p className="text-muted-foreground">This note doesn&apos;t exist (or was deleted).</p>
        <Button asChild variant="outline">
          <Link href="/library">Back to library</Link>
        </Button>
      </div>
    );
  }
  // Keyed so switching notes resets the editor state.
  return <NoteEditor key={note.id} note={note} />;
}

function NoteEditor({ note }: { note: Note }) {
  const router = useRouter();
  const settings = useSettings();
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [kind, setKind] = useState<NoteKind>(note.kind);
  const [tags, setTags] = useState(note.tags.join(", "));
  const [activeTool, setActiveTool] = useState<CreatorTool | null>(null);
  const [related, setRelated] = useState<RankedNote[]>([]);
  const completion = useCompletion();
  const source = useLiveQuery(
    async () => (note.sourceId ? ((await db.notes.get(note.sourceId)) ?? null) : null),
    [note.sourceId],
  );

  // Debounced autosave of local edits.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => {
      updateNote(note.id, {
        title: title.trim() || "Untitled",
        body,
        kind,
        tags: tags.split(/[,\s]+/),
      });
    }, 500);
    return () => clearTimeout(t);
  }, [note.id, title, body, kind, tags]);

  // "Related ideas" from embeddings, computed once per opened note (not on
  // every autosave, which would re-embed on each keystroke pause).
  const noteRef = useRef(note);
  useEffect(() => {
    noteRef.current = note;
  }, [note]);
  useEffect(() => {
    if (!settings) return;
    let cancelled = false;
    (async () => {
      const current = noteRef.current;
      try {
        await indexNotes(settings, { notes: [current] });
      } catch {
        // offline / no key
      }
      const [vectors, notes] = await Promise.all([loadVectors(settings), liveNotes()]);
      if (!cancelled) setRelated(relatedNotes(current, notes, vectors));
    })();
    return () => {
      cancelled = true;
    };
  }, [settings, note.id]);

  const outputRef = useRef<HTMLDivElement>(null);
  function runTool(tool: CreatorTool) {
    if (!settings) return;
    setActiveTool(tool);
    // On phones the result renders below the fold; bring it into view.
    requestAnimationFrame(() => outputRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    const current: Note = { ...note, title, body, kind, tags: tags.split(/[,\s]+/).filter(Boolean) };
    completion.run(settings, {
      system: creatorSystem(settings.channel),
      messages: [{ role: "user", content: tool.build(current, settings.channel) }],
    });
  }

  async function saveOutput() {
    if (!activeTool || !completion.output) return;
    const created = await createNote({
      title: `${activeTool.label}: ${title}`.slice(0, 120),
      body: completion.output,
      kind: activeTool.saveAs,
      tags: tags.split(/[,\s]+/),
      sourceId: note.id,
    });
    completion.reset();
    setActiveTool(null);
    toast.success("Saved as a new note", {
      action: { label: "Open", onClick: () => router.push(`/note?id=${created.id}`) },
    });
  }

  async function remove() {
    if (!confirm("Delete this note?")) return;
    await deleteNote(note.id);
    toast("Note deleted");
    router.push("/library");
  }

  const aiReady = settings ? hasChatAccess(settings) : false;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft /> Back
        </Button>
        <span className="text-xs text-muted-foreground">Edited {relativeTime(note.updatedAt)} · autosaves</span>
        <Button variant="ghost" size="icon-sm" className="ml-auto" onClick={remove} aria-label="Delete note">
          <Trash2 />
        </Button>
      </div>

      {source && (
        <Link
          href={`/note?id=${source.id}`}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <CornerUpLeft className="size-3.5" /> Made from: <span className="underline">{source.title}</span>
        </Link>
      )}

      <div className="space-y-3">
        <Textarea
          rows={1}
          value={title}
          onChange={(e) => setTitle(e.target.value.replace(/\n/g, " "))}
          className="min-h-0 resize-none border-0 px-0 py-0 text-xl font-semibold shadow-none focus-visible:ring-0 md:text-xl dark:bg-transparent"
          aria-label="Title"
        />
        <KindPicker value={kind} onChange={setKind} />
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="min-h-48 text-base leading-relaxed"
          aria-label="Body"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="Tags"
            className="max-w-xs flex-1"
            aria-label="Tags"
          />
          {settings && (
            <VoiceButton settings={settings} onText={(t) => setBody((b) => (b.trim() ? `${b.trimEnd()} ${t}` : t))} />
          )}
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <h2 className="font-medium">Make it a video</h2>
        </div>
        {!aiReady && (
          <p className="text-sm text-muted-foreground">
            <Link href="/settings" className="text-primary underline">
              Add an AI key or Ollama
            </Link>{" "}
            to use these.
          </p>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          {CREATOR_TOOLS.map((tool) => (
            <button
              key={tool.id}
              type="button"
              disabled={!aiReady || completion.running}
              onClick={() => runTool(tool)}
              className="rounded-xl border bg-card p-3 text-left transition-colors hover:border-primary/50 hover:bg-muted/40 disabled:pointer-events-none disabled:opacity-50"
            >
              <div className="text-sm font-medium">{tool.label}</div>
              <div className="text-xs text-muted-foreground">{tool.description}</div>
            </button>
          ))}
        </div>
        <div ref={outputRef} className="scroll-mt-20" />
        <AiOutput
          title={activeTool?.label ?? "Result"}
          output={completion.output}
          running={completion.running}
          error={completion.error}
          onStop={completion.stop}
          onSave={saveOutput}
        />
      </section>

      {related.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-medium">Related in your vault</h2>
          <div className="grid gap-3">
            {related.map((r) => (
              <NoteCard key={r.note.id} note={r.note} match={r.semantic} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
