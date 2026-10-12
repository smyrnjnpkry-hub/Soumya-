"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db, kvGet, kvSet } from "./db";
import {
  CHAT_PROVIDERS,
  EMBEDDING_DEFAULTS,
  type ChatProvider,
  type EmbeddingProvider,
  type TranscribeProvider,
} from "./ai/providers";

export type Platform = "youtube-shorts" | "tiktok" | "reels" | "youtube";

export interface Settings {
  chatProvider: ChatProvider;
  models: Record<ChatProvider, string>;
  /** Stored only in this browser's IndexedDB; sent per request, never saved server-side. */
  keys: { xai: string; openai: string; anthropic: string; groq: string };
  ollamaUrl: string;
  embeddingProvider: EmbeddingProvider;
  embeddingModels: { openai: string; ollama: string };
  transcribeProvider: TranscribeProvider;
  speechLang: string;
  channel: {
    name: string;
    niche: string;
    audience: string;
    style: string;
    platform: Platform;
  };
}

export const DEFAULT_SETTINGS: Settings = {
  chatProvider: "xai",
  models: {
    xai: CHAT_PROVIDERS.xai.defaultModel,
    openai: CHAT_PROVIDERS.openai.defaultModel,
    anthropic: CHAT_PROVIDERS.anthropic.defaultModel,
    ollama: CHAT_PROVIDERS.ollama.defaultModel,
  },
  keys: { xai: "", openai: "", anthropic: "", groq: "" },
  ollamaUrl: "http://localhost:11434",
  embeddingProvider: "none",
  embeddingModels: { ...EMBEDDING_DEFAULTS },
  transcribeProvider: "browser",
  speechLang: "en-US",
  channel: {
    name: "",
    niche: "",
    audience: "",
    style: "punchy, curious, no fluff",
    platform: "youtube-shorts",
  },
};

const KEY = "settings";

function merge(saved: Partial<Settings> | undefined): Settings {
  const s = saved ?? {};
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    models: { ...DEFAULT_SETTINGS.models, ...s.models },
    keys: { ...DEFAULT_SETTINGS.keys, ...s.keys },
    embeddingModels: { ...DEFAULT_SETTINGS.embeddingModels, ...s.embeddingModels },
    channel: { ...DEFAULT_SETTINGS.channel, ...s.channel },
  };
}

export async function getSettings(): Promise<Settings> {
  return merge(await kvGet<Partial<Settings>>(KEY));
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  await db.transaction("rw", db.kv, async () => {
    const current = await getSettings();
    await kvSet(KEY, { ...current, ...patch });
  });
}

/** Live settings; undefined while IndexedDB is loading. */
export function useSettings(): Settings | undefined {
  return useLiveQuery(getSettings, []);
}

/** True when the selected chat provider can be called right now. */
export function hasChatAccess(s: Settings): boolean {
  return s.chatProvider === "ollama" || Boolean(s.keys[s.chatProvider]);
}
