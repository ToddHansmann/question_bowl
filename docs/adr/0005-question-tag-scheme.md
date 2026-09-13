# 0005 — Manual, versioned, per-revision question tags

- **Status:** Accepted
- **Date:** 2026-09-13

## Context

A recommendation engine for conversations can't reason about 400 opaque ids.
It needs to know that a question is light, safe with strangers, and
story-shaped, so rules like "open with low-risk, low-depth questions" can
exist, and so learning can generalize to questions it has barely seen.

Tags could be generated. They won't be: a tag is an editorial claim about what
a question *is*, and generated tags would silently become ground truth that
nobody decided.

## Decision

- Seven initial dimensions (`src/catalog/tags.ts`): **depth, spice, energy,
  format, familiarity_required, group_size_fit, risk**. Ordinal dimensions
  are ordered low → high; `group_size_fit` is a set; `format` is an enum.
- **Manual only.** Written by a person in `src/catalog/questionTags.ts`. No
  generation, no inference from wording, no learning from play data.
- **Stored as value keys, never ranks,** so a scale can gain a step without
  rewriting history.
- **Per revision.** The database records tag decisions against the revision
  they were made for (`question_tag_assignments`, append-only). Rewording a
  question prompts a re-tag, and history stays honest either way.
- **Versioned scheme.** Dimensions and values are never renamed or re-meant.
  Add new ones and bump `TAG_SCHEME_VERSION`. Removing a value means marking
  it deprecated.
- **Unknown is not low.** An untagged dimension is unknown, and policies must
  treat it as such.
- The code is the authority. The admin **Sync this build** button registers
  the scheme and tags with the database; the database validates every value.

## Consequences

- Tagging ~430 questions is real editorial work. It ships empty and is filled
  in over time; the admin dashboard shows coverage.
- Tags and learned performance are kept apart: tags describe, telemetry
  measures. Either can change without contaminating the other.
- An admin tagging UI that writes `source = 'admin'` assignments can come
  later without schema change.

## Alternatives considered

- **Tags per question id, not revision.** Rejected: a reworded dare can move
  from `risk: medium` to `risk: high`, and the old telemetry was collected
  under the old risk.
- **Free-form labels.** Rejected: unqueryable and inconsistent within weeks.
