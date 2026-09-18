import re
import os

def prepare_landing():
    src = os.path.join('Zorvex_website', 'zorvex_landing.html')
    dst = os.path.join('Zorvex_website', 'index.html')
    
    with open(src, 'r', encoding='utf-8') as f:
        html = f.read()

    # 1. Remove Django template static load tag
    clean = re.sub(r'{%\s*load static\s*%}\s*\n?', '', html)
    # 2. Replace static tags with absolute web root paths
    clean = re.sub(r'{%\s*static\s*[\'"]([^\'"]+)[\'"]\s*%}', r'/\1', clean)
    # 3. Direct Login & Signup CTA buttons to React 2.0 login
    clean = re.sub(r'href=[\'"]/login/?[\'"]', 'href="/app/login"', clean)
    clean = re.sub(r'href=[\'"]/signup/?[\'"]', 'href="/app/login"', clean)

    with open(dst, 'w', encoding='utf-8') as f:
        f.write(clean)

    print(f"Generated clean {dst} ({len(clean)} bytes).")

if __name__ == '__main__':
    prepare_landing()
