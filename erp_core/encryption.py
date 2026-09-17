"""
erp_core/encryption.py
----------------------
Fernet-based encrypted Django model field.

Design decisions:
- Uses cryptography.fernet.Fernet (AES-128-CBC + HMAC-SHA256, authenticated).
- Encryption key comes exclusively from settings.FIELD_ENCRYPTION_KEY which
  must be loaded from an environment variable — never from the database or
  application code.
- Key is NOT stored beside encrypted data.
- `from_db_value` transparently decrypts on read.
- `get_prep_value` transparently encrypts on write.
- Serializers must use `write_only=True` for any field backed by this type.
- Logging/exceptions in this module never include plaintext or ciphertext values.
"""
import logging
from django.conf import settings
from django.db import models

logger = logging.getLogger(__name__)


def _get_fernet():
    """Return a Fernet instance using FIELD_ENCRYPTION_KEY from settings."""
    from cryptography.fernet import Fernet
    key = getattr(settings, 'FIELD_ENCRYPTION_KEY', None)
    if not key:
        raise RuntimeError(
            "FIELD_ENCRYPTION_KEY is not configured. "
            "Generate one with: python -c \"from cryptography.fernet import Fernet; "
            "print(Fernet.generate_key().decode())\" "
            "and set it as an environment variable FIELD_ENCRYPTION_KEY."
        )
    raw = key.encode('utf-8') if isinstance(key, str) else key
    return Fernet(raw)


def encrypt_value(plaintext: str) -> str:
    """Encrypt a plaintext string and return a base64url Fernet token."""
    if not plaintext:
        return plaintext
    f = _get_fernet()
    # Errors here are configuration failures — let them propagate without logging the value.
    return f.encrypt(plaintext.encode('utf-8')).decode('utf-8')


def decrypt_value(ciphertext: str) -> str:
    """Decrypt a Fernet token and return plaintext."""
    if not ciphertext:
        return ciphertext
    f = _get_fernet()
    return f.decrypt(ciphertext.encode('utf-8')).decode('utf-8')


class EncryptedCharField(models.CharField):
    """
    A CharField whose database value is a Fernet-encrypted ciphertext.

    Transparent usage:
        - Assigning `obj.field = 'plaintext'` stores the ciphertext in DB.
        - Reading `obj.field` returns the plaintext.
        - `max_length` must account for Fernet overhead (~88 bytes per token).
          Use max_length=512 for typical credential values ≤424 plaintext bytes.

    Protection guarantees:
        - Never logs plaintext or ciphertext.
        - Returns None on decryption failure (key rotation / corrupted value)
          instead of raising an exception that might propagate the value.
        - Serializers must still mark this field write_only=True; the field
          does NOT prevent API serialization on its own.
    """

    def from_db_value(self, value, expression, connection):
        if not value:
            return value
        try:
            return decrypt_value(value)
        except Exception:
            # Key mismatch or data corruption — return None, never log the token.
            logger.warning("EncryptedCharField: decryption failed for a field value (key mismatch or corruption).")
            return None

    def to_python(self, value):
        return value

    def get_prep_value(self, value):
        """Encrypt before writing to the database."""
        if not value:
            return value
        return encrypt_value(str(value))
