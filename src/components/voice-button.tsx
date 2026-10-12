"use client";

import { useState } from "react";
import { Loader2, Mic, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { transcribe } from "@/lib/ai/client";
import type { Settings } from "@/lib/settings";
import { useDictation } from "@/hooks/use-dictation";
import { useRecorder } from "@/hooks/use-recorder";

/**
 * One mic button, two engines: free live browser dictation, or record-then-
 * transcribe with Whisper (OpenAI/Groq) for better accuracy.
 */
export function VoiceButton({
  settings,
  onText,
}: {
  settings: Settings;
  onText: (text: string) => void;
}) {
  const useWhisper = settings.transcribeProvider !== "browser";
  const dictation = useDictation(settings.speechLang, onText);
  const recorder = useRecorder();
  const [transcribing, setTranscribing] = useState(false);

  const active = useWhisper ? recorder.recording : dictation.listening;
  const error = useWhisper ? recorder.error : dictation.error;

  async function toggle() {
    if (!useWhisper) {
      if (dictation.listening) dictation.stop();
      else dictation.start();
      return;
    }
    if (!recorder.recording) {
      await recorder.start();
      return;
    }
    const blob = await recorder.stop();
    setTranscribing(true);
    try {
      const text = await transcribe(settings, blob);
      if (text) onText(text);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Transcription failed");
    } finally {
      setTranscribing(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant={active ? "destructive" : "outline"}
        size="lg"
        onClick={toggle}
        disabled={transcribing}
        aria-label={active ? "Stop voice input" : "Start voice input"}
        className={active ? "animate-pulse" : undefined}
      >
        {transcribing ? <Loader2 className="animate-spin" /> : active ? <Square /> : <Mic />}
        {transcribing
          ? "Transcribing…"
          : active
            ? useWhisper
              ? `Stop · ${recorder.seconds}s`
              : "Listening…"
            : "Voice"}
      </Button>
      {error ? (
        <span className="text-xs text-destructive">{error}</span>
      ) : (
        dictation.interim && (
          <span className="line-clamp-1 text-xs text-muted-foreground italic">{dictation.interim}</span>
        )
      )}
    </div>
  );
}
