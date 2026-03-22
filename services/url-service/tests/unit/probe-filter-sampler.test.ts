import { describe, it, expect } from "vitest";
import { type Sampler, SpanKind, TraceFlags, trace, ROOT_CONTEXT, type Context } from "@opentelemetry/api";
import { ParentBasedSampler, SamplingDecision } from "@opentelemetry/sdk-trace-base";
import { ATTR_URL_PATH } from "@opentelemetry/semantic-conventions";
import { ProbeFilterSampler } from "../../src/probe-filter-sampler.js";

// Minimal arguments for shouldSample calls that don't affect the outcome.
const DUMMY_TRACE_ID = "d4cda95b652f4a1592b449d5929fda1b";
const DUMMY_SPAN_ID = "6e0c63257de34c92";

function callSampler(
  sampler: Sampler,
  attributes: Record<string, string>,
  ctx: Context = ROOT_CONTEXT
) {
  return sampler.shouldSample(ctx, DUMMY_TRACE_ID, "GET", SpanKind.SERVER, attributes, []);
}

describe("ProbeFilterSampler", () => {
  const sampler = new ProbeFilterSampler();

  it("drops /health", () => {
    const result = callSampler(sampler, { [ATTR_URL_PATH]: "/health" });
    expect(result.decision).toBe(SamplingDecision.NOT_RECORD);
  });

  it("drops /ready", () => {
    const result = callSampler(sampler, { [ATTR_URL_PATH]: "/ready" });
    expect(result.decision).toBe(SamplingDecision.NOT_RECORD);
  });

  it("drops /metrics", () => {
    const result = callSampler(sampler, { [ATTR_URL_PATH]: "/metrics" });
    expect(result.decision).toBe(SamplingDecision.NOT_RECORD);
  });

  it("drops via legacy http.target attribute", () => {
    const result = callSampler(sampler, { "http.target": "/health" });
    expect(result.decision).toBe(SamplingDecision.NOT_RECORD);
  });

  it("passes /urls/:code (normal traffic)", () => {
    const result = callSampler(sampler, { [ATTR_URL_PATH]: "/urls/abc123" });
    expect(result.decision).toBe(SamplingDecision.RECORD_AND_SAMPLED);
  });

  it("passes POST /urls (URL creation)", () => {
    const result = callSampler(sampler, { [ATTR_URL_PATH]: "/urls" });
    expect(result.decision).toBe(SamplingDecision.RECORD_AND_SAMPLED);
  });

  it("passes spans with no URL attributes (e.g. Fastify child spans)", () => {
    // ProbeFilterSampler alone would PASS these — the ParentBasedSampler
    // wrapper is what ensures they are correctly dropped when their parent
    // root span was NOT_RECORD. This test documents that behavior.
    const result = callSampler(sampler, {});
    expect(result.decision).toBe(SamplingDecision.RECORD_AND_SAMPLED);
  });
});

describe("ParentBasedSampler wrapping ProbeFilterSampler", () => {
  const sampler = new ParentBasedSampler({ root: new ProbeFilterSampler() });

  it("drops root /health span", () => {
    const result = callSampler(sampler, { [ATTR_URL_PATH]: "/health" });
    expect(result.decision).toBe(SamplingDecision.NOT_RECORD);
  });

  it("records root /urls/:code span", () => {
    const result = callSampler(sampler, { [ATTR_URL_PATH]: "/urls/abc123" });
    expect(result.decision).toBe(SamplingDecision.RECORD_AND_SAMPLED);
  });

  it("drops child span when local parent is not sampled", () => {
    // Simulate the context a Fastify child span would see after its parent
    // HTTP server span was dropped (traceFlags = NONE, not sampled).
    const notSampledCtx = trace.setSpanContext(ROOT_CONTEXT, {
      traceId: DUMMY_TRACE_ID,
      spanId: DUMMY_SPAN_ID,
      traceFlags: TraceFlags.NONE,
      isRemote: false,
    });

    // Child span has no URL attributes — this is the Fastify orphan scenario.
    const result = callSampler(sampler, {}, notSampledCtx);
    expect(result.decision).toBe(SamplingDecision.NOT_RECORD);
  });

  it("records child span when local parent is sampled", () => {
    const sampledCtx = trace.setSpanContext(ROOT_CONTEXT, {
      traceId: DUMMY_TRACE_ID,
      spanId: DUMMY_SPAN_ID,
      traceFlags: TraceFlags.SAMPLED,
      isRemote: false,
    });

    const result = callSampler(sampler, {}, sampledCtx);
    expect(result.decision).toBe(SamplingDecision.RECORD_AND_SAMPLED);
  });
});
