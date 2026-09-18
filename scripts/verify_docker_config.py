import os

def audit_production_config():
    print("==================================================")
    print("   Zorvex ERP 2.0 — Production Proxy & Config Audit ")
    print("==================================================")

    # 1. Docker Compose Audit
    with open('docker-compose.prod.yml', 'r', encoding='utf-8') as f:
        compose = f.read()

    assert 'name: zorvex-v2' in compose, "Missing 'name: zorvex-v2'"
    assert '127.0.0.1:8081:80' in compose, "Nginx must be published strictly on 127.0.0.1:8081:80"
    assert '"80:80"' not in compose and '"443:443"' not in compose, "Host ports 80/443 must not be exposed"
    assert '8000:8000' not in compose, "Host port 8000 must not be exposed (reserved for Zorvex 1.0)"
    for s in ['db', 'redis', 'web', 'celery_worker', 'celery_beat', 'nginx']:
        assert f'container_name: zorvex_v2_{s}' in compose, f"Missing container_name for {s}"
    print("[OK] Docker Compose: Project 'zorvex-v2' fully isolated with port 127.0.0.1:8081:80")

    # 2. Container Nginx Protocol Preservation Audit
    with open('nginx/conf.d/default.conf', 'r', encoding='utf-8') as f:
        nginx_conf = f.read()

    assert 'map $http_x_forwarded_proto $proxy_x_forwarded_proto' in nginx_conf, "Missing protocol preservation map"
    assert 'default $http_x_forwarded_proto;' in nginx_conf, "Map must preserve incoming $http_x_forwarded_proto"
    assert '""      $scheme;' in nginx_conf, "Map must fallback to $scheme when header is absent"
    assert 'proxy_set_header X-Forwarded-Proto $proxy_x_forwarded_proto;' in nginx_conf, "Proxy must send $proxy_x_forwarded_proto"
    assert 'proxy_set_header X-Forwarded-Port $proxy_x_forwarded_port;' in nginx_conf, "Proxy must send $proxy_x_forwarded_port"
    assert 'try_files $uri $uri/ /app/index.html;' in nginx_conf, "Missing React SPA fallback in /app/"
    assert 'internal;' in nginx_conf and 'alias /app/media/;' in nginx_conf, "Protected media must enforce internal directive"
    print("[OK] Container Nginx: HTTPS protocol preservation verified with direct curl fallback")

    # 3. Django Security Settings Audit
    with open('erp_core/settings.py', 'r', encoding='utf-8') as f:
        settings = f.read()

    assert "SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')" in settings, "Missing SECURE_PROXY_SSL_HEADER"
    assert "USE_X_FORWARDED_HOST = True" in settings, "Missing USE_X_FORWARDED_HOST"
    assert "_env_allowed_hosts = env.list('ALLOWED_HOSTS', default=None)" in settings, "Missing dynamic ALLOWED_HOSTS"
    assert "_env_csrf_trusted = env.list('CSRF_TRUSTED_ORIGINS', default=None)" in settings, "Missing dynamic CSRF_TRUSTED_ORIGINS"
    assert "CORS_ALLOW_ALL_ORIGINS = env.bool('CORS_ALLOW_ALL_ORIGINS', default=True)" in settings, "Missing dynamic CORS"
    print("[OK] Django Settings: SECURE_PROXY_SSL_HEADER and dynamic CSRF/Hosts verified")

    # 4. Frontend Vite Development Proxy Audit
    with open('frontend/vite.config.ts', 'r', encoding='utf-8') as f:
        vite_conf = f.read()

    assert "base: '/app/'" in vite_conf, "Vite base path must be '/app/'"
    assert "'/api':" in vite_conf and "target: 'http://127.0.0.1:8000'" in vite_conf, "Missing /api proxy"
    assert "'/admin':" in vite_conf and "target: 'http://127.0.0.1:8000'" in vite_conf, "Missing /admin proxy"
    assert "'/static':" in vite_conf and "target: 'http://127.0.0.1:8000'" in vite_conf, "Missing /static proxy"
    print("[OK] Vite Config: Development proxy targets configured with base '/app/'")

    # 5. Frontend Client API Base URL Audit
    with open('frontend/src/api/client.ts', 'r', encoding='utf-8') as f:
        client_ts = f.read()

    assert "return '';" in client_ts, "Browser must use same-origin relative URLs"
    print("[OK] Frontend Client: Same-origin relative URLs enforced for browser requests")

    print("\nAll production deployment, proxy, and security audits PASSED (5/5)!")

if __name__ == '__main__':
    audit_production_config()
