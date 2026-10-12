import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { KIND_LABELS, type Note } from "@/lib/types";
import { cn } from "@/lib/utils";

const KIND_STYLE: Record<Note["kind"], string> = {
  idea: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  hook: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  script: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  note: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
};

export function KindBadge({ kind }: { kind: Note["kind"] }) {
  return <Badge className={cn("border-transparent", KIND_STYLE[kind])}>{KIND_LABELS[kind]}</Badge>;
}

export function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const min = Math.round(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ms).toLocaleDateString();
}

export function NoteCard({ note, match }: { note: Note; match?: number | null }) {
  const preview = note.body.replace(/\s+/g, " ").trim();
  return (
    <Link
      href={`/note?id=${note.id}`}
      className="group block rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/40"
    >
      <div className="mb-1.5 flex items-center gap-2">
        <KindBadge kind={note.kind} />
        <span className="text-xs text-muted-foreground">{relativeTime(note.updatedAt)}</span>
        {match != null && (
          <span className="ml-auto text-xs tabular-nums text-muted-foreground" title="Meaning match">
            {Math.round(match * 100)}% match
          </span>
        )}
      </div>
      <h3 className="line-clamp-1 font-medium group-hover:text-primary">{note.title}</h3>
      {preview && preview !== note.title && (
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{preview}</p>
      )}
      {note.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {note.tags.slice(0, 5).map((t) => (
            <span key={t} className="text-xs text-muted-foreground">
              #{t}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}
