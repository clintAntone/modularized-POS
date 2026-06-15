import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Fix: Define __dirname for ESM environment to resolve 'Cannot find name __dirname' error
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [
      react(),
      tailwindcss(),
      // Stamp the build timestamp into sw.js so every deploy gets a unique cache name.
      // This forces the browser to install the new SW and evict all stale caches.
      {
        name: 'sw-version-stamp',
        closeBundle() {
          const swPath = path.resolve(__dirname, 'dist/sw.js');
          if (!fs.existsSync(swPath)) return;
          const stamped = fs.readFileSync(swPath, 'utf-8')
            .replace('__BUILD_TS__', Date.now().toString());
          fs.writeFileSync(swPath, stamped);
        },
      },
    ],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    build: {
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom'],
            'vendor-query': ['@tanstack/react-query'],
            'vendor-supabase': ['@supabase/supabase-js'],
            'vendor-pdf': ['jspdf', 'jspdf-autotable', 'html-to-image'],
            'vendor-ui': ['react-datepicker', 'qrcode.react', 'lucide-react'],
            'vendor-face': ['face-api.js'],
          }
        }
      }
    }
  };
});