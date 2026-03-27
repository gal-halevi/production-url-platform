// OTel SDK bootstrap — loaded via --require before any other module.
//
// This file is compiled to CJS (see tsconfig.instrumentation.json) and
// loaded via --require in the Dockerfile CMD.
//
// When OTEL_EXPORTER_OTLP_ENDPOINT is unset, the SDK starts with a
// no-op tracer and no exporter — the service runs normally.
//
// Probe span suppression: ignoreIncomingRequestHook calls suppressTracing()
// before the HTTP span is created, preventing the span and all children
// in the same async context.

import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
const serviceName = process.env.OTEL_SERVICE_NAME ?? "url-service";

const PROBE_PATHS = new Set(
  (process.env.OTEL_NODE_EXCLUDED_URLS ?? "health,ready,metrics")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => (p.startsWith("/") ? p : `/${p}`))
);

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: serviceName,
  }),
  ...(endpoint ? { traceExporter: new OTLPTraceExporter() } : {}),
  instrumentations: [
    getNodeAutoInstrumentations({
      "@opentelemetry/instrumentation-fs": { enabled: false },
      "@opentelemetry/instrumentation-dns": { enabled: false },
      "@opentelemetry/instrumentation-http": {
        ignoreIncomingRequestHook: (req) => {
          const path = (req.url ?? "").split("?")[0];
          return PROBE_PATHS.has(path);
        },
      },
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
