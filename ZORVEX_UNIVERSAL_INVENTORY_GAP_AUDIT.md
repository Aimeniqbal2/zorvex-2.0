# ZORVEX ERP 2.0 — UNIVERSAL INVENTORY GAP AUDIT REPORT

## 1. Current Architecture
The repository is currently in a state of **partial integration** regarding the Universal Inventory architecture. 
- **Backend**: The backend has successfully migrated to a Universal `Item` architecture (Phase 3). It features `Item`, `InventoryBalance`, and `ItemSerial` models. It exposes endpoints via `/api/inventory/items/`.
- **Frontend**: The React SPA has *not* migrated. It still explicitly queries the legacy `/api/inventory/products/` endpoints. 

## 2. Why the UI Shows Mobile-Specific Inventory
The React Inventory module was directly ported from the legacy mobile-shop logic without being updated to utilize the Universal `Item` backend. It explicitly maps to the legacy `Product` model.

## 3. Exact Files Causing the Mobile-Specific UI
- `frontend/src/modules/inventory/components/ProductModal.tsx`: Hardcodes inputs for `brand`, `model_name`, `color`, and `storage_capacity`.
- `frontend/src/modules/inventory/api.ts`: Explicitly calls `/api/inventory/products/`.
- `frontend/src/modules/inventory/types.ts`: Defines the `Product` interface with mobile-specific attributes.

## 4. Product vs. Item Dependency Map
- **React Inventory UI**: Depends entirely on `Product`.
- **React POS**: Depends entirely on `Product` (uses `/api/inventory/products/search_pos/` and sends `product_id` to checkout).
- **Backend Inventory**: Models (`StockMovement`, `PurchaseOrderItem`) use **both** `product` (legacy) and `item` (universal) foreign keys.
- **Backend Sales/Services**: `SaleItem` and `ServicePart` use **both** `product` and `item` foreign keys.
- **Backend Purchasing**: `ProcurementLine` uses `Item`.
- **Compatibility Layer**: `inventory/services/compatibility.py` contains logic (`resolve_item_from_product`) that forces legacy `Product` entries to silently mirror to `Item` entries.

## 5. Current Universal Inventory Coverage
The Universal Inventory is **Backend-Only**. The frontend components are completely disconnected from the new `Item` architecture. The system only works because the `compatibility.py` bridge syncs the legacy `Product` requests into `Item` balances behind the scenes.

## 6. Missing Frontend Pieces
- `ItemModal.tsx` (A clean, industry-neutral creation form).
- `ItemTable.tsx` (Listing universal items).
- Dynamic Custom Attributes engine to handle industry-specific data.
- API Client updates to target `/api/inventory/items/`.

## 7. Industry-Neutral UI Architecture
The final Universal Inventory form MUST NOT require `brand`, `model_name`, `color`, or `storage_capacity` natively. 

**Universal Core Fields:**
- Item Name
- Item Type (Product, Service, Spare Part, Asset, Consumable)
- Category
- SKU / Item Code / Barcode
- Description
- Unit of Measure (pcs, kg, liters, hours)
- Cost Price
- Selling Price
- Minimum Stock / Reorder Level
- Toggles: Track Inventory, Track Serial Number, Track Batch, Sellable, Purchasable.

### Industry Examples:
*   **SECURITY**: 
    *   *Core*: Two-Way Radio (SKU: RAD-001)
    *   *Custom*: Frequency Band, Range.
    *   *Tracking*: Serial tracking enabled (for assigning to guards).
*   **MEDICAL**:
    *   *Core*: Surgical Gloves (SKU: GLV-002), Unit: Box of 100.
    *   *Custom*: Material (Latex/Nitrile), Size (M/L).
    *   *Tracking*: Batch tracking and Expiry Date tracking enabled.
*   **MOBILE**:
    *   *Core*: iPhone 14 Pro Screen (SKU: SCR-IP14).
    *   *Custom*: Color, Storage, Condition.
    *   *Tracking*: Serial tracking enabled.
*   **CONSTRUCTION**:
    *   *Core*: Portland Cement (SKU: CEM-001), Unit: 50kg Bag.
    *   *Custom*: Grade, Curing Time.
    *   *Tracking*: Batch tracking.

## 8. Custom Attribute Architecture Recommendation
To support the custom fields mentioned above without hardcoding them into the database, an Entity-Attribute-Value (EAV) or JSON-based architecture is required.
- **Models Required**: `ItemFieldDefinition` (defines the schema: Name, Type [Text, Number, Date, Boolean, Select], Required, Options) and `ItemFieldValue` (stores the actual data linked to the `Item`).
- **Isolation**: `ItemFieldDefinition` must belong to a `Company` (Tenant) and optionally be linked to a specific `Category`.
- **Validation**: The backend will validate `ItemFieldValue` against the rules defined in `ItemFieldDefinition` during creation/update.

## 9. Industry Template Recommendation
The `Company.business_type` field (which exists and has choices like `hospital`, `security`, `mobile`) should be used to **bootstrap** templates. 
When a new tenant registers, their `business_type` can trigger a background task to auto-populate default `Category` and `ItemFieldDefinition` records. 
*Rule*: `business_type` provides defaults/suggestions, NOT restrictions. A security company can still manually create a "medical" category if they wish.

## 10. POS Migration Implications
Currently, the React POS module searches for items using `/api/inventory/products/search_pos/` and adds `product_id` to the cart. 
- **Implication**: If we replace `ProductModal` with `ItemModal`, the POS will break because the POS expects legacy `Product` objects. 
- **Migration Path**: The POS must be updated to query `/api/inventory/items/` and submit `item_id` in the `POST /api/sales/sales/checkout/` payload. The backend `SaleItem` already supports the `item` foreign key.

## 11. Compatibility Strategy
**The Safest Path:**
1. Keep the Legacy `Product`, `/api/inventory/products/`, and `compatibility.py` bridge **completely frozen and active**.
2. Build the Universal React UI targeting `/api/inventory/items/`.
3. Update the React POS search to target `/api/inventory/items/`.
4. Only once the entire React app (Inventory + POS) is functioning 100% on `Item`, we can safely drop the `Product` model and bridge.

## 12. Required Implementation Phases
To resolve this gap safely, the following sequence is recommended:
- **Phase 8I-1**: Inventory React Migration (Build `ItemModal.tsx`, `ItemTable.tsx`, and connect to `/api/inventory/items/`).
- **Phase 8I-2**: Custom Attribute Engine (Backend EAV models + Frontend dynamic form rendering).
- **Phase 8I-3**: POS API Migration (Swap POS search and checkout payload from `product` to `item`).

## 13. Risks
- **Data Fragmentation**: If the compatibility bridge fails during the transition, stock balances could become desynced between legacy `Product` and universal `Item`.
- **POS Outage**: Prematurely deleting `Product` will break the POS entirely.

## 14. Files That Must Remain Frozen
- `inventory/models.py` (`Product` class)
- `inventory/services/compatibility.py`
- `sales/views.py` (Atomic checkout logic handling `product_id` fallback)
- `frontend/src/modules/pos/` (Until Phase 8I-3)

## 15. Recommended Next Phase
**PIVOT:** Pause the CRM migration. 
**Next Phase Recommendation:** Authorize **Phase 8I-1 (Universal Inventory React Migration)** to build the industry-neutral UI targeting the `Item` APIs, ensuring the foundation is solid before continuing horizontal expansion.
