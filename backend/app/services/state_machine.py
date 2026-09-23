"""Explicit, validated task state machine."""
from app.core.errors import InvalidTransition
from app.models.enums import TaskStatus as S

ALLOWED: dict[S, set[S]] = {
    S.PENDING: {S.READY, S.BLOCKED, S.CANCELLED},
    S.BLOCKED: {S.READY, S.CANCELLED},
    S.READY: {S.SUBMITTED, S.BLOCKED, S.COMPLETED, S.FAILED, S.CANCELLED},
    S.SUBMITTED: {S.PROCESSING, S.COMPLETED, S.REJECTED, S.WAITING_FOR_RESIDENT, S.WAITING_FOR_ENTITY, S.FAILED, S.CANCELLED},
    S.PROCESSING: {S.COMPLETED, S.REJECTED, S.WAITING_FOR_RESIDENT, S.WAITING_FOR_ENTITY, S.FAILED, S.CANCELLED},
    S.WAITING_FOR_ENTITY: {S.PROCESSING, S.COMPLETED, S.REJECTED, S.WAITING_FOR_RESIDENT, S.FAILED, S.CANCELLED},
    S.WAITING_FOR_RESIDENT: {S.PROCESSING, S.SUBMITTED, S.REJECTED, S.FAILED, S.CANCELLED},
    S.REJECTED: {S.READY, S.WAITING_FOR_RESIDENT, S.WAITING_FOR_ENTITY, S.CANCELLED, S.FAILED},
    S.FAILED: {S.READY, S.CANCELLED},
    S.COMPLETED: set(),
    S.CANCELLED: set(),
}


def can_transition(old: S, new: S) -> bool:
    return new in ALLOWED[old]


def validate_transition(old: S, new: S) -> None:
    if not can_transition(old, new):
        raise InvalidTransition(f"Task cannot move from {old.value} to {new.value}")
