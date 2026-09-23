"""Exception handling policy for rejected / failed tasks.

The agent only chooses *coordination* actions (retry a submission, use a configured alternative path, ask the
resident for information, wait, or hand to a human). It never overrides or reinterprets an authority's decision.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any


class ExceptionAction(str, Enum):
    RETRY = "RETRY"
    REQUEST_INFO = "REQUEST_INFO"
    ALTERNATIVE = "ALTERNATIVE"
    WAIT = "WAIT"
    ESCALATE = "ESCALATE"


@dataclass
class ExceptionDecision:
    action: ExceptionAction
    reason: str


class ExceptionAgent:
    def __init__(self, default_max_attempts: int = 2) -> None:
        self.default_max_attempts = default_max_attempts

    def decide_rejection(self, *, attempts: int, node_config: dict[str, Any], payload: dict[str, Any], alternative_used: bool) -> ExceptionDecision:
        """Ladder: 1 info needed -> 2 retry allowed -> 3 permitted alternative -> 4 wait -> 5 human escalation."""
        code = payload.get("reason_code", "")
        if code == "ADDITIONAL_INFORMATION_REQUIRED":
            return ExceptionDecision(ExceptionAction.REQUEST_INFO, "The authority needs more information from the resident.")
        max_attempts = int(node_config.get("max_attempts", self.default_max_attempts))
        if payload.get("retryable") and attempts < max_attempts:
            return ExceptionDecision(ExceptionAction.RETRY, f"Retry permitted (attempt {attempts + 1} of {max_attempts}).")
        if node_config.get("alternative") and not alternative_used:
            return ExceptionDecision(ExceptionAction.ALTERNATIVE, "A permitted alternative path is configured for this service.")
        if code in {"TEMPORARY", "CAPACITY"}:
            return ExceptionDecision(ExceptionAction.WAIT, "The authority indicated a temporary condition; waiting.")
        return ExceptionDecision(ExceptionAction.ESCALATE, "No further automated path is permitted; a human officer must review.")
