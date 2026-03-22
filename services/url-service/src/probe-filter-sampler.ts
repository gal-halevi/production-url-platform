// ProbeFilterSampler — drops root HTTP spans whose url.path matches a probe path.
//
// This sampler must be wrapped in ParentBasedSampler (done in instrumentation.ts)
// so that child spans (e.g. Fastify route spans from @opentelemetry/instrumentation-fastify)
// automatically inherit the NOT_RECORD decision. Without the wrapper, child spans
// are evaluated independently by this sampler and, lacking url.path attributes,
// would pass through as orphan spans.
//
// The HTTP instrumentation is configured with semconvStability: "stable" so
// url.path (ATTR_URL_PATH) is always present on server spans. The http.target
// fallback is kept for belt-and-suspenders in case of indirect instrumentation.

import { ATTR_URL_PATH } from "@opentelemetry/semantic-conventions";
import { Context, Attributes, SpanKind, Link } from "@opentelemetry/api";
import {
  Sampler,
  SamplingDecision,
  SamplingResult,
} from "@opentelemetry/sdk-trace-base";

export const PROBE_PATHS = new Set(
  (process.env.OTEL_NODE_EXCLUDED_URLS ?? "health,ready,metrics")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => (p.startsWith("/") ? p : `/${p}`))
);

export class ProbeFilterSampler implements Sampler {
  shouldSample(
    _ctx: Context,
    _traceId: string,
    _spanName: string,
    _spanKind: SpanKind,
    attributes: Attributes,
    _links: Link[]
  ): SamplingResult {
    const path = (attributes[ATTR_URL_PATH] ?? attributes["http.target"] ?? "") as string;
    if (path && PROBE_PATHS.has(path)) {
      return { decision: SamplingDecision.NOT_RECORD };
    }
    return { decision: SamplingDecision.RECORD_AND_SAMPLED };
  }

  toString(): string {
    return "ProbeFilterSampler";
  }
}
