// ProbeFilterSpanProcessor — last line of defense before export.
//
// Wraps a SpanProcessor and silently drops any span whose url.path or
// http.target matches a probe path.  This fires on fully-constructed spans
// (all attributes populated) at onEnd time, so it catches anything that
// slipped past the ignoreIncomingRequestHook (layer 1) and the
// ProbeFilterSampler (layer 2).

import type { Context } from "@opentelemetry/api";
import type {
  ReadableSpan,
  Span,
  SpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { PROBE_PATHS } from "./probe-filter-sampler.js";

export class ProbeFilterSpanProcessor implements SpanProcessor {
  constructor(private _inner: SpanProcessor) {}

  onStart(span: Span, parentContext: Context): void {
    this._inner.onStart(span, parentContext);
  }

  onEnd(span: ReadableSpan): void {
    const path = (span.attributes["url.path"] ??
      span.attributes["http.target"] ??
      "") as string;
    if (path && PROBE_PATHS.has(path)) {
      return; // drop — do not forward to the inner processor
    }
    this._inner.onEnd(span);
  }

  forceFlush(): Promise<void> {
    return this._inner.forceFlush();
  }

  shutdown(): Promise<void> {
    return this._inner.shutdown();
  }
}
