# 0002 — Permanent question ids, content-derived revision ids

- **Status:** Accepted
- **Date:** 2026-09-13

## Context

Questions already carry permanent ids (`base-001`, `exp-172`) and ratings key
on them, so rewording a question doesn't orphan its feedback. But that
creates the opposite problem for a recommendation engine: when `exp-314` was
reworded, every signal collected about the *old* words silently became a
signal about the *new* words. For thumbs up/down that is tolerable. For a
model learning which wording opens a room up, it is contamination.

Any versioning scheme that relies on an editor remembering to bump a number
will eventually be forgotten.

## Decision

- **Question id:** permanent, never reused, never renumbered. Community
  questions get `com-NNNN`, allocated by the database when a submission is
  accepted as a draft.
- **Revision id:** derived from the wording itself:
  `revisionId = questionId + "@" + sha256(NFC(text))[0:12]`.
  Computed in TypeScript (`src/catalog/revision.ts`) and enforced by a CHECK
  constraint in Postgres (`question_revisions.revision_id_matches_text`). A
  test holds the two formulas identical, and the database suite proves they
  agree on every question in the deck.
- Every impression, feedback row and nomination records **both** ids.
- `CATALOG_VERSION` is a hash of every dealt revision id, recorded on each
  session. That lets any session's candidate set be reconstructed later.

"Different text" means the NFC-normalized string differs at all. Curly vs.
straight quotes are different revisions, and so is trailing whitespace.
Anything looser would need a normalizer that TypeScript and Postgres agree on
forever.

## Consequences

- Nobody maintains revision numbers, and nobody can forget to.
- Analysis chooses its level: per revision (what exactly was said) or per
  question (the idea, across wordings).
- A typo fix creates a new revision. Analysis that wants to pool trivially
  different wordings must decide to do so explicitly.
- 48 bits of hash per question id. A collision would need two wordings of the
  same question to collide, which is not a realistic concern.

## Alternatives considered

- **Manual `version: 3` fields.** Rejected: relies on memory. It would have
  been wrong within a month.
- **Full 64-char hashes.** Rejected: unwieldy in ids and URLs, and adds
  nothing at this scale.
- **Store the text on every impression.** Rejected: redundant, large, and
  still needs a stable key to group by.
