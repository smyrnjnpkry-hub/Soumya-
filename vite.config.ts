/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// `base: './'` + HashRouter keeps the build portable: it runs from any static
// host or sub-folder (GitHub Pages, Netlify, Vercel, a USB stick) with no
// server rewrites, and the service worker scope follows wherever it is served.
export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeManifestIcons: false, // already matched by globPatterns below
      manifest: {
        name: 'FinTrack — Personal Finance',
        short_name: 'FinTrack',
        description: 'Private, offline-first personal finance tracker: budgets, goals, loans, cash flow and smart insights in ₹.',
        lang: 'en-IN',
        theme_color: '#f5f7fb',
        background_color: '#f5f7fb',
        display: 'standalone',
        id: './',
        start_url: './',
        scope: './',
        categories: ['finance', 'productivity'],
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Long-press the home-screen icon for one-tap entry
        shortcuts: [
          {
            name: 'Add expense',
            url: './#/transactions/new?type=expense',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Add income',
            url: './#/transactions/new?type=income',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Only the Latin subsets of Inter are needed (₹ lives in latin-ext).
        globIgnores: ['**/inter-cyrillic*', '**/inter-greek*', '**/inter-vietnamese*'],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    rolldownOptions: {
      output: {
        // Long-lived vendor chunks: an app update doesn't make returning users re-download React or Recharts.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler|react-router)[\\/]/, priority: 20 },
            { name: 'vendor', test: /node_modules[\\/]/, priority: 10 },
          ],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
