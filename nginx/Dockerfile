# ==============================================================================
# Zorvex ERP 2.0 — Production Nginx + React Multi-Stage Dockerfile
# ==============================================================================

# Stage 1: Build React 2.0 Production Bundle
FROM node:20-alpine AS frontend-builder
WORKDIR /build

# Copy dependency manifests first for layer caching
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install

# Copy frontend source code
COPY frontend/ ./

# Run production build (TypeScript check + Vite bundle)
RUN npm run build

# Stage 2: Production Nginx Web Server (HTTP Only)
FROM nginx:alpine

# Clean default Nginx welcome files
RUN rm -rf /usr/share/nginx/html/*

# Deploy compiled React 2.0 SPA to /usr/share/nginx/html/app
COPY --from=frontend-builder /build/dist /usr/share/nginx/html/app

# Deploy public marketing landing page to /usr/share/nginx/html/website
COPY Zorvex_website /usr/share/nginx/html/website

# Copy production Nginx configuration
COPY nginx/conf.d/default.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

STOPSIGNAL SIGQUIT

CMD ["nginx", "-g", "daemon off;"]
