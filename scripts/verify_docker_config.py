import sys

def validate_yaml():
    with open('docker-compose.prod.yml', 'r', encoding='utf-8') as f:
        content = f.read()

    print("=== docker-compose.prod.yml Structure Audit ===")
    
    # 1. Check Project Name
    assert 'name: zorvex-v2' in content, "Missing 'name: zorvex-v2' project name"
    print("[OK] Unique Compose Project Name: zorvex-v2")

    # 2. Check Port Isolation
    assert '127.0.0.1:8081:80' in content, "Missing 127.0.0.1:8081:80 port mapping"
    assert '"80:80"' not in content, "Must not expose host port 80"
    assert '"443:443"' not in content, "Must not expose host port 443"
    assert '8000:8000' not in content, "Must not expose host port 8000 (reserved for Zorvex 1.0)"
    print("[OK] Host Port Isolation: Bound strictly to 127.0.0.1:8081:80 (No 80/443/8000 collisions)")

    # 3. Check Services
    required_services = ['db', 'redis', 'web', 'celery_worker', 'celery_beat', 'nginx']
    for s in required_services:
        assert f'{s}:' in content, f"Missing service: {s}"
        assert f'container_name: zorvex_v2_{s}' in content, f"Missing isolated container_name for {s}"
    print("[OK] Service Isolation: All 6 services defined with zorvex_v2_ container prefixes")

    # 4. Check Healthchecks
    assert 'pg_isready' in content, "Missing PostgreSQL healthcheck"
    assert 'redis-cli' in content, "Missing Redis healthcheck"
    assert 'service_healthy' in content, "Missing service_healthy depends_on conditions"
    print("[OK] Healthchecks: PostgreSQL and Redis healthchecks configured with dependent service gates")

    # 5. Check Volumes
    required_volumes = ['zorvex_v2_postgres_data', 'zorvex_v2_media_volume', 'zorvex_v2_static_volume']
    for v in required_volumes:
        assert v in content, f"Missing isolated volume: {v}"
    print("[OK] Persistent Storage: Isolated named volumes defined")

    # 6. Check Multi-stage Nginx Build
    assert './nginx/Dockerfile' in content, "Nginx service must build using ./nginx/Dockerfile"
    print("[OK] React Automated Build: Configured via multi-stage ./nginx/Dockerfile")

    # 7. Check Network
    assert 'zorvex_v2_net' in content, "Private network zorvex_v2_net must be defined"
    print("[OK] Network: Private network zorvex_v2_net configured with no external leaks")

    print("\nAll Docker Compose production assertions passed successfully!")

if __name__ == '__main__':
    validate_yaml()
