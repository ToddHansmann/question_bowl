# 0009 — Feature flags

- **Status:** Accepted
- **Date:** 2026-09-13

## Context

This foundation adds behavior that must be switchable: telemetry itself, the
nomination star, onboarding, and future-facing pieces that must stay off
(experimental questions, a skip gesture). The player path has no server read
before the first card, and adding one for flags would slow every session.

## Decision

`src/flags.ts`: a typed list of flags with defaults, resolved once at load:

1. `FLAG_DEFAULTS`
2. build: `VITE_FLAGS="experimentalQuestions,-onboarding"`
3. device: `?qbflags=name,-name` (persisted to localStorage; `?qbflags=reset` clears)

| Flag | Default | Purpose |
|---|---|---|
| `telemetry` | on | Record impressions, exits, dwell, context, nominations |
| `telemetryOutbox` | on | Persist undelivered rows and retry later |
| `bestConversation` | on | The nomination star |
| `onboarding` | on | One-time welcome |
| `experimentalQuestions` | **off** | Deal `experimental` community questions |
| `skipGesture` | **off** | Swipe up = `skip` exit |
| `telemetryDebug` | off | Mirror rows to console and `window.__sttTelemetry` |

Every session records its resolved flags in `play_sessions.flags`, so data
from different product configurations is never pooled by accident.

## Consequences

- Turning a flag off for everyone takes a redeploy with `VITE_FLAGS`, which is
  minutes on Vercel. That's acceptable at current scale.
- Flags never change mid-session.
- None of these flags guards anything security-relevant. A curious player can
  flip their own device.

## Alternatives considered

- **A remote flag service.** Rejected for now: a network dependency in front
  of the first card. Revisit when experiments need per-session random
  assignment controlled from a server. `experiment_id` / `experiment_arm` are
  already recorded.
