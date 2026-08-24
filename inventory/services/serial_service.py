from django.db import transaction
from inventory.models import ItemSerial
from .exceptions import SerialException, WarehouseMismatchException

@transaction.atomic
def receive_serial(item, warehouse, serial_number):
    """Receive a new serial number into stock."""
    if not item.track_serial_number:
        return None
    if item.company_id != warehouse.company_id:
        raise WarehouseMismatchException("Company mismatch for serial reception.")

    if ItemSerial.objects.filter(company=item.company, serial_number=serial_number).exists():
        raise SerialException(f"Serial number {serial_number} already exists in this company.")

    serial = ItemSerial.objects.create(
        company=item.company,
        item=item,
        warehouse=warehouse,
        serial_number=serial_number,
        status='IN_STOCK'
    )
    return serial

@transaction.atomic
def move_serial(serial, destination_warehouse):
    """Move an existing serial to a different warehouse."""
    if serial.company_id != destination_warehouse.company_id:
        raise WarehouseMismatchException("Cannot move serial to a warehouse in a different company.")
    if serial.status != 'IN_STOCK':
        raise SerialException(f"Serial {serial.serial_number} is {serial.status}, cannot be moved.")

    serial.warehouse = destination_warehouse
    serial.save(update_fields=['warehouse', 'updated_at'])
    return serial

@transaction.atomic
def sell_serial(serial):
    """Mark a serial as sold."""
    if serial.status != 'IN_STOCK':
        raise SerialException(f"Serial {serial.serial_number} is {serial.status} and cannot be sold.")
    
    serial.status = 'SOLD'
    serial.save(update_fields=['status', 'updated_at'])
    return serial

@transaction.atomic
def return_serial(serial, warehouse):
    """Return a sold serial back to a warehouse."""
    if serial.status != 'SOLD':
        raise SerialException(f"Serial {serial.serial_number} is not sold, cannot be returned.")
    if serial.company_id != warehouse.company_id:
        raise WarehouseMismatchException("Company mismatch for serial return.")

    serial.warehouse = warehouse
    serial.status = 'IN_STOCK'
    serial.save(update_fields=['warehouse', 'status', 'updated_at'])
    return serial

@transaction.atomic
def mark_defective(serial):
    """Mark a serial as defective."""
    serial.status = 'DEFECTIVE'
    serial.save(update_fields=['status', 'updated_at'])
    return serial

@transaction.atomic
def issue_serial(serial):
    """Mark a serial as issued to an employee."""
    if serial.status != 'IN_STOCK':
        raise SerialException(f"Serial {serial.serial_number} is {serial.status} and cannot be issued.")
    
    serial.status = 'ISSUED'
    serial.save(update_fields=['status', 'updated_at'])
    return serial

@transaction.atomic
def unissue_serial(serial, warehouse):
    """Return an issued serial back to a warehouse."""
    if serial.status != 'ISSUED':
        raise SerialException(f"Serial {serial.serial_number} is not issued, cannot be returned.")
    if serial.company_id != warehouse.company_id:
        raise WarehouseMismatchException("Company mismatch for serial return.")

    serial.warehouse = warehouse
    serial.status = 'IN_STOCK'
    serial.save(update_fields=['warehouse', 'status', 'updated_at'])
    return serial
