import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './index.css';
import { registerServiceWorker } from './lib/pwa';

registerServiceWorker();

// Pages load on demand, and a deploy replaces their files. A tab left open across a
// deploy then asks for a chunk that no longer exists; reload onto the new build instead
// of showing a broken page. Once per minute at most, so a genuinely missing file cannot
// loop.
window.addEventListener('vite:preloadError', event => {
  const KEY = 'chunk-reload-at';
  let last = 0;
  try { last = Number(sessionStorage.getItem(KEY) || 0); } catch { /* storage blocked */ }
  if (Date.now() - last < 60_000) return;
  event.preventDefault();
  try { sessionStorage.setItem(KEY, String(Date.now())); } catch { /* storage blocked */ }
  window.location.reload();
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
