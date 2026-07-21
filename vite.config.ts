import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Meet My Menu AI',
        short_name: 'MeetMyMenuAI',
        description: 'AI-powered, voice-first menu navigation for blind and low-vision users',
        theme_color: '#1a1a1a',
        background_color: '#1a1a1a',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // Cache all app shell assets (JS, CSS, HTML).
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        // Keep /api/* out of the single-page-app navigation fallback. Without this,
        // the service worker answers a link navigation to /api/dashboard (no file
        // extension) with the cached app shell — so on an installed PWA the link
        // opens the app instead of the real analytics page. Denylisting /api lets
        // those navigations reach the server and render the dashboard/report HTML.
        navigateFallbackDenylist: [/^\/api\//],
        // Never cache API calls — they must hit the server for the OpenAI key.
        runtimeCaching: [
          {
            urlPattern: /^\/api\//,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  server: { host: true },
});
