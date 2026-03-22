// OTel SDK bootstrap — loaded via --require before any other module.
//
// This file is compiled to CJS (see tsconfig.instrumentation.json) and
// loaded via --require in the Dockerfile CMD.
//
// When OTEL_EXPORTER_OTLP_ENDPOINT is unset, the SDK starts with a
// no-op tracer and no exporter — the service runs normally.

import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { ParentBasedSampler } from "@opentelemetry/sdk-trace-base";
import { ProbeFilterSampler } from "./probe-filter-sampler.js";

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
const serviceName = process.env.OTEL_SERVICE_NAME ?? "url-service";

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: serviceName,
  }),
  // ParentBasedSampler delegates root spans (no parent) to ProbeFilterSampler,
  // which drops /health, /ready, and /metrics. All child spans created within
  // a dropped root span are automatically suppressed by localParentNotSampled
  // (AlwaysOff). Without this wrapper, child spans from instrumentation-fastify
  // bypass the URL check and are exported as orphan spans.
  sampler: new ParentBasedSampler({ root: new ProbeFilterSampler() }),
  ...(endpoint
    ? {
        traceExporter: new OTLPTraceExporter(),
      }
    : {}),
  instrumentations: [
    getNodeAutoInstrumentations({
      "@opentelemetry/instrumentation-fs": { enabled: false },
      "@opentelemetry/instrumentation-dns": { enabled: false },
      // Set OTEL_SEMCONV_STABILITY_OPT_IN=http in the environment to use stable
      // semconv attributes (url.path). The default is old semconv (http.target).
      // ProbeFilterSampler checks both, so filtering works regardless of this setting.
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
