"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowRight, KeyRound, Plus } from "lucide-react";
import { toast } from "sonner";
import { KindPicker } from "@/components/kind-picker";
import { NoteCard } from "@/components/note-card";
import { VoiceButton } from "@/components/voice-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { indexNotes } from "@/lib/embeddings";
import { createNote, liveNotes } from "@/lib/notes";
import { hasChatAccess, useSettings } from "@/lib/settings";
import type { NoteKind } from "@/lib/types";

const PLACEHOLDER: Record<NoteKind, string> = {
  idea: "What's the video? e.g. \"Why cats knock things off tables — 3 science reasons\"",
  hook: "A line that stops the scroll…",
  script: "Paste or dictate a script…",
  note: "Research, links, stats, comments to reply to…",
};

export default function CapturePage() {
  const router = useRouter();
  const settings = useSettings();
  const recent = useLiveQuery(async () => (await liveNotes()).slice(0, 6), []);
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<NoteKind>("idea");
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!body.trim() || saving) return;
    setSaving(true);
    try {
      const note = await createNote({ body: body.trim(), kind, tags: tags.split(/[,\s]+/) });
      setBody("");
      setTags("");
      toast.success("Saved to your vault", {
        action: { label: "Open", onClick: () => router.push(`/note?id=${note.id}`) },
      });
      if (settings) indexNotes(settings, { notes: [note] }).catch(() => {});
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Catch the idea before it&apos;s gone</h1>
          <p className="text-sm text-muted-foreground">
            Type or talk. Everything stays on this device and works offline.
          </p>
        </div>

        <div className="space-y-3 rounded-xl border bg-card p-4 shadow-xs">
          <KindPicker value={kind} onChange={setKind} />
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                save();
              }
            }}
            placeholder={PLACEHOLDER[kind]}
            aria-label="Idea"
            className="min-h-32 text-base"
          />
          <Input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="Tags (optional): cats, science, series"
            aria-label="Tags"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            {settings ? (
              <VoiceButton
                settings={settings}
                onText={(t) => setBody((b) => (b.trim() ? `${b.trimEnd()} ${t}` : t))}
              />
            ) : (
              <span />
            )}
            <Button size="lg" onClick={save} disabled={!body.trim() || saving}>
              <Plus /> Save
              <kbd className="ml-1 hidden rounded bg-primary-foreground/15 px-1 text-[10px] sm:inline">⌘↵</kbd>
            </Button>
          </div>
        </div>

        {settings && !hasChatAccess(settings) && (
          <Link
            href="/settings"
            className="flex items-center gap-3 rounded-xl border border-dashed p-3 text-sm transition-colors hover:bg-muted/50"
          >
            <KeyRound className="size-4 text-primary" />
            <span>
              <span className="font-medium">Unlock AI scripts and hooks:</span>{" "}
              <span className="text-muted-foreground">add a Grok, OpenAI or Claude key, or use free local Ollama.</span>
            </span>
            <ArrowRight className="ml-auto size-4 shrink-0" />
          </Link>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-medium">Recent</h2>
          <Link href="/library" className="text-sm text-primary hover:underline">
            See all
          </Link>
        </div>
        {recent === undefined ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        ) : recent.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nothing yet. Your first idea goes above. Small and messy is fine.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {recent.map((n) => (
              <NoteCard key={n.id} note={n} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
