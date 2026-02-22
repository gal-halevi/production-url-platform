# Changelog

## [0.3.0](https://github.com/gal-halevi/production-url-platform/compare/url-service-v0.2.0...url-service-v0.3.0) (2026-02-22)


### Features

* **metrics:** add 1ms histogram bucket for latency SLO testing ([#67](https://github.com/gal-halevi/production-url-platform/issues/67)) ([9f17799](https://github.com/gal-halevi/production-url-platform/commit/9f17799ec829e1e5944b412a54591e2dcfb7e8a3))
* **url-service:** add build metadata and APP_ENV runtime config ([#49](https://github.com/gal-halevi/production-url-platform/issues/49)) ([0e003ae](https://github.com/gal-halevi/production-url-platform/commit/0e003ae00f557be153a3b1c85cf7d21043e84238))
* **url-service:** add Prometheus metrics and HTTP instrumentation ([#58](https://github.com/gal-halevi/production-url-platform/issues/58)) ([b008313](https://github.com/gal-halevi/production-url-platform/commit/b0083135d31591e14beaa1596fdbc47fb3b73a63))


### Bug Fixes

* **url-service:** exclude health/ready/metrics from rate limit and preserve original HTTP status codes ([#65](https://github.com/gal-halevi/production-url-platform/issues/65)) ([0c90989](https://github.com/gal-halevi/production-url-platform/commit/0c9098916939e6b4c903721b6907b4c911d02bbe))

## [0.2.0](https://github.com/gal-halevi/production-url-platform/compare/url-service-v0.1.0...url-service-v0.2.0) (2026-01-28)


### Features

* add url-service ([c7540e7](https://github.com/gal-halevi/production-url-platform/commit/c7540e73178a66710b716e55c4f1d16c59d9ecc5))
* containerize url-service ([d0fbc06](https://github.com/gal-halevi/production-url-platform/commit/d0fbc060b1c9feb566a2d04532551f8b61701a22))
* resolve redirects via url-service ([7d2eb7a](https://github.com/gal-halevi/production-url-platform/commit/7d2eb7af6dbdefeee314dd602f3e5b02ce64531d))
