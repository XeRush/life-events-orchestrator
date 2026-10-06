"""Explicit, validated node state machine. Every transition in the system goes through `assert_transition`."""
from app.core.errors import InvalidTransition
from app.models.enums import NodeState as S

ALLOWED: dict[S, frozenset[S]] = {
    S.PENDING: frozenset({S.READY, S.WAITING_FOR_PARENT, S.DOCUMENT_MISSING, S.BLOCKED}),
    S.READY: frozenset({S.WAITING_FOR_HUMAN, S.WAITING_FOR_PARENT, S.DOCUMENT_MISSING, S.SUBMITTING, S.PENDING, S.BLOCKED}),
    S.WAITING_FOR_HUMAN: frozenset({S.SUBMITTING, S.BLOCKED, S.DOCUMENT_MISSING, S.REJECTED, S.READY}),
    S.SUBMITTING: frozenset({S.SUBMITTED, S.PROCESSING, S.STALLED, S.BLOCKED, S.REJECTED, S.DOCUMENT_MISSING}),
    S.SUBMITTED: frozenset({S.PROCESSING, S.CLEARED, S.COMPLETED, S.BLOCKED, S.DOCUMENT_MISSING, S.STALLED, S.REJECTED, S.WAITING_FOR_PARENT}),
    S.PROCESSING: frozenset({S.CLEARED, S.COMPLETED, S.BLOCKED, S.DOCUMENT_MISSING, S.STALLED, S.REJECTED, S.WAITING_FOR_PARENT}),
    S.WAITING_FOR_PARENT: frozenset({S.PROCESSING, S.COMPLETED, S.CLEARED, S.STALLED, S.DOCUMENT_MISSING, S.READY,
                                     S.WAITING_FOR_HUMAN, S.BLOCKED}),
    S.DOCUMENT_MISSING: frozenset({S.READY, S.WAITING_FOR_HUMAN, S.WAITING_FOR_PARENT, S.BLOCKED, S.SUBMITTING}),
    S.STALLED: frozenset({S.SUBMITTING, S.SUBMITTED, S.PROCESSING, S.WAITING_FOR_HUMAN, S.WAITING_FOR_PARENT, S.BLOCKED,
                          S.CLEARED, S.COMPLETED, S.READY, S.DOCUMENT_MISSING, S.REJECTED}),
    S.BLOCKED: frozenset({S.WAITING_FOR_HUMAN, S.DOCUMENT_MISSING, S.READY, S.SUBMITTING, S.REJECTED}),
    S.REJECTED: frozenset({S.WAITING_FOR_HUMAN, S.READY}),
    S.CLEARED: frozenset({S.COMPLETED}),
    S.COMPLETED: frozenset(),
}

# What an authority may report through an adapter (poll, webhook or demo simulation).
ENTITY_REPORTABLE = frozenset({S.SUBMITTED, S.PROCESSING, S.CLEARED, S.COMPLETED, S.BLOCKED, S.DOCUMENT_MISSING,
                               S.STALLED, S.REJECTED, S.WAITING_FOR_PARENT})


def can_transition(current: S, target: S) -> bool:
    return target in ALLOWED.get(current, frozenset())


def assert_transition(current: S, target: S, node_key: str = "") -> None:
    if current == target:
        return
    if not can_transition(current, target):
        raise InvalidTransition(f"{node_key or 'Node'} cannot move from {current.value} to {target.value}")
