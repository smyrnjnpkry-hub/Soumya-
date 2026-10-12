"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Records microphone audio to a Blob for Whisper-style transcription. */
export function useRecorder() {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const resolveStop = useRef<((b: Blob) => void) | null>(null);

  const cleanup = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    recRef.current?.stream.getTracks().forEach((t) => t.stop());
    recRef.current = null;
    setRecording(false);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.onstop = () => {
        const blob = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
        cleanup();
        resolveStop.current?.(blob);
        resolveStop.current = null;
      };
      recRef.current = rec;
      rec.start();
      setSeconds(0);
      timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
      setRecording(true);
    } catch {
      setError("Couldn't access the microphone.");
      cleanup();
    }
  }, [cleanup]);

  const stop = useCallback(
    () =>
      new Promise<Blob>((resolve) => {
        if (!recRef.current) return;
        resolveStop.current = resolve;
        recRef.current.stop();
      }),
    [],
  );

  useEffect(() => cleanup, [cleanup]);

  return { recording, seconds, error, start, stop };
}
