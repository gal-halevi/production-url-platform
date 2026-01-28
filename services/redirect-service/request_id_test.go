package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRequestIDUsesIncoming(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.Header.Set(RequestIDHeader, "demo-123")

	id := getOrCreateRequestID(r)
	if id != "demo-123" {
		t.Fatalf("expected demo-123, got %s", id)
	}
}

func TestRequestIDGeneratesWhenMissing(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/", nil)

	id := getOrCreateRequestID(r)
	if id == "" {
		t.Fatal("expected generated request id")
	}
}

func TestMiddlewareEchoesHeader(t *testing.T) {
	handler := withRequestID(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := requestIDFromContext(r.Context())
		if id == "" {
			t.Fatal("missing request id in context")
		}
	}))

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set(RequestIDHeader, "demo-456")

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Header().Get(RequestIDHeader) != "demo-456" {
		t.Fatalf("expected header to be echoed")
	}
}
