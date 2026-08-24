# ZORVEX ERP 2.0 — PHASE S-3 COMPLETION REPORT
# SECURITY SITES, CONTRACTS & COMMERCIAL CONFIGURATION

**Date:** 2026-08-19  
**Phase:** S-3  
**Status:** ✅ COMPLETE

---

## DELIVERABLES COMPLETED

### 1. Backend Hardening

| Area | Change |
|------|--------|
| `OperationalSiteSerializer` | Fixed `customer_name` source to `crm_entity.name` |
| `ServiceContractSerializer` | Fixed `customer_name` source to `crm_entity.name` |
| `BaseSecurityOpsViewSet` | New base class with `RolePermission` + `ModulePermission` + tenant scoping |
| `OperationalSiteViewSet` | Upgraded: SearchFilter, OrderingFilter, `?is_active=` and `?customer=` query params |
| `ServiceContractViewSet` | Upgraded: SearchFilter, OrderingFilter, `?status=` and `?customer=` query params |
| `ContractRateViewSet` | Now enforces RBAC via BaseSecurityOpsViewSet |
| `DeploymentViewSet` | Now enforces RBAC via BaseSecurityOpsViewSet |
| `DutyAssignmentViewSet` | Now enforces RBAC via BaseSecurityOpsViewSet |
| `ExtraDutyViewSet` | Now enforces RBAC via BaseSecurityOpsViewSet |
| `SecurityOperationsDashboardView` | Now enforces RBAC via RolePermission + ModulePermission |

### 2. Frontend CRUD — Sites

| File | Description |
|------|-------------|
| `SiteModal.tsx` | Full create/edit form: CRM customer selector, name, address, lat/lng, active toggle |
| `SitesView.tsx` | Added **New Site** button + **Edit** action per row + SiteModal integration |

### 3. Frontend CRUD — Contracts

| File | Description |
|------|-------------|
| `ContractModal.tsx` | Full create/edit form: CRM customer selector, contract code, status, dates, notes, multi-site checkbox |
| `ContractsView.tsx` | Added **New Contract** button + **Edit** action per row + ContractModal integration |
| `ContractRateModal.tsx` | Per-contract billing/pay rate management by designation + effective date |

### 4. TypeScript Types Updated

| Type | Change |
|------|--------|
| `OperationalSite` | `crm_entity` (was `customer`), `address` (was `location`), added `latitude`/`longitude` |
| `ServiceContract` | `crm_entity` (was `customer`), `contract_code` (was `contract_number`), `notes`, removed `billing_frequency` |
| `ContractRate` | **New type** — `service_contract`, `designation`, `billing_rate`, `pay_rate`, `effective_date` |

### 5. Test Suite — S2/S3

**File:** `operations/tests/test_s2_s3.py`  
**Result:** ✅ 4/4 tests pass

| Test | Result |
|------|--------|
| `test_dashboard_tenant_isolation` | ✅ PASS — Company A KPIs don't bleed into Company B |
| `test_site_crud_and_validation` | ✅ PASS — Create, cross-tenant rejection, read, edit all work |
| `test_contract_crud_and_validation` | ✅ PASS — Create, invalid date range rejected |
| `test_contract_rate` | ✅ PASS — Rate creation with designation + effective date |

---

## ARCHITECTURE DECISIONS

- **CRM integration:** Sites and Contracts link via `crm_entity` (CRMEntity with CUSTOMER role). Same CRM entity can appear across multiple contracts and sites.
- **RBAC:** All ViewSets now require `manager` or `admin` role. Read access also granted to `staff`. Module guard (`security_ops`) enforced.
- **Tenant isolation:** All ViewSets use `TenantModelViewSet.get_queryset()` which filters by `company_id`. Cross-tenant FKs rejected at `clean()` level.
- **Search:** Sites searchable by `name`, `address`, `crm_entity__name`. Contracts by `contract_code`, `crm_entity__name`.

---

## CONSTRAINTS OBSERVED

- Guard Deployment rostering → **Phase S-4** (not touched)
- Equipment Issue → **Phase S-4**
- Attendance UI → Not part of this phase
- Payroll → Not part of this phase

---

## NEXT PHASE: S-4

Phase S-4 will implement:
1. Guard Deployment create/edit/deactivate (write-enabled Deployment CRUD)
2. Duty Assignment scheduling (calendar view)
3. Staffing shortage indicators per site
4. Guard attendance dashboard integration
