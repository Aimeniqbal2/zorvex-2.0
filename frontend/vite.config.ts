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
          const landingPath = path.resolve((import.meta.dirname || __dirname), '../Zorvex_website/zorvex_landing.html');
          if (fs.existsSync(landingPath)) {
            let html = fs.readFileSync(landingPath, 'utf-8');
            // Clean Django template tags and wire login CTA to React 2.0
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

        // 3. Fallback for root /assets/* requests to frontend/public/assets
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

        // 4. Redirect /app to /app/
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
      '/static/admin': {
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
