package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestResolveLongURL_OK(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/urls/abc" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}

		// Verify request-id propagation
		if got := r.Header.Get("X-Request-Id"); got != "req-123" {
			t.Fatalf("expected X-Request-Id=req-123, got %q", got)
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(200)
		_, _ = w.Write([]byte(`{"code":"abc","long_url":"https://example.com"}`))
	}))
	defer ts.Close()

	c := &http.Client{Timeout: 2 * time.Second}
	u, status, err := resolveLongURL(c, ts.URL, "abc", "req-123")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if status != 200 {
		t.Fatalf("expected status 200, got %d", status)
	}
	if u != "https://example.com" {
		t.Fatalf("expected https://example.com, got %s", u)
	}
}

func TestResolveLongURL_NotFound(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(404)
	}))
	defer ts.Close()

	c := &http.Client{Timeout: 2 * time.Second}
	u, status, err := resolveLongURL(c, ts.URL, "missing", "req-404")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if status != 404 {
		t.Fatalf("expected status 404, got %d", status)
	}
	if u != "" {
		t.Fatalf("expected empty url, got %s", u)
	}
}

func TestResolveLongURL_InvalidScheme(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(200)
		_, _ = w.Write([]byte(`{"code":"abc","long_url":"javascript:alert(1)"}`))
	}))
	defer ts.Close()

	c := &http.Client{Timeout: 2 * time.Second}
	_, _, err := resolveLongURL(c, ts.URL, "abc", "req-bad")
	if err == nil {
		t.Fatalf("expected err for invalid scheme")
	}
}
