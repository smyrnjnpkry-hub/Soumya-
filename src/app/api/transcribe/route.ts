import OpenAI from "openai";
import { OPENAI_COMPATIBLE_BASE_URL, TRANSCRIBE_MODELS } from "@/lib/ai/providers";
import { errorResponse, readKey, RequestError } from "@/lib/ai/server";

const MAX_BYTES = 25 * 1024 * 1024; // provider limit for one upload

export async function POST(req: Request) {
  try {
    const apiKey = readKey(req);
    const form = await req.formData().catch(() => null);
    const provider = form?.get("provider");
    const file = form?.get("file");
    const language = form?.get("language");
    if (provider !== "openai" && provider !== "groq") throw new RequestError("Unknown provider");
    if (!(file instanceof File) || file.size === 0) throw new RequestError("Missing audio file");
    if (file.size > MAX_BYTES) throw new RequestError("Recording too long (25 MB max)", 413);

    const client = new OpenAI({ apiKey, baseURL: OPENAI_COMPATIBLE_BASE_URL[provider] });
    const result = await client.audio.transcriptions.create(
      {
        file,
        model: TRANSCRIBE_MODELS[provider],
        ...(typeof language === "string" && language ? { language } : {}),
      },
      { signal: req.signal },
    );
    return Response.json({ text: result.text });
  } catch (err) {
    return errorResponse(err);
  }
}
