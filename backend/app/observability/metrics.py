"""Prometheus metrics exposed at /metrics (request latency, domain events, workers, dependency status)."""
from prometheus_client import CollectorRegistry, Counter, Gauge, Histogram, generate_latest

REGISTRY = CollectorRegistry(auto_describe=True)

HTTP_REQUESTS = Counter("lifeloop_http_requests_total", "HTTP requests", ["method", "route", "status"], registry=REGISTRY)
HTTP_LATENCY = Histogram(
    "lifeloop_http_request_duration_seconds", "HTTP request latency", ["method", "route"], registry=REGISTRY,
    buckets=(0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5),
)
CASE_EVENTS = Counter("lifeloop_case_events_total", "Domain events written to the outbox", ["event_type"], registry=REGISTRY)
CONSUMED = Counter("lifeloop_events_consumed_total", "Events processed by consumers", ["topic", "outcome"], registry=REGISTRY)
OUTBOX_PENDING = Gauge("lifeloop_outbox_pending", "Outbox events not yet published", registry=REGISTRY)
WORKER_HEARTBEAT = Gauge("lifeloop_worker_heartbeat_timestamp", "Last loop iteration per worker", ["worker"], registry=REGISTRY)
DEPENDENCY_UP = Gauge("lifeloop_dependency_up", "1 when a dependency is healthy, 0 when degraded/fallback", ["dependency"], registry=REGISTRY)
CALLBACKS = Counter("lifeloop_callbacks_total", "Callback decisions", ["outcome"], registry=REGISTRY)
TOOL_CALLS = Counter("lifeloop_agent_tool_calls_total", "Agent tool calls", ["tool", "outcome"], registry=REGISTRY)
ADAPTER_CALLS = Counter("lifeloop_adapter_calls_total", "Government adapter calls", ["entity", "operation", "outcome"], registry=REGISTRY)


def render() -> bytes:
    return generate_latest(REGISTRY)
