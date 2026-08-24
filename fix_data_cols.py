import os
import re

def fix_columns(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # replace accessor: (e: Employee) => with render: (e: Employee) =>
    content = content.replace('accessor: (', 'render: (')
    
    # Also I need to remove accessor: 'code' because DataTable just uses row[col.key]
    content = re.sub(r'accessor:\s*[\'\"][^\'\"]+[\'\"]\s*,?', '', content)

    # I also need to ensure data is an array
    content = content.replace('setEmployees(res.data.results || res.data);', 'setEmployees(res.data.results || (Array.isArray(res.data) ? res.data : []));')
    content = content.replace('setDesignations(res.data.results || res.data);', 'setDesignations(res.data.results || (Array.isArray(res.data) ? res.data : []));')
    content = content.replace('setCandidates(res.data.results || res.data);', 'setCandidates(res.data.results || (Array.isArray(res.data) ? res.data : []));')

    with open(filepath, 'w') as f:
        f.write(content)

base_dir = r'c:\Users\Aimen Iqbal\Desktop\ERP\frontend\src\modules\hr\components'
for file in os.listdir(base_dir):
    if file.endswith('.tsx'):
        fix_columns(os.path.join(base_dir, file))
