from django.core.exceptions import ValidationError

class InventoryException(Exception):
    """Base exception for inventory engine."""
    pass

class NegativeStockException(ValidationError):
    """Raised when an operation would result in negative stock."""
    pass

class WarehouseMismatchException(InventoryException):
    """Raised when an item and warehouse belong to different companies."""
    pass

class ItemMismatchException(InventoryException):
    """Raised when items do not match in a transaction."""
    pass

class SerialException(InventoryException):
    """Raised for serial number tracking issues."""
    pass

class InventoryValidationException(InventoryException):
    """Raised for general validation failures."""
    pass
