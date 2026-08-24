import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp_core.settings')
django.setup()

from django.db import connection
cursor = connection.cursor()
cursor.execute("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'test_erp_db3' AND pid != pg_backend_pid();")
try:
    connection.connection.autocommit = True
    cursor.execute("DROP DATABASE IF EXISTS test_erp_db3;")
    print("Test database dropped successfully.")
except Exception as e:
    print(f"Failed to drop test database: {e}")
