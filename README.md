# Longbridge Research OS

**Cross-market CN / HK / US financial research terminal for portfolio analytics, risk monitoring and longitudinal research tracking.**

Longbridge Research OS combines market data, fundamentals, portfolio state and research evidence into one local-first research workflow. The development system has accumulated **424 immutable research Runs**, **97 Editions** and approximately **2.08 GB** of persisted research evidence. A session-history I/O redesign reduced first-screen latency from roughly **9.8 seconds to sub-second** on that corpus.

## Core capabilities

- CN / HK / US market-aware research workflows
- Portfolio allocation, exposure and risk analytics
- Research-session tracking and longitudinal evaluation
- Immutable research evidence and versioned research outputs
- Explicit timezone / session semantics across Shanghai, Hong Kong and New York
- Read-only financial-data acquisition with bounded concurrency and provenance-aware timestamps

## Open engineering modules

This repository contains runnable modules from the system that demonstrate its cross-market infrastructure and implementation quality:

```text
src/
  calendar.ts       CN/HK/US market sessions, DST and publish-window semantics
  time.ts           provenance-aware timestamp normalization
  concurrency.ts    bounded asynchronous task orchestration
  *.test.ts         regression tests for the modules above
```

The calendar module handles exchange-local time and DST explicitly, including New York winter/summer offsets and injectable authoritative holiday/half-day calendars.

## Quick start

```bash
npm install
npm run typecheck
npm test
```

## Engineering approach

```text
market data → explicit time semantics → normalized research facts
            → portfolio/risk analysis → versioned research evidence
            → longitudinal review
```

The system is designed to preserve data provenance and market-specific semantics while keeping the interactive research surface fast enough for daily use.
