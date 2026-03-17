import client from "prom-client";

export const registry = new client.Registry();

// Add default Node.js / process metrics (CPU, memory, GC, event loop, etc.)
client.collectDefaultMetrics({ register: registry });

// HTTP request counter
export const httpRequestsTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status_code"] as const,
  registers: [registry],
});

// HTTP request duration histogram.
// enableExemplars allows attaching a trace_id to each observation so Grafana
// can link latency spikes directly to the corresponding Tempo trace.
export const httpRequestDurationSeconds = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status_code"] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  enableExemplars: true,
  registers: [registry],
});
