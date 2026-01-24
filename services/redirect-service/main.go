package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"
)

type Config struct {
	Host        string
	Port        int
	BaseURL     string
	DefaultDest string
	LogJSON     bool
}

func loadConfig() (Config, error) {
	host := getenv("HOST", "0.0.0.0")
	portStr := getenv("PORT", "8080")
	port, err := strconv.Atoi(portStr)
	if err != nil || port <= 0 || port > 65535 {
		return Config{}, errors.New("invalid PORT")
	}

	// For future use (when this service calls url-service).
	baseURL := getenv("URL_SERVICE_BASE_URL", "http://url-service:3000")

	// For now we redirect to a fixed destination (until we wire url-service).
	defaultDest := getenv("DEFAULT_REDIRECT_URL", "https://example.com")
	if !isHTTPURL(defaultDest) {
		return Config{}, errors.New("DEFAULT_REDIRECT_URL must be http/https URL")
	}

	logJSON := getenv("LOG_JSON", "false") == "true"

	return Config{
		Host:        host,
		Port:        port,
		BaseURL:     baseURL,
		DefaultDest: defaultDest,
		LogJSON:     logJSON,
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

func main() {
	cfg, err := loadConfig()
	if err != nil {
		log.Fatalf("config error: %v", err)
	}

	logf := logger(cfg)

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
		// Readiness is trivial right now (no dependencies).
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

		code := strings.TrimPrefix(r.URL.Path, "/r/")
		code = strings.TrimSpace(code)

		if code == "" || len(code) > 64 {
			http.Error(w, "invalid_code", http.StatusBadRequest)
			return
		}

		// For this milestone, always redirect to a fixed destination.
		// Next milestone: fetch destination from url-service and record analytics.
		dest := cfg.DefaultDest

		logf("info", "redirect", map[string]interface{}{
			"code": code,
			"to":   dest,
			"ua":   r.UserAgent(),
		})

		http.Redirect(w, r, dest, http.StatusFound)
	})

	// Default 404 with minimal info (don’t leak).
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "not_found", http.StatusNotFound)
	})

	// Wrap with basic request logging + timeouts.
	srv := &http.Server{
		Addr:              cfg.Host + ":" + strconv.Itoa(cfg.Port),
		Handler:           withRequestLogging(mux, logf),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	// Graceful shutdown
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

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
	logf("info", "server stopped", nil)
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
