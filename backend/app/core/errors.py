"""Domain exceptions. The API layer maps these to safe HTTP responses (no stack traces, no internals)."""


class DomainError(Exception):
    status_code = 400
    code = "domain_error"

    def __init__(self, message: str, *, code: str | None = None, details: dict | None = None):
        super().__init__(message)
        self.message = message
        self.details = details or {}
        if code:
            self.code = code


class NotFound(DomainError):
    status_code = 404
    code = "not_found"


class Forbidden(DomainError):
    status_code = 403
    code = "forbidden"


class Unauthorized(DomainError):
    status_code = 401
    code = "unauthorized"


class Conflict(DomainError):
    status_code = 409
    code = "conflict"


class InvalidTransition(Conflict):
    code = "invalid_transition"


class ConsentRequired(DomainError):
    status_code = 403
    code = "consent_required"


class OptedOut(DomainError):
    status_code = 409
    code = "opted_out"


class ApprovalRequired(DomainError):
    status_code = 403
    code = "human_approval_required"


class ValidationFailed(DomainError):
    status_code = 422
    code = "validation_failed"


class RateLimited(DomainError):
    status_code = 429
    code = "rate_limited"


class AccountLocked(DomainError):
    status_code = 423
    code = "account_locked"


class EmailNotVerified(DomainError):
    status_code = 403
    code = "email_not_verified"


class ServiceUnavailable(DomainError):
    status_code = 503
    code = "service_unavailable"
