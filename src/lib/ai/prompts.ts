import type { Platform, Settings } from "../settings";
import type { Note, NoteKind } from "../types";

const PLATFORM: Record<Platform, string> = {
  "youtube-shorts": "YouTube Shorts (vertical, under 60s)",
  tiktok: "TikTok (vertical, 15-60s)",
  reels: "Instagram Reels (vertical, 15-60s)",
  youtube: "long-form YouTube (8-15 min)",
};

export function channelBrief(c: Settings["channel"]): string {
  const lines = [
    `Platform: ${PLATFORM[c.platform]}`,
    c.name && `Channel: ${c.name}`,
    c.niche && `Niche: ${c.niche}`,
    c.audience && `Audience: ${c.audience}`,
    c.style && `Voice/style: ${c.style}`,
  ].filter(Boolean);
  return lines.join("\n");
}

const FORMAT_RULES = `Formatting: plain text that pastes cleanly into a teleprompter or caption box. Use short UPPERCASE section labels and simple "-" bullets. No markdown tables, no bold/italics markers, no preamble — start with the content.`;

export function creatorSystem(c: Settings["channel"]): string {
  return `You are a short-form video strategist and scriptwriter working with one creator. The creator works on a tight budget: they make videos with AI voiceover, AI-generated or stock visuals, and free editing tools, so everything you suggest must be producible by one person cheaply.

What you know about the channel:
${channelBrief(c)}

Write for retention: the first 1-2 seconds decide whether a viewer stays, so lead with tension, a surprising claim, or a visual pattern-interrupt. Prefer concrete specifics over generic advice. Stay original — never copy existing creators' scripts or titles. Don't promise viewers things the video doesn't deliver; misleading clickbait hurts watch time and can get videos limited.

${FORMAT_RULES}`;
}

export interface CreatorTool {
  id: string;
  label: string;
  description: string;
  /** Kind of note to save the output as. */
  saveAs: NoteKind;
  build: (note: Note, c: Settings["channel"]) => string;
}

function source(note: Note): string {
  return `TITLE: ${note.title}\n${note.body}${note.tags.length ? `\nTAGS: ${note.tags.join(", ")}` : ""}`;
}

export const CREATOR_TOOLS: CreatorTool[] = [
  {
    id: "short-script",
    label: "Shorts script",
    description: "Hook, scenes with voiceover + AI visual prompts, CTA",
    saveAs: "script",
    build: (note, c) => `Turn this into a ready-to-produce script for ${PLATFORM[c.platform]}.

${source(note)}

Return:
HOOK (0-2s): the exact first line spoken + what's on screen
SCENES: 5-8 numbered scenes. For each:
- VO: the voiceover line (spoken, conversational, short sentences)
- ON-SCREEN TEXT: 2-6 words
- VISUAL PROMPT: a prompt the creator can paste into an AI image/video generator (subject, setting, camera angle, lighting, vertical 9:16)
PAYOFF: the line that delivers on the hook
CTA: one natural line (follow / comment prompt) — not begging
LOOP TIP: how to make the ending flow back into the start
ESTIMATED LENGTH: seconds, assuming ~150 spoken words per minute`,
  },
  {
    id: "hooks",
    label: "10 hooks",
    description: "Scroll-stopping opening lines in different styles",
    saveAs: "hook",
    build: (note) => `Write 10 different opening hooks (spoken, under 12 words each) for a video about this idea:

${source(note)}

Use a mix of styles: bold claim, question, "you're doing X wrong", countdown, story-in-progress, visual surprise, myth-bust, stakes. After each hook, add the matching on-screen text in brackets. Finish with "BEST BET:" and the number of the hook you'd test first and why in one line.`,
  },
  {
    id: "metadata",
    label: "Title + description + tags",
    description: "Upload-ready metadata for search and suggested",
    saveAs: "note",
    build: (note, c) => `Write upload metadata for a ${PLATFORM[c.platform]} video based on:

${source(note)}

Return:
TITLES: 5 options under 60 characters, curiosity-driven but honest
DESCRIPTION: 2-3 short sentences with the main keyword early, then 3 relevant hashtags
TAGS: 12 comma-separated search tags (mix of broad and specific)
THUMBNAIL/COVER TEXT: 3 options, max 4 words each
PINNED COMMENT: one line that invites replies`,
  },
  {
    id: "series",
    label: "Spin into a series",
    description: "5 follow-up video ideas from this one",
    saveAs: "idea",
    build: (note) => `This idea could become a recurring series. Pitch 5 follow-up videos that build on it so viewers who liked the first one want the next.

${source(note)}

For each: a working title, the one-line hook, and why it would perform (one line). Then give a SERIES NAME and a consistent opening line/format the creator can reuse every episode.`,
  },
];

export function askSystem(c: Settings["channel"], context: Note[]): string {
  const notes = context.length
    ? context
        .map((n, i) => `[${i + 1}] ${n.title} (${n.kind})\n${n.body.slice(0, 1500)}`)
        .join("\n\n---\n\n")
    : "(no matching notes)";
  return `${creatorSystem(c)}

You can see the creator's own notes below — their ideas, hooks, scripts and research. Use them when relevant and cite them like [1] or [2]. If the notes don't cover the question, say so briefly and answer from general knowledge.

<notes>
${notes}
</notes>`;
}
