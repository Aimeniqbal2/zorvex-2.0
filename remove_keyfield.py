import os

def remove_keyfield(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    content = content.replace(' keyField="id"', '')

    with open(filepath, 'w') as f:
        f.write(content)

base_dir = r'c:\Users\Aimen Iqbal\Desktop\ERP\frontend\src\modules\hr\components'
for file in os.listdir(base_dir):
    if file.endswith('.tsx'):
        remove_keyfield(os.path.join(base_dir, file))
