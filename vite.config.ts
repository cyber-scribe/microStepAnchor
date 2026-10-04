import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import http from 'http';
import { spawn } from 'child_process';
import { defineConfig, Plugin } from 'vite';

function fastapiPlugin(): Plugin {
  return {
    name: 'fastapi-backend-starter',
    configureServer() {
      // Check if FastAPI backend is responding on port 8080; if not, spawn it
      const req = http.get('http://127.0.0.1:8080/api/health', (res) => {
        // FastAPI already running
      });
      req.on('error', () => {
        console.log('[FastAPI] Spawning FastAPI backend on port 8080...');
        const isWindows = process.platform === 'win32';
        const pythonCmd = isWindows ? 'python' : 'python3';
        const py = spawn(
          pythonCmd,
          ['-m', 'uvicorn', 'main:app', '--app-dir', 'backend', '--host', '127.0.0.1', '--port', '8080'],
          {
            stdio: 'inherit',
            detached: false,
          }
        );
        py.on('error', (err) => console.error('[FastAPI] Error starting server:', err));
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), fastapiPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8080',
          changeOrigin: true,
        },
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
