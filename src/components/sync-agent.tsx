"use client";

import { useEffect } from "react";
import { getSupabase } from "@/lib/sync/supabase";
import { syncNow } from "@/lib/sync/sync";

const EVERY_MS = 2 * 60_000;

/** Background sync while signed in: on load, when back online, and periodically. */
export function SyncAgent() {
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    let signedIn = false;
    const run = () => {
      if (signedIn && navigator.onLine) syncNow().catch(() => {});
    };
    const { data } = sb.auth.onAuthStateChange((_event, session) => {
      signedIn = Boolean(session);
      run();
    });
    window.addEventListener("online", run);
    const timer = setInterval(run, EVERY_MS);
    return () => {
      data.subscription.unsubscribe();
      window.removeEventListener("online", run);
      clearInterval(timer);
    };
  }, []);
  return null;
}
