"use client";

import { db, kvGet, kvSet } from "../db";
import { fromRemote, shouldApplyRemote, toRemote, type RemoteNote } from "./merge";
import { getSupabase } from "./supabase";

const CURSOR_KEY = "sync.cursor";
const PAGE = 500;

export interface SyncResult {
  pulled: number;
  pushed: number;
}

let running: Promise<SyncResult> | null = null;

/** Pull remote changes, then push local ones. Concurrent calls share one run. */
export function syncNow(): Promise<SyncResult> {
  running ??= doSync().finally(() => {
    running = null;
  });
  return running;
}

async function doSync(): Promise<SyncResult> {
  const sb = getSupabase();
  if (!sb) throw new Error("Sync isn't configured for this deployment.");
  const { data: auth } = await sb.auth.getSession();
  if (!auth.session) throw new Error("Sign in to sync.");

  // Pull everything the server changed since our cursor.
  let cursor = (await kvGet<string>(CURSOR_KEY)) ?? "1970-01-01T00:00:00Z";
  let pulled = 0;
  while (true) {
    const { data, error } = await sb
      .from("notes")
      .select("*")
      .gt("server_updated_at", cursor)
      .order("server_updated_at", { ascending: true })
      .limit(PAGE);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as RemoteNote[];
    if (rows.length === 0) break;

    await db.transaction("rw", db.notes, db.embeddings, async () => {
      for (const row of rows) {
        const remote = fromRemote(row);
        const local = await db.notes.get(remote.id);
        if (shouldApplyRemote(local, remote)) {
          await db.notes.put(remote);
          if (remote.deletedAt) await db.embeddings.delete(remote.id);
          pulled++;
        }
      }
    });
    cursor = rows[rows.length - 1].server_updated_at ?? cursor;
    await kvSet(CURSOR_KEY, cursor);
    if (rows.length < PAGE) break;
  }

  // Push local edits.
  const dirty = await db.notes.where("dirty").equals(1).toArray();
  for (let i = 0; i < dirty.length; i += 200) {
    const batch = dirty.slice(i, i + 200);
    const { error } = await sb.from("notes").upsert(batch.map(toRemote), { onConflict: "id" });
    if (error) throw new Error(error.message);
    // Only clear the flag if the note wasn't edited again while we uploaded.
    await db.transaction("rw", db.notes, async () => {
      for (const sent of batch) {
        const now = await db.notes.get(sent.id);
        if (now && now.updatedAt === sent.updatedAt) await db.notes.update(sent.id, { dirty: 0 });
      }
    });
  }

  await kvSet("sync.lastAt", Date.now());
  return { pulled, pushed: dirty.length };
}

/** Forget the cursor so the next sync re-pulls everything (e.g. after switching accounts). */
export async function resetSyncCursor(): Promise<void> {
  await kvSet(CURSOR_KEY, null);
}
