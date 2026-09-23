import pytest

from app.core.errors import InvalidTransition
from app.models.enums import TaskStatus as S
from app.services.state_machine import ALLOWED, can_transition, validate_transition


def test_every_state_has_a_rule():
    assert set(ALLOWED) == set(S)


def test_terminal_states_are_terminal():
    for terminal in (S.COMPLETED, S.CANCELLED):
        assert ALLOWED[terminal] == set()


@pytest.mark.parametrize("old,new", [(S.PENDING, S.READY), (S.READY, S.SUBMITTED), (S.SUBMITTED, S.PROCESSING),
                                     (S.PROCESSING, S.WAITING_FOR_RESIDENT), (S.WAITING_FOR_RESIDENT, S.PROCESSING),
                                     (S.REJECTED, S.READY), (S.PROCESSING, S.COMPLETED)])
def test_valid_transitions(old, new):
    assert can_transition(old, new)
    validate_transition(old, new)


@pytest.mark.parametrize("old,new", [(S.COMPLETED, S.PROCESSING), (S.BLOCKED, S.COMPLETED), (S.PENDING, S.SUBMITTED),
                                     (S.CANCELLED, S.READY), (S.WAITING_FOR_RESIDENT, S.COMPLETED)])
def test_invalid_transitions(old, new):
    with pytest.raises(InvalidTransition):
        validate_transition(old, new)
