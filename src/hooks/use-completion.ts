"use client";

import { useCallback, useRef, useState } from "react";
import { streamCompletion, type CompletionInput } from "@/lib/ai/client";
import type { Settings } from "@/lib/settings";

/** Runs one streamed AI completion at a time, with stop support. */
export function useCompletion() {
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(
    async (settings: Settings, input: Omit<CompletionInput, "signal">, onDelta?: (full: string) => void) => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setOutput("");
      setError(null);
      setRunning(true);
      let full = "";
      try {
        for await (const delta of streamCompletion(settings, { ...input, signal: ctrl.signal })) {
          full += delta;
          setOutput(full);
          onDelta?.(full);
        }
      } catch (err) {
        if (!ctrl.signal.aborted) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (abortRef.current === ctrl) {
          abortRef.current = null;
          setRunning(false);
        }
      }
      return full;
    },
    [],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setRunning(false);
  }, []);

  const reset = useCallback(() => {
    setOutput("");
    setError(null);
  }, []);

  return { output, running, error, run, stop, reset };
}
