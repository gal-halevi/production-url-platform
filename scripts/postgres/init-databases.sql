-- Creates all application databases on first postgres initialization.
-- Runs automatically via docker-entrypoint-initdb.d on fresh volumes only.
CREATE DATABASE url_platform_urls;
CREATE DATABASE url_platform_analytics;
