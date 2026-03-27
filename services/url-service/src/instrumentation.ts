// OTel SDK bootstrap — loaded via --require before any other module.
//
// This file is compiled to CJS (see tsconfig.instrumentation.json) and
// loaded via --require in the Dockerfile CMD.
//
// When OTEL_EXPORTER_OTLP_ENDPOINT is unset, the SDK starts with a
// no-op tracer and no exporter — the service runs normally.
//
// Probe span suppression uses three independent layers so that /health,
// /ready, and /metrics never reach Tempo:
//
//   Layer 1 – ignoreIncomingRequestHook:
//     Calls suppressTracing() before the HTTP span is created, preventing
//     the span and all children in the same async context.
//
//   Layer 2 – ParentBasedSampler(ProbeFilterSampler):
//     If a root span is somehow created with a probe url.path / http.target,
//     the sampler returns NOT_RECORD and ParentBasedSampler propagates that
//     decision to every child span.
//
//   Layer 3 – ProbeFilterSpanProcessor:
//     Wraps the BatchSpanProcessor and silently drops any span whose
//     fully-populated attributes match a probe path — the last checkpoint
//     before a span leaves the process.

import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import {
  BatchSpanProcessor,
  ParentBasedSampler,
} from "@opentelemetry/sdk-trace-base";
import { ProbeFilterSampler, PROBE_PATHS } from "./probe-filter-sampler.js";
import { ProbeFilterSpanProcessor } from "./probe-filter-processor.js";

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
const serviceName = process.env.OTEL_SERVICE_NAME ?? "url-service";

console.log(
  `[otel] starting SDK (service=${serviceName}, endpoint=${endpoint ?? "none"}, excluded=${[...PROBE_PATHS].join(",")})`
);

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: serviceName,
  }),
  sampler: new ParentBasedSampler({ root: new ProbeFilterSampler() }),
  ...(endpoint
    ? {
        spanProcessors: [
          new ProbeFilterSpanProcessor(
            new BatchSpanProcessor(new OTLPTraceExporter())
          ),
        ],
      }
    : {}),
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
