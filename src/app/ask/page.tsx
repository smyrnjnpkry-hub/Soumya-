"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, Loader2, Save, Square } from "lucide-react";
import { toast } from "sonner";
import { VoiceButton } from "@/components/voice-button";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { streamCompletion } from "@/lib/ai/client";
import { askSystem } from "@/lib/ai/prompts";
import { embedQuery, loadVectors } from "@/lib/embeddings";
import { createNote, liveNotes } from "@/lib/notes";
import { rankNotes } from "@/lib/search";
import { hasChatAccess, useSettings } from "@/lib/settings";
import type { ChatMessage, Note } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Turn extends ChatMessage {
  sources?: Note[];
  error?: boolean;
}

const STARTERS = [
  "Which of my ideas would make the best Short this week, and why?",
  "Give me 5 new video ideas based on what I've saved.",
  "Plan my next 7 days of uploads from my vault.",
  "What patterns do my best hooks have in common?",
];

export default function AskPage() {
  const settings = useSettings();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (turns.length) endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || !settings || running) return;
    setInput("");
    setRunning(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    // Retrieve the most relevant notes (semantic when available, else keywords).
    const [notes, vectors, queryVector] = await Promise.all([
      liveNotes(),
      loadVectors(settings),
      embedQuery(settings, q),
    ]);
    const context = rankNotes(notes, q, { queryVector, vectors, limit: 6 }).map((r) => r.note);

    const history: ChatMessage[] = [...turns.filter((t) => !t.error), { role: "user" as const, content: q }]
      .slice(-12)
      .map(({ role, content }) => ({ role, content }));
    setTurns((t) => [...t, { role: "user", content: q }, { role: "assistant", content: "", sources: context }]);

    const setLast = (patch: Partial<Turn>) =>
      setTurns((t) => [...t.slice(0, -1), { ...t[t.length - 1], ...patch }]);

    let full = "";
    try {
      for await (const delta of streamCompletion(settings, {
        system: askSystem(settings.channel, context),
        messages: history,
        signal: ctrl.signal,
      })) {
        full += delta;
        setLast({ content: full });
      }
    } catch (err) {
      if (ctrl.signal.aborted) setLast({ content: full ? `${full}\n\n[stopped]` : "[stopped]" });
      else setLast({ content: err instanceof Error ? err.message : "Something went wrong", error: true });
    } finally {
      abortRef.current = null;
      setRunning(false);
    }
  }

  async function saveTurn(turn: Turn) {
    await createNote({ body: turn.content, kind: "note", tags: ["from-ask"] });
    toast.success("Saved to your vault");
  }

  if (settings && !hasChatAccess(settings)) {
    return (
      <div className="space-y-3 py-10 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Ask your vault</h1>
        <p className="text-muted-foreground">Chat with all your saved ideas. Needs an AI provider first.</p>
        <Button asChild>
          <Link href="/settings">Set up AI</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100dvh-10rem)] flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ask your vault</h1>
        <p className="text-sm text-muted-foreground">Answers use your own notes as context.</p>
      </div>

      <div className="flex-1 space-y-4">
        {turns.length === 0 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {STARTERS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                className="rounded-xl border bg-card p-3 text-left text-sm transition-colors hover:border-primary/50 hover:bg-muted/40"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {turns.map((t, i) => (
          <div key={i} className={cn("flex", t.role === "user" && "justify-end")}>
            {t.role === "user" ? (
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2 text-sm text-primary-foreground">
                {t.content}
              </div>
            ) : (
              <div className="w-full space-y-2 rounded-2xl border bg-card px-4 py-3">
                {t.content ? (
                  <div className={cn("text-sm leading-relaxed whitespace-pre-wrap", t.error && "text-destructive")}>
                    {t.content}
                  </div>
                ) : (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" /> Reading your notes…
                  </p>
                )}
                {t.sources && t.sources.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {t.sources.map((n, j) => (
                      <Link
                        key={n.id}
                        href={`/note?id=${n.id}`}
                        className="max-w-48 truncate rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
                      >
                        [{j + 1}] {n.title}
                      </Link>
                    ))}
                  </div>
                )}
                {!t.error && t.content && !(running && i === turns.length - 1) && (
                  <Button size="xs" variant="ghost" onClick={() => saveTurn(t)}>
                    <Save /> Save as note
                  </Button>
                )}
              </div>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form
        className="sticky bottom-20 space-y-2 rounded-xl border bg-background/95 p-2 shadow-sm backdrop-blur sm:bottom-4"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder="Ask anything about your ideas…"
          className="min-h-12 resize-none border-0 shadow-none focus-visible:ring-0"
          aria-label="Question"
        />
        <div className="flex items-center justify-between">
          {settings ? (
            <VoiceButton settings={settings} onText={(t) => setInput((v) => (v.trim() ? `${v.trimEnd()} ${t}` : t))} />
          ) : (
            <span />
          )}
          {running ? (
            <Button type="button" size="icon" variant="outline" onClick={() => abortRef.current?.abort()} aria-label="Stop">
              <Square />
            </Button>
          ) : (
            <Button type="submit" size="icon" disabled={!input.trim()} aria-label="Send">
              <ArrowUp />
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
