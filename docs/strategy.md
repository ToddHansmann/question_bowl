# Sip the Tea: Strategy

> A living document. Edit it as the product evolves. When a decision here
> changes, don't delete the old reasoning: record the change in the
> **Decision log** at the bottom.

**Last updated:** 2026-09-14

---

## 1. Vision

**Sip the Tea is becoming the world's best recommendation engine for
meaningful in-person conversations.**

The question library is not the product. The product is *learning*:

- which questions work,
- for which groups,
- at what point in a conversation,
- under what circumstances.

Over time the system becomes a living map of how people connect through
conversation. Players experience that as a game that keeps getting better,
because people keep having great conversations.

### What we are not building

- The world's largest library of questions.
- A feed, a leaderboard, or a social network.
- A product that wants your attention on the screen.

---

## 2. The objective

We want **meaningful conversations** *and* **engagement**. These two agree at
one level and fight at another, so the order matters.

| Level | Relationship | Consequence |
|---|---|---|
| **One card** | They fight. A question that starts a 20-minute conversation produces one card view and a long pause. A dull one produces a fast swipe and another card. | Never optimize any per-card or per-session interaction count. |
| **A group over time** | They agree. A group that had a great night comes back. | Measure engagement as *return*, not intensity. |

**Primary objective:** conversations the group is glad it had.
**Business check:** groups and devices come back. "Groups" is the intent;
today it can only be measured as `device_id` returning, since there is no
group identity yet (Q5) — a gap between intent and measurement, not a
redefinition of the objective. Storage mechanics behind that gap are covered
in [telemetry-spec.md](telemetry-spec.md#identity-and-privacy), not here.
**Never success metrics:** cards viewed, time in app, votes cast, taps,
session length.

### Three kinds of preference

"What people genuinely want to ask one another" hides three different things:

1. **Stated:** what people upvote while browsing.
2. **Revealed:** what they don't skip during play.
3. **Reflective:** what they're glad they talked about afterward.

Crowd voting measures the first. **Sip the Tea lives or dies on the third.**
The best-conversation nomination is our first direct reflective signal.

---

## 3. Architectural doctrine

These principles are binding. Changing one requires an ADR that argues
against it explicitly. The product-level doctrine they serve is
[ADR-000: Sip the Tea Measures Conversations, Not Engagement](adr/0000-measures-conversations-not-engagement.md).

1. **The unit of value is a conversation, not a card.**
2. **The app will eventually recommend conversation arcs rather than
   individual questions.**
3. **Every question exists within context. There is no global question score.**
4. **Collect raw events. Never store derived scores.** (ADR-000 principle 5.)
5. **Recommendation systems will change repeatedly. Telemetry should never
   need redesign.**
6. **The random shuffle is the permanent baseline.** Every future engine must
   be measurable against it.
7. **Question ids are permanent. Wording is versioned. Edits create
   revisions.** Historical data is never contaminated.
8. **Prefer future flexibility over short-term convenience.**

### Supporting principles

9. **Constraints before optimization.** Consent, packs, and the group's own
   ceilings decide eligibility. Nothing learned can reach past them.
10. **Exact selection probabilities, always logged.** It is the price of being
    able to evaluate tomorrow's idea on today's data.
11. **Promotion is editorial, never automatic.**
12. **Tags are written by people.** Tags describe; telemetry measures.
13. **The group sets the ceiling; the engine chooses within it.** No policy
    may escalate spice or depth beyond what the table chose.
14. **Privacy is structural.** No accounts to play. Anonymous device and
    session ids. Nothing identifying inferred from what packs people play.
    Group memory, when it comes, is opt-in and local-first.
15. **Pair every metric with a counter-metric.** When engagement rises,
    check spice share, risk share and skips before celebrating.

---

## 4. Product philosophy (user experience)

Every UX decision reinforces:

- Sip the Tea is a **living conversation game**.
- The game **evolves through the people who play it**.
- **Great conversations shape tomorrow's questions.**
- **Community participation improves the experience for everyone.**
- It exists to **create meaningful conversations**, not maximize screen time.

### Language rules

- Describe the **human benefit**, never the mechanism.
- **Never** mention algorithms, recommendation engines, telemetry, analytics,
  AI or machine learning in anything a player sees.
- Players should feel the game is getting smarter *because people keep
  having great conversations*, not because software is collecting data.
- Warm, brief, optimistic. Nothing that reads like a settings page.

### Current copy (canonical)

| Surface | Copy |
|---|---|
| Home, beneath *Answer out loud.* | Discover what people are really curious about. |
| First-launch welcome | This isn't a static deck. · The best questions stay. · New questions come from the community. · Every game helps shape what comes next. · *Welcome to a conversation that's always evolving.* · **Let's Play** |
| Best conversation | ★ · *Tonight's best conversation* |
| About | Began around a dinner table… players suggest new questions, help surface the best ones, and build a living collection of conversations worth having. |

---

## 5. Where the model adds value and where it takes it away

### It becomes more valuable through

- **Replay value.** Fresh, tested questions solve the core retention problem
  of party decks: running out.
- **Contexts editors can't write for alone.** First dates, families, teams,
  cultures, languages.
- **Knowing what works where.** That knowledge is the moat; the questions are
  copyable.
- **Contributor pride.** Seeing "your" question played.
- **Private group memory** (later, opt-in).

### It becomes less valuable through

- **Averaged taste.** Crowds pull toward safe, familiar, meme-shaped
  questions. The brand is a voice.
- **Lost host trust.** One bad card in front of the wrong room ends the night
  and the word of mouth.
- **Voters ≠ players.** Browsing rewards what's clever to read; play rewards
  what works out loud.
- **Moderation cost** that grows with submissions, alongside intimate packs
  and possible minors.
- **Rights problems.** Questions copied from commercial decks.
- **Cheap generated submissions.** Curation and testing become the scarce
  work, not writing.

---

## 6. Failure modes we design against

| Failure mode | Defense in the architecture |
|---|---|
| **Rich get richer**: early winners crowd out new questions | Exact probabilities, exploration budget for experimental questions (Stage 3), permanent random holdout |
| **Retiring the deep questions**: a thumbs-down often means "not for this room tonight" | No global score; thumbs are one noisy, reader-biased signal; retirement is editorial |
| **Escalation ratchet**: spice gets shared, so the next must top it | Group-set ceilings as hard constraints; spice-share counter-metric; shares never used as an objective |
| **One global ranking** | Context snapshots on every impression; rank within context |
| **Questions as weapons**: aimed at one person, harassment | Editorial review of every community question; no auto-promotion; private in-jokes belong in private decks, not the public library |
| **Gaming and brigading** | No public voting; promotion by editors |
| **Near-duplicate flood** | *Duplicate…* decision in review; ids never reused |
| **Dashboard Goodhart**: "Least liked" becomes a kill list | Data health presented as pipeline checks; outcome definitions written down before optimizing |
| **Contaminated history from rewording** | Content-derived revision ids |
| **Identity inference from sensitive packs** | No accounts, anonymous ids, no identity joins, local-first group memory |
| **Cold start**: too little data for community signals | Stage gates based on evidence; rules over tags before learning |
| **Pipeline silently breaking** | Data health: superseded exits, orphaned impressions, missing probabilities, reported-exit rate |

---

## 7. Signals

### Most important
1. **Best-conversation nominations**: reflective, scarce (one per session).
2. **Return**: the same device starting another session later.
3. **Card impressions with context and exact probability**: the foundation
   everything else is interpreted against.
4. **Exit actions**: next vs. back vs. skip vs. pool emptied vs.
   background/abandoned.
5. **Dwell, interpreted with visibility and exit**: visible vs. obscured vs.
   hidden time.
6. **Mid-session corrections**: pack changes, and later skips and rerolls.
7. **Sequence**: which orderings of the same questions produce better nights.

### Less important
- **Thumbs up/down**: one feature among many; sparse, reader-biased,
  context-dependent.
- **Submission volume, library size**: coverage matters, count doesn't.

### Never objectives
- Cards per session, time in app, taps, votes, shares.

---

## 8. Data model at a glance

- **Identity:** `question_catalog` (permanent ids) → `question_revisions`
  (wording, id = hash of text) → `question_tag_assignments` (manual tags per
  revision).
- **Editorial:** `question_suggestions` (raw) → `submission_reviews` →
  `question_lifecycle_events` (draft → experimental → canon → archived).
- **Play:** `play_sessions` → `context_snapshots` → `card_impressions` →
  `card_visibility_events` / `card_exits` / `impression_feedback` →
  `conversation_nominations`.
- **Analysis:** `research_impressions`, `research_nominations`,
  `research_sessions` views; `admin_telemetry_health()`.

Full detail: [schema.md](schema.md) · [telemetry-spec.md](telemetry-spec.md) ·
[architecture/recommendation.md](architecture/recommendation.md)

---

## 9. Roadmap

```
Random shuffle → Measured shuffle (now) → Rule-based → Learning engine → Arc engine
```

Each stage adds implementations behind existing contracts, gated by evidence.
Full detail: [roadmap.md](roadmap.md)

**Now (Stage 1):** apply migrations; sync the catalog; tag the deck by hand;
run the editorial loop on real submissions; watch data health; do descriptive
research only.

**Next (Stage 2), when gated:** optional room read; editor-written arc; tag
rules with softmax selection; offline evaluation; ship with a permanent 20%
random holdout.

---

## 10. Open questions

Decisions still to make. Move each to the Decision log once made.

Q1, Q2, Q6 and Q7 were resolved on 2026-09-14 review — see the Decision log.
The remaining open questions are genuinely undecided: nothing in the shipped
architecture implies an answer, and none of them blocks this branch.

| # | Question | Notes |
|---|---|---|
| Q3 | **Outcome definition** for Stage 2 evaluation. | Working draft: "session has a nomination" + "device returns within 14 days" (§10 caveat below). Needs real tagging and session-volume data before it can be finalized — that's the Stage 1 → 2 gate in roadmap.md, not something the architecture alone can settle. |
| Q4 | **Generated question drafts:** may editors use AI to *draft* questions for gaps, provided humans approve? | Tags are manual-only (decided, ADR 0005). Question drafting is an editorial-policy question, not an architectural one — nothing here depends on the answer. |
| Q5 | **Persistent groups:** are opt-in, device-local "tables" in scope? | Big retention upside; biggest privacy surface. No architecture for it exists yet; `ContextSnapshot.dimensions` could hold it later without a schema change, but whether to build it is a product and privacy decision. |
| Q8 | **Contributor credit:** should players ever see "suggested by the community" on a card? | Must not become a leaderboard. Product/UX call; the lifecycle design (ADR 0006) works the same either way. |

### Note on Q3's outcome definition

The candidate outcome ("device returns within 14 days") measures return per
`device_id`, which is what §2's "devices come back" actually tracks — there
is no group identity yet (Q5). On iOS, Safari can clear a page's storage,
`device_id` included, after roughly a week of not visiting the site (an app
added to the home screen is exempt), so a 14-day window will undercount
returning iPhone players who don't re-add the shortcut. This doesn't block
Stage 1; it's a caveat the outcome definition should account for (a shorter
window, or treating iOS Safari separately) when it's finalized at the Stage
1 → 2 gate.

---

## 11. Decision log

| Date | Decision | Where recorded |
|---|---|---|
| 2026-09-13 | Long-term goal: best recommendation engine for in-person conversations, not largest library. | This document §1 |
| 2026-09-13 | Meaningful conversation is the objective; engagement is measured as return; interaction counts are never success metrics. | §2 |
| 2026-09-13 | Eight architectural doctrine principles adopted. | §3 |
| 2026-09-13 | Product doctrine: Sip the Tea measures conversations, not engagement. | ADR-000 |
| 2026-09-13 | Dedicated normalized telemetry tables, separate from `analytics_events`. | ADR 0001 |
| 2026-09-13 | Permanent question ids; content-derived revision ids. | ADR 0002 |
| 2026-09-13 | Recommendation contracts with exact selection probabilities; interfaces only. | ADR 0003 |
| 2026-09-13 | Uniform random is the permanent baseline and future holdout. | ADR 0004 |
| 2026-09-13 | Seven manual tag dimensions, versioned, per revision. No generated tags. | ADR 0005 |
| 2026-09-13 | Community lifecycle Draft → Experimental → Canon → Archived; editorial only; code authoritative for editor-authored, database for community. | ADR 0006 |
| 2026-09-13 | No end-of-session modal; one best-conversation nomination per session. | ADR 0007 |
| 2026-09-13 | Client-generated ids, offline outbox, no FKs between telemetry tables. | ADR 0008 |
| 2026-09-13 | Build/device feature flags; experimental questions and skip gesture off by default. | ADR 0009 |
| 2026-09-13 | User-facing messaging: living conversation game; never mention the technology. | §4 |
| 2026-09-13 | Public voting, leaderboards and contributor profiles are out of scope. | roadmap.md |
| 2026-09-14 | Privacy policy and legal disclosures are a separate product/legal concern, outside the recommendation-foundation architecture review, unless an architectural dependency or implementation blocker is found. | This log |
| 2026-09-14 | ADR-000 principle 4 clarified: gameplay surfaces do not discuss telemetry; any required disclosures belong in a separate Privacy Policy. (Previously read "players are never told the game is collecting data".) | ADR-000 |
| 2026-09-14 | **Q1 resolved:** an optional 1–2 tap room read at session start is acceptable. If skipped, gameplay proceeds with unknown context (`group`/`ceilings` stay `null`). No schema or code change needed now — `ContextSnapshot.group`/`ceilings` and their columns already exist for Stage 2 to fill in. | §10 (was Q1); roadmap.md Stage 2 |
| 2026-09-14 | **Q2 resolved: holdout share is 20%.** No new architectural decision — `docs/strategy.md` §9 and `docs/roadmap.md`'s Stage 2 table already stated 20% as settled fact while this open-questions table listed it as still undecided. This entry closes that documentation inconsistency by recording the number both other places already committed to. | §9; roadmap.md Stage 2 |
| 2026-09-14 | **Q6 resolved: keep the first-card repeat quirk as is.** It is already implemented (`makeBag`'s mount-time reset in `src/App.tsx`, `PassWithoutReplacementGenerator` in `src/recommendation/uniformRandom.ts`), documented as intentional (ADR 0004), and covered by a test (`test/recommendation.test.ts:58`, "the current card stays in the new pass and can come round again later"). Fixing it is a gameplay change with its own tradeoffs (it would need to decide what "seen this pass" means across pool changes) and isn't required by anything in this branch's architecture. Revisit only if it becomes a real player complaint, as its own decision. | ADR 0004; test/recommendation.test.ts |
| 2026-09-14 | **Q7 resolved: no server read for experimental rotation yet.** `docs/roadmap.md` already names the trigger ("likely when experimental questions number in the dozens") and flags that crossing it needs its own ADR (ADR 0006 rejected a database-backed runtime read "for now," for the same reason: it adds a network read in front of the first card and bypasses code review for player-visible content). Nothing in this branch needs it; revisit by that trigger. | ADR 0006; roadmap.md |
