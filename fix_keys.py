import os
import re

def fix_last_col(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # Find { header: 'Actions'
    content = re.sub(r'\{\s*header:\s*[\'\"]Actions[\'\"]', "{ key: 'actions', header: 'Actions'", content)
    content = re.sub(r'\{\s*header:\s*[\'\"]Status[\'\"]', "{ key: 'status', header: 'Status'", content)
    content = re.sub(r'\{\s*header:\s*[\'\"]Name[\'\"]', "{ key: 'name', header: 'Name'", content)
    content = re.sub(r'\{\s*header:\s*[\'\"]Designation[\'\"]', "{ key: 'designation', header: 'Designation'", content)
    content = re.sub(r'\{\s*header:\s*[\'\"]Department[\'\"]', "{ key: 'department', header: 'Department'", content)
    content = re.sub(r'\{\s*header:\s*[\'\"]Applied For[\'\"]', "{ key: 'applied_for', header: 'Applied For'", content)

    with open(filepath, 'w') as f:
        f.write(content)

base_dir = r'c:\Users\Aimen Iqbal\Desktop\ERP\frontend\src\modules\hr\components'
for file in os.listdir(base_dir):
    if file.endswith('.tsx'):
        fix_last_col(os.path.join(base_dir, file))
