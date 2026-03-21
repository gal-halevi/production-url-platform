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
import { ATTR_SERVICE_NAME, ATTR_URL_PATH } from "@opentelemetry/semantic-conventions";
import { Context, Attributes, SpanKind, Link } from "@opentelemetry/api";
import {
  Sampler,
  SamplingDecision,
  SamplingResult,
} from "@opentelemetry/sdk-trace-base";

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
const serviceName = process.env.OTEL_SERVICE_NAME ?? "url-service";

// Probe and metrics paths are excluded via a custom sampler — the correct
// OTel abstraction for dropping spans before they are recorded or exported.
// Using a sampler rather than ignoreIncomingRequestHook works regardless of
// which instrumentation creates the span (http, fastify, etc.).
const PROBE_PATHS = new Set(
  (process.env.OTEL_NODE_EXCLUDED_URLS ?? "health,ready,metrics")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => (p.startsWith("/") ? p : `/${p}`))
);

class ProbeFilterSampler implements Sampler {
  shouldSample(
    _ctx: Context,
    _traceId: string,
    _spanName: string,
    _spanKind: SpanKind,
    attributes: Attributes,
    _links: Link[]
  ): SamplingResult {
    // Drop spans for probe and metrics paths — high-frequency, no diagnostic value.
    // Check both attribute names: http.target (old semconv) and url.path (stable
    // semconv, ATTR_URL_PATH). The http instrumentation sets url.path on the root
    // span unconditionally, but http.target is only present in old-semconv mode.
    // Checking both makes the sampler robust regardless of semconvStability config.
    const target = (attributes["http.target"] ?? attributes[ATTR_URL_PATH] ?? "") as string;
    if (target && PROBE_PATHS.has(target)) {
      return { decision: SamplingDecision.NOT_RECORD };
    }
    return { decision: SamplingDecision.RECORD_AND_SAMPLED };
  }

  toString(): string {
    return "ProbeFilterSampler";
  }
}

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: serviceName,
  }),
  sampler: new ProbeFilterSampler(),
  ...(endpoint
    ? {
        traceExporter: new OTLPTraceExporter(),
      }
    : {}),
  instrumentations: [
    getNodeAutoInstrumentations({
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
