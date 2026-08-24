import os
import re

def fix_columns_and_colors(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    
    # colors
    content = content.replace("'blue'", "'primary'")
    content = content.replace("'yellow'", "'warning'")
    content = content.replace("'purple'", "'default'")
    content = content.replace("'orange'", "'warning'")
    content = content.replace("'green'", "'success'")
    content = content.replace("'red'", "'danger'")
    content = content.replace("'gray'", "'default'")

    # add key to columns
    def repl(m):
        header = m.group(1)
        return f"{{ key: '{header}', header: '{header}', "
    content = re.sub(r'\{ *header: *[\'\"]([^\'\"]+)[\'\"],', repl, content)

    with open(filepath, 'w') as f:
        f.write(content)

base_dir = r'c:\Users\Aimen Iqbal\Desktop\ERP\frontend\src\modules\hr\components'
for file in os.listdir(base_dir):
    if file.endswith('.tsx'):
        fix_columns_and_colors(os.path.join(base_dir, file))
