import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Idea Vault",
    short_name: "Idea Vault",
    description: "Capture video ideas by voice, find them by meaning, and turn them into scripts.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#7c3aed",
    categories: ["productivity", "entertainment"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Capture idea", url: "/" },
      { name: "Ask my notes", url: "/ask" },
    ],
  };
}
