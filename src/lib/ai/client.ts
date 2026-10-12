"use client";

import type { Settings } from "../settings";
import type { ChatMessage } from "../types";
import { CHAT_PROVIDERS, KEY_HEADER, TRANSCRIBE_MODELS, type CloudChatProvider } from "./providers";

export class AIError extends Error {}

async function errorFrom(res: Response): Promise<AIError> {
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  return new AIError(data?.error ?? `Request failed (${res.status})`);
}

function requireKey(settings: Settings, provider: keyof Settings["keys"]): string {
  const key = settings.keys[provider];
  if (!key) {
    const label = provider === "groq" ? "Groq" : CHAT_PROVIDERS[provider].label;
    throw new AIError(`Add your ${label} API key in Settings first.`);
  }
  return key;
}

export interface CompletionInput {
  system: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
}

/** Streams text from whichever chat provider is selected in Settings. */
export async function* streamCompletion(
  settings: Settings,
  { system, messages, signal }: CompletionInput,
): AsyncGenerator<string> {
  const provider = settings.chatProvider;
  const model = settings.models[provider] || CHAT_PROVIDERS[provider].defaultModel;

  if (provider === "ollama") {
    yield* streamOllama(settings.ollamaUrl, model, system, messages, signal);
    return;
  }

  const key = requireKey(settings, provider);
  let res: Response;
  try {
    res = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json", [KEY_HEADER]: key },
      body: JSON.stringify({ provider, model, system, messages }),
      signal,
    });
  } catch (err) {
    if (signal?.aborted) return;
    throw offlineAware(err);
  }
  if (!res.ok || !res.body) throw await errorFrom(res);

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) yield value;
  }
}

/** Ollama runs on the user's machine, so the browser talks to it directly. */
async function* streamOllama(
  baseUrl: string,
  model: string,
  system: string,
  messages: ChatMessage[],
  signal?: AbortSignal,
): AsyncGenerator<string> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        stream: true,
        messages: [...(system ? [{ role: "system", content: system }] : []), ...messages],
      }),
      signal,
    });
  } catch (err) {
    if (signal?.aborted) return;
    throw new AIError(
      `Can't reach Ollama at ${baseUrl}. Is it running? If this app is on a different origin, start Ollama with OLLAMA_ORIGINS set to this site.`,
      { cause: err },
    );
  }
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new AIError(`Ollama error (${res.status}): ${text.slice(0, 200)}`);
  }

  // Ollama streams newline-delimited JSON.
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const chunk = JSON.parse(line) as { message?: { content?: string }; error?: string };
      if (chunk.error) throw new AIError(`Ollama: ${chunk.error}`);
      if (chunk.message?.content) yield chunk.message.content;
    }
  }
}

function offlineAware(err: unknown): AIError {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return new AIError("You're offline. AI tools need a connection (or a local Ollama).");
  }
  return new AIError(err instanceof Error ? err.message : "Network error");
}

export async function fetchModelList(settings: Settings, provider: CloudChatProvider): Promise<string[]> {
  const key = requireKey(settings, provider);
  const res = await fetch("/api/models", {
    method: "POST",
    headers: { "content-type": "application/json", [KEY_HEADER]: key },
    body: JSON.stringify({ provider }),
  });
  if (!res.ok) throw await errorFrom(res);
  return ((await res.json()) as { models: string[] }).models;
}

export async function fetchOllamaModels(baseUrl: string): Promise<string[]> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/tags`);
  if (!res.ok) throw new AIError(`Ollama error (${res.status})`);
  const data = (await res.json()) as { models?: { name: string }[] };
  return (data.models ?? []).map((m) => m.name).sort();
}

/** Whisper-quality transcription via OpenAI or Groq. */
export async function transcribe(settings: Settings, audio: Blob): Promise<string> {
  const provider = settings.transcribeProvider;
  if (provider === "browser") throw new AIError("Browser dictation doesn't use this path.");
  const key = requireKey(settings, provider);
  const ext = audio.type.includes("mp4") ? "mp4" : audio.type.includes("ogg") ? "ogg" : "webm";
  const form = new FormData();
  form.set("provider", provider);
  form.set("file", new File([audio], `voice.${ext}`, { type: audio.type || "audio/webm" }));
  const lang = settings.speechLang.split("-")[0];
  if (lang) form.set("language", lang);

  let res: Response;
  try {
    res = await fetch("/api/transcribe", { method: "POST", headers: { [KEY_HEADER]: key }, body: form });
  } catch (err) {
    throw offlineAware(err);
  }
  if (!res.ok) throw await errorFrom(res);
  return ((await res.json()) as { text: string }).text.trim();
}

export const transcribeModelLabel = (p: "openai" | "groq") => TRANSCRIBE_MODELS[p];
