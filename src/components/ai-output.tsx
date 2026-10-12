"use client";

import { Check, Copy, Loader2, Save, Square } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Streaming AI result with copy / save / stop actions. */
export function AiOutput({
  title,
  output,
  running,
  error,
  onStop,
  onSave,
}: {
  title: string;
  output: string;
  running: boolean;
  error: string | null;
  onStop: () => void;
  onSave?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  if (!running && !output && !error) return null;

  return (
    <section className="rounded-xl border bg-card" aria-live="polite">
      <div className="flex items-center gap-2 border-b px-4 py-2.5">
        <h3 className="text-sm font-medium">{title}</h3>
        <div className="ml-auto flex gap-1">
          {running ? (
            <Button size="sm" variant="ghost" onClick={onStop}>
              <Square /> Stop
            </Button>
          ) : (
            output && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    if (await copyText(output)) {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }
                  }}
                >
                  {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
                </Button>
                {onSave && (
                  <Button size="sm" onClick={onSave}>
                    <Save /> Save as note
                  </Button>
                )}
              </>
            )
          )}
        </div>
      </div>
      <div className="px-4 py-3">
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : output ? (
          <div className="text-sm leading-relaxed whitespace-pre-wrap">{output}</div>
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Thinking…
          </p>
        )}
      </div>
    </section>
  );
}
