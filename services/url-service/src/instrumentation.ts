// OTel SDK must be initialized before any other imports.
// This file is loaded via --import in the Dockerfile CMD, which ensures
// it runs before server.ts regardless of module load order.
//
// When OTEL_EXPORTER_OTLP_ENDPOINT is unset, the SDK starts with a
// no-op tracer and no exporter — the service runs normally.

import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
const serviceName = process.env.OTEL_SERVICE_NAME ?? "url-service";

// Probe and metrics paths should never generate traces — they are high-frequency
// and have no diagnostic value. We instantiate HttpInstrumentation directly rather
// than relying on the getNodeAutoInstrumentations config passthrough, which does
// not reliably forward ignoreIncomingRequestHook in all versions.
const PROBE_PATHS = new Set(["/health", "/ready", "/metrics"]);

const httpInstrumentation = new HttpInstrumentation({
  ignoreIncomingRequestHook: (req) => {
    const rawUrl: string = (req as any).url ?? "";
    const path = rawUrl.split("?")[0];
    return PROBE_PATHS.has(path);
  },
});

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
    // HttpInstrumentation is listed first and explicitly instantiated so that
    // ignoreIncomingRequestHook is guaranteed to be applied. getNodeAutoInstrumentations
    // is configured to disable HTTP to avoid registering a second, unfiltered instance.
    httpInstrumentation,
    getNodeAutoInstrumentations({
      "@opentelemetry/instrumentation-fs": { enabled: false },
      "@opentelemetry/instrumentation-dns": { enabled: false },
      "@opentelemetry/instrumentation-http": { enabled: false },
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
