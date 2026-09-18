import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

function zorvexLandingPlugin(): Plugin {
  return {
    name: 'zorvex-landing-page',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const rawUrl = req.url || '';
        const pathname = rawUrl.split('?')[0];

        // 1. Root marketing website at http://localhost:5173/
        if (pathname === '/' || pathname === '/index.html') {
          const indexLandingPath = path.resolve((import.meta.dirname || __dirname), '../Zorvex_website/index.html');
          const legacyLandingPath = path.resolve((import.meta.dirname || __dirname), '../Zorvex_website/zorvex_landing.html');
          const landingPath = fs.existsSync(indexLandingPath) ? indexLandingPath : legacyLandingPath;
          if (fs.existsSync(landingPath)) {
            let html = fs.readFileSync(landingPath, 'utf-8');
            html = html
              .replace(/{%\s*load static\s*%}/g, '')
              .replace(/{%\s*static\s*['"]([^'"]+)['"]\s*%}/g, '/$1')
              .replace(/href=["']\/login\/?["']/g, 'href="/app/login"')
              .replace(/href=["']\/signup\/?["']/g, 'href="/app/login"');

            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.end(html);
          }
        }

        // 2. Marketing website assets (styles.css, script.js, images/*)
        if (pathname === '/styles.css' || pathname === '/script.js' || pathname.startsWith('/images/')) {
          const relativePath = pathname.replace(/^\//, '');
          const filePath = path.resolve((import.meta.dirname || __dirname), '../Zorvex_website', relativePath);
          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const ext = path.extname(filePath).toLowerCase();
            const mimeMap: Record<string, string> = {
              '.css': 'text/css',
              '.js': 'application/javascript',
              '.png': 'image/png',
              '.jpg': 'image/jpeg',
              '.jpeg': 'image/jpeg',
              '.svg': 'image/svg+xml',
              '.webp': 'image/webp',
              '.ico': 'image/x-icon',
            };
            res.setHeader('Content-Type', mimeMap[ext] || 'application/octet-stream');
            return fs.createReadStream(filePath).pipe(res);
          }
        }

        // 3. Service Worker handling (/sw.js and /app/sw.js)
        if (pathname === '/sw.js' || pathname === '/app/sw.js') {
          const swFile = path.resolve((import.meta.dirname || __dirname), 'public/sw.js');
          if (fs.existsSync(swFile)) {
            res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
            res.setHeader('Service-Worker-Allowed', '/');
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            return fs.createReadStream(swFile).pipe(res);
          }
        }

        // 4. Web App Manifest handling (/manifest.webmanifest and /manifest.json)
        if (pathname === '/manifest.webmanifest' || pathname === '/manifest.json' || pathname === '/app/manifest.webmanifest' || pathname === '/app/manifest.json') {
          const manifestFile = path.resolve((import.meta.dirname || __dirname), 'public/manifest.webmanifest');
          if (fs.existsSync(manifestFile)) {
            res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
            res.setHeader('Cache-Control', 'no-cache');
            return fs.createReadStream(manifestFile).pipe(res);
          }
        }

        // 5. Fallback for root /assets/* requests to frontend/public/assets
        if (pathname.startsWith('/assets/')) {
          const relativeAsset = pathname.replace(/^\//, '');
          const assetFile = path.resolve((import.meta.dirname || __dirname), 'public', relativeAsset);
          if (fs.existsSync(assetFile) && fs.statSync(assetFile).isFile()) {
            const ext = path.extname(assetFile).toLowerCase();
            const mimeMap: Record<string, string> = {
              '.png': 'image/png',
              '.jpg': 'image/jpeg',
              '.jpeg': 'image/jpeg',
              '.svg': 'image/svg+xml',
              '.webp': 'image/webp',
              '.ico': 'image/x-icon',
            };
            res.setHeader('Content-Type', mimeMap[ext] || 'application/octet-stream');
            return fs.createReadStream(assetFile).pipe(res);
          }
        }

        // 6. Redirect /app to /app/
        if (pathname === '/app') {
          res.writeHead(302, { Location: '/app/' });
          return res.end();
        }

        next();
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  base: '/app/',
  plugins: [react(), zorvexLandingPlugin()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/admin': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/static': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/media': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
