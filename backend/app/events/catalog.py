"""Domain event catalogue: names, categories, Kafka topics and how each one reads on the case timeline."""
from __future__ import annotations

from dataclasses import dataclass

from app.models.enums import NodeState

TOPIC_CASE = "lifeloop.case.events"
TOPIC_CALLBACKS = "lifeloop.case.callbacks"
TOPIC_ENTITY_REQUESTS = "lifeloop.entity.requests"
TOPIC_ENTITY_STATUS = "lifeloop.entity.status"
TOPIC_AGENT = "lifeloop.agent.events"
TOPIC_NOTIFICATIONS = "lifeloop.notifications"
TOPIC_AUDIT = "lifeloop.audit"
ALL_TOPICS = (TOPIC_CASE, TOPIC_CALLBACKS, TOPIC_ENTITY_REQUESTS, TOPIC_ENTITY_STATUS, TOPIC_AGENT, TOPIC_NOTIFICATIONS, TOPIC_AUDIT)

CATEGORY_TOPIC = {
    "case": TOPIC_CASE,
    "node_transition": TOPIC_CASE,
    "officer": TOPIC_CASE,
    "callback": TOPIC_CALLBACKS,
    "entity_request": TOPIC_ENTITY_REQUESTS,
    "entity_status": TOPIC_ENTITY_STATUS,
    "agent": TOPIC_AGENT,
    "notification": TOPIC_NOTIFICATIONS,
}


@dataclass(frozen=True)
class EventSpec:
    category: str
    timeline: bool = True


SPECS: dict[str, EventSpec] = {
    # case lifecycle
    "CaseCreated": EventSpec("case"),
    "IntakeCompleted": EventSpec("case"),
    "CaseCompleted": EventSpec("case"),
    "CaseStatusChanged": EventSpec("case", timeline=False),
    "ConsentCaptured": EventSpec("case"),
    "ConsentRevoked": EventSpec("case"),
    "OptOutRequested": EventSpec("case"),
    "OptOutCompleted": EventSpec("case"),
    "OptInRestored": EventSpec("case"),
    "VerificationSucceeded": EventSpec("case"),
    "VerificationFailed": EventSpec("case"),
    "DocumentUploaded": EventSpec("case"),
    "DocumentVerified": EventSpec("case"),
    "ConsulateMilestoneReported": EventSpec("case"),
    "HumanEscalationRequired": EventSpec("case"),
    "EscalationResolved": EventSpec("case"),
    # officer gate
    "ApprovalRequested": EventSpec("officer"),
    "OfficerApproved": EventSpec("officer"),
    "OfficerRejected": EventSpec("officer"),
    "OfficerRequestedDocuments": EventSpec("officer"),
    "CaseTransferred": EventSpec("officer"),
    # callbacks
    "CallbackRequired": EventSpec("callback", timeline=False),
    "CallbackScheduled": EventSpec("callback"),
    "CallbackDialed": EventSpec("callback"),
    "CallbackCompleted": EventSpec("callback"),
    "CallbackNoAnswer": EventSpec("callback"),
    "CallbackBlocked": EventSpec("callback"),
    "CallbacksCancelled": EventSpec("callback"),
    # entities
    "EntityRequestReleased": EventSpec("entity_request", timeline=False),
    "EntityStatusReceived": EventSpec("entity_status", timeline=False),
    # agent
    "CallStarted": EventSpec("agent"),
    "CallEnded": EventSpec("agent"),
    "CallTransferred": EventSpec("agent"),
    "AgentToolCalled": EventSpec("agent", timeline=False),
    "PostCallWebhookReceived": EventSpec("agent", timeline=False),
    "PostCallProcessed": EventSpec("case"),
    # notifications
    "NotificationRequested": EventSpec("notification", timeline=False),
}

# Node-transition events. A semantic name when the canvas names one, otherwise a generic Node<State> name.
SEMANTIC_NODE_EVENTS: dict[tuple[str, NodeState], str] = {
    ("BIRTH_CERTIFICATE", NodeState.SUBMITTED): "BirthCertificateSubmitted",
    ("BIRTH_CERTIFICATE", NodeState.CLEARED): "BirthCertificateCleared",
    ("MOFA_ATTESTATION", NodeState.READY): "MOFAReady",
    ("MOFA_ATTESTATION", NodeState.CLEARED): "MOFACompleted",
    ("CONSULATE_PASSPORT", NodeState.COMPLETED): "ConsulatePassportReported",
    ("RESIDENCE_VISA", NodeState.SUBMITTED): "VisaRequestCreated",
    ("RESIDENCE_VISA", NodeState.CLEARED): "VisaCleared",
    ("EMIRATES_ID", NodeState.READY): "EmiratesIDReady",
    ("EMIRATES_ID", NodeState.COMPLETED): "EmiratesIDCompleted",
    ("INSURANCE", NodeState.READY): "InsuranceReady",
    ("INSURANCE", NodeState.COMPLETED): "InsuranceCompleted",
}
GENERIC_NODE_EVENTS: dict[NodeState, str] = {
    NodeState.PENDING: "NodeReset",
    NodeState.READY: "NodeReady",
    NodeState.WAITING_FOR_HUMAN: "NodeAwaitingRelease",
    NodeState.SUBMITTING: "NodeSubmitting",
    NodeState.SUBMITTED: "NodeSubmitted",
    NodeState.PROCESSING: "NodeProcessing",
    NodeState.CLEARED: "NodeCleared",
    NodeState.COMPLETED: "NodeCompleted",
    NodeState.BLOCKED: "NodeBlocked",
    NodeState.DOCUMENT_MISSING: "DocumentMissing",
    NodeState.STALLED: "NodeStalled",
    NodeState.WAITING_FOR_PARENT: "NodeWaitingForParent",
    NodeState.REJECTED: "NodeRejected",
}
NODE_EVENT_NAMES = frozenset(SEMANTIC_NODE_EVENTS.values()) | frozenset(GENERIC_NODE_EVENTS.values())


def node_event_name(node_key: str, state: NodeState) -> str:
    return SEMANTIC_NODE_EVENTS.get((node_key, state)) or GENERIC_NODE_EVENTS[state]


def spec_for(name: str) -> EventSpec:
    if name in NODE_EVENT_NAMES:
        return EventSpec("node_transition")
    return SPECS.get(name, EventSpec("case"))


def topic_for(name: str) -> str:
    return CATEGORY_TOPIC[spec_for(name).category]


STATE_PHRASES: dict[NodeState, str] = {
    NodeState.PENDING: "waiting for an earlier step",
    NodeState.READY: "ready to prepare",
    NodeState.WAITING_FOR_HUMAN: "prepared, awaiting officer release",
    NodeState.SUBMITTING: "being filed",
    NodeState.SUBMITTED: "request submitted",
    NodeState.PROCESSING: "being processed by the authority",
    NodeState.CLEARED: "cleared by the authority",
    NodeState.COMPLETED: "completed",
    NodeState.BLOCKED: "blocked",
    NodeState.DOCUMENT_MISSING: "document missing",
    NodeState.STALLED: "stalled, not cleared yet",
    NodeState.WAITING_FOR_PARENT: "waiting for you",
    NodeState.REJECTED: "not approved by the authority",
}
