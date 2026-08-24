from django.core.exceptions import ValidationError
from django.utils import timezone
from purchasing.models import ApprovalWorkflow, ApprovalStep, ApprovalHistory, ProcurementDocument

class ApprovalService:
    @staticmethod
    def get_applicable_workflow(document: ProcurementDocument):
        """
        Finds the correct workflow based on company, document type, and amount.
        """
        workflows = ApprovalWorkflow.objects.filter(
            company_id=document.company_id,
            module='purchasing',
            document_type=document.document_type,
            active=True
        )
        
        # Filter by amount if applicable
        for wf in workflows:
            if wf.min_amount <= document.total_amount:
                if wf.max_amount is None or wf.max_amount >= document.total_amount:
                    return wf
        return None

    @staticmethod
    def get_current_approval_step(document: ProcurementDocument):
        """
        Determines the current pending approval step for a document.
        Returns (workflow, step, history_records).
        """
        histories = ApprovalHistory.objects.filter(
            company_id=document.company_id,
            document_model='purchasing.ProcurementDocument',
            document_id=document.id
        ).order_by('created_at')

        if not histories.exists():
            return None, None, []

        last_submit = histories.filter(action='SUBMITTED').last()
        if not last_submit:
            return None, None, list(histories)

        actions_since_submit = histories.filter(created_at__gte=last_submit.created_at)
        
        workflow = last_submit.workflow
        if not workflow:
            return None, None, list(histories)

        steps = list(workflow.steps.all().order_by('step_number'))
        if not steps:
            return workflow, None, list(histories)

        approved_steps = actions_since_submit.filter(action='APPROVED').values_list('step_id', flat=True)
        
        for step in steps:
            if step.id not in approved_steps:
                return workflow, step, list(histories)
                
        return workflow, None, list(histories)

    @staticmethod
    def can_user_approve_step(user, step: ApprovalStep):
        """
        Checks if the user is authorized to approve the given step.
        """
        if not step:
            if getattr(user, 'role', None) == 'admin':
                return True
            return False

        if step.approver_user_id and step.approver_user_id == user.id:
            return True
            
        if step.approver_role:
            user_role = getattr(user, 'role', '')
            if user_role == step.approver_role:
                return True
                
        if getattr(user, 'role', None) == 'admin':
            return True
            
        return False

    @staticmethod
    def submit_document(document: ProcurementDocument, user, comments=""):
        if document.status not in ('DRAFT', 'REJECTED'):
            raise ValidationError("Only draft or rejected documents can be submitted.")

        workflow = ApprovalService.get_applicable_workflow(document)
        
        document.status = 'PENDING_APPROVAL'
        document.save(update_fields=['status'])

        ApprovalHistory.objects.create(
            company_id=document.company_id,
            workflow=workflow,
            step=None,
            document_id=document.id,
            document_model='purchasing.ProcurementDocument',
            action='SUBMITTED',
            action_by=user,
            comments=comments or "Document submitted for approval."
        )
        return document

    @staticmethod
    def approve_document(document: ProcurementDocument, user, comments=""):
        if document.status != 'PENDING_APPROVAL':
            raise ValidationError("Document is not awaiting approval.")

        workflow, current_step, _ = ApprovalService.get_current_approval_step(document)
        
        if workflow:
            if current_step:
                if not ApprovalService.can_user_approve_step(user, current_step):
                    raise ValidationError("You are not authorized to approve this step.")
            else:
                pass
        else:
            if getattr(user, 'role', None) != 'admin':
                raise ValidationError("No approval workflow configured. Only company admins can directly approve.")

        ApprovalHistory.objects.create(
            company_id=document.company_id,
            workflow=workflow,
            step=current_step,
            document_id=document.id,
            document_model='purchasing.ProcurementDocument',
            action='APPROVED',
            action_by=user,
            comments=comments or "Approved."
        )

        if workflow:
            steps = list(workflow.steps.all().order_by('step_number'))
            approved_steps = ApprovalHistory.objects.filter(
                company_id=document.company_id,
                document_model='purchasing.ProcurementDocument',
                document_id=document.id,
                action='APPROVED'
            ).values_list('step_id', flat=True)
            
            all_approved = all(s.id in approved_steps for s in steps)
            if all_approved:
                document.status = 'APPROVED'
                document.save(update_fields=['status'])
        else:
            document.status = 'APPROVED'
            document.save(update_fields=['status'])

        return document

    @staticmethod
    def reject_document(document: ProcurementDocument, user, comments=""):
        if document.status != 'PENDING_APPROVAL':
            raise ValidationError("Document is not awaiting approval.")
            
        if not comments:
            raise ValidationError("Rejection requires a comment/reason.")

        workflow, current_step, _ = ApprovalService.get_current_approval_step(document)

        if workflow and current_step:
            if not ApprovalService.can_user_approve_step(user, current_step):
                raise ValidationError("You are not authorized to reject at this step.")
        elif not workflow:
            if getattr(user, 'role', None) != 'admin':
                raise ValidationError("No approval workflow configured. Only company admins can directly reject.")

        document.status = 'REJECTED'
        document.save(update_fields=['status'])

        ApprovalHistory.objects.create(
            company_id=document.company_id,
            workflow=workflow,
            step=current_step,
            document_id=document.id,
            document_model='purchasing.ProcurementDocument',
            action='REJECTED',
            action_by=user,
            comments=comments
        )
        return document

    @staticmethod
    def get_pending_approvals_for_user(user):
        """
        Returns a queryset of ProcurementDocuments currently awaiting the user's approval.
        """
        pending_docs = ProcurementDocument.objects.filter(
            company_id=user.company_id,
            status='PENDING_APPROVAL'
        )
        
        valid_doc_ids = []
        user_role = getattr(user, 'role', None)
        
        for doc in pending_docs:
            workflow, current_step, _ = ApprovalService.get_current_approval_step(doc)
            if current_step:
                if ApprovalService.can_user_approve_step(user, current_step):
                    valid_doc_ids.append(doc.id)
            elif not workflow:
                if user_role == 'admin':
                    valid_doc_ids.append(doc.id)
                    
        return ProcurementDocument.objects.filter(id__in=valid_doc_ids).order_by('-updated_at')
