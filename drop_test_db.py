import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

conn = psycopg2.connect(dbname='postgres', user='postgres', password='2861', host='localhost', port='5432')
conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
cursor = conn.cursor()

cursor.execute("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'test_erp_db3' AND pid <> pg_backend_pid();")
cursor.execute("DROP DATABASE IF EXISTS test_erp_db3;")
cursor.close()
conn.close()
print("Dropped test_erp_db3 successfully.")
