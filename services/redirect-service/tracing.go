package main

import (
	"context"
	"errors"
	"os"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.26.0"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

// initTracing sets up the OTel tracer provider with an OTLP gRPC exporter.
// It reads OTEL_EXPORTER_OTLP_ENDPOINT from the environment (set via Helm
// values to point at the OTel Collector in the monitoring namespace).
//
// Returns a shutdown function that must be deferred in main() to flush and
// close the exporter cleanly on graceful shutdown.
func initTracing(ctx context.Context) (shutdown func(context.Context) error, err error) {
	endpoint := os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
	if endpoint == "" {
		// Tracing disabled — return a no-op shutdown so callers don't need to
		// branch. All OTel API calls become no-ops when no provider is registered.
		return func(context.Context) error { return nil }, nil
	}

	serviceName := os.Getenv("OTEL_SERVICE_NAME")
	if serviceName == "" {
		serviceName = "redirect-service"
	}

	// Dial the OTel Collector. Using WithBlock would hang startup if the
	// collector is temporarily unavailable — non-blocking is safer here.
	conn, err := grpc.NewClient(
		endpoint,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	if err != nil {
		return nil, err
	}

	// OTLP gRPC trace exporter — sends spans to the collector.
	exporter, err := otlptracegrpc.New(ctx, otlptracegrpc.WithGRPCConn(conn))
	if err != nil {
		return nil, err
	}

	// Resource identifies this service in every span.
	res, err := resource.Merge(
		resource.Default(),
		resource.NewWithAttributes(
			semconv.SchemaURL,
			semconv.ServiceName(serviceName),
		),
	)
	if err != nil {
		return nil, err
	}

	// Batch processor — buffers spans and sends in batches for efficiency.
	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exporter),
		sdktrace.WithResource(res),
	)

	// Register as global so otelhttp instrumentation can pick it up.
	otel.SetTracerProvider(tp)

	// W3C Trace Context propagation — injects/extracts the traceparent header
	// on all outbound and inbound HTTP calls automatically.
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	shutdown = func(ctx context.Context) error {
		ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
		defer cancel()
		return errors.Join(
			tp.Shutdown(ctx),
			conn.Close(),
		)
	}

	return shutdown, nil
}
