# 0008 — Client-generated ids, an offline outbox, no FKs between telemetry tables

- **Status:** Accepted
- **Date:** 2026-09-13

## Context

Sip the Tea is played at parties, in basements and on trains. Requests fail.
Pages are killed from the background without warning. Rows from one page
arrive over separate requests, in any order, sometimes days later. The anon
key can only insert, never read back.

## Decision

1. **Every telemetry row's primary key is generated on the client** (UUIDs,
   or `impression_id` for the one-exit-per-impression table). A retry of a row
   that actually arrived fails with a unique violation, which PostgREST
   returns as **409**. The client treats 409 as delivered. No upsert
   privileges are needed.
2. **An outbox** (`src/telemetry/outbox.ts`) queues rows in memory, mirrors
   them to localStorage, and retries on transient failures (network, 408, 429,
   5xx) with backoff, when the browser comes back online, and on the next
   visit. It is bounded (1,000 rows, 14 days). A row the database rejects
   outright is isolated from its batch and dropped, never retried forever.
3. **Urgent sends** (a page hide, `pagehide`) flush immediately with
   `fetch(..., { keepalive: true })` in small batches.
4. **No foreign keys between telemetry tables.** An exit arriving before its
   impression is real data, not an integrity violation. Integrity is checked
   after the fact by `research_impressions` (inferred exits) and
   `admin_telemetry_health()` (orphans, superseded exits, draws missing a
   probability). Lookup FKs that never race (`exit_actions`) are kept.
5. **Pages that die silently** leave impressions without exits. The research
   view infers `background` when the last visibility event was `hidden`, and
   `session_abandoned` otherwise, and labels the row with `exit_source`.

## Consequences

- Duplicate delivery is harmless, and loss is bounded to rows a device never
  got to send before its storage was cleared.
- Two tabs share one localStorage outbox key, and the last writer wins. A row
  can be lost from storage (not from memory) if two tabs play at once and one
  is closed before flushing. That's accepted as rare for a party game.
- Referential integrity is a monitored property, not an enforced one.

## Alternatives considered

- **`Prefer: resolution=ignore-duplicates`.** Would also work, but ties
  correctness to an upsert code path. A plain insert plus 409 is simpler and
  has been verified against the schema in the database suite.
- **`navigator.sendBeacon`.** Can't set the `apikey` / `Authorization`
  headers PostgREST requires. `fetch` with `keepalive` can.
