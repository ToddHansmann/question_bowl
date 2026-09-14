# Architecture Decision Records

Each record captures one decision that shapes Sip the Tea for years: the
context, what was decided, and what it costs. Records are immutable once
accepted. To change a decision, write a new record that supersedes the old
one and mark the old one `Superseded by NNNN`.

**Start with ADR-000.** It is the product doctrine every other record serves.

| # | Decision | Status |
|---|---|---|
| [0000](0000-measures-conversations-not-engagement.md) | **Sip the Tea measures conversations, not engagement** | Accepted, doctrine |
| [0001](0001-dedicated-telemetry-tables.md) | Recommendation telemetry lives in dedicated, normalized tables, not `analytics_events` | Accepted |
| [0002](0002-question-identity-and-revisions.md) | Permanent question ids, content-derived revision ids | Accepted |
| [0003](0003-recommendation-framework.md) | Policy / generator / ranker / arc interfaces with exact selection probabilities | Accepted |
| [0004](0004-uniform-random-baseline.md) | The uniform random shuffle is the permanent baseline | Accepted |
| [0005](0005-question-tag-scheme.md) | Manual, versioned, per-revision question tags | Accepted |
| [0006](0006-community-question-lifecycle.md) | Draft → Experimental → Canon → Archived, editorial only | Accepted |
| [0007](0007-best-conversation-nomination.md) | One "best conversation" nomination per session instead of an end-of-session prompt | Accepted |
| [0008](0008-client-ids-outbox-and-no-foreign-keys.md) | Client-generated ids, an offline outbox, and no FKs between telemetry tables | Accepted |
| [0009](0009-feature-flags.md) | Build- and device-level feature flags, no remote flag service | Accepted |

Template: Context → Decision → Consequences → Alternatives considered.
