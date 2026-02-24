package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
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
)

type Config struct {
	Host    string
	Port    int
	BaseURL string
	LogJSON bool

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

	logJSON := getenv("LOG_JSON", "false") == "true"

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
		LogJSON:  logJSON,

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

type logLine struct {
	Level     string                 `json:"level"`
	Msg       string                 `json:"msg"`
	Timestamp string                 `json:"ts"`
	Fields    map[string]interface{} `json:"fields,omitempty"`
}

func logger(cfg Config) func(level, msg string, fields map[string]interface{}) {
	if !cfg.LogJSON {
		return func(level, msg string, fields map[string]interface{}) {
			if len(fields) == 0 {
				log.Printf("[%s] %s", level, msg)
				return
			}
			log.Printf("[%s] %s %v", level, msg, fields)
		}
	}

	return func(level, msg string, fields map[string]interface{}) {
		ll := logLine{
			Level:     level,
			Msg:       msg,
			Timestamp: time.Now().UTC().Format(time.RFC3339Nano),
			Fields:    fields,
		}
		b, _ := json.Marshal(ll)
		log.Print(string(b))
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

func newAnalyticsSink(cfg Config, logf func(level, msg string, fields map[string]interface{})) *analyticsSink {
	return &analyticsSink{
		baseURL: strings.TrimRight(cfg.AnalyticsBaseURL, "/"),
		client:  &http.Client{Timeout: cfg.AnalyticsTimeout},
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
		s.logf("error", "analytics request build failed", map[string]interface{}{"err": err.Error(), "rid": evt.RequestID})
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
		s.logf("error", "analytics post failed", map[string]interface{}{"err": err.Error(), "rid": evt.RequestID})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		s.logf("error", "analytics non-2xx", map[string]interface{}{
			"status": resp.StatusCode,
			"body":   strings.TrimSpace(string(b)),
			"rid":    evt.RequestID,
		})
	}
}

func main() {
	cfg, err := loadConfig()
	if err != nil {
		log.Fatalf("config error: %v", err)
	}

	logf := logger(cfg)
	resolveClient := &http.Client{Timeout: 1500 * time.Millisecond}

	// Graceful shutdown context
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	// Start analytics sink worker (bounded queue)
	sink := newAnalyticsSink(cfg, logf)
	sink.Start(ctx)

	mux := http.NewServeMux()

	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method_not_allowed", http.StatusMethodNotAllowed)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{
			"status":  "ok",
			"service": "redirect-service",
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
				"rid":    rid,
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
				"rid":  rid,
			})
		}

		logf("info", "redirect", map[string]interface{}{
			"code": code,
			"to":   dest,
			"ua":   r.UserAgent(),
			"rid":  rid,
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

	handler := withRequestID(
		withMetrics(
			withRequestLogging(mux, logf),
		),
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
			"rid":    requestIDFromContext(r.Context()),
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
