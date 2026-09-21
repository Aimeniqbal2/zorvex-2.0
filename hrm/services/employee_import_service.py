import csv
import io
import re
from datetime import datetime, date, timedelta
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from hrm.models import (
    Employee, Department, Designation, EmployeeDocument,
    EmployeeDocumentType, DocumentVerificationStatus
)
from finance.models import EmployeePaymentDestination

class EmployeeImportService:
    """
    Safe legacy data migration framework for One Security HRIS.
    Preserves leading zeros, guarantees tenant isolation, validates records,
    provides dry-run preview, and prevents duplicates on retry.
    """

    @staticmethod
    def get_template_csv():
        output = io.StringIO()
        writer = csv.writer(output)
        headers = [
            'legacy_code', 'full_name', 'father_husband_name',
            'gender', 'date_of_birth', 'place_of_birth', 'marital_status',
            'children_male', 'children_female', 'caste', 'cnic_number',
            'cnic_issue_date', 'cnic_expiry_date', 'telephone_number', 'mobile_number',
            'current_address', 'permanent_address', 'joining_date', 'confirmation_date',
            'designation', 'department', 'workforce_type', 'background_type',
            'eobi_number', 'sessi_number', 'insurance_policy_number', 'ntn_number',
            'is_guard_vaccine', 'is_guard_apsa_verified',
            'payment_method', 'bank_name', 'account_title', 'account_number', 'branch_code', 'iban',
            'wallet_provider', 'wallet_number'
        ]
        writer.writerow(headers)
        # Add sample row matching legacy screenshot
        writer.writerow([
            '010571', 'Saad Khan Jadoon', 'Saeed Khan',
            'Male', '2000-04-01', 'Distric Aptabad', 'Married',
            '0', '0', 'Jadoon', '13101-7124112-7',
            '2019-10-08', '2029-10-08', '03185559650', '03149329381',
            'Distric Aptabad', 'Distric Aptabad', '2026-09-14', '2026-09-14',
            'Security Guard', 'Operations', 'DIRECT', 'CIVILIAN',
            'EOBI-987654', 'SESSI-123456', 'INS-554433', '1234567-8',
            '1', '1',
            'BANK_TRANSFER', 'Habib Bank Limited', 'Saad Khan Jadoon', '01234567890123', '0142', 'PK36HABB0000123456789012',
            '', ''
        ])
        return output.getvalue()

    @classmethod
    def parse_rows(cls, file_content):
        """
        Parses CSV or TSV or Excel exports, auto-detects delimiter,
        canonicalizes legacy headers, and preserves leading zeros.
        """
        if isinstance(file_content, bytes):
            try:
                file_content = file_content.decode('utf-8-sig')
            except UnicodeDecodeError:
                try:
                    file_content = file_content.decode('cp1252')
                except Exception:
                    file_content = file_content.decode('utf-8', errors='replace')
        elif hasattr(file_content, 'read'):
            raw = file_content.read()
            if isinstance(raw, bytes):
                try:
                    file_content = raw.decode('utf-8-sig')
                except UnicodeDecodeError:
                    try:
                        file_content = raw.decode('cp1252')
                    except Exception:
                        file_content = raw.decode('utf-8', errors='replace')
            else:
                file_content = raw

        # Detect delimiter
        lines = [line for line in file_content.splitlines() if line.strip()]
        delimiter = ','
        if lines:
            first_line = lines[0]
            counts = {
                ',': first_line.count(','),
                '\t': first_line.count('\t'),
                ';': first_line.count(';'),
                '|': first_line.count('|'),
            }
            best_delim = max(counts, key=counts.get)
            if counts[best_delim] > 0:
                delimiter = best_delim

        reader = csv.DictReader(io.StringIO(file_content), delimiter=delimiter)

        def canonicalize_key(raw_k):
            if not raw_k:
                return ''
            norm = re.sub(r'[^a-zA-Z0-9]', '', str(raw_k)).lower()

            # 1. Name
            if norm in ('name', 'fullname', 'employeename', 'guardname', 'empname', 'nameofemployee', 'staffname', 'personname'):
                return 'name'
            if norm in ('firstname', 'fname'):
                return 'first_name'
            if norm in ('lastname', 'lname', 'surname'):
                return 'last_name'

            # 2. Father / Husband Name
            if any(p in norm for p in ('fatherhusband', 'fathername', 'husbandname', 'father', 'husband', 'valad')):
                return 'father_husband_name'

            # 3. Old NIC / Previous NIC (MUST precede modern CNIC so it doesn't overwrite CNIC)
            if any(p in norm for p in ('oldnic', 'oldcnic', 'previousnic', 'prevnic', 'oldid', 'oldnicno', 'oldcnicno')) or (('old' in norm or 'prev' in norm) and ('nic' in norm or 'cnic' in norm)):
                return 'old_nic_no'

            # 4. CNIC Issue Date
            if (('cnic' in norm or 'nic' in norm) and any(x in norm for x in ('issue', 'issuing', 'issued'))) or norm in ('issuedate', 'dateofissue', 'cnicissue', 'nicissue', 'cnicissuedate', 'nicissuedate'):
                return 'cnic_issue_date'

            # 5. CNIC Expiry Date
            if (('cnic' in norm or 'nic' in norm) and any(x in norm for x in ('exp', 'expiry', 'expired', 'valid'))) or norm in ('expirydate', 'dateofexpiry', 'expdate', 'validtill', 'cnicexpiry', 'nicexpiry', 'cnicexpirydate', 'nicexpirydate'):
                return 'cnic_expiry_date'

            # 6. Modern CNIC Number
            if norm in ('cnic', 'cnicno', 'cnicnumber', 'nic', 'nicno', 'nicnumber', 'nationalid', 'idcard', 'idcardno', 'cnicnum', 'nicnum', 'cnic#', 'nic#') or (('cnic' in norm or 'nic' in norm or norm in ('nationalid', 'idcard')) and not any(x in norm for x in ('old', 'prev', 'issue', 'exp', 'valid'))):
                return 'cnic_number'

            # 7. Dates
            if norm in ('dob', 'dateofbirth', 'birthdate', 'datebirth'):
                return 'date_of_birth'
            if norm in ('enrollmentdate', 'joiningdate', 'dateofjoining', 'doj', 'enrollment', 'joining', 'hiredate', 'dateofhire', 'appointmentdate'):
                return 'joining_date'
            if norm in ('confirmdate', 'confirmationdate', 'doc', 'dateofconfirmation'):
                return 'confirmation_date'

            # 8. Bank & Payment Details (MUST precede department/branch so Branch Code is not mapped to Department!)
            if any(p in norm for p in ('bankaccount', 'accountno', 'accountnumber', 'acctno', 'acctnum', 'accno', 'acno', 'bankacc', 'bankaccno')):
                return 'account_number'
            if 'branchcode' in norm or 'bankbranchcode' in norm or norm in ('bcode',):
                return 'branch_code'
            if 'branchname' in norm or 'bankbranch' in norm:
                return 'branch_name'
            if any(p in norm for p in ('bankname', 'bank')) and not any(x in norm for x in ('account', 'acct', 'branch', 'code')):
                return 'bank_name'
            if any(p in norm for p in ('accounttitle', 'titleofaccount', 'acctitle', 'beneficiary')):
                return 'account_title'
            if 'iban' in norm:
                return 'iban'
            if any(p in norm for p in ('paymentmethod', 'paymethod', 'modeofpay', 'paymentmode')):
                return 'payment_method'
            if any(p in norm for p in ('easypaisa', 'jazzcash', 'upaisa', 'wallet')):
                if any(n in norm for n in ('no', 'num', 'number', 'mobile', 'cell')):
                    return 'wallet_number'
                return 'wallet_provider'

            # 9. Contact (Landline / Telephone vs Mobile)
            if any(p in norm for p in ('tele', 'landline', 'ptcl', 'residencephone', 'resphone', 'homephone', 'emergencyphone', 'emergencycontact', 'officetelephone')) or norm in ('telephone', 'telephoneno', 'telephonenumber', 'tel', 'telno', 'telnumber', 'landlineno'):
                return 'telephone_number'
            if any(p in norm for p in ('mobile', 'cell', 'whatsapp', 'cellular')) or norm in ('phone', 'phoneno', 'phonenumber', 'contact', 'contactno', 'contactnumber'):
                return 'mobile_number'

            # 10. Addresses
            if any(p in norm for p in ('corres', 'current', 'present', 'temp', 'postal')) or norm in ('address', 'address1', 'currentaddress', 'presentaddress'):
                return 'current_address'
            if any(p in norm for p in ('perma', 'permanent', 'homeaddress', 'address2')) or norm in ('permanentaddress', 'hometown'):
                return 'permanent_address'

            # 11. Personal & Caste
            if any(p in norm for p in ('caste', 'cast', 'tribe', 'qaum', 'baradari', 'zaat', 'clan')):
                return 'caste'
            if any(p in norm for p in ('placeofbirth', 'birthplace', 'cityofbirth', 'district', 'domicile')) or ('birth' in norm and ('place' in norm or 'city' in norm or 'dist' in norm)):
                return 'place_of_birth'
            if norm in ('gender', 'sex'):
                return 'gender'
            if 'marital' in norm:
                return 'marital_status'
            if ('children' in norm and 'male' in norm) or norm in ('son', 'sons', 'malekids'):
                return 'children_male'
            if ('children' in norm and 'female' in norm) or norm in ('daughter', 'daughters', 'femalekids'):
                return 'children_female'

            # 12. Designation & Department
            if any(p in norm for p in ('designation', 'desig', 'rank', 'jobtitle', 'position', 'post', 'role')):
                return 'designation'
            if any(p in norm for p in ('department', 'dept')) or (('branch' in norm or 'location' in norm) and not any(b in norm for b in ('bank', 'code', 'acct', 'acc'))):
                return 'department'
            if any(p in norm for p in ('workforce', 'classification', 'workforcetype', 'category', 'directindirect')) or norm in ('type', 'workforcetype'):
                return 'workforce_type'
            if 'background' in norm or norm in ('exarmy', 'civilianarmy'):
                return 'background_type'

            # 13. Statutory & Guard specifics
            if 'eobi' in norm:
                return 'eobi_number'
            if 'sesi' in norm or 'sessi' in norm or 'pessi' in norm or 'socialsecurity' in norm:
                return 'sessi_number'
            if 'ntn' in norm or 'taxno' in norm or 'taxnumber' in norm:
                return 'ntn_number'
            if 'insurance' in norm or 'policy' in norm:
                return 'insurance_policy_number'
            if 'vaccine' in norm or 'vaccin' in norm or 'covid' in norm:
                return 'is_guard_vaccine'
            if 'apsa' in norm:
                return 'is_guard_apsa_verified'

            # 14. Code / Legacy Code
            if norm in ('employeecode', 'empcode', 'legacycode', 'previouscode', 'oldcode', 'code', 'regno', 'cardno', 'fileno', 'id', 'empno', 'employeeno'):
                return 'legacy_code'

            # Fallback cleaned key
            return raw_k.strip().lower().replace(' ', '_').replace('/', '_')

        rows = []
        for idx, r in enumerate(reader, start=1):
            cleaned = {}
            for k, v in r.items():
                if k:
                    canonical_k = canonicalize_key(k)
                    val = v.strip() if v is not None else ''
                    if canonical_k:
                        # CRITICAL: Never overwrite a populated key with an empty value
                        if canonical_k not in cleaned or (val and not cleaned[canonical_k]):
                            cleaned[canonical_k] = val
                    simple_k = k.strip().lower().replace(' ', '_').replace('/', '_')
                    if simple_k not in cleaned or (val and not cleaned[simple_k]):
                        cleaned[simple_k] = val

            # Normalize CNIC: fallback to old_nic_no if modern cnic_number is empty
            if not cleaned.get('cnic_number') and cleaned.get('old_nic_no'):
                cleaned['cnic_number'] = cleaned['old_nic_no']

            # Clean CNIC format: if 13 raw digits, format as XXXXX-XXXXXXX-X
            raw_cnic = cleaned.get('cnic_number', '')
            digits = re.sub(r'\D', '', raw_cnic)
            if len(digits) == 13 and '-' not in raw_cnic:
                cleaned['cnic_number'] = f"{digits[:5]}-{digits[5:12]}-{digits[12]}"

            # Cross-populate contact numbers if only one was provided
            if not cleaned.get('phone') and cleaned.get('mobile_number'):
                cleaned['phone'] = cleaned['mobile_number']
            if not cleaned.get('phone') and cleaned.get('telephone_number'):
                cleaned['phone'] = cleaned['telephone_number']

            cleaned['_row_num'] = idx
            rows.append(cleaned)
        return rows

    @classmethod
    def _parse_date(cls, val):
        if not val:
            return None
        val = str(val).strip()
        if not val:
            return None
        # Remove time component if present (e.g. "01/01/1972 00:00:00" or "2026-07-13T00:00:00")
        val = val.split(' ')[0].split('T')[0].strip()

        # Handle numeric Excel serial date (e.g. 44561 or 26299)
        if val.isdigit():
            try:
                days = int(val)
                return date(1899, 12, 30) + timedelta(days=days)
            except Exception:
                pass

        # Try common date formats
        for fmt in ('%Y-%m-%d', '%m/%d/%Y', '%d/%m/%Y', '%d-%m-%Y', '%m-%d-%Y', '%Y/%m/%d', '%d.%m.%Y', '%m.%d.%Y'):
            try:
                return datetime.strptime(val, fmt).date()
            except ValueError:
                pass
        return None

    @classmethod
    def preview(cls, company_id, file_content):
        """
        Dry-run validation of employee import rows.
        """
        rows = cls.parse_rows(file_content)
        preview_rows = []
        total_valid = 0
        total_invalid = 0
        total_existing = 0

        existing_legacy_codes = set(
            Employee.objects.filter(company_id=company_id, is_deleted=False)
            .exclude(previous_employee_code='')
            .values_list('previous_employee_code', flat=True)
        )
        existing_employee_codes = set(
            Employee.objects.filter(company_id=company_id, is_deleted=False)
            .values_list('employee_code', flat=True)
        )
        existing_cnics = set(
            Employee.objects.filter(company_id=company_id, is_deleted=False)
            .exclude(cnic_number='')
            .values_list('cnic_number', flat=True)
        )

        for r in rows:
            errors = []
            row_num = r.get('_row_num')
            legacy_code = str(r.get('legacy_code') or r.get('previous_code') or r.get('employee_code') or '').strip()
            
            # Single Full Name everywhere: no first/last splitting
            name = (r.get('name') or r.get('full_name') or r.get('first_name') or '').strip()
            if r.get('last_name'):
                last = r.get('last_name').strip()
                if last and not name.endswith(last):
                    name = f"{name} {last}".strip()

            if not name:
                errors.append("Employee Name is required.")

            # Date validations
            dob = cls._parse_date(r.get('date_of_birth') or r.get('dob'))
            joining_date = cls._parse_date(r.get('joining_date') or r.get('enrollment_date') or r.get('hire_date'))
            confirm_date = cls._parse_date(r.get('confirmation_date') or r.get('confirm_date'))
            cnic_issue = cls._parse_date(r.get('cnic_issue_date'))
            cnic_exp = cls._parse_date(r.get('cnic_expiry_date'))

            if r.get('date_of_birth') and not dob:
                errors.append(f"Invalid Date of Birth format: {r.get('date_of_birth')}")
            if (r.get('joining_date') or r.get('enrollment_date')) and not joining_date:
                errors.append(f"Invalid Joining Date format: {r.get('joining_date') or r.get('enrollment_date')}")

            # CNIC checking
            cnic = r.get('cnic_number') or r.get('cnic', '')
            is_existing = False
            if legacy_code:
                if legacy_code in existing_legacy_codes or legacy_code in existing_employee_codes:
                    is_existing = True
                elif legacy_code.isdigit() and (legacy_code.zfill(6) in existing_legacy_codes or legacy_code.lstrip('0') in existing_legacy_codes):
                    is_existing = True
            if not is_existing and cnic and cnic in existing_cnics:
                is_existing = True

            status = 'INVALID' if errors else ('EXISTING' if is_existing else 'VALID')
            if status == 'VALID':
                total_valid += 1
            elif status == 'EXISTING':
                total_existing += 1
            else:
                total_invalid += 1

            preview_rows.append({
                'row_number': row_num,
                'legacy_code': legacy_code,
                'full_name': name,
                'father_name': r.get('father_husband_name') or r.get('father_name', ''),
                'cnic': cnic,
                'phone': r.get('phone') or r.get('mobile_number') or r.get('telephone_number', ''),
                'designation': r.get('designation', ''),
                'department': r.get('department', ''),
                'joining_date': joining_date.strftime('%Y-%m-%d') if joining_date else '',
                'status': status,
                'errors': errors
            })

        return {
            'total_rows': len(rows),
            'valid_rows': total_valid,
            'existing_rows': total_existing,
            'invalid_rows': total_invalid,
            'preview': preview_rows
        }

    @classmethod
    def execute(cls, company_id, file_content, update_existing=False, user=None):
        """
        Executes employee import safely with transactional atomic guarantees.
        """
        rows = cls.parse_rows(file_content)
        created_count = 0
        updated_count = 0
        skipped_count = 0
        error_records = []

        # Department / Designation cache
        departments = {d.name.lower(): d for d in Department.objects.filter(company_id=company_id, is_deleted=False)}
        designations = {d.name.lower(): d for d in Designation.objects.filter(company_id=company_id, is_deleted=False)}

        with transaction.atomic():
            for r in rows:
                row_num = r.get('_row_num')
                legacy_code = str(r.get('legacy_code') or r.get('previous_code') or r.get('employee_code') or '').strip()
                
                # Single Full Name everywhere
                name = (r.get('name') or r.get('full_name') or r.get('first_name') or '').strip()
                if r.get('last_name'):
                    last = r.get('last_name').strip()
                    if last and not name.endswith(last):
                        name = f"{name} {last}".strip()

                if not name:
                    error_records.append({'row': row_num, 'error': 'Employee Name is required'})
                    continue

                cnic = r.get('cnic_number') or r.get('cnic', '')
                dob = cls._parse_date(r.get('date_of_birth') or r.get('dob'))
                joining_date = cls._parse_date(r.get('joining_date') or r.get('enrollment_date') or r.get('hire_date')) or timezone.now().date()
                confirm_date = cls._parse_date(r.get('confirmation_date') or r.get('confirm_date'))
                cnic_issue = cls._parse_date(r.get('cnic_issue_date'))
                cnic_exp = cls._parse_date(r.get('cnic_expiry_date'))

                # Resolve department
                dept_name = str(r.get('department') or '').strip()[:250]
                dept = None
                if dept_name:
                    dept = departments.get(dept_name.lower())
                    if not dept:
                        dept = Department.objects.create(company_id=company_id, name=dept_name)
                        departments[dept_name.lower()] = dept

                # Resolve designation
                desig_name = str(r.get('designation') or '').strip()[:250]
                desig = None
                if desig_name:
                    desig = designations.get(desig_name.lower())
                    if not desig:
                        desig = Designation.objects.create(company_id=company_id, name=desig_name)
                        designations[desig_name.lower()] = desig

                # Check existing employee by previous_employee_code or employee_code or cnic or name+father
                existing = None
                if legacy_code:
                    clean_code = legacy_code.strip()
                    q = Q(previous_employee_code=clean_code) | Q(employee_code=clean_code)
                    if clean_code.isdigit():
                        q |= Q(previous_employee_code=clean_code.zfill(6))
                        q |= Q(employee_code=clean_code.zfill(6))
                        q |= Q(previous_employee_code=clean_code.lstrip('0'))
                        q |= Q(employee_code=clean_code.lstrip('0'))
                    existing = Employee.objects.filter(company_id=company_id, is_deleted=False).filter(q).first()

                if not existing and cnic:
                    existing = Employee.objects.filter(
                        company_id=company_id,
                        cnic_number=cnic,
                        is_deleted=False
                    ).first()

                if not existing and name:
                    father = (r.get('father_husband_name') or r.get('father_name') or '').strip()
                    if father:
                        existing = Employee.objects.filter(
                            company_id=company_id,
                            first_name__iexact=name,
                            father_name__iexact=father,
                            is_deleted=False
                        ).first()

                if existing:
                    if not update_existing:
                        skipped_count += 1
                        continue
                    # Update all fields from legacy data
                    emp = existing
                    if not emp.previous_employee_code and legacy_code:
                        emp.previous_employee_code = str(legacy_code)[:50]
                    if name:
                        emp.first_name = str(name)[:200]
                        emp.last_name = ''
                    if r.get('father_husband_name') or r.get('father_name'):
                        emp.father_name = str(r.get('father_husband_name') or r.get('father_name'))[:100]
                    if cnic:
                        emp.cnic_number = str(cnic)[:50]
                    if dob:
                        emp.date_of_birth = dob
                    if r.get('joining_date') or r.get('enrollment_date') or r.get('hire_date'):
                        emp.hire_date = joining_date
                    if confirm_date:
                        emp.confirmation_date = confirm_date
                    if cnic_issue:
                        emp.cnic_issue_date = cnic_issue
                    if cnic_exp:
                        emp.cnic_expiry_date = cnic_exp
                    if r.get('telephone_number'):
                        emp.telephone_number = str(r.get('telephone_number'))[:30]
                    mob = r.get('mobile_number') or r.get('phone')
                    if mob:
                        emp.phone = str(mob)[:30]
                    elif not emp.phone and r.get('telephone_number'):
                        emp.phone = str(r.get('telephone_number'))[:30]
                    if r.get('current_address'):
                        emp.current_address = r.get('current_address')
                    if r.get('permanent_address'):
                        emp.permanent_address = r.get('permanent_address')
                    if r.get('place_of_birth'):
                        emp.place_of_birth = str(r.get('place_of_birth'))[:100]
                    if r.get('caste'):
                        emp.caste = str(r.get('caste'))[:50]
                    if r.get('gender'):
                        g_in = str(r.get('gender')).upper()
                        emp.gender = 'FEMALE' if 'FEMALE' in g_in else ('OTHER' if 'OTHER' in g_in else 'MALE')
                    if r.get('marital_status'):
                        ms_in = str(r.get('marital_status')).upper()
                        if 'MARRIED' in ms_in:
                            emp.marital_status = 'MARRIED'
                        elif 'DIVORCED' in ms_in:
                            emp.marital_status = 'DIVORCED'
                        elif 'WIDOW' in ms_in:
                            emp.marital_status = 'WIDOWED'
                        else:
                            emp.marital_status = 'SINGLE'
                    if r.get('children_male') is not None and r.get('children_male') != '':
                        try:
                            emp.children_male = int(r.get('children_male'))
                        except Exception:
                            pass
                    if r.get('children_female') is not None and r.get('children_female') != '':
                        try:
                            emp.children_female = int(r.get('children_female'))
                        except Exception:
                            pass
                    if dept:
                        emp.department = dept
                    if desig:
                        emp.designation = desig
                    if r.get('workforce_type'):
                        wf_in = str(r.get('workforce_type')).upper()
                        emp.classification = 'INDIRECT' if 'INDIRECT' in wf_in else 'DIRECT'
                    if r.get('background_type'):
                        bg_in = str(r.get('background_type')).upper()
                        if 'ARMY' in bg_in or 'MILITARY' in bg_in:
                            emp.background_type = 'EX_ARMY'
                        elif 'POLICE' in bg_in:
                            emp.background_type = 'OTHER'
                        else:
                            emp.background_type = 'CIVILIAN'
                    if r.get('eobi_number'):
                        emp.eobi_number = str(r.get('eobi_number'))[:50]
                    if r.get('sessi_number'):
                        emp.sessi_number = str(r.get('sessi_number'))[:50]
                    if r.get('insurance_policy_number'):
                        emp.insurance_policy_number = str(r.get('insurance_policy_number'))[:50]
                    if r.get('ntn_number'):
                        emp.ntn_number = str(r.get('ntn_number'))[:50]
                    if 'is_guard_vaccine' in r:
                        emp.is_guard_vaccine = str(r.get('is_guard_vaccine', '')).lower() in ('1', 'true', 'yes')
                    if 'is_guard_apsa_verified' in r:
                        emp.is_guard_apsa_verified = str(r.get('is_guard_apsa_verified', '')).lower() in ('1', 'true', 'yes')
                    emp.save()
                    updated_count += 1
                else:
                    # Create new employee
                    gender_val = 'MALE'
                    g_in = str(r.get('gender') or '').upper()
                    if 'FEMALE' in g_in:
                        gender_val = 'FEMALE'
                    elif 'OTHER' in g_in:
                        gender_val = 'OTHER'

                    wf_val = 'DIRECT'
                    wf_in = str(r.get('workforce_type') or '').upper()
                    if 'INDIRECT' in wf_in:
                        wf_val = 'INDIRECT'

                    bg_val = 'CIVILIAN'
                    bg_in = str(r.get('background_type') or '').upper()
                    if 'ARMY' in bg_in or 'MILITARY' in bg_in:
                        bg_val = 'EX_ARMY'
                    elif 'POLICE' in bg_in:
                        bg_val = 'OTHER'
                    elif 'OTHER' in bg_in:
                        bg_val = 'OTHER'

                    try:
                        male_ch = int(r.get('children_male') or 0)
                    except Exception:
                        male_ch = 0
                    try:
                        fem_ch = int(r.get('children_female') or 0)
                    except Exception:
                        fem_ch = 0

                    is_vaccine = str(r.get('is_guard_vaccine', '')).lower() in ('1', 'true', 'yes')
                    is_apsa = str(r.get('is_guard_apsa_verified', '')).lower() in ('1', 'true', 'yes')

                    mob = str(r.get('mobile_number') or r.get('phone') or '')[:30]
                    tel = str(r.get('telephone_number') or '')[:30]
                    if not mob and tel:
                        mob = tel

                    emp = Employee(
                        company_id=company_id,
                        previous_employee_code=str(legacy_code)[:50],
                        first_name=str(name)[:200],
                        last_name='',
                        father_name=str(r.get('father_husband_name') or r.get('father_name', ''))[:100],
                        gender=gender_val,
                        date_of_birth=dob,
                        place_of_birth=str(r.get('place_of_birth', ''))[:100],
                        marital_status=(r.get('marital_status') or 'SINGLE').upper(),
                        children_male=male_ch,
                        children_female=fem_ch,
                        caste=str(r.get('caste', ''))[:50],
                        cnic_number=str(cnic)[:50],
                        cnic_issue_date=cnic_issue,
                        cnic_expiry_date=cnic_exp,
                        telephone_number=tel,
                        phone=mob,
                        current_address=r.get('current_address', ''),
                        permanent_address=r.get('permanent_address', ''),
                        hire_date=joining_date,
                        confirmation_date=confirm_date,
                        department=dept,
                        designation=desig,
                        classification=wf_val,
                        background_type=bg_val,
                        eobi_number=str(r.get('eobi_number', ''))[:50],
                        sessi_number=str(r.get('sessi_number', ''))[:50],
                        insurance_policy_number=str(r.get('insurance_policy_number', ''))[:50],
                        ntn_number=str(r.get('ntn_number', ''))[:50],
                        is_guard_vaccine=is_vaccine,
                        is_guard_apsa_verified=is_apsa,
                        visible_for_activity=True
                    )
                    emp.save()
                    created_count += 1

                # Payment destination sync (for both created and updated)
                pm = r.get('payment_method')
                bank = r.get('bank_name')
                acct = r.get('account_number')
                branch = r.get('branch_code') or r.get('branch_name')
                wallet_no = r.get('wallet_number')
                wallet_prov = r.get('wallet_provider')

                if bank and branch and f"({branch})" not in bank:
                    bank = f"{bank} ({branch})"
                elif not bank and branch:
                    bank = f"Branch {branch}"

                if pm or bank or acct or wallet_no or branch:
                    meth = pm or ('WALLET' if wallet_no else ('BANK_TRANSFER' if acct else 'CASH'))
                    EmployeePaymentDestination.objects.update_or_create(
                        company_id=company_id,
                        employee=emp,
                        is_preferred=True,
                        defaults={
                            'payment_method': meth,
                            'bank_name': bank or '',
                            'account_title': r.get('account_title') or emp.get_full_name(),
                            'account_number': acct or '',
                            'iban': r.get('iban', ''),
                            'wallet_provider': wallet_prov or '',
                            'wallet_number': wallet_no or '',
                            'is_active': True
                        }
                    )

        return {
            'total_processed': len(rows),
            'created': created_count,
            'updated': updated_count,
            'skipped': skipped_count,
            'errors': error_records
        }

