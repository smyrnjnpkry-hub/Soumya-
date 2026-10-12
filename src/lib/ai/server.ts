// Server-only helpers for the /api routes. Keys arrive per request from the
// user's device and are never logged or stored.
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { ChatMessage } from "../types";
import {
  CLOUD_CHAT_PROVIDERS,
  KEY_HEADER,
  OPENAI_COMPATIBLE_BASE_URL,
  type CloudChatProvider,
} from "./providers";

export class RequestError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export function readKey(req: Request): string {
  const key = req.headers.get(KEY_HEADER)?.trim();
  if (!key) throw new RequestError("Missing API key. Add one in Settings.", 401);
  return key;
}

export function errorResponse(err: unknown): Response {
  if (err instanceof RequestError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof Anthropic.APIError || err instanceof OpenAI.APIError) {
    const status = err.status && err.status >= 400 ? err.status : 502;
    return Response.json({ error: providerMessage(err) }, { status });
  }
  console.error("Unexpected AI route error", err instanceof Error ? err.message : err);
  return Response.json({ error: "Something went wrong talking to the AI provider." }, { status: 502 });
}

function providerMessage(err: InstanceType<typeof Anthropic.APIError> | InstanceType<typeof OpenAI.APIError>): string {
  if (err.status === 401 || err.status === 403 || /api key/i.test(err.message)) {
    return "The provider rejected your API key. Check it in Settings.";
  }
  if (err.status === 429) return "Rate limited or out of credits at the provider. Try again shortly.";
  if (err.status === 404) return "Model not found. Check the model name in Settings.";
  return err.message || "Provider error";
}

export interface ChatRequest {
  provider: CloudChatProvider;
  model: string;
  system: string;
  messages: ChatMessage[];
}

const MAX_CHARS = 400_000;

export function parseChatRequest(body: unknown): ChatRequest {
  if (!body || typeof body !== "object") throw new RequestError("Invalid JSON body");
  const b = body as Record<string, unknown>;
  const provider = b.provider as CloudChatProvider;
  if (!CLOUD_CHAT_PROVIDERS.includes(provider)) throw new RequestError("Unknown provider");
  const model = typeof b.model === "string" ? b.model.trim() : "";
  if (!model || model.length > 120) throw new RequestError("Invalid model name");
  const system = typeof b.system === "string" ? b.system : "";
  if (!Array.isArray(b.messages) || b.messages.length === 0 || b.messages.length > 60) {
    throw new RequestError("messages must be a non-empty array");
  }
  const messages: ChatMessage[] = b.messages.map((m) => {
    const msg = m as Record<string, unknown>;
    if ((msg.role !== "user" && msg.role !== "assistant") || typeof msg.content !== "string") {
      throw new RequestError("Each message needs a role (user|assistant) and string content");
    }
    return { role: msg.role, content: msg.content };
  });
  const total = system.length + messages.reduce((n, m) => n + m.content.length, 0);
  if (total > MAX_CHARS) throw new RequestError("Request too large", 413);
  return { provider, model, system, messages };
}

// Models that accept output_config.effort / server-side refusal fallbacks.
const EFFORT_MODELS = /^claude-(fable-5|opus-5|sonnet-5|haiku-5|opus-4-[5-8])/;
const FALLBACK_MODELS = /^claude-(fable-5-1|opus-5|sonnet-5-5)/;

/**
 * Yields text deltas. The first yield is an empty string once the provider has
 * accepted the request, so auth/model errors surface before streaming starts.
 */
export async function* streamChat(
  req: ChatRequest,
  apiKey: string,
  signal: AbortSignal,
): AsyncGenerator<string> {
  if (req.provider === "anthropic") {
    yield* streamAnthropic(req, apiKey, signal);
  } else {
    yield* streamOpenAICompatible(req, apiKey, signal);
  }
}

async function* streamAnthropic(req: ChatRequest, apiKey: string, signal: AbortSignal) {
  const client = new Anthropic({ apiKey });
  const useFallback = FALLBACK_MODELS.test(req.model);
  const stream = client.beta.messages.stream(
    {
      model: req.model,
      max_tokens: 64000,
      system: req.system || undefined,
      messages: req.messages,
      ...(EFFORT_MODELS.test(req.model) ? { output_config: { effort: "medium" as const } } : {}),
      // On a policy decline, let the API retry on Anthropic's recommended model.
      ...(useFallback
        ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
        : {}),
    },
    { signal },
  );

  for await (const event of stream) {
    if (event.type === "message_start") {
      yield "";
    } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    }
  }
  const final = await stream.finalMessage();
  if (final.stop_reason === "refusal") {
    yield "\n\n[Claude declined this request. Try rephrasing it.]";
  } else if (final.stop_reason === "max_tokens") {
    yield "\n\n[Stopped: hit the length limit.]";
  }
}

async function* streamOpenAICompatible(req: ChatRequest, apiKey: string, signal: AbortSignal) {
  const client = new OpenAI({ apiKey, baseURL: OPENAI_COMPATIBLE_BASE_URL[req.provider] });
  const stream = await client.chat.completions.create(
    {
      model: req.model,
      stream: true,
      messages: [
        ...(req.system ? [{ role: "system" as const, content: req.system }] : []),
        ...req.messages,
      ],
    },
    { signal },
  );
  yield "";
  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content;
    if (text) yield text;
  }
}

/** Turns a text generator into a streaming HTTP response body. */
export async function textStreamResponse(gen: AsyncGenerator<string>): Promise<Response> {
  // Pull until the provider accepts the request, so errors become proper statuses.
  const first = await gen.next();
  const encoder = new TextEncoder();
  let pending: string | null = first.done ? null : first.value;
  let finished = Boolean(first.done);

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        while (true) {
          if (pending) {
            controller.enqueue(encoder.encode(pending));
            pending = null;
            return;
          }
          if (finished) {
            controller.close();
            return;
          }
          const next = await gen.next();
          if (next.done) finished = true;
          else pending = next.value;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "stream interrupted";
        controller.enqueue(encoder.encode(`\n\n[Error: ${msg}]`));
        controller.close();
      }
    },
    async cancel() {
      await gen.return(undefined);
    },
  });

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
