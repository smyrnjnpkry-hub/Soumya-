"use client";

import { useEffect } from "react";

/** Registers the offline service worker in production builds. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    // Ask the browser not to evict the local vault under storage pressure.
    navigator.storage?.persist?.().catch(() => {});
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      // Offline caching is a progressive enhancement; the app works without it.
    });
  }, []);
  return null;
}
