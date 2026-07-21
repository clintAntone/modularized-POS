
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './src/index.css';

// ── Devtools deterrent (production only) ─────────────────────────────────────
// This is a UI-layer deterrent only. Real security lives in server-side guards.
if (import.meta.env.PROD) {
  // Block common keyboard shortcuts that open devtools
  document.addEventListener('keydown', (e) => {
    const blocked =
      e.key === 'F12' ||
      (e.ctrlKey && e.shiftKey && ['I', 'J', 'C', 'U'].includes(e.key)) ||
      (e.metaKey && e.altKey && ['I', 'J', 'C'].includes(e.key)) || // macOS
      (e.ctrlKey && e.key === 'U'); // view-source
    if (blocked) e.preventDefault();
  });

  // Disable right-click context menu
  document.addEventListener('contextmenu', (e) => e.preventDefault());
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 30, // 30 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => console.warn('SW registration failed:', err));
  });
}
