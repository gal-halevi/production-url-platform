// OTel SDK must be initialized before any other imports.
// This file is loaded via --import in the Dockerfile CMD, which ensures
// it runs before server.ts regardless of module load order.
//
// When OTEL_EXPORTER_OTLP_ENDPOINT is unset, the SDK starts with a
// no-op tracer and no exporter — the service runs normally.

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
      // HTTP and pg (via @opentelemetry/instrumentation-pg) are the key ones.
      "@opentelemetry/instrumentation-fs": { enabled: false },
      "@opentelemetry/instrumentation-dns": { enabled: false },
      // OTEL_NODE_EXCLUDED_URLS is not picked up when using --import;
      // read it manually and pass it to the HTTP instrumentation.
      "@opentelemetry/instrumentation-http": {
        ignoreIncomingRequestHook: (req) => {
          const excluded = (process.env.OTEL_NODE_EXCLUDED_URLS ?? "")
            .split(",")
            .map((p) => p.trim())
            .filter(Boolean)
            .map((p) => (p.startsWith("/") ? p : `/${p}`));
          const path = (req as any).url ?? "";
          return excluded.some((p) => path === p);
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
