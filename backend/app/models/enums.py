"""Shared enumerations. Values are stored as strings with CHECK constraints (portable and easy to migrate)."""
from enum import StrEnum


class UserRole(StrEnum):
    RESIDENT = "RESIDENT"
    OFFICER = "OFFICER"
    ADMIN = "ADMIN"


class OrganizationKind(StrEnum):
    PLATFORM = "PLATFORM"
    SERVICE_CENTRE = "SERVICE_CENTRE"


class AuthTokenPurpose(StrEnum):
    EMAIL_VERIFICATION = "EMAIL_VERIFICATION"
    PASSWORD_RESET = "PASSWORD_RESET"
    INVITATION = "INVITATION"


class CaseStatus(StrEnum):
    INTAKE = "INTAKE"
    ACTIVE = "ACTIVE"
    WAITING_FOR_PARENT = "WAITING_FOR_PARENT"
    WAITING_FOR_HUMAN = "WAITING_FOR_HUMAN"
    ESCALATED = "ESCALATED"
    COMPLETED = "COMPLETED"
    CLOSED = "CLOSED"


class ChannelMode(StrEnum):
    VOICE = "VOICE"
    SMS_ONLY = "SMS_ONLY"


class RiskLevel(StrEnum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class ParentRole(StrEnum):
    FATHER = "FATHER"
    MOTHER = "MOTHER"
    GUARDIAN = "GUARDIAN"


class Entity(StrEnum):
    DHA = "DHA"
    MOHAP = "MOHAP"
    DOH = "DOH"
    MOFA = "MOFA"
    CONSULATE = "CONSULATE"
    GDRFA = "GDRFA"
    ICP = "ICP"
    INSURER = "INSURER"


class NodeType(StrEnum):
    ENTITY_FILING = "ENTITY_FILING"
    PARENT_REPORTED = "PARENT_REPORTED"


class NodeState(StrEnum):
    PENDING = "PENDING"
    READY = "READY"
    SUBMITTING = "SUBMITTING"
    SUBMITTED = "SUBMITTED"
    PROCESSING = "PROCESSING"
    CLEARED = "CLEARED"
    BLOCKED = "BLOCKED"
    DOCUMENT_MISSING = "DOCUMENT_MISSING"
    STALLED = "STALLED"
    WAITING_FOR_PARENT = "WAITING_FOR_PARENT"
    WAITING_FOR_HUMAN = "WAITING_FOR_HUMAN"
    REJECTED = "REJECTED"
    COMPLETED = "COMPLETED"


DONE_STATES = frozenset({NodeState.CLEARED, NodeState.COMPLETED})
ATTENTION_STATES = frozenset({NodeState.BLOCKED, NodeState.DOCUMENT_MISSING, NodeState.STALLED, NodeState.REJECTED})
WITH_ENTITY_STATES = frozenset({NodeState.SUBMITTING, NodeState.SUBMITTED, NodeState.PROCESSING})


class Source(StrEnum):
    """Who an event or a piece of information comes from. The UI renders these distinctly."""

    AI_AGENT = "AI_AGENT"
    GOVERNMENT_MOCK = "GOVERNMENT_MOCK"
    PARENT_REPORTED = "PARENT_REPORTED"
    HUMAN_OFFICER = "HUMAN_OFFICER"
    RESIDENT = "RESIDENT"
    SYSTEM = "SYSTEM"


class ActorType(StrEnum):
    SYSTEM = "SYSTEM"
    AI_AGENT = "AI_AGENT"
    RESIDENT = "RESIDENT"
    OFFICER = "OFFICER"
    ADMIN = "ADMIN"
    GOVERNMENT_ENTITY = "GOVERNMENT_ENTITY"
    PROVIDER = "PROVIDER"


class ApprovalState(StrEnum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"


class OfficerDecision(StrEnum):
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    DOCUMENTS_REQUESTED = "DOCUMENTS_REQUESTED"
    ESCALATED = "ESCALATED"
    TRANSFERRED = "TRANSFERRED"
    RESOLVED = "RESOLVED"
    NOTE = "NOTE"


class EscalationReason(StrEnum):
    TWO_FAILED_VERIFICATIONS = "TWO_FAILED_VERIFICATIONS"
    SLA_STALL = "SLA_STALL"
    CONSULATE_STALL = "CONSULATE_STALL"
    DISTRESS = "DISTRESS"
    APPROVAL_QUESTION = "APPROVAL_QUESTION"
    DISPUTED_RECORD = "DISPUTED_RECORD"
    RESIDENT_REQUEST = "RESIDENT_REQUEST"
    ENTITY_REJECTION = "ENTITY_REJECTION"
    OFFICER_REFERRAL = "OFFICER_REFERRAL"


class EscalationStatus(StrEnum):
    OPEN = "OPEN"
    IN_PROGRESS = "IN_PROGRESS"
    RESOLVED = "RESOLVED"


class ConsentType(StrEnum):
    CALLBACK = "CALLBACK"
    DATA_PROCESSING = "DATA_PROCESSING"
    SERVICE_FILING = "SERVICE_FILING"


class ConsentStatus(StrEnum):
    GRANTED = "GRANTED"
    REVOKED = "REVOKED"


class DocumentCategory(StrEnum):
    PARENT = "PARENT"
    CHILD = "CHILD"
    MARRIAGE_CERTIFICATE = "MARRIAGE_CERTIFICATE"
    BIRTH_CERTIFICATE = "BIRTH_CERTIFICATE"
    PASSPORT = "PASSPORT"
    VISA = "VISA"
    EMIRATES_ID = "EMIRATES_ID"
    INSURANCE = "INSURANCE"


class DocumentStatus(StrEnum):
    REQUIRED = "REQUIRED"
    UPLOADED = "UPLOADED"
    VERIFIED = "VERIFIED"
    MISSING = "MISSING"
    EXPIRED = "EXPIRED"
    NOT_APPLICABLE = "NOT_APPLICABLE"


class CallbackStatus(StrEnum):
    SCHEDULED = "SCHEDULED"
    DIALING = "DIALING"
    COMPLETED = "COMPLETED"
    NO_ANSWER = "NO_ANSWER"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"
    BLOCKED_NO_CONSENT = "BLOCKED_NO_CONSENT"
    SMS_ONLY = "SMS_ONLY"


class CallDirection(StrEnum):
    INBOUND = "INBOUND"
    OUTBOUND = "OUTBOUND"


class CallProvider(StrEnum):
    ELEVENLABS = "ELEVENLABS"
    SIMULATED = "SIMULATED"


class CallState(StrEnum):
    RINGING = "RINGING"
    ACTIVE = "ACTIVE"
    ENDED = "ENDED"
    TRANSFERRED = "TRANSFERRED"
    FAILED = "FAILED"


class TranscriptRole(StrEnum):
    AGENT = "AGENT"
    RESIDENT = "RESIDENT"
    SYSTEM = "SYSTEM"
    OFFICER = "OFFICER"


class SubAgent(StrEnum):
    ROUTER = "ROUTER"
    INTAKE = "INTAKE"
    STATUS = "STATUS"
    EXCEPTION = "EXCEPTION"


class NotificationChannel(StrEnum):
    IN_APP = "IN_APP"
    SMS = "SMS"
    EMAIL = "EMAIL"
    VOICE = "VOICE"


class NotificationStatus(StrEnum):
    QUEUED = "QUEUED"
    SENT = "SENT"
    FAILED = "FAILED"
    READ = "READ"


class VerificationMethod(StrEnum):
    UAE_PASS = "UAE_PASS"
    KNOWLEDGE_FACTS = "KNOWLEDGE_FACTS"


class OutboxStatus(StrEnum):
    PENDING = "PENDING"
    PUBLISHED = "PUBLISHED"
    PROCESSED = "PROCESSED"
    FAILED = "FAILED"


class IntegrationStatus(StrEnum):
    RECEIVED = "RECEIVED"
    PROCESSED = "PROCESSED"
    DUPLICATE = "DUPLICATE"
    REJECTED = "REJECTED"
    FAILED = "FAILED"


class IntegrationDirection(StrEnum):
    INBOUND = "INBOUND"
    OUTBOUND = "OUTBOUND"


ACTIVE_CASE_STATES = frozenset({
    CaseStatus.INTAKE, CaseStatus.ACTIVE, CaseStatus.WAITING_FOR_PARENT, CaseStatus.WAITING_FOR_HUMAN, CaseStatus.ESCALATED,
})
STAFF_ROLES = frozenset({UserRole.OFFICER, UserRole.ADMIN})
