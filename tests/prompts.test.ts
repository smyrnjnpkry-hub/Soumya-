import { describe, expect, it } from "vitest";
import { askSystem, CREATOR_TOOLS, creatorSystem } from "@/lib/ai/prompts";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import type { Note } from "@/lib/types";

const channel = { ...DEFAULT_SETTINGS.channel, niche: "AI history shorts", audience: "students" };
const note: Note = {
  id: "n1",
  title: "Why Rome fell in 60 seconds",
  body: "Three causes, fast cuts",
  kind: "idea",
  tags: ["history"],
  createdAt: 0,
  updatedAt: 0,
  dirty: 0,
};

describe("prompts", () => {
  it("puts the channel brief in the system prompt", () => {
    const s = creatorSystem(channel);
    expect(s).toContain("Niche: AI history shorts");
    expect(s).toContain("YouTube Shorts");
  });
  it("every creator tool includes the note content", () => {
    for (const tool of CREATOR_TOOLS) {
      expect(tool.build(note, channel)).toContain(note.title);
    }
  });
  it("numbers notes for citation in Ask", () => {
    expect(askSystem(channel, [note])).toContain("[1] Why Rome fell in 60 seconds (idea)");
    expect(askSystem(channel, [])).toContain("(no matching notes)");
  });
});
