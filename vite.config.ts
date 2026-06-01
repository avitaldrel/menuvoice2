import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// host:true exposes the dev server on your LAN. Note: iOS Safari only allows
// camera/microphone over HTTPS or localhost, so for on-phone testing deploy to
// Vercel/Netlify (see README) rather than hitting the LAN http URL.
export default defineConfig({
  plugins: [react()],
  server: { host: true },
});
