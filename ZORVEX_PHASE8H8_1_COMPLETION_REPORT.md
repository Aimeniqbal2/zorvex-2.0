# ZORVEX ERP 2.0 — PHASE 8H-8-1
# CRM API VERIFICATION & TYPES — COMPLETION/AUDIT REPORT

## 1. Repository Files Inspected
- `crm/models.py`, `crm/serializers.py`, `crm/views.py`, `crm/urls.py`
- `crm/services/compatibility.py`
- `templates/vendors.html`, `static/vendors.js`
- Multiple app dependencies (`sales/`, `inventory/`, `finance/`, `services/`, `purchasing/`, `hrm/`)

## 2. CRM Architecture
The `crm` app acts as a "Universal CRM" which replaces legacy segmented `Customer` and `Vendor` models. 
- **Models**: The central model is `CRMEntity`, which can be of type `PERSON`, `COMPANY`, `SUPPLIER`, `CUSTOMER`, `LEAD`, `PARTNER`, `EMPLOYEE`, `CONTRACTOR`, or `OTHER`. 
- **Relationships**: A `CRMEntity` can have multiple `CRMContact`, `CRMAddress`, `CRMCommunication`, `CRMAttachment`, `CRMNote`, and `CRMTag` records.
- **Compatibility**: There is a `compatibility.py` service bridging Legacy models (e.g. `inventory.Vendor`, `sales.Customer`) with the Universal `CRMEntity` model.

## 3. Legacy CRM Capabilities
Based on the `templates/vendors.html` and `static/vendors.js`, the current frontend has the following capabilities for vendors:
- List Vendors, showing Purchased, Paid, and Balance Due.
- View Vendor Ledger (Transaction History of `DEBIT`/`CREDIT`).
- Create/Edit/Delete Vendor (Name, Email, Phone, Address).
- Process Payments (`pay_vendor` endpoint).
- Generate New Purchase Orders for a specific vendor.
*Note: The legacy frontend heavily depends on `/api/inventory/vendors/` and `/api/inventory/vendorledger/`, not the Universal `/api/crm/` API.*

## 4. Backend API Matrix

| Endpoint | Method | Purpose | Search | Ordering | Pagination | RBAC |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/api/crm/entities/` | GET/POST/PATCH/DEL | Manage CRM Entities | name, code, tax... | name, created | Yes | `admin`, `manager` |
| `/api/crm/contacts/` | GET/POST/PATCH/DEL | Manage Contacts | name, email, phone | name, created | Yes | `admin`, `manager` |
| `/api/crm/addresses/` | GET/POST/PATCH/DEL | Manage Addresses | city, country, line1 | - | Yes | `admin`, `manager` |
| `/api/crm/communications/`| GET/POST/PATCH/DEL | Manage Comms (Emails, Calls) | subject, desc | - | Yes | `admin`, `manager` |
| `/api/crm/tags/` | GET/POST/PATCH/DEL | Manage Tags | name | - | Yes | `admin`, `manager` |
| `/api/crm/notes/` | GET/POST/PATCH/DEL | Internal Notes | - | - | Yes | `admin`, `manager` |
| `/api/crm/attachments/` | GET/POST/PATCH/DEL | File Uploads | - | - | Yes | `admin`, `manager` |

## 5. Model/Serializer Relationships
- `CRMEntitySerializer` is a "fat" serializer. When fetching an entity, it auto-embeds `tags`, `contacts`, and `addresses` as nested lists because they are explicitly added to the fields as `many=True, read_only=True` nested serializers.
- For write operations, `contacts` and `addresses` must be managed via their respective endpoints. Tags can be linked using `tags_ids`.

## 6. Tenant/RBAC Verification
- **Tenant Isolation**: Handled flawlessly by inheriting `TenantModelViewSet`. In `perform_create`, `company_id=self.request.user.company_id` is enforced.
- **RBAC**: Protected by `IsAuthenticated`, `RolePermission`, and `ModulePermission`. Only `admin` and `manager` roles are allowed full write access. Reads are expanded to `sales`, `hr`, `finance`, and `staff`.

## 7. Search/Filter/Pagination Capabilities
- **Pagination**: Inherits global `PageNumberPagination` config.
- **Server-Side Search**: Fully supported via DRF `filters.SearchFilter`. `CRMEntityViewSet` supports search on `['name', 'display_name', 'code', 'tax_number', 'registration_number']`.
- **Filtering**: Currently lacks `DjangoFilterBackend` for explicit strict filtering (e.g. `?entity_type=CUSTOMER`), although search might catch some of it. We may need to ensure strict query param filtering exists or add it.

## 8. Cross-Module Dependency Map
The `CRMEntity` model has infiltrated almost every other app as an explicit foreign key.
- **Sales**: `Sale` model uses `crm_entity`.
- **Inventory**: `InventoryBalance` and `PurchaseOrder` use `crm_entity`.
- **Services**: `ServiceOrder` uses `crm_entity`.
- **Finance**: `JournalEntry` and `JournalEntryLine` use `crm_entity`.
- **Purchasing**: `ProcurementDocument` uses `crm_entity`.
- **HRM**: `EmployeeRecord` uses `crm_entity`.

*Conclusion: The Universal CRM is the architectural linchpin. Legacy Customer/Vendor models are deprecated shadows.*

## 9. Proposed TypeScript Type Definitions

```typescript
export type CRMEntityType = 'PERSON' | 'COMPANY' | 'GOVERNMENT' | 'NGO' | 'SUPPLIER' | 'CUSTOMER' | 'LEAD' | 'PARTNER' | 'EMPLOYEE' | 'CONTRACTOR' | 'OTHER';

export interface CRMTag {
    id: number;
    name: string;
    color?: string | null;
    created_at: string;
}

export interface CRMContact {
    id: number;
    entity: number; // CRMEntity ID
    first_name: string;
    last_name?: string;
    job_title?: string;
    department?: string;
    email?: string;
    phone?: string;
    mobile?: string;
    whatsapp?: string;
    is_primary: boolean;
    receives_invoices: boolean;
    receives_quotes: boolean;
    receives_notifications: boolean;
    created_at: string;
    updated_at: string;
}

export interface CRMAddress {
    id: number;
    entity: number; // CRMEntity ID
    address_type: 'Billing' | 'Shipping' | 'Office' | 'Warehouse' | 'Home' | 'Other';
    line1: string;
    line2?: string;
    city: string;
    state?: string;
    country: string;
    postal_code?: string;
    latitude?: number | null;
    longitude?: number | null;
    is_default: boolean;
    created_at: string;
    updated_at: string;
}

export interface CRMEntity {
    id: number;
    entity_type: CRMEntityType;
    name: string;
    display_name?: string;
    code: string;
    status: string;
    active: boolean;
    notes?: string;
    website?: string;
    tax_number?: string;
    registration_number?: string;
    credit_limit: number;
    payment_terms?: string;
    preferred_currency: string;
    preferred_language: string;
    created_by?: number | null;
    owner?: number | null;
    tags: CRMTag[];
    contacts: CRMContact[];
    addresses: CRMAddress[];
    created_at: string;
    updated_at: string;
}
```

## 10. Legacy Parity Matrix

| Legacy Feature | Backend Support | React Requirement | Risk | Priority |
| :--- | :--- | :--- | :--- | :--- |
| Vendor List | Yes (`/api/crm/entities/?search=...`) | Must implement DataTable | Low | High |
| Pay Vendor | Handled via Finance/VendorLedger | Finance crossover needed | High | High |
| Vendor Ledger | Handled via Finance/VendorLedger | Finance crossover needed | Med | High |
| Create PO | Yes (Inventory API) | Link CRM entity to PO | Med | High |

## 11. Risks and Blockers
- **Strict Filtering**: `CRMEntityViewSet` has `SearchFilter` but no `DjangoFilterBackend`. If we want to request *only* Customers (`/api/crm/entities/?entity_type=CUSTOMER`), DRF default behavior won't filter this unless `filterset_fields` is defined. This is a minor backend hardening requirement.
- **Ledger/Payment Integration**: The legacy frontend handles "Pay Vendor" by calling `/api/inventory/vendorledger/pay_vendor/`. The CRM migration in React will either need to continue calling this inventory endpoint temporarily, or we need to bridge it properly to Finance.

## 12. Required Backend Hardening
Add `DjangoFilterBackend` to `CRMEntityViewSet` to allow explicit filtering by `entity_type` (e.g. `?entity_type=CUSTOMER`). This is trivial but necessary.

## 13. Recommended React Migration Sequence
1. **Phase 8H-8-2**: Implement CRM Zustand Store, API Client wrapper, and TypeScript types.
2. **Phase 8H-8-3**: Implement CRM Datatable UI (Master list view for Entities, handling server-side pagination & search).
3. **Phase 8H-8-4**: Implement Entity Detail View (Tabs for Contacts, Addresses, Communications).
4. **Phase 8H-8-5**: Create/Edit Modals and hook into the Workspace Manager.

## 14. Exact Files That Should Be Created in Phase 8H-8-2
- `frontend/src/modules/crm/types/crm.ts`
- `frontend/src/modules/crm/api/crmClient.ts`
- `frontend/src/modules/crm/store/crmStore.ts`

## 15. Exact Files That Should NOT Be Touched
- `authStore.ts`, `tokenManager.ts`, `Login.tsx`
- Any `inventory` or `sales` backend API code (except minor bridging if strictly required).
- POS module and Zustand stores.
- `WorkspaceManager.tsx` (until UI integration).
- `TenantModelViewSet`.

## 16. Final Verdict
The CRM backend is highly sophisticated and perfectly positioned for a React migration. It utilizes a Universal Entity structure that cleanly resolves legacy fragmentation. The only minor gap is ensuring explicit API filtering by `entity_type` is active in `views.py`. 

**The architecture is verified and ready for Phase 8H-8-2 (State & Types).**
