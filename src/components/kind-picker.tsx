"use client";

import { KIND_LABELS, NOTE_KINDS, type NoteKind } from "@/lib/types";
import { cn } from "@/lib/utils";

export function KindPicker({ value, onChange }: { value: NoteKind; onChange: (k: NoteKind) => void }) {
  return (
    <div role="radiogroup" aria-label="Type" className="inline-flex rounded-lg bg-muted p-0.5">
      {NOTE_KINDS.map((k) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={value === k}
          onClick={() => onChange(k)}
          className={cn(
            "rounded-md px-3 py-1 text-sm text-muted-foreground transition-colors",
            value === k && "bg-background text-foreground shadow-sm",
          )}
        >
          {KIND_LABELS[k]}
        </button>
      ))}
    </div>
  );
}
