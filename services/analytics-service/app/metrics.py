"""Prometheus metrics for analytics-service.

Uses raw prometheus_client with an OpenMetrics registry so that exemplars
(trace IDs) can be attached to histogram observations and scraped by
Prometheus. This replaces prometheus-fastapi-instrumentator which does not
support exemplars and doesn't allow owning the observe() call.
"""
from __future__ import annotations

from prometheus_client import (
    Counter,
    Histogram,
    REGISTRY,
)
from prometheus_client.openmetrics.exposition import (
    CONTENT_TYPE_LATEST,
    generate_latest,
)

# Re-export for use in main.py metrics endpoint.
__all__ = [
    "http_requests_total",
    "http_request_duration_seconds",
    "CONTENT_TYPE_LATEST",
    "generate_latest",
    "REGISTRY",
]

http_requests_total = Counter(
    "http_requests_total",
    "Total number of HTTP requests",
    ["method", "route", "status_code"],
)

# enableExemplars=True allows attaching a trace_id to each observation so
# Grafana can link latency spikes directly to the corresponding Tempo trace.
http_request_duration_seconds = Histogram(
    "http_request_duration_seconds",
    "HTTP request duration in seconds",
    ["method", "route", "status_code"],
    buckets=[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
)
