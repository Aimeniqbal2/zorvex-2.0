import logging
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework import exceptions

logger = logging.getLogger(__name__)

class SecurityJWTAuthentication(JWTAuthentication):
    """
    Enhanced JWT Authentication enforcing instantaneous multi-device logout
    whenever a user's password is changed in Django Admin or elsewhere.

    Validates that the token's embedded password hash (pwd_hash) matches the user's
    current session auth hash in the database. If the password was changed, all
    existing tokens across all active devices/browsers are immediately rejected (401).
    """

    def get_user(self, validated_token):
        user = super().get_user(validated_token)

        # Extract embedded password hash claim from token
        token_pwd_hash = validated_token.get('pwd_hash')
        current_pwd_hash = user.get_session_auth_hash()[:16]

        # If token does not contain pwd_hash or hash does not match current password:
        if not token_pwd_hash or token_pwd_hash != current_pwd_hash:
            logger.info(
                f"Security: Token rejected for user '{user.username}' (ID: {user.pk}) - "
                f"Password was changed. Old token hash: {token_pwd_hash}, Current hash: {current_pwd_hash}."
            )
            raise exceptions.AuthenticationFailed(
                "Your password has been changed. For security, you have been logged out of all active devices. "
                "Please sign in with your new password.",
                code="password_changed"
            )

        return user
