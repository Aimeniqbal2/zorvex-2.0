import os
import subprocess

def run_cmd(cmd, outfile):
    print(f"Running: {cmd}")
    with open(outfile, "w") as f:
        f.write(f"COMMAND: {cmd}\n")
        f.write("="*40 + "\n")
        try:
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
            f.write("STDOUT:\n")
            f.write(result.stdout)
            f.write("\nSTDERR:\n")
            f.write(result.stderr)
            f.write(f"\nRETURN CODE: {result.returncode}\n")
        except Exception as e:
            f.write(f"EXCEPTION: {str(e)}\n")
    print(f"Done: {cmd}")

def main():
    base_dir = r"C:\Users\Aimen Iqbal\Desktop\ERP"
    os.chdir(base_dir)
    
    commands = [
        ("venv\\Scripts\\python manage.py check", "scratch/audit_check.txt"),
        ("venv\\Scripts\\python manage.py showmigrations", "scratch/audit_showmigrations.txt"),
        ("venv\\Scripts\\python manage.py makemigrations --check --dry-run", "scratch/audit_makemigrations.txt"),
        ("venv\\Scripts\\python manage.py test finance --noinput", "scratch/audit_test_finance.txt"),
        ("venv\\Scripts\\python manage.py test --noinput", "scratch/audit_test_full.txt"),
        ("venv\\Scripts\\python manage.py verify_finance_integrity", "scratch/audit_finance_integrity.txt"),
        ("venv\\Scripts\\python manage.py audit_finance_bridge", "scratch/audit_finance_bridge.txt"),
        ("venv\\Scripts\\python manage.py verify_sales_finance_migration", "scratch/audit_sales_migration.txt"),
        ("venv\\Scripts\\python manage.py verify_procurement_migration", "scratch/audit_procurement_migration.txt"),
        ("venv\\Scripts\\python manage.py test scratch.test_phase6g_smoke --noinput", "scratch/audit_test_smoke.txt")
    ]
    
    for cmd, outfile in commands:
        run_cmd(cmd, outfile)
        
if __name__ == "__main__":
    main()
