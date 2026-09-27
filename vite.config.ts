import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Libraries that change only when package.json does, split from app code so a deploy
// does not make returning visitors re-download them. Kept to what the entry already
// loads; everything heavier (TipTap, Excalidraw) is split per route by lazy imports.
const VENDOR_CHUNKS: Record<string, string[]> = {
  react: ['react', 'react-dom', 'scheduler', 'react-router', 'react-router-dom'],
  supabase: ['@supabase'],
  query: ['@tanstack'],
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          for (const [chunk, packages] of Object.entries(VENDOR_CHUNKS)) {
            if (packages.some(p => id.includes(`/node_modules/${p}/`))) return `vendor-${chunk}`;
          }
          return undefined;
        },
      },
    },
  },
});
