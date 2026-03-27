// ProbeFilterSampler — drops root HTTP spans whose path matches a probe endpoint.
//
// Wrapped in ParentBasedSampler (see instrumentation.ts) so child spans
// automatically inherit the NOT_RECORD decision.
//
// Checks both url.path (stable semconv) and http.target (old semconv) because
// the active semconv mode depends on OTEL_SEMCONV_STABILITY_OPT_IN, which
// defaults to OLD.  In OLD mode only http.target is present on initial span
// attributes; in STABLE mode only url.path is present.

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
