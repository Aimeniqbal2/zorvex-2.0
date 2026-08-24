import psycopg2

try:
    conn = psycopg2.connect(dbname='postgres', user='postgres', password='password', host='localhost')
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("""
    SELECT pg_terminate_backend(pg_stat_activity.pid)
    FROM pg_stat_activity
    WHERE pg_stat_activity.datname = 'test_erp_db'
      AND pid <> pg_backend_pid();
    """)
    print('Connections terminated')
except Exception as e:
    print(f"Failed to terminate connections: {e}")
