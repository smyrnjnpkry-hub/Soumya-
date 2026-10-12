"use client";

import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Cloud, Download, ExternalLink, Loader2, RefreshCw, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchModelList, fetchOllamaModels } from "@/lib/ai/client";
import {
  CHAT_PROVIDERS,
  EMBEDDING_DEFAULTS,
  TRANSCRIBE_MODELS,
  type ChatProvider,
  type EmbeddingProvider,
  type TranscribeProvider,
} from "@/lib/ai/providers";
import { exportBackup, importBackup } from "@/lib/backup";
import { db, kvGet } from "@/lib/db";
import { embeddingModelId, indexNotes } from "@/lib/embeddings";
import { saveSettings, useSettings, type Platform, type Settings } from "@/lib/settings";
import { getSupabase } from "@/lib/sync/supabase";
import { resetSyncCursor, syncNow } from "@/lib/sync/sync";

function Field({ label, hint, children, htmlFor }: { label: string; hint?: React.ReactNode; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function SettingsPage() {
  const stored = useSettings();
  if (!stored) return <p className="text-sm text-muted-foreground">Loading settings…</p>;
  return <SettingsForm initial={stored} />;
}

function SettingsForm({ initial }: { initial: Settings }) {
  // Local copy keeps inputs snappy; each change is persisted immediately.
  const [s, setS] = useState(initial);
  function update(patch: Partial<Settings>) {
    setS((cur) => ({ ...cur, ...patch }));
    saveSettings(patch);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Keys and notes are stored only on this device. Keys are sent to the provider per request and never saved on a server.
        </p>
      </div>
      <ChannelCard s={s} update={update} />
      <AiCard s={s} update={update} />
      <SearchCard s={s} update={update} />
      <VoiceCard s={s} update={update} />
      <SyncCard />
      <BackupCard />
    </div>
  );
}

type CardProps = { s: Settings; update: (p: Partial<Settings>) => void };

function ChannelCard({ s, update }: CardProps) {
  const set = (patch: Partial<Settings["channel"]>) => update({ channel: { ...s.channel, ...patch } });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your channel</CardTitle>
        <CardDescription>The AI writes in your niche and voice. The more specific, the better the scripts.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <Field label="Channel name" htmlFor="ch-name">
          <Input id="ch-name" value={s.channel.name} onChange={(e) => set({ name: e.target.value })} placeholder="@mychannel" />
        </Field>
        <Field label="Main platform" htmlFor="platform">
          <Select value={s.channel.platform} onValueChange={(v) => set({ platform: v as Platform })}>
            <SelectTrigger id="platform" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="youtube-shorts">YouTube Shorts</SelectItem>
              <SelectItem value="tiktok">TikTok</SelectItem>
              <SelectItem value="reels">Instagram Reels</SelectItem>
              <SelectItem value="youtube">YouTube (long-form)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Niche" htmlFor="ch-niche">
          <Input id="ch-niche" value={s.channel.niche} onChange={(e) => set({ niche: e.target.value })} placeholder="AI-animated history facts" />
        </Field>
        <Field label="Audience" htmlFor="ch-aud">
          <Input id="ch-aud" value={s.channel.audience} onChange={(e) => set({ audience: e.target.value })} placeholder="curious teens & students" />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Voice / style" htmlFor="ch-style">
            <Input id="ch-style" value={s.channel.style} onChange={(e) => set({ style: e.target.value })} />
          </Field>
        </div>
      </CardContent>
    </Card>
  );
}

function KeyInput({ id, value, onChange, placeholder }: { id: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <Input
      id={id}
      type="password"
      autoComplete="off"
      spellCheck={false}
      value={value}
      onChange={(e) => onChange(e.target.value.trim())}
      placeholder={placeholder}
    />
  );
}

function AiCard({ s, update }: CardProps) {
  const provider = s.chatProvider;
  const info = CHAT_PROVIDERS[provider];
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  async function loadModels() {
    setLoading(true);
    try {
      const list = provider === "ollama" ? await fetchOllamaModels(s.ollamaUrl) : await fetchModelList(s, provider);
      setModels(list);
      toast.success(`Found ${list.length} models`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't load models");
    } finally {
      setLoading(false);
    }
  }

  const keyField = (p: "xai" | "openai" | "anthropic") => (
    <Field
      label={`${CHAT_PROVIDERS[p].label} key`}
      htmlFor={`key-${p}`}
      hint={
        <a className="inline-flex items-center gap-1 underline" href={CHAT_PROVIDERS[p].keyUrl} target="_blank" rel="noreferrer">
          Get a key <ExternalLink className="size-3" />
        </a>
      }
    >
      <KeyInput
        id={`key-${p}`}
        value={s.keys[p]}
        onChange={(v) => update({ keys: { ...s.keys, [p]: v } })}
        placeholder={p === "anthropic" ? "sk-ant-…" : p === "xai" ? "xai-…" : "sk-…"}
      />
    </Field>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI writer</CardTitle>
        <CardDescription>Bring your own key. You pay the provider directly, usually cents per script.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Provider" htmlFor="ai-provider">
            <Select
              value={provider}
              onValueChange={(v) => {
                setModels([]);
                update({ chatProvider: v as ChatProvider });
              }}
            >
              <SelectTrigger id="ai-provider" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(CHAT_PROVIDERS) as ChatProvider[]).map((p) => (
                  <SelectItem key={p} value={p}>
                    {CHAT_PROVIDERS[p].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Model" htmlFor="model" hint="Type any model name, or load the list your key can use.">
            <div className="flex gap-2">
              <Input
                id="model"
                list="model-options"
                value={s.models[provider]}
                onChange={(e) => update({ models: { ...s.models, [provider]: e.target.value.trim() } })}
                placeholder={info.defaultModel}
              />
              <datalist id="model-options">
                {(models.length ? models : info.suggestions).map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
              <Button variant="outline" size="lg" onClick={loadModels} disabled={loading} aria-label="Load models">
                {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              </Button>
            </div>
          </Field>
        </div>

        {provider === "ollama" ? (
          <Field
            label="Ollama URL"
            htmlFor="ollama"
            hint={
              <>
                Free and private: runs on your computer. Install from ollama.com, then <code>ollama pull {s.models.ollama || "llama3.2"}</code>. If this app runs on a different origin, start Ollama with <code>OLLAMA_ORIGINS=*</code>.
              </>
            }
          >
            <Input id="ollama" value={s.ollamaUrl} onChange={(e) => update({ ollamaUrl: e.target.value.trim() })} />
          </Field>
        ) : (
          keyField(provider)
        )}

        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Other provider keys</summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {(["xai", "openai", "anthropic"] as const).filter((p) => p !== provider).map((p) => (
              <div key={p}>{keyField(p)}</div>
            ))}
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

function SearchCard({ s, update }: CardProps) {
  const [progress, setProgress] = useState<string | null>(null);
  const active = embeddingModelId(s);

  async function reindex() {
    setProgress("Starting…");
    try {
      await db.embeddings.clear();
      const n = await indexNotes(s, { onProgress: (d, t) => setProgress(`${d}/${t}`) });
      toast.success(n ? `Indexed ${n} notes` : "Nothing to index");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Indexing failed");
    } finally {
      setProgress(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Search by meaning</CardTitle>
        <CardDescription>
          Embeddings let you find &quot;that idea about budget travel&quot; even if you wrote &quot;cheap trips&quot;. Without it, search matches words.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Embedding provider" htmlFor="emb-provider">
            <Select value={s.embeddingProvider} onValueChange={(v) => update({ embeddingProvider: v as EmbeddingProvider })}>
              <SelectTrigger id="emb-provider" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Off (keyword search)</SelectItem>
                <SelectItem value="openai">OpenAI (uses your OpenAI key, ~free)</SelectItem>
                <SelectItem value="ollama">Ollama (local, free)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {s.embeddingProvider !== "none" && (
            <Field label="Embedding model" htmlFor="emb-model">
              <Input
                id="emb-model"
                value={s.embeddingModels[s.embeddingProvider]}
                onChange={(e) =>
                  update({ embeddingModels: { ...s.embeddingModels, [s.embeddingProvider]: e.target.value.trim() } })
                }
                placeholder={EMBEDDING_DEFAULTS[s.embeddingProvider]}
              />
            </Field>
          )}
        </div>
        {s.embeddingProvider === "openai" && !s.keys.openai && (
          <p className="text-sm text-destructive">Add your OpenAI key under AI writer → Other provider keys.</p>
        )}
        {active && (
          <Button variant="outline" onClick={reindex} disabled={progress !== null}>
            {progress ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            {progress ? `Indexing ${progress}` : "Re-index all notes"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function VoiceCard({ s, update }: CardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Voice</CardTitle>
        <CardDescription>Browser dictation is free and live. Whisper is more accurate with accents, slang and noise.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <Field label="Transcription" htmlFor="transcribe-provider">
          <Select value={s.transcribeProvider} onValueChange={(v) => update({ transcribeProvider: v as TranscribeProvider })}>
            <SelectTrigger id="transcribe-provider" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="browser">Browser (free, live)</SelectItem>
              <SelectItem value="groq">Groq Whisper ({TRANSCRIBE_MODELS.groq}, very cheap)</SelectItem>
              <SelectItem value="openai">OpenAI ({TRANSCRIBE_MODELS.openai})</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Language" htmlFor="lang" hint="BCP-47 code, e.g. en-US, en-IN, hi-IN, es-ES">
          <Input id="lang" value={s.speechLang} onChange={(e) => update({ speechLang: e.target.value.trim() })} />
        </Field>
        {s.transcribeProvider === "groq" && (
          <Field
            label="Groq key"
            htmlFor="key-groq"
            hint={
              <a className="inline-flex items-center gap-1 underline" href="https://console.groq.com/keys" target="_blank" rel="noreferrer">
                Get a key <ExternalLink className="size-3" />
              </a>
            }
          >
            <KeyInput id="key-groq" value={s.keys.groq} onChange={(v) => update({ keys: { ...s.keys, groq: v } })} placeholder="gsk_…" />
          </Field>
        )}
        {s.transcribeProvider === "openai" && !s.keys.openai && (
          <p className="text-sm text-destructive sm:col-span-2">Add your OpenAI key under AI writer → Other provider keys.</p>
        )}
      </CardContent>
    </Card>
  );
}

function SyncCard() {
  const sb = getSupabase();
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastAt, setLastAt] = useState<number | null>(null);

  useEffect(() => {
    if (!sb) return;
    kvGet<number>("sync.lastAt").then((v) => setLastAt(v ?? null));
    const { data } = sb.auth.onAuthStateChange((_e, sess) => setSession(sess));
    return () => data.subscription.unsubscribe();
  }, [sb]);

  if (!sb) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cloud className="size-4" /> Sync across devices
          </CardTitle>
          <CardDescription>
            Off for this deployment. Your vault lives on this device only. To sync phone and laptop, connect a free Supabase project (see the README).
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  async function signIn() {
    if (!sb || !email) return;
    setBusy(true);
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: `${location.origin}/settings` } });
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Check your email for a sign-in link");
  }

  async function runSync() {
    setBusy(true);
    try {
      const r = await syncNow();
      setLastAt(Date.now());
      toast.success(`Synced: ${r.pushed} up, ${r.pulled} down`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await sb?.auth.signOut();
    await resetSyncCursor();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cloud className="size-4" /> Sync across devices
        </CardTitle>
        <CardDescription>Private to your account (row-level security). Works offline and syncs when you&apos;re back online.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {session ? (
          <>
            <p className="text-sm">
              Signed in as <span className="font-medium">{session.user.email}</span>
              {lastAt && <span className="text-muted-foreground"> · last sync {new Date(lastAt).toLocaleTimeString()}</span>}
            </p>
            <div className="flex gap-2">
              <Button onClick={runSync} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />} Sync now
              </Button>
              <Button variant="outline" onClick={signOut}>
                Sign out
              </Button>
            </div>
          </>
        ) : (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              signIn();
            }}
          >
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" aria-label="Email" />
            <Button type="submit" disabled={busy}>
              Email me a link
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function BackupCard() {
  const fileRef = useRef<HTMLInputElement>(null);

  async function download() {
    const blob = await exportBackup();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `idea-vault-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    try {
      const n = await importBackup(file);
      toast.success(`Imported ${n} notes`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Backup</CardTitle>
        <CardDescription>Browsers can clear site data. Export now and then, especially without sync.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={download}>
          <Download /> Export JSON
        </Button>
        <Button variant="outline" onClick={() => fileRef.current?.click()}>
          <Upload /> Import JSON
        </Button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      </CardContent>
    </Card>
  );
}
