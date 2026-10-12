# Idea Vault

An offline-first idea vault for short-form video creators. Capture video ideas by
typing or talking, find them later by meaning, and turn any idea into a
ready-to-shoot Shorts/TikTok/Reels script with the AI provider of your choice.
You bring your own key, or use free local Ollama.

Built for a cheap setup: no paid backend is required. Notes live in your
browser, the app installs to your phone's home screen, and it works without a
connection.

## What it does

| | |
|---|---|
| **Capture** | Ideas, hooks, scripts and notes. `#hashtags` become tags. ⌘/Ctrl+Enter saves. |
| **Voice** | Free live browser dictation, or record and transcribe with Whisper (Groq or OpenAI) for better accuracy. |
| **Search by meaning** | "money saving trip" finds "How I flew to Paris for $40". Uses embeddings (OpenAI or local Ollama) and falls back to keyword search offline. |
| **Make it a video** | One tap on any note produces: a **Shorts script** (hook, scenes with voiceover, on-screen text and AI image/video prompts, CTA, loop tip), **10 hooks**, **title + description + tags**, or a **5-part series**. Results stream in and can be saved as new notes linked to the original. |
| **Ask your vault** | Chat with all your notes, e.g. "Which idea should I post this week?". Answers cite the notes they used. |
| **Your channel** | Set your niche, audience, style and platform once; every prompt uses them. |
| **Offline + installable** | PWA with a service worker. Open, browse, edit and capture with no network. |
| **Backup / sync** | JSON export/import. Optional Supabase sync across phone and laptop, private per user via Row Level Security. |

## Stack

| Layer | Used here |
|---|---|
| Frontend | Next.js 16 (App Router) + TypeScript + Tailwind v4 + shadcn/ui |
| Offline storage | IndexedDB via Dexie, plus a service worker (`public/sw.js`) |
| Backend / auth / sync | Optional Supabase (Postgres + Auth + RLS). Off by default, so the app is fully local |
| Vector search | Local: embeddings stored in IndexedDB, cosine similarity in the browser |
| AI | Grok (xAI), OpenAI, Claude (Anthropic), Ollama (local). Bring your own key |
| Embeddings | OpenAI `text-embedding-3-small` or Ollama `nomic-embed-text` |
| Voice | Browser SpeechRecognition, or Whisper via Groq (`whisper-large-v3-turbo`) / OpenAI |
| Hosting | Vercel (or anywhere that runs Next.js) |

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

Then open **Settings**:

1. **Your channel**: niche, audience, style, platform.
2. **AI writer**: pick a provider and paste its key
   ([xAI](https://console.x.ai) · [OpenAI](https://platform.openai.com/api-keys) ·
   [Anthropic](https://console.anthropic.com/settings/keys)), or pick **Ollama**
   for free local AI (`ollama pull llama3.2`). The ↻ button lists the models your
   key can use, so you can switch to newer models without code changes.
3. **Search by meaning** (optional): OpenAI (needs the OpenAI key; costs very
   little) or Ollama (`ollama pull nomic-embed-text`).
4. **Voice**: browser dictation is free. Groq Whisper is cheap and more accurate.

> Ollama + a deployed site: the browser calls Ollama on `localhost:11434`
> directly. If the app runs on another origin (e.g. your Vercel URL), start
> Ollama with `OLLAMA_ORIGINS=https://your-app.vercel.app ollama serve`.

## Deploy (Vercel)

1. Push this repo to GitHub, then import it at [vercel.com/new](https://vercel.com/new). No env vars are required.
2. Open the site on your phone → browser menu → **Add to Home Screen**.

### Optional: sync across devices (Supabase)

1. Create a free project at [supabase.com](https://supabase.com).
2. In the SQL editor, run `supabase/migrations/0001_notes.sql` (creates the `notes` table with RLS).
3. Under Authentication → URL Configuration, add your site URL (and `http://localhost:3000`) to the redirect URLs.
4. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (see `.env.example`) locally and in Vercel.
5. In Settings → Sync, sign in with an email link. Sync runs on load, when you come back online, every 2 minutes, and on demand.

Sync is last-write-wins per note. Embeddings are not synced; each device rebuilds its own.

## Privacy and security

- Notes and API keys are stored in this browser's IndexedDB. Clearing site data
  deletes them, so use Export or sync.
- Keys go from your device to this app's `/api/*` routes, which forward them to
  the provider for that one request. The routes never log or store keys. Ollama
  requests go straight from the browser to your machine.
- The API routes only proxy requests that carry the caller's own key, so a
  public deployment doesn't spend your money. It does use your hosting
  bandwidth; keep the URL private if that matters to you.
- Claude requests use `claude-opus-5-5` by default with server-side refusal
  fallbacks enabled (`fallbacks: "default"`). You can choose
  `claude-sonnet-5-5` or `claude-haiku-5-5` in Settings to lower the cost.

## Develop

```bash
npm run lint
npm run typecheck
npm test           # vitest: search ranking, sync merge, storage, API validation, streaming
npm run build
```

Offline behaviour only applies to production builds (`npm run build && npm start`).
The service worker is not registered in dev.

```
src/
  app/                 pages: / (capture), /library, /note?id=, /ask, /settings
    api/               chat (streaming), embed, transcribe, models — BYOK proxies
  components/          app shell, voice button, AI output, note cards, shadcn/ui
  hooks/               dictation, recorder, streaming completion, online status
  lib/
    ai/                provider catalog, server adapters, browser client, prompts
    db.ts notes.ts     Dexie schema + note CRUD (soft deletes for sync)
    search.ts          hybrid semantic + keyword ranking
    embeddings.ts      indexing and query embeddings
    sync/              Supabase client, merge rules, sync runner
public/sw.js           offline service worker
supabase/migrations/   SQL for optional sync
```
