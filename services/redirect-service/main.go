package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/prometheus/client_golang/prometheus/promhttp"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
)

type Config struct {
	Host    string
	Port    int
	BaseURL string
	AnalyticsBaseURL  string
	AnalyticsTimeout  time.Duration
	AnalyticsQueueLen int
}

func loadConfig() (Config, error) {
	host := getenv("HOST", "0.0.0.0")

	portStr := getenv("PORT", "8080")
	port, err := strconv.Atoi(portStr)
	if err != nil || port <= 0 || port > 65535 {
		return Config{}, errors.New("invalid PORT")
	}

	// Base URL for url-service resolve endpoint.
	baseURL := getenv("URL_SERVICE_BASE_URL", "http://url-service:3000")

	analyticsBase := getenv("ANALYTICS_SERVICE_BASE_URL", "http://analytics-service:8000")

	timeoutMs := getenv("ANALYTICS_TIMEOUT_MS", "300")
	tms, err := strconv.Atoi(timeoutMs)
	if err != nil || tms <= 0 || tms > 10_000 {
		return Config{}, errors.New("invalid ANALYTICS_TIMEOUT_MS")
	}

	queueLenStr := getenv("ANALYTICS_QUEUE_SIZE", "256")
	ql, err := strconv.Atoi(queueLenStr)
	if err != nil || ql <= 0 || ql > 100_000 {
		return Config{}, errors.New("invalid ANALYTICS_QUEUE_SIZE")
	}

	return Config{
		Host:    host,
		Port:    port,
		BaseURL:  baseURL,
		AnalyticsBaseURL:  analyticsBase,
		AnalyticsTimeout:  time.Duration(tms) * time.Millisecond,
		AnalyticsQueueLen: ql,
	}, nil
}

func getenv(key, def string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return def
}

func isHTTPURL(s string) bool {
	s = strings.ToLower(strings.TrimSpace(s))
	return strings.HasPrefix(s, "http://") || strings.HasPrefix(s, "https://")
}

type resolveResp struct {
	Code    string `json:"code"`
	LongURL string `json:"long_url"`
}

func resolveLongURL(client *http.Client, base string, code string, requestID string) (string, int, error) {
	base = strings.TrimRight(base, "/")
	endpoint := base + "/urls/" + url.PathEscape(code)

	req, err := http.NewRequest(http.MethodGet, endpoint, nil)
	if err != nil {
		return "", 0, err
	}
	req.Header.Set("Accept", "application/json")

	// Propagate request id to url-service for cross-service tracing.
	if requestID != "" {
		req.Header.Set(RequestIDHeader, requestID)
	}

	resp, err := client.Do(req)
	if err != nil {
		return "", 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return "", http.StatusNotFound, nil
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		msg := strings.TrimSpace(string(b))
		if msg == "" {
			msg = resp.Status
		}
		return "", resp.StatusCode, errors.New("url-service error: " + msg)
	}

	var rr resolveResp
	if err := json.NewDecoder(resp.Body).Decode(&rr); err != nil {
		return "", resp.StatusCode, err
	}
	if !isHTTPURL(rr.LongURL) {
		return "", resp.StatusCode, errors.New("invalid long_url from url-service")
	}
	return rr.LongURL, resp.StatusCode, nil
}

// logf emits a single JSON line to stdout.
// Schema is consistent across all platform services so Loki can query
// across services with a single LogQL expression.
func logger(_ Config) func(level, msg string, fields map[string]interface{}) {
	return func(level, msg string, fields map[string]interface{}) {
		payload := map[string]interface{}{
			"timestamp": time.Now().UTC().Format("2006-01-02T15:04:05.000Z"),
			"level":     level,
			"service":   "redirect-service",
			"msg":       msg,
		}
		for k, v := range fields {
			payload[k] = v
		}
		b, _ := json.Marshal(payload)
		fmt.Fprintln(os.Stdout, string(b))
	}
}

type analyticsEvent struct {
	Code      string `json:"code"`
	TS        int64  `json:"ts,omitempty"`
	UserAgent string `json:"user_agent,omitempty"`
	Referrer  string `json:"referrer,omitempty"`
	RequestID string `json:"request_id,omitempty"`
}

type analyticsSink struct {
	baseURL string
	client  *http.Client
	logf    func(level, msg string, fields map[string]interface{})

	ch   chan analyticsEvent
	wg   sync.WaitGroup
	once sync.Once
}

func newAnalyticsSink(cfg Config, logf func(level, msg string, fields map[string]interface{}), transport http.RoundTripper) *analyticsSink {
	if transport == nil {
		transport = http.DefaultTransport
	}
	return &analyticsSink{
		baseURL: strings.TrimRight(cfg.AnalyticsBaseURL, "/"),
		client:  &http.Client{Timeout: cfg.AnalyticsTimeout, Transport: transport},
		logf:    logf,
		ch:      make(chan analyticsEvent, cfg.AnalyticsQueueLen),
	}
}

func (s *analyticsSink) Start(ctx context.Context) {
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		for {
			select {
			case <-ctx.Done():
				return
			case evt, ok := <-s.ch:
				if !ok {
					return
				}
				s.post(evt)
			}
		}
	}()
}

func (s *analyticsSink) Stop() {
	s.once.Do(func() {
		close(s.ch)
	})
	s.wg.Wait()
}

func (s *analyticsSink) Enqueue(evt analyticsEvent) bool {
	select {
	case s.ch <- evt:
		return true
	default:
		// Queue full; drop to protect redirect latency.
		return false
	}
}

func (s *analyticsSink) post(evt analyticsEvent) {
	body, _ := json.Marshal(evt)
	req, err := http.NewRequest(http.MethodPost, s.baseURL+"/events", bytes.NewReader(body))
	if err != nil {
		s.logf("error", "analytics request build failed", map[string]interface{}{"err": err.Error(), "request_id": evt.RequestID})
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	// Propagate request id to analytics-service.
	if evt.RequestID != "" {
		req.Header.Set(RequestIDHeader, evt.RequestID)
	}

	resp, err := s.client.Do(req)
	if err != nil {
		s.logf("error", "analytics post failed", map[string]interface{}{"err": err.Error(), "request_id": evt.RequestID})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		s.logf("error", "analytics non-2xx", map[string]interface{}{
			"status": resp.StatusCode,
			"body":   strings.TrimSpace(string(b)),
			"request_id": evt.RequestID,
		})
	}
}

type healthResponse struct {
	Status    string `json:"status"`
	Service   string `json:"service"`
	Version   string `json:"version"`
	Commit    string `json:"commit"`
	Env       string `json:"env"`
	StartedAt string `json:"started_at"`
}

var startedAt = time.Now().UTC().Format(time.RFC3339Nano)

var buildInfo = map[string]string{
	"service": "redirect-service",
	"version": getenvOrUnknown("APP_VERSION"),
	"commit":  getenvOrUnknown("GIT_SHA"),
	"env":     getenvOrUnknown("APP_ENV"),
}

func getenvOrUnknown(key string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return "unknown"
}

func main() {
	cfg, err := loadConfig()
	if err != nil {
		fmt.Fprintf(os.Stderr, "config error: %v\n", err)
		os.Exit(1)
	}

	logf := logger(cfg)

	// Graceful shutdown context
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	// Initialise OTel tracing. OTEL_EXPORTER_OTLP_ENDPOINT must be set for
	// tracing to be active — if unset the call is a no-op and all OTel API
	// calls become no-ops, so the service runs normally without a collector.
	shutdownTracing, err := initTracing(ctx)
	if err != nil {
		logf("error", "tracing init failed", map[string]interface{}{"err": err.Error()})
		os.Exit(1)
	}
	defer func() {
		if err := shutdownTracing(context.Background()); err != nil {
			logf("error", "tracing shutdown failed", map[string]interface{}{"err": err.Error()})
		}
	}()

	// Wrap HTTP transport with OTel instrumentation so outbound calls to
	// url-service and analytics-service automatically inject the traceparent
	// header and create child spans.
	resolveClient := &http.Client{
		Timeout:   1500 * time.Millisecond,
		Transport: otelhttp.NewTransport(http.DefaultTransport),
	}

	// Start analytics sink worker (bounded queue).
	// Pass the same OTel transport so analytics POST requests also carry
	// the traceparent header and appear as child spans in the trace.
	sink := newAnalyticsSink(cfg, logf, otelhttp.NewTransport(http.DefaultTransport))
	sink.Start(ctx)

	mux := http.NewServeMux()

	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method_not_allowed", http.StatusMethodNotAllowed)
			return
		}
		writeJSON(w, http.StatusOK, healthResponse{
			Status:    "ok",
			Service:   buildInfo["service"],
			Version:   buildInfo["version"],
			Commit:    buildInfo["commit"],
			Env:       buildInfo["env"],
			StartedAt: startedAt,
		})
	})

	mux.HandleFunc("/ready", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method_not_allowed", http.StatusMethodNotAllowed)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ready"})
	})

	// Redirect handler: /r/{code}
	mux.HandleFunc("/r/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.Error(w, "method_not_allowed", http.StatusMethodNotAllowed)
			return
		}

		rid := requestIDFromContext(r.Context())

		code := strings.TrimSpace(strings.TrimPrefix(r.URL.Path, "/r/"))
		if code == "" || len(code) > 64 {
			http.Error(w, "invalid_code", http.StatusBadRequest)
			return
		}

		dest, status, err := resolveLongURL(resolveClient, cfg.BaseURL, code, rid)
		if err != nil {
			logf("error", "resolve failed", map[string]interface{}{
				"code":   code,
				"status": status,
				"err":    err.Error(),
				"request_id": rid,
			})
			http.Error(w, "bad_gateway", http.StatusBadGateway)
			return
		}
		if status == http.StatusNotFound || dest == "" {
			http.Error(w, "not_found", http.StatusNotFound)
			return
		}

		// Emit analytics event asynchronously (best-effort).
		ref := strings.TrimSpace(r.Referer())
		evt := analyticsEvent{
			Code:      code,
			TS:        time.Now().Unix(),
			UserAgent: r.UserAgent(),
			RequestID: rid,
		}
		if isHTTPURL(ref) {
			evt.Referrer = ref
		}
		if ok := sink.Enqueue(evt); !ok {
			logf("error", "analytics queue full (event dropped)", map[string]interface{}{
				"code": code,
				"request_id": rid,
			})
		}

		logf("info", "redirect", map[string]interface{}{
			"code": code,
			"to":   dest,
			"ua":   r.UserAgent(),
			"request_id": rid,
		})

		http.Redirect(w, r, dest, http.StatusFound)
	})

	// Default 404 with minimal info (don’t leak).
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "not_found", http.StatusNotFound)
	})

	// Expose Prometheus metrics. Registered directly on the mux so it bypasses
	// withMetrics to avoid recording observations about the scrape itself.
	mux.Handle("/metrics", promhttp.Handler())

	// otelhttp.NewHandler wraps the entire handler chain to create a root span
	// for every inbound request and extract the traceparent header if present.
	// WithFilter excludes paths listed in OTEL_GO_EXCLUDED_URLS (comma-separated)
	// from span creation — consistent with OTEL_NODE_EXCLUDED_URLS and
	// OTEL_PYTHON_FASTAPI_EXCLUDED_URLS used by the other services.
	excludedPaths := map[string]struct{}{}
	for _, p := range strings.Split(os.Getenv("OTEL_GO_EXCLUDED_URLS"), ",") {
		if t := strings.TrimSpace(p); t != "" {
			excludedPaths["/"+strings.TrimPrefix(t, "/")] = struct{}{}
		}
	}
	probeFilter := otelhttp.WithFilter(func(r *http.Request) bool {
		_, excluded := excludedPaths[r.URL.Path]
		return !excluded
	})
	handler := otelhttp.NewHandler(
		withRequestID(
			withMetrics(
				withRequestLogging(mux, logf),
			),
		),
		"redirect-service",
		probeFilter,
	)

	srv := &http.Server{
		Addr:              cfg.Host + ":" + strconv.Itoa(cfg.Port),
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	go func() {
		logf("info", "redirect-service started", map[string]interface{}{
			"host": cfg.Host,
			"port": cfg.Port,
		})
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logf("error", "server failed", map[string]interface{}{"err": err.Error()})
			os.Exit(1)
		}
	}()

	<-ctx.Done()
	logf("info", "shutdown signal received", nil)

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_ = srv.Shutdown(shutdownCtx)
	sink.Stop()

	logf("info", "server stopped", nil)
}

func withMetrics(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Skip recording metrics for the /metrics endpoint itself.
		if r.URL.Path == "/metrics" {
			next.ServeHTTP(w, r)
			return
		}

		start := time.Now()
		ww := &statusWriter{ResponseWriter: w, status: 200}
		next.ServeHTTP(ww, r)

		duration := time.Since(start).Seconds()
		// Normalise route: collapse /r/<code> to /r/{code} to avoid high cardinality.
		// Anything else that doesn't match a known route is collapsed to "unknown"
		// to prevent bot/scanner paths from creating unbounded label cardinality.
		route := "unknown"
		switch {
		case r.URL.Path == "/health":
			route = "/health"
		case r.URL.Path == "/ready":
			route = "/ready"
		case len(r.URL.Path) > 3 && r.URL.Path[:3] == "/r/":
			route = "/r/{code}"
		}
		statusStr := strconv.Itoa(ww.status)

		httpRequestsTotal.WithLabelValues(r.Method, route, statusStr).Inc()
		httpRequestDurationSeconds.WithLabelValues(r.Method, route, statusStr).Observe(duration)
	})
}

func withRequestLogging(next http.Handler, logf func(level, msg string, fields map[string]interface{})) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		ww := &statusWriter{ResponseWriter: w, status: 200}

		next.ServeHTTP(ww, r)

		logf("info", "request", map[string]interface{}{
			"method": r.Method,
			"path":   r.URL.Path,
			"status": ww.status,
			"ms":     time.Since(start).Milliseconds(),
			"request_id": requestIDFromContext(r.Context()),
		})
	})
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(code int) {
	w.status = code
	w.ResponseWriter.WriteHeader(code)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
