import os

def replace_keyfield(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # We previously removed keyField="id" so it's not there anymore.
    # We will just append keyExtractor to the DataTable.
    content = content.replace('<DataTable columns={columns} data={designations} />', '<DataTable columns={columns} data={designations} keyExtractor={(item: any) => item.id} />')
    content = content.replace('<DataTable columns={columns} data={employees} />', '<DataTable columns={columns} data={employees} keyExtractor={(item: any) => item.id} />')
    content = content.replace('<DataTable columns={columns} data={candidates} />', '<DataTable columns={columns} data={candidates} keyExtractor={(item: any) => item.id} />')

    with open(filepath, 'w') as f:
        f.write(content)

base_dir = r'c:\Users\Aimen Iqbal\Desktop\ERP\frontend\src\modules\hr\components'
for file in os.listdir(base_dir):
    if file.endswith('.tsx'):
        replace_keyfield(os.path.join(base_dir, file))
