from rest_framework import serializers
from .models import SenderIdentity, EmailTemplate, OutboundEmail, OutboundEmailAttachment

class SenderIdentitySerializer(serializers.ModelSerializer):
    smtp_password = serializers.CharField(write_only=True, required=False, allow_blank=True, allow_null=True)
    has_smtp_password = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = SenderIdentity
        fields = [
            'id', 'name', 'email_address', 'reply_to', 'provider_type',
            'verification_status', 'is_active', 'is_default', 'is_usable',
            'smtp_host', 'smtp_port', 'smtp_username', 'smtp_password',
            'smtp_use_tls', 'has_smtp_password', 'created_at', 'updated_at'
        ]
        read_only_fields = ['company', 'created_at', 'updated_at', 'is_usable']

    def get_has_smtp_password(self, obj) -> bool:
        return bool(obj.smtp_password)

    def create(self, validated_data):
        password = validated_data.pop('smtp_password', None)
        instance = SenderIdentity(**validated_data)
        if password:
            instance.smtp_password = password
        instance.save()
        return instance

    def update(self, instance, validated_data):
        # If smtp_password is not provided or is blank/None, keep the existing password
        password = validated_data.pop('smtp_password', None)
        if password:
            instance.smtp_password = password
        return super().update(instance, validated_data)

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        # Ensure raw secret is never present in serialized representation
        ret.pop('smtp_password', None)
        return ret


class EmailTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmailTemplate
        fields = '__all__'
        read_only_fields = ['company', 'created_at', 'updated_at']


class OutboundEmailAttachmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = OutboundEmailAttachment
        fields = ['id', 'file', 'filename', 'content_type', 'crm_attachment']
        read_only_fields = ['id']


class OutboundEmailSerializer(serializers.ModelSerializer):
    attachments = OutboundEmailAttachmentSerializer(many=True, read_only=True)
    sender_name = serializers.CharField(source='sender_identity.name', read_only=True)
    sender_email = serializers.CharField(source='sender_identity.email_address', read_only=True)

    class Meta:
        model = OutboundEmail
        fields = [
            'id', 'sender_identity', 'sender_name', 'sender_email', 'to', 'cc', 'bcc',
            'subject', 'body_html', 'body_text', 'status', 'provider_message_id',
            'error_message', 'sent_at', 'context_type', 'context_id', 'context_version_id',
            'attachments', 'created_by', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'company', 'created_at', 'updated_at', 'status', 'error_message',
            'sent_at', 'provider_message_id', 'created_by'
        ]


class UserEmailSignatureSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.username', read_only=True)
    image_url = serializers.SerializerMethodField(read_only=True)

    class Meta:
        from .models import UserEmailSignature
        model = UserEmailSignature
        fields = [
            'id', 'user', 'user_name', 'name', 'signature_type',
            'text_content', 'image', 'image_url', 'is_default',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['company', 'user', 'user_name', 'image_url', 'created_at', 'updated_at']

    def get_image_url(self, obj) -> str | None:
        if obj.image:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.image.url)
            return obj.image.url
        return None

