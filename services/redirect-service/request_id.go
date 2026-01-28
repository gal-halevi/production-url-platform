package main

import (
	"context"
	"net/http"

	"github.com/google/uuid"
)

type ctxKeyRequestID struct{}

const RequestIDHeader = "X-Request-Id"

func getOrCreateRequestID(r *http.Request) string {
	if v := r.Header.Get(RequestIDHeader); v != "" && len(v) <= 128 {
		return v
	}
	return uuid.NewString()
}

func withRequestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reqID := getOrCreateRequestID(r)

		// store in context
		ctx := context.WithValue(r.Context(), ctxKeyRequestID{}, reqID)

		// echo header back
		w.Header().Set(RequestIDHeader, reqID)

		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func requestIDFromContext(ctx context.Context) string {
	if v, ok := ctx.Value(ctxKeyRequestID{}).(string); ok {
		return v
	}
	return ""
}
