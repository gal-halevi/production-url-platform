// OTel SDK must be initialized before any other imports.
// This file is loaded via --import in the Dockerfile CMD, which ensures
// it runs before server.ts regardless of module load order.
//
// When OTEL_EXPORTER_OTLP_ENDPOINT is unset, the SDK starts with a
// no-op tracer and no exporter — the service runs normally.
//
// Probe path filtering (/health, /ready, /metrics) is handled at the
// OTel Collector level via a filter processor — this is more reliable
// than SDK-side hooks which are affected by ESM/CJS interop issues.

import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
const serviceName = process.env.OTEL_SERVICE_NAME ?? "url-service";

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: serviceName,
  }),
  // Only configure the exporter when an endpoint is provided.
  // Without it, NodeSDK still starts but uses a no-op tracer.
  ...(endpoint
    ? {
        traceExporter: new OTLPTraceExporter(),
      }
    : {}),
  instrumentations: [
    getNodeAutoInstrumentations({
      // Disable instrumentations we don't need to keep overhead minimal.
      "@opentelemetry/instrumentation-fs": { enabled: false },
      "@opentelemetry/instrumentation-dns": { enabled: false },
    }),
  ],
});

sdk.start();

// Graceful shutdown — flush pending spans before the process exits.
process.on("SIGTERM", () => {
  sdk
    .shutdown()
    .catch((err) => console.error("OTel SDK shutdown error:", err));
});
