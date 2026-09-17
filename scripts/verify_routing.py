"""
scripts/verify_routing.py
Automated verification of the Zorvex 2.0 routing architecture.
"""
import urllib.request
import urllib.error

def test_url(url, expected_status=200, check_content=None, follow_redirects=True):
    print(f"\nTesting: {url}")
    class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
        def http_error_302(self, req, fp, code, msg, headers):
            return fp
        http_error_301 = http_error_302

    opener = urllib.request.build_opener() if follow_redirects else urllib.request.build_opener(NoRedirectHandler)
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        res = opener.open(req, timeout=5)
        status = getattr(res, 'status', getattr(res, 'code', 200))
        body = res.read().decode('utf-8', errors='ignore') if hasattr(res, 'read') else ''
        print(f"  [RESULT] Status: {status}")
        if status == expected_status:
            print(f"  [PASS] Matches expected status {expected_status}")
        else:
            print(f"  [FAIL] Expected {expected_status}, got {status}")

        if check_content:
            if check_content in body:
                print(f"  [PASS] Found expected snippet: '{check_content}'")
            else:
                print(f"  [FAIL] Missing expected snippet: '{check_content}'")
        return True
    except urllib.error.HTTPError as e:
        print(f"  [RESULT] HTTP {e.code}")
        if e.code == expected_status:
            print(f"  [PASS] Matches expected status {expected_status}")
            return True
        else:
            print(f"  [FAIL] Expected {expected_status}, got {e.code}")
            return False
    except Exception as err:
        print(f"  [ERROR] {err}")
        return False

def main():
    print("==================================================")
    print("   Zorvex 2.0 Routing Architecture Verification   ")
    print("==================================================")

    # 1. Public Marketing Website
    print("\n--- 1. Public Marketing Website (http://localhost:5173/) ---")
    test_url("http://localhost:5173/", 200, "Elevate your entire enterprise")
    test_url("http://localhost:5173/styles.css", 200, "styles.css")
    test_url("http://localhost:5173/script.js", 200)

    # 2. React 2.0 SPA Application
    print("\n--- 2. React 2.0 SPA (http://localhost:5173/app/) ---")
    test_url("http://localhost:5173/app/", 200, "ZORVEX - Powering Your Business")
    test_url("http://localhost:5173/app/login", 200, "ZORVEX - Powering Your Business")

    # 3. Proxied APIs and Django Admin
    print("\n--- 3. Proxied REST APIs and Django Admin ---")
    test_url("http://localhost:5173/api/auth/login/", 405) # POST-only endpoint
    test_url("http://localhost:5173/admin/login/", 200, "Django administration")

    # 4. Django Root Redirect & Legacy Route Removal
    print("\n--- 4. Django Backend (Port 8000) ---")
    test_url("http://127.0.0.1:8000/", 302, follow_redirects=False)
    test_url("http://127.0.0.1:8000/pos/", 404)
    test_url("http://127.0.0.1:8000/inventory/", 404)
    test_url("http://127.0.0.1:8000/login/", 404)
    test_url("http://127.0.0.1:8000/dashboard/", 404)
    test_url("http://127.0.0.1:8000/services/", 404)
    test_url("http://127.0.0.1:8000/service-logs/", 404)

if __name__ == '__main__':
    main()
