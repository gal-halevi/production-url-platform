# OTel tracing initialisation for analytics-service.
#
# When OTEL_EXPORTER_OTLP_ENDPOINT is unset the TracerProvider is still
# configured but no exporter is attached — the service runs normally with
# no-op spans and zero overhead.
#
# FastAPIInstrumentor is applied in main.py after app creation.
# Probe paths (/health, /ready, /metrics) are excluded via the
# OTEL_PYTHON_FASTAPI_EXCLUDED_URLS env var, which is set in the Helm chart.

import os

from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.semconv.resource import ResourceAttributes


def setup_tracing() -> None:
    service_name = os.getenv("OTEL_SERVICE_NAME", "analytics-service")
    endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT")

    resource = Resource.create({ResourceAttributes.SERVICE_NAME: service_name})
    provider = TracerProvider(resource=resource)

    if endpoint:
        from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter

        provider.add_span_processor(
            BatchSpanProcessor(OTLPSpanExporter())
        )

    trace.set_tracer_provider(provider)
