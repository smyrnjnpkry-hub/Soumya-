import OpenAI from "openai";
import { errorResponse, readKey, RequestError } from "@/lib/ai/server";

// OpenAI embeddings proxy. Ollama embeddings are called from the browser.
export async function POST(req: Request) {
  try {
    const apiKey = readKey(req);
    const body = (await req.json().catch(() => null)) as { model?: unknown; input?: unknown } | null;
    const model = typeof body?.model === "string" ? body.model : "";
    const input = body?.input;
    if (!model) throw new RequestError("Missing model");
    if (
      !Array.isArray(input) ||
      input.length === 0 ||
      input.length > 128 ||
      !input.every((t) => typeof t === "string" && t.length <= 32_000)
    ) {
      throw new RequestError("input must be 1-128 strings of up to 32k chars");
    }

    const client = new OpenAI({ apiKey });
    const res = await client.embeddings.create({ model, input }, { signal: req.signal });
    const vectors = res.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
    return Response.json({ vectors });
  } catch (err) {
    return errorResponse(err);
  }
}
