from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    CategoryViewSet, ProductViewSet, StockMovementViewSet, VendorViewSet, 
    VendorLedgerViewSet, PurchaseOrderViewSet, PurchaseOrderItemViewSet,
    ItemViewSet, InventoryBalanceViewSet, ItemSerialViewSet, ItemFieldDefinitionViewSet
)

router = DefaultRouter()
router.register(r'categorys', CategoryViewSet)
router.register(r'products', ProductViewSet)
router.register(r'stockmovements', StockMovementViewSet)
router.register(r'vendors', VendorViewSet)
router.register(r'vendorledger', VendorLedgerViewSet)
router.register(r'purchaseorders', PurchaseOrderViewSet)
router.register(r'purchaseitems', PurchaseOrderItemViewSet)
router.register(r'items', ItemViewSet)
router.register(r'inventory-balances', InventoryBalanceViewSet)
router.register(r'item-serials', ItemSerialViewSet)
router.register(r'item-field-definitions', ItemFieldDefinitionViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
