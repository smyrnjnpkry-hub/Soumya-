// Shared by the browser and the API routes — no secrets in here.

export const CLOUD_CHAT_PROVIDERS = ["xai", "openai", "anthropic"] as const;
export type CloudChatProvider = (typeof CLOUD_CHAT_PROVIDERS)[number];
export type ChatProvider = CloudChatProvider | "ollama";

export interface ProviderInfo {
  label: string;
  defaultModel: string;
  /** Shown as suggestions; the model field stays free text so new models work. */
  suggestions: string[];
  keyUrl?: string;
}

export const CHAT_PROVIDERS: Record<ChatProvider, ProviderInfo> = {
  xai: {
    label: "Grok (xAI)",
    defaultModel: "grok-4",
    suggestions: ["grok-4", "grok-4-fast", "grok-3-mini"],
    keyUrl: "https://console.x.ai",
  },
  openai: {
    label: "OpenAI",
    defaultModel: "gpt-5-mini",
    suggestions: ["gpt-5-mini", "gpt-5", "gpt-5-nano"],
    keyUrl: "https://platform.openai.com/api-keys",
  },
  anthropic: {
    label: "Claude (Anthropic)",
    defaultModel: "claude-opus-5-5",
    suggestions: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"],
    keyUrl: "https://console.anthropic.com/settings/keys",
  },
  ollama: {
    label: "Ollama (local, free)",
    defaultModel: "llama3.2",
    suggestions: ["llama3.2", "qwen3", "gemma3"],
  },
};

/** OpenAI-compatible base URLs. OpenAI itself uses the SDK default. */
export const OPENAI_COMPATIBLE_BASE_URL: Partial<Record<string, string>> = {
  xai: "https://api.x.ai/v1",
  groq: "https://api.groq.com/openai/v1",
};

export type EmbeddingProvider = "none" | "openai" | "ollama";
export const EMBEDDING_DEFAULTS = {
  openai: "text-embedding-3-small",
  ollama: "nomic-embed-text",
} as const;

export type TranscribeProvider = "browser" | "openai" | "groq";
export const TRANSCRIBE_MODELS = {
  openai: "gpt-4o-mini-transcribe",
  groq: "whisper-large-v3-turbo",
} as const;

export const KEY_HEADER = "x-provider-key";
