"""Import every model so Base.metadata is complete (Alembic autogenerate, tests)."""
from app.models.audit import AuditLog
from app.models.call import AgentSession, CallSession, Transcript
from app.models.callback import Callback
from app.models.case import Case, Child, Parent
from app.models.case_event import CaseEvent
from app.models.consent import Consent, OptOut
from app.models.document import Document
from app.models.entity import EntityRequest, EntityStatus
from app.models.graph import LifeEventEdge, LifeEventNode
from app.models.integration import IntegrationEvent
from app.models.notification import Notification
from app.models.officer import Approval, Escalation, OfficerReview
from app.models.organization import Organization
from app.models.outbox import ConsumerReceipt, OutboxEvent
from app.models.user import AuthToken, RevokedToken, User
from app.models.verification import VerificationAttempt

__all__ = [
    "AgentSession", "Approval", "AuditLog", "AuthToken", "CallSession", "Callback", "Case", "CaseEvent", "Child", "Consent",
    "ConsumerReceipt", "Document", "EntityRequest", "EntityStatus", "Escalation", "IntegrationEvent", "LifeEventEdge",
    "LifeEventNode", "Notification", "OfficerReview", "OptOut", "Organization", "OutboxEvent", "Parent", "RevokedToken",
    "Transcript", "User", "VerificationAttempt",
]
