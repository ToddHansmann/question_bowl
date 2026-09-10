/**
 * Sip the Tea — the deck.
 *
 * `BASE_DECK` is the original deck and is canonical: never edit the wording,
 * never reorder, never delete. It's Ian's original 114 and stays at 114
 * forever. An original may be *retired* — see `retired` below — which takes
 * it out of play without taking it out of the record.
 * `expansionQuestions` layers on top, each tagged with a category. It's
 * Todd-created content — the pool any future paid expansion packs would draw
 * from.
 * `questions` is the flat list the app plays — its shape is unchanged, so the
 * deck logic and UI don't know any of this structure exists.
 *
 * Every entry carries a stable `id`. **Ratings key on the id, not the text**,
 * so a question can be reworded or moved between packs without orphaning the
 * feedback it has already collected. `sourceByIndex` and `categoryByIndex`
 * key on *position* in the active deck, which is why they are derived fresh
 * rather than stored — a retirement shifts every position after it, and
 * nothing may persist a position across sessions.
 */

export type Category =
  | 'Warm-up'
  | 'Personal'
  | 'Messy'
  | 'Dating'
  | 'Sex'
  | 'Dare'
  | 'Adulting'
  | 'Travel'
  | 'Nostalgia'
  | 'AI'
  | 'Queer Culture'
  | 'Dark Room'

/**
 * What a pack is for, which is not the same as what's in it.
 *
 * - `expansion` — questions. Shown in the menu's "Expansion Packs" grid.
 * - `challenge` — dares, not questions. Shown in their own "Challenges"
 *   section, placed after every expansion pack so the two kinds never blur
 *   together in the list the way they used to when it was one flat menu.
 *
 * AI and Queer Culture shipped small on purpose, to find out whether the
 * subject was worth more — that trial is over and both graduated into
 * `expansion` alongside everything else. Nothing left in this file measures
 * pack size against a band anymore.
 */
export type Group = 'expansion' | 'challenge'

export type Pack = {
  category: Category
  group: Group
  /**
   * Present means the pack can't simply be switched on: everyone at the
   * table has to agree before it joins the shuffle, every session, freshly.
   * The string is what they're agreeing to. Consent is per-session and never
   * remembered — same as every other category choice, and for a better
   * reason. A gated pack is still listed openly in its group's grid — the
   * disclaimer shown at the moment someone tries to turn it on is the gate,
   * not whether the pack is visible.
   */
  consent?: string
}

/** Where a question came from — `baseQuestions` vs. `expansionQuestions`. */
export type Source = 'original' | 'todd'

/**
 * A question is a question; a challenge is a dare. The distinction is only
 * recorded where a rule depends on it — Dark Room is challenges only, and a
 * test enforces that — so it is declared here by a person rather than
 * guessed from the wording by a regex, which is not a thing a regex can do.
 */
export type Kind = 'question' | 'challenge'

/**
 * Every question carries an `id` that is assigned once and never changes.
 * Ratings key on it, so a question can be reworded — or moved between packs
 * — without orphaning the feedback it has already collected. The text is a
 * label; the id is the identity. Ids are not positions: they were assigned
 * in file order at the time they were introduced and new questions take the
 * next number, wherever in the file they end up sitting.
 */
export type BaseEntry = {
  id: string
  text: string
  /**
   * Why this left the active deck, and when. A retired question keeps its id
   * and its wording: it stops being dealt, and everything ever rated against
   * it stays attached and readable. Retiring is not deleting.
   */
  retired?: string
}

export type Expansion = BaseEntry & {
  category: Category
  kind?: Kind
}

/* ------------------------------------------------------------------ base --- */

/** The original 114. Canonical — do not edit, reword, or reorder. */
export const BASE_DECK: BaseEntry[] = [
  { id: 'base-001', text: "Describe a time or times when you feel very connected with yourself." },
  { id: 'base-002', text: "Describe a time you were uncomfortable being alone." },
  { id: 'base-003', text: "Describe a time you were mean to yourself." },
  { id: 'base-004', text: "Share something people might not know about you. Maybe something you do at work or with family that people aren’t aware of." },
  { id: 'base-005', text: "Describe your relationship to the contradicting human needs of: togetherness, separateness, security, freedom, surrender, autonomy." },
  {
    id: 'base-006',
    text: "Dido has a famous song with the lyrics, “No love without freedom, no freedom without love.” Make a personal connection to this quote, or describe a time in your life when you feel this applied.",
    retired: 'Retired 2026-09-09: leans on a 2003 lyric, and one of only two base questions carrying a thumbs-down. The first original retired on feedback rather than taste.',
  },
  { id: 'base-007', text: "“Love is the extremely difficult realization that something other than oneself is real.” — Iris Murdoch. Make a personal connection to this quote and share, or describe a time when you connected to this idea." },
  { id: 'base-008', text: "Describe a time you ended a relationship. (Work, friend, romantic.)" },
  { id: 'base-009', text: "Describe a time a relationship was easy, flowy, and organic. Describe a time you had to work hard at a relationship." },
  { id: 'base-010', text: "Describe an experience you had with the tension between tradition and newness." },
  { id: 'base-011', text: "If you could snap your fingers and eliminate one thing from the planet, what would it be? (Except pain, suffering, death, war.) What would you add more of to the world?" },
  { id: 'base-012', text: "If you could eliminate gossip, would you?" },
  { id: 'base-013', text: "Would you rather ask someone out on a date or to hang out, or be asked out? (Friend, romance, etc.) Why?" },
  { id: 'base-014', text: "If you could make sure all children understood one thing, what would it be?" },
  { id: 'base-015', text: "If you could change the behavior of people, what would be one thing you would change?" },
  { id: 'base-016', text: "If you could change the way society views one thing, what would it be?" },
  { id: 'base-017', text: "Say out loud and fill in the blank: “I am amazing at ________.”" },
  { id: 'base-018', text: "What is an adage, mantra, saying, or quote you find meaningful?" },
  { id: 'base-019', text: "This is an acting card. Be very, very dramatic. With great drama and fanfare say, “I’m sorry. I can’t! I just can’t!” and dramatically discard the card." },
  { id: 'base-020', text: "What is a misconception you think people have about you?" },
  { id: 'base-021', text: "What is a misconception you held for a very long time?" },
  { id: 'base-022', text: "Forgive someone else for something. Can be recent or from years ago. Say it out loud." },
  { id: 'base-023', text: "Forgive yourself for something. Can be recent or from years ago. Say it out loud." },
  { id: 'base-024', text: "What is a lesson that took you a really long time to learn?" },
  { id: 'base-025', text: "When you were a child, what is something you absolutely loved doing?" },
  { id: 'base-026', text: "Categories!" },
  { id: 'base-027', text: "What is a role you would like to play more in a relationship? (Work, friend, romantic.)" },
  { id: 'base-028', text: "What is a role you played in a relationship (work, friend, romantic) that you didn’t enjoy or sought to change?" },
  { id: 'base-029', text: "Describe a quality of “sameness” you look for in relationships, and a quality of “difference” you look for in relationships." },
  { id: 'base-030', text: "What are 3 expectations you have for a relationship? Choose whether it’s a friend, romantic, business, or other." },
  { id: 'base-031', text: "Did you have an open-door family vibe or a closed-door family vibe growing up?" },
  { id: 'base-032', text: "What was something you felt like you had too much of growing up, and too little of growing up?" },
  { id: 'base-033', text: "What is a story you often tell about yourself? What is a story you often tell about yourself that you would like to let go of?" },
  { id: 'base-034', text: "Were you educated in your youth that self-reliance is crucial, or were you taught to depend on others?" },
  { id: 'base-035', text: "What misinformation from your youth have you had to unlearn? Or do you want to unlearn?" },
  { id: 'base-036', text: "What is a piece of misinformation you often see other people falling for?" },
  { id: 'base-037', text: "Describe a time you were a people pleaser. What would you do differently now?" },
  { id: 'base-038', text: "When was a time you reacted in a way you wish you didn’t? What would you change?" },
  { id: 'base-039', text: "When was a time you made an assumption that turned out to be wrong?" },
  { id: 'base-040', text: "Describe a miscommunication that you experienced." },
  { id: 'base-041', text: "When was a time you gave up but feel you shouldn’t have?" },
  { id: 'base-042', text: "Describe a firm boundary you have. Describe a porous boundary you have." },
  { id: 'base-043', text: "Describe a time someone had power over you. Describe a time you had power over someone." },
  { id: 'base-044', text: "Describe a time when you have given power to someone." },
  { id: 'base-045', text: "Describe a time when you felt you had very little agency. Describe a time when you felt you had a lot of agency." },
  { id: 'base-046', text: "Describe a difficult conversation you had with someone." },
  { id: 'base-047', text: "Describe a time you had a conflict that got out of control. Describe a time you had a healthy conflict." },
  { id: 'base-048', text: "Describe a time you avoided something." },
  { id: 'base-049', text: "Describe a time you were confrontational." },
  { id: 'base-050', text: "Describe a time you trusted someone and were let down." },
  { id: 'base-051', text: "Describe a time you trusted someone and it worked out well." },
  { id: 'base-052', text: "Describe a time you were betrayed." },
  { id: 'base-053', text: "Describe a time you betrayed someone." },
  { id: 'base-054', text: "Describe a relationship that ended and you had to let go." },
  { id: 'base-055', text: "Describe a relationship you’ve had that is generative, erotic, vibrant." },
  { id: 'base-056', text: "Describe a relationship you’ve had that felt dead and/or sapped your energy." },
  { id: 'base-057', text: "What’s a dream you never shared?" },
  { id: 'base-058', text: "What’s a rule you secretly love to break?" },
  { id: 'base-059', text: "What’s a lie you’re tempted to tell about yourself?" },
  { id: 'base-060', text: "What did you learn about love or relationships from your parents?" },
  { id: 'base-061', text: "Never Have I Ever" },
  { id: 'base-062', text: "What makes you trust someone? What makes you distrust someone?" },
  { id: 'base-063', text: "Name a piece of art, movie, TV show, or play that you loved and think everyone should see." },
  { id: 'base-064', text: "Give a compliment to the person to your right." },
  { id: 'base-065', text: "Give an A grade to someone at the table for something they’ve done or said recently. Explain why." },
  { id: 'base-066', text: "Give a rose and a thorn for the day, week, or month." },
  { id: 'base-067', text: "Say something you’re grateful for." },
  { id: 'base-068', text: "Say an intention or goal for the day, week, month, or year." },
  { id: 'base-069', text: "Who would you be starstruck to see?" },
  { id: 'base-070', text: "What is something you wish you were more intentional about?" },
  { id: 'base-071', text: "What are three lessons or values you would want to instill upon your children (if you had children)?" },
  { id: 'base-072', text: "What is a life hack or productivity tip that has helped you a lot?" },
  { id: 'base-073', text: "What is a great piece of advice someone shared with you?" },
  { id: 'base-074', text: "What is an important lesson you learned from a prior relationship?" },
  { id: 'base-075', text: "What is something in your life you thought would never change but surprisingly did?" },
  { id: 'base-076', text: "Describe an ideal day." },
  { id: 'base-077', text: "Name a place you’ve traveled to and would go again. Name a place you would avoid." },
  { id: 'base-078', text: "What’s been your biggest adventure?" },
  { id: 'base-079', text: "What is something new sexually you would like to experience?" },
  { id: 'base-080', text: "What is one of the most challenging emotions for you to experience?" },
  { id: 'base-081', text: "When do you feel most present? Like you’re a child at play." },
  { id: 'base-082', text: "What would you say makes you not the easiest person to live with?" },
  { id: 'base-083', text: "Describe a time when you changed your mind." },
  { id: 'base-084', text: "What would you do if you had a different career?" },
  { id: 'base-085', text: "Were you raised for autonomy or raised for loyalty?" },
  { id: 'base-086', text: "What is something you wish you had known or been told as a child?" },
  { id: 'base-087', text: "What is one of the lessons learned from a heartbreak?" },
  { id: 'base-088', text: "What is a conversation that you need to have with yourself?" },
  { id: 'base-089', text: "What is a habit you would like to stop? What is a habit you would like to start?" },
  { id: 'base-090', text: "When did you know you were no longer a child?" },
  { id: 'base-091', text: "What is a tradition you love and wish to continue?" },
  { id: 'base-092', text: "What is the relationship legacy from your own family of origin that you want to keep?" },
  { id: 'base-093', text: "What is an aspect from your relationship culture that you’re set on changing?" },
  { id: 'base-094', text: "What’s a challenge that you have successfully faced, and how have you handled it?" },
  { id: 'base-095', text: "Name a risk you took that paid off." },
  { id: 'base-096', text: "Name a risk that you’ve taken and learned from." },
  { id: 'base-097', text: "Name someone who has inspired you, and how." },
  { id: 'base-098', text: "Name a time you had an “aha” moment that led you to make a big change." },
  { id: 'base-099', text: "Would you rather care for someone or be cared for? Why?" },
  { id: 'base-100', text: "What’s something you like or dislike that most other people don’t?" },
  { id: 'base-101', text: "What is your ______________ ____________ experience?" },
  { id: 'base-102', text: "Marry, ____________, kill . . . The person to your left chooses the 3." },
  { id: 'base-103', text: "What is your ideal frequency for having _________?" },
  { id: 'base-104', text: "What’s something __________ you like that most other people don’t?" },
  { id: 'base-105', text: "What is a relationship must for you? Romantic or otherwise." },
  { id: 'base-106', text: "What is a ____________ must for you?" },
  { id: 'base-107', text: "What is a major ___________ turn-off?" },
  { id: 'base-108', text: "What is a major relationship red flag for you?" },
  { id: 'base-109', text: "Why are you such a __________?" },
  { id: 'base-110', text: "What is one _______________ experience or act you would like to try?" },
  { id: 'base-111', text: "What is one _______________ experience or act you have done but don’t want to do again?" },
  { id: 'base-112', text: "M, F, K: Pudding, Pickles, Porridge." },
  { id: 'base-113', text: "M, F, K: The person to your right chooses the 3." },
  { id: 'base-114', text: "M, F, K: The person across from you chooses the 3." },
]

/* ------------------------------------------------------------- expansion --- */

/**
 * The expansion deck. Two exact duplicates of base questions were dropped
 * during the audit — see README. Near-duplicates are still here, flagged in
 * the audit but deliberately left in play pending review.
 */
export const expansionQuestions: Expansion[] = [
  /* -- Warm-up ----------------------------------------------------------- */
  { id: 'exp-001', category: 'Warm-up', text: "What’s the weirdest compliment you’ve ever received?" },
  { id: 'exp-002', category: 'Warm-up', text: "Which person here do you think would survive longest on a deserted island?" },
  { id: 'exp-003', category: 'Warm-up', text: "What’s a completely useless talent you’re oddly proud of?" },
  { id: 'exp-004', category: 'Warm-up', text: "If your life had a warning label, what would it say?" },
  { id: 'exp-005', category: 'Warm-up', text: "Which person here would make the best cult leader?" },
  { id: 'exp-006', category: 'Warm-up', text: "What’s the most ridiculous purchase you’ve ever justified?" },
  { id: 'exp-007', category: 'Warm-up', text: "If you had to swap lives with someone here for a week, who would it be?" },
  { id: 'exp-008', category: 'Warm-up', text: "What’s your most irrational fear?" },
  { id: 'exp-009', category: 'Warm-up', text: "What TV family would you want to join?" },
  { id: 'exp-010', category: 'Warm-up', text: "What’s the funniest lie you’ve ever told?" },
  { id: 'exp-011', category: 'Warm-up', text: "What’s one thing everyone should experience once?" },
  { id: 'exp-012', category: 'Warm-up', text: "What’s your most controversial food opinion?" },
  { id: 'exp-013', category: 'Warm-up', text: "What would your autobiography be called?" },
  { id: 'exp-014', category: 'Warm-up', text: "What’s something you’ve pretended to know about?" },
  { id: 'exp-015', category: 'Warm-up', text: "Which person here would be the hardest to date?" },
  { id: 'exp-016', category: 'Warm-up', text: "What’s a tiny hill you’d die on?" },
  { id: 'exp-017', category: 'Warm-up', text: "If you could relive one day, which would it be?" },
  { id: 'exp-018', category: 'Warm-up', text: "What’s something you secretly think you’re excellent at?" },
  { id: 'exp-019', category: 'Warm-up', text: "If your phone wallpaper had to be explained, what would the story be?" },
  { id: 'exp-020', category: 'Warm-up', text: "Are you a \"yes, hand me the baby\" person, or a \"please don't hand me the baby\" person?" },
  { id: 'exp-021', category: 'Warm-up', text: "What's the most boomer thing you've caught yourself doing?" },
  { id: 'exp-022', category: 'Warm-up', text: "Which generation — including the ones in between — do you feel like you don't quite belong to?" },
  { id: 'exp-023', category: 'Warm-up', text: "What pet from your childhood are you still a little in mourning for, or a little relieved you don't have anymore?" },
  { id: 'exp-024', category: 'Warm-up', text: "What's your hometown actually known for, and is it deserved?" },
  { id: 'exp-025', category: 'Warm-up', text: "What's the worst haircut you've ever paid for and then had to walk around in public with?" },
  { id: 'exp-026', category: 'Warm-up', text: "What's your gay identifier, if you claim one — twink, bear, otter, none of the above?" },
  { id: 'exp-027', category: 'Warm-up', text: "Someone double-dips in the shared bowl. Do you say something, quietly stop eating, or genuinely not care?" },
  { id: 'exp-028', category: 'Warm-up', text: "What food combination do you love that visibly disturbs other people?" },
  { id: 'exp-029', category: 'Warm-up', text: "If your group chat assigned you a job title, what would it be?" },
  { id: 'exp-030', category: 'Warm-up', text: "What phase were you convinced was permanent at the time?" },
  { id: 'exp-031', category: 'Warm-up', text: "What's the last thing you searched for that you'd hesitate to say out loud right now?" },
  { id: 'exp-032', category: 'Warm-up', text: "What's your best \"you had to be there\" story from the pandemic — the one that still makes you laugh?" },
  { id: 'exp-033', category: 'Warm-up', text: "Nobody ever sneezes again. How long before you notice?" },
  { id: 'exp-034', category: 'Warm-up', text: "If ice cream came in flavours of emotions and ideas, which one are you trying first?" },
  { id: 'exp-035', category: 'Warm-up', text: "You are stuck in a time loop repeating one thing forever. What are you picking?" },
  { id: 'exp-036', category: 'Warm-up', text: "What would people in this room assume you had been arrested for?" },
  { id: 'exp-037', category: 'Warm-up', text: "If one season vanished from the calendar forever, which are you sacrificing?" },
  { id: 'exp-038', category: 'Warm-up', text: "Where do you actually land on time travel — back, forward, or leave it alone?" },
  { id: 'exp-039', category: 'Warm-up', text: "Do you have a bird story? Everyone who has one has a strange one." },
  { id: 'exp-040', category: 'Warm-up', text: "Phone call, voice note, or text — and what does your answer give away about when you were born?" },
  { id: 'exp-041', category: 'Warm-up', text: "What is something younger people do that you mocked and have quietly started doing?" },
  { id: 'exp-042', category: 'Warm-up', text: "What is your villain-era self doing right now?" },

  /* -- Personal ---------------------------------------------------------- */
  { id: 'exp-043', category: 'Personal', text: "When was the last time you changed your mind about something important?" },
  { id: 'exp-044', category: 'Personal', text: "What’s something you’ve never apologized for but probably should?" },
  { id: 'exp-045', category: 'Personal', text: "What’s one thing you wish people understood about you?" },
  { id: 'exp-046', category: 'Personal', text: "What’s your biggest relationship green flag?" },
  { id: 'exp-047', category: 'Personal', text: "What’s your biggest relationship red flag?" },
  { id: 'exp-048', category: 'Personal', text: "When do you feel most attractive?" },
  { id: 'exp-049', category: 'Personal', text: "What’s the nicest thing an ex ever did for you?" },
  { id: 'exp-050', category: 'Personal', text: "Who knows you better than anyone?" },
  { id: 'exp-051', category: 'Personal', text: "What’s something you’ve outgrown?" },
  { id: 'exp-052', category: 'Personal', text: "When do you feel most like yourself?" },
  { id: 'exp-053', category: 'Personal', text: "What’s something you miss from childhood?" },
  { id: 'exp-054', category: 'Personal', text: "What’s something you’ve never admitted to your parents?" },
  { id: 'exp-055', category: 'Personal', text: "What’s one insecurity you’ve mostly overcome?" },
  { id: 'exp-056', category: 'Personal', text: "What’s your love language — even if you hate the phrase?" },
  { id: 'exp-057', category: 'Personal', text: "What’s something you’ve forgiven that surprised you?" },
  { id: 'exp-058', category: 'Personal', text: "What’s your biggest “what if?”" },
  { id: 'exp-059', category: 'Personal', text: "What’s something you’re currently working on in yourself?" },
  { id: 'exp-060', category: 'Personal', text: "What’s one compliment you’ll never forget?" },
  { id: 'exp-061', category: 'Personal', text: "What’s something you hope is true five years from now?" },
  { id: 'exp-062', category: 'Personal', text: "What does a good night alone actually look like for you?" },
  { id: 'exp-063', category: 'Personal', text: "What's something you do to recharge that would surprise people who think they know you?" },
  { id: 'exp-064', category: 'Personal', text: "What's your unofficial ritual for coming back to yourself after a stretch of being \"on\" for other people?" },
  { id: 'exp-065', category: 'Personal', text: "What's the difference between being alone and being lonely, for you specifically?" },
  { id: 'exp-066', category: 'Personal', text: "What's a form of self-care everyone raves about that does nothing for you?" },
  { id: 'exp-067', category: 'Personal', text: "How do you know when you've hit your social limit for the day?" },
  { id: 'exp-068', category: 'Personal', text: "What's something you've stopped feeling guilty about doing by yourself?" },
  { id: 'exp-069', category: 'Personal', text: "You have one hour left and you cannot contact anyone you love. How do you spend it?" },
  { id: 'exp-070', category: 'Personal', text: "A machine writes the complete and honest account of your life. You may read one chapter. Which one?" },
  { id: 'exp-071', category: 'Personal', text: "The lever kills one person instead of five. Do you pull it, and how long do you stand there?" },
  { id: 'exp-072', category: 'Personal', text: "Would you take a pill that permanently removed one memory?" },
  { id: 'exp-073', category: 'Personal', text: "What have you lost that you still think about?" },
  { id: 'exp-074', category: 'Personal', text: "If this stretch of your life had a chapter title, what would it be?" },
  { id: 'exp-075', category: 'Personal', text: "What advice from your younger self would you actually take?" },

  /* -- Messy ------------------------------------------------------------- */
  { id: 'exp-076', category: 'Messy', text: "What’s the pettiest thing you’ve ever done?" },
  { id: 'exp-077', category: 'Messy', text: "Have you ever accidentally ruined someone’s relationship?" },
  { id: 'exp-078', category: 'Messy', text: "What’s the most awkward text you’ve sent to the wrong person?" },
  { id: 'exp-079', category: 'Messy', text: "What’s the worst first impression you’ve ever made?" },
  { id: 'exp-080', category: 'Messy', text: "Have you ever pretended not to recognize someone?" },
  { id: 'exp-081', category: 'Messy', text: "What’s your most embarrassing drunk story?" },
  { id: 'exp-082', category: 'Messy', text: "What’s something you’ve stolen — even accidentally?" },
  { id: 'exp-083', category: 'Messy', text: "Have you ever faked being sick to avoid someone?" },
  { id: 'exp-084', category: 'Messy', text: "What’s your biggest social regret?" },
  { id: 'exp-085', category: 'Messy', text: "What’s the longest you’ve gone without admitting you were wrong?" },
  { id: 'exp-086', category: 'Messy', text: "What’s the meanest thing you’ve ever said in an argument?" },
  { id: 'exp-087', category: 'Messy', text: "Have you ever ghosted someone you actually liked?" },
  { id: 'exp-088', category: 'Messy', text: "What’s the biggest lie you’ve told that nobody ever discovered?" },
  { id: 'exp-089', category: 'Messy', text: "What’s the most jealous you’ve ever been?" },
  { id: 'exp-090', category: 'Messy', text: "Have you ever sabotaged yourself?" },
  { id: 'exp-091', category: 'Messy', text: "What’s the closest you’ve come to getting arrested?" },
  { id: 'exp-092', category: 'Messy', text: "What’s your worst wedding guest behavior?" },
  { id: 'exp-093', category: 'Messy', text: "What’s the most embarrassing thing someone has caught you doing?" },
  { id: 'exp-094', category: 'Messy', text: "What’s the biggest misunderstanding you’ve ever created?" },
  { id: 'exp-095', category: 'Messy', text: "What’s the hardest you’ve laughed at someone else’s misfortune?" },
  { id: 'exp-096', category: 'Messy', text: "Have you ever quietly refused to pay someone back, purely out of principle?" },
  { id: 'exp-097', category: 'Messy', text: "Have you ever calculated your exact share of a group bill down to the cent and made everyone wait for it?" },
  { id: 'exp-098', category: 'Messy', text: "What's the worst version of yourself that group vacations bring out?" },
  { id: 'exp-099', category: 'Messy', text: "Have you ever been genuinely offended by someone else's wedding plus-one policy?" },
  { id: 'exp-100', category: 'Messy', text: "What's the pettiest thing you've done to a hairstylist who wronged you — including just never going back, no explanation?" },
  { id: 'exp-101', category: 'Messy', text: "Have you ever pretended to like a haircut you hated, to the stylist's face?" },
  { id: 'exp-102', category: 'Messy', text: "What's a group chat argument that got way more heated than the actual topic deserved?" },
  { id: 'exp-103', category: 'Messy', text: "Did you break your own pandemic rules and never tell anyone?" },
  { id: 'exp-104', category: 'Messy', text: "Have you ever fully checked out at a job while still collecting the paycheck — and for how long did you get away with it?" },
  { id: 'exp-105', category: 'Messy', text: "Has a stranger ever watched you at your absolute worst in public?" },

  /* -- Dating ------------------------------------------------------------ */
  { id: 'exp-106', category: 'Dating', text: "Which celebrity would immediately make you nervous to flirt with?" },
  { id: 'exp-107', category: 'Dating', text: "What’s the boldest move you’ve made on someone?" },
  { id: 'exp-108', category: 'Dating', text: "Have you ever had a crush on someone in this room?" },
  { id: 'exp-109', category: 'Dating', text: "What’s your biggest turn-on that isn’t physical?" },
  { id: 'exp-110', category: 'Dating', text: "What’s the most attractive quality someone can have?" },
  { id: 'exp-111', category: 'Dating', text: "Have you ever kissed someone you just met?" },
  { id: 'exp-112', category: 'Dating', text: "What’s the most spontaneous romantic thing you’ve ever done?" },
  { id: 'exp-113', category: 'Dating', text: "Have you ever had feelings for someone you absolutely shouldn’t have?" },
  { id: 'exp-114', category: 'Dating', text: "What’s your biggest dating “ick”?" },
  { id: 'exp-115', category: 'Dating', text: "What’s something someone could do that would instantly make you interested?" },
  { id: 'exp-116', category: 'Dating', text: "Have you ever accidentally flirted with the wrong person?" },
  { id: 'exp-117', category: 'Dating', text: "What’s your most memorable first kiss?" },
  { id: 'exp-118', category: 'Dating', text: "What’s the biggest age gap you’ve dated?" },
  { id: 'exp-119', category: 'Dating', text: "Have you ever been caught making out?" },
  { id: 'exp-120', category: 'Dating', text: "What’s your favorite excuse for leaving a bad date?" },
  { id: 'exp-121', category: 'Dating', text: "What’s the most ridiculous reason you’ve liked someone?" },
  { id: 'exp-122', category: 'Dating', text: "Have you ever matched with someone you already knew?" },
  { id: 'exp-123', category: 'Dating', text: "What’s something you’ve always wanted to try on a date?" },
  { id: 'exp-124', category: 'Dating', text: "Have you ever gone on two dates in one day?" },
  { id: 'exp-125', category: 'Dating', text: "What’s your most unforgettable romantic disaster?" },
  { id: 'exp-126', category: 'Dating', text: "Have you ever taken a break from a relationship and found out afterwards that you'd each understood it differently?" },
  { id: 'exp-127', category: 'Dating', text: "How do you and a partner actually split money — and did you ever have to negotiate that out loud?" },
  { id: 'exp-128', category: 'Dating', text: "What's the most awkward you've felt being someone's plus-one at a wedding — or bringing a plus-one everyone was skeptical of?" },
  { id: 'exp-129', category: 'Dating', text: "Would you rather find out your partner is bad with money or bad with time?" },
  { id: 'exp-130', category: 'Dating', text: "What's a relationship \"rule\" you and a partner made up that would sound insane to anyone else?" },
  { id: 'exp-131', category: 'Dating', text: "What is the largest age gap you would be comfortable with, and does the direction change your answer?" },
  { id: 'exp-132', category: 'Dating', text: "Have you dated someone much older or much younger, and what did it teach you?" },
  { id: 'exp-133', category: 'Dating', text: "At what point does an age gap stop being anybody else's business?" },

  /* -- Sex ------------------------------------------------------------ */
  { id: 'exp-134', category: 'Sex', text: "What’s the most memorable hookup you’ve ever had, and what made it stick?" },
  { id: 'exp-135', category: 'Sex', text: "What does your Grindr profile claim about you that isn’t strictly true?" },
  { id: 'exp-136', category: 'Sex', text: "What’s a kink you were surprised to discover you were into?" },
  { id: 'exp-137', category: 'Sex', text: "What’s your hard limit — the thing you’ll never be talked into?" },
  { id: 'exp-138', category: 'Sex', text: "What’s the hottest thing someone has ever said to you in bed?" },
  { id: 'exp-139', category: 'Sex', text: "What’s the most public place you’ve ever had sex?" },
  { id: 'exp-140', category: 'Sex', text: "Top, bottom, vers — and has that changed over the years?" },
  { id: 'exp-141', category: 'Sex', text: "What’s the strangest place you’ve ever met someone for sex?" },
  { id: 'exp-142', category: 'Sex', text: "What’s a sexual boundary you set that you’re proud of?" },
  { id: 'exp-143', category: 'Sex', text: "What’s the biggest gap you’ve encountered between the profile and the person?" },
  { id: 'exp-144', category: 'Sex', text: "What’s a fantasy you’ve never said out loud to anyone at this table?" },
  { id: 'exp-145', category: 'Sex', text: "What’s the best sex you’ve ever had, and what made it the best?" },
  { id: 'exp-146', category: 'Sex', text: "What were you into five years ago that does nothing for you now?" },
  { id: 'exp-147', category: 'Sex', text: "Tell the story of your first time with a man." },
  { id: 'exp-148', category: 'Sex', text: "How do you turn someone down when you’re just not interested?" },
  { id: 'exp-149', category: 'Sex', text: "What’s a sexual insecurity you’ve made peace with?" },
  { id: 'exp-150', category: 'Sex', text: "What’s the worst hookup you’ve ever had — the one that became a story?" },
  { id: 'exp-151', category: 'Sex', text: "What’s a physical type you’re into that your friends have never understood?" },
  { id: 'exp-152', category: 'Sex', text: "Have you ever had sex somewhere you could have been caught? What happened?" },
  { id: 'exp-153', category: 'Sex', text: "Do you stay the night after a hookup, or are you out the door — and has that ever caused a problem?" },
  { id: 'exp-154', category: 'Sex', text: "Have you ever had a completely faceless, anonymous encounter, and would you do it again?" },
  { id: 'exp-155', category: 'Sex', text: "Glory holes: curiosity, hard pass, or been there?" },
  { id: 'exp-156', category: 'Sex', text: "Have you ever been the one to pump and dump — or the one left wondering why someone vanished?" },
  { id: 'exp-157', category: 'Sex', text: "Where's your personal line between sex and sex with substances involved?" },
  { id: 'exp-158', category: 'Sex', text: "What's a hookup situation where you genuinely felt unsafe, not just regretful?" },
  { id: 'exp-159', category: 'Sex', text: "What's the boldest lie you've told to get someone to come over?" },
  { id: 'exp-160', category: 'Sex', text: "How long was your longest dry spell, and what ended it?" },
  { id: 'exp-161', category: 'Sex', text: "Have you ever been part of a group scene — and would you seek that out again, or file it under \"once was enough\"?" },
  { id: 'exp-162', category: 'Sex', text: "How old were you the first time you used a hookup app, and does that number surprise people?" },
  { id: 'exp-163', category: 'Sex', text: "Have you ever hooked up with a coworker?" },
  { id: 'exp-164', category: 'Sex', text: "Have you ever jerked off at work?" },
  { id: 'exp-165', category: 'Sex', text: "Which celebrity was your gay sexual awakening?" },
  { id: 'exp-166', category: 'Sex', text: "What is your underwear vibe?" },
  { id: 'exp-167', category: 'Sex', text: "During sex, are you noisy or quiet?" },
  { id: 'exp-168', category: 'Sex', text: "Which uniform gets you instantly horny?" },
  { id: 'exp-302', category: 'Sex', text: "Have you ever used Sniffies? How did that go?" },
  { id: 'exp-305', category: 'Sex', text: "Describe your type in the bluntest possible terms. No hedging, no jokes." },
  { id: 'exp-306', category: 'Sex', text: "Say your number out loud, then say whether that was the real one." },
  { id: 'exp-307', category: 'Sex', text: "What's a kink you've never said out loud to anyone in this room?" },
  { id: 'exp-308', category: 'Sex', text: "Who here would you have gone home with, in another life?" },
  { id: 'exp-309', category: 'Sex', text: "Describe the best sex you've had this year in exactly three words." },

  /* -- Dare --------------------------------------------------------- */
  { id: 'exp-170', category: 'Dare', text: "Let the group choose your phone wallpaper until tomorrow." },
  { id: 'exp-171', category: 'Dare', text: "Speak in an accent until your next turn." },
  { id: 'exp-172', category: 'Dare', text: "Swap seats with the person who knows you least." },
  { id: 'exp-173', category: 'Dare', text: "Attempt 20 push-ups." },
  { id: 'exp-174', category: 'Dare', text: "Trade one article of clothing with the person to your left." },
  { id: 'exp-175', category: 'Dare', text: "Do your best impression of another player." },
  { id: 'exp-176', category: 'Dare', text: "Serenade someone with the chorus of any song." },
  { id: 'exp-177', category: 'Dare', text: "Let another player style your hair." },
  { id: 'exp-178', category: 'Dare', text: "Do five yoga poses chosen by the group." },
  { id: 'exp-179', category: 'Dare', text: "Tell a joke. If nobody laughs, tell another." },
  { id: 'exp-180', category: 'Dare', text: "Moonwalk — or attempt to." },
  { id: 'exp-181', category: 'Dare', text: "Hold eye contact with the person across from you for 30 seconds without laughing." },
  { id: 'exp-182', category: 'Dare', text: "Do your best animal impression until someone guesses it." },
  { id: 'exp-198', category: 'Dare', text: "Say your screen time from last week out loud. The exact number." },
  { id: 'exp-315', category: 'Dare', text: "Duck walk across the room and back." },

  /* -- Adulting ------------------------------------------------------------ */
  { id: 'exp-199', category: 'Adulting', text: "What's the most you've ever spent trying to avoid an awkward conversation about money?" },
  { id: 'exp-200', category: 'Adulting', text: "Do you round up, split exactly evenly, or calculate your precise share when the bill comes?" },
  { id: 'exp-201', category: 'Adulting', text: "What's your actual tipping philosophy, and has it changed since you had to work for tips yourself?" },
  { id: 'exp-202', category: 'Adulting', text: "How much \"quiet quitting\" is happening in your current job, if you're honest?" },
  { id: 'exp-203', category: 'Adulting', text: "What's the most office-culture-poisoned phrase you've caught yourself saying out loud?" },
  { id: 'exp-204', category: 'Adulting', text: "Are you the friend who organizes the group plans, or the one who shows up wherever you're told?" },
  { id: 'exp-205', category: 'Adulting', text: "What's something you fixed yourself that you're unreasonably proud of?" },
  { id: 'exp-206', category: 'Adulting', text: "Describe the last time you had to actually lead something — a project, a room, a group of drunk friends." },
  { id: 'exp-207', category: 'Adulting', text: "What's your relationship with public speaking: thrive, survive, or actively avoid?" },
  { id: 'exp-208', category: 'Adulting', text: "What's your actual daily screen time, and how far off is that from what you'd guess?" },
  { id: 'exp-209', category: 'Adulting', text: "Is there a creator, celebrity, or total stranger online whose life you're weirdly invested in?" },
  { id: 'exp-210', category: 'Adulting', text: "What platform do you actually enjoy using, versus the one you use out of habit?" },
  { id: 'exp-211', category: 'Adulting', text: "What's a car repair or home repair you attempted yourself that you now regret?" },
  { id: 'exp-212', category: 'Adulting', text: "Which generation's work ethic do you secretly think you have, regardless of when you were born?" },
  { id: 'exp-213', category: 'Adulting', text: "What's the most \"I am becoming my parents\" financial habit you've picked up?" },
  { id: 'exp-214', category: 'Adulting', text: "Are you chronically early, chronically late, or does it depend entirely on who's waiting for you?" },
  { id: 'exp-215', category: 'Adulting', text: "What workplace rule were you told was non-negotiable that turned out to be nonsense?" },
  { id: 'exp-216', category: 'Adulting', text: "What were you told about buying a home that turned out to be a fairy tale?" },

  /* -- Travel ---------------------------------------------------------------- */
  { id: 'exp-217', category: 'Travel', text: "Are you an over-packer or an under-packer, and which trip finally proved it?" },
  { id: 'exp-218', category: 'Travel', text: "What's the most convincing travel scam you've ever fallen for, even a little?" },
  { id: 'exp-219', category: 'Travel', text: "What's your worst canceled- or delayed-flight story?" },
  { id: 'exp-220', category: 'Travel', text: "What's an unwritten rule of flying that you think everyone should follow and clearly doesn't?" },
  { id: 'exp-221', category: 'Travel', text: "What's the longest layover you've survived, and how did you fill the time?" },
  { id: 'exp-222', category: 'Travel', text: "What's a trip that went wrong in a way that turned into a great story only in hindsight?" },
  { id: 'exp-223', category: 'Travel', text: "Window, aisle, or you'll take whatever's left — and is that a real preference or just resignation?" },
  { id: 'exp-224', category: 'Travel', text: "What's the most unexpectedly great thing that's happened to you while traveling alone?" },
  { id: 'exp-225', category: 'Travel', text: "Have you ever nearly missed a flight because of something completely avoidable?" },
  { id: 'exp-226', category: 'Travel', text: "What souvenir did you buy that you immediately regretted?" },
  { id: 'exp-227', category: 'Travel', text: "What's your pre-flight ritual, if you have one?" },
  { id: 'exp-228', category: 'Travel', text: "Have you ever lost your passport, wallet, or phone while traveling — and how did that story end?" },
  { id: 'exp-229', category: 'Travel', text: "What's a destination with a five-star reputation that you'd personally give three stars?" },
  { id: 'exp-230', category: 'Travel', text: "Would you fly somewhere else to have a medical procedure done cheaper?" },
  { id: 'exp-231', category: 'Travel', text: "What is the most questionable thing you would have done to your body abroad to save money?" },
  { id: 'exp-316', category: 'Travel', text: "Are you the road-trip planner with snacks pre-portioned, or the one who says \"we'll figure it out\" at the gas station?" },
  { id: 'exp-317', category: 'Travel', text: "Driver or passenger — and be honest about which one you actually are, not which one you'd like to be." },
  { id: 'exp-318', category: 'Travel', text: "What's the worst thing that's ever happened on a road trip you were part of?" },
  { id: 'exp-319', category: 'Travel', text: "What's an unwritten road-trip rule — aux cord privileges, shotgun calls, snack tax — that you take way too seriously?" },
  { id: 'exp-320', category: 'Travel', text: "What's it like the first night back in your childhood bedroom as an adult?" },
  { id: 'exp-321', category: 'Travel', text: "What's a tradition at a family member's house that only makes sense once you're standing in it?" },
  { id: 'exp-322', category: 'Travel', text: "How many days can you spend at your parents' house before you start counting down to leaving?" },
  { id: 'exp-323', category: 'Travel', text: "What's the most \"this is why I don't visit more often\" moment from a trip home?" },

  /* -- Nostalgia --------------------------------------------------------- */
  { id: 'exp-232', category: 'Nostalgia', text: "What was your first car, and do you remember it fondly or is it better left forgotten?" },
  { id: 'exp-233', category: 'Nostalgia', text: "Describe your first kiss — the real, non-negotiable, no-do-overs first one." },
  { id: 'exp-234', category: 'Nostalgia', text: "Was your first kiss with a person of the same sex before or after you'd figured out you were gay?" },
  { id: 'exp-235', category: 'Nostalgia', text: "What's your coming out story — the real one, not the polished version you tell now?" },
  { id: 'exp-236', category: 'Nostalgia', text: "Was there a period where you were out to some people and closeted with others? What was that like to manage?" },
  { id: 'exp-237', category: 'Nostalgia', text: "Did you ever have a \"beard\" — a girlfriend or boyfriend to hide who you actually were?" },
  { id: 'exp-238', category: 'Nostalgia', text: "When did you first realize you were gay, even before you had the words for it?" },
  { id: 'exp-239', category: 'Nostalgia', text: "What's something you desperately wanted as a kid that you never got?" },
  { id: 'exp-240', category: 'Nostalgia', text: "What toy, show, or piece of music defined your childhood more than anything else?" },
  { id: 'exp-241', category: 'Nostalgia', text: "Did you go to prom? Who with, and how honest were you being with yourself that night?" },
  { id: 'exp-242', category: 'Nostalgia', text: "What's your best or worst high school story that still comes up with old friends?" },
  { id: 'exp-243', category: 'Nostalgia', text: "Who was in your pandemic pod, and would you choose the same people again?" },
  { id: 'exp-244', category: 'Nostalgia', text: "What was your honest opinion on mask etiquette during the pandemic — not the polite one?" },
  { id: 'exp-245', category: 'Nostalgia', text: "How did working from home change you, for better or worse?" },
  { id: 'exp-246', category: 'Nostalgia', text: "What's a place you used to live that you have complicated feelings about?" },
  { id: 'exp-247', category: 'Nostalgia', text: "What childhood friendship do you wish you'd kept, and what happened to it?" },
  { id: 'exp-248', category: 'Nostalgia', text: "What was the first record, cassette, CD or download you bought with your own money?" },
  { id: 'exp-249', category: 'Nostalgia', text: "One album for the rest of your life. Pick it, and no changing your mind." },
  { id: 'exp-250', category: 'Nostalgia', text: "What is your go-to karaoke song, and how honest are you being right now?" },
  { id: 'exp-251', category: 'Nostalgia', text: "What was your first username, and what does it say about you?" },
  { id: 'exp-252', category: 'Nostalgia', text: "Which generation had it easiest, and can you defend that?" },
  { id: 'exp-253', category: 'Nostalgia', text: "What technology did you have to learn as an adult that children now simply know?" },
  { id: 'exp-254', category: 'Nostalgia', text: "What did dating look like when you started, and would you survive dating now?" },
  { id: 'exp-255', category: 'Nostalgia', text: "What did your parents' generation get right that yours has quietly dropped?" },

  /* -- AI ------------------------------------------------- */
  { id: 'exp-256', category: 'AI', text: "Have you ever had a genuinely emotional exchange with an AI chatbot?" },
  { id: 'exp-257', category: 'AI', text: "Have you ever thanked an AI, and did you mean it?" },
  { id: 'exp-258', category: 'AI', text: "What have you told an AI that you have not told anyone in this room?" },
  { id: 'exp-259', category: 'AI', text: "Would you be hurt if a friend used AI to write your birthday message?" },
  { id: 'exp-260', category: 'AI', text: "If a machine could do most of your job tomorrow, are you relieved or terrified?" },
  { id: 'exp-261', category: 'AI', text: "Would you date someone who talks to an AI companion every day?" },
  { id: 'exp-262', category: 'AI', text: "What is the last thing you asked an AI that you would rather not say out loud?" },
  { id: 'exp-263', category: 'AI', text: "Do you trust a machine's medical advice more or less than a doctor you waited six weeks to see?" },
  { id: 'exp-264', category: 'AI', text: "If an AI wrote a song that made you cry, does it still count?" },
  { id: 'exp-265', category: 'AI', text: "Who would you least want replaced by a machine — your therapist, your doctor, or your barista?" },
  { id: 'exp-266', category: 'AI', text: "Have you ever changed your mind because an AI argued with you?" },
  { id: 'exp-267', category: 'AI', text: "If a machine could imitate your voice perfectly, who would you have it call?" },
  { id: 'exp-268', category: 'AI', text: "Would you want to know if the person you matched with wrote their profile with AI?" },
  { id: 'exp-269', category: 'AI', text: "What job should never be automated, however good the machine gets?" },
  { id: 'exp-270', category: 'AI', text: "If an AI remembered everything you ever told it, is that intimacy or surveillance?" },
  { id: 'exp-271', category: 'AI', text: "Is something you made less yours because a machine helped make it?" },
  { id: 'exp-272', category: 'AI', text: "Would you let an AI read your messages if it made you a better partner?" },
  { id: 'exp-273', category: 'AI', text: "If a machine says it is conscious, what would actually convince you?" },
  { id: 'exp-274', category: 'AI', text: "What would you want deleted before an AI got to know you?" },
  { id: 'exp-275', category: 'AI', text: "How long could you work without AI before anyone noticed the difference?" },
  { id: 'exp-276', category: 'AI', text: "Would you want a version of yourself that kept talking to your family after you died?" },
  { id: 'exp-277', category: 'AI', text: "What is the most human thing you think a machine will never manage?" },
  { id: 'exp-278', category: 'AI', text: "Has AI ever made you feel worse about your own creativity?" },

  /* -- Queer Culture -------------------------------------- */
  { id: 'exp-279', category: 'Queer Culture', text: "What is an unpopular opinion you hold about a queer icon?" },
  { id: 'exp-280', category: 'Queer Culture', text: "What is something extremely gay you did while closeted and thought nobody clocked?" },
  { id: 'exp-281', category: 'Queer Culture', text: "Who clocked you before you clocked yourself?" },
  { id: 'exp-282', category: 'Queer Culture', text: "What is the first queer character you saw on screen who felt real?" },
  { id: 'exp-283', category: 'Queer Culture', text: "Which queer bar or space do you still miss?" },
  { id: 'exp-284', category: 'Queer Culture', text: "What piece of queer slang do you refuse to use?" },
  { id: 'exp-285', category: 'Queer Culture', text: "What is the straightest thing about you?" },
  { id: 'exp-286', category: 'Queer Culture', text: "What did you think being queer would cost you that it never did?" },
  { id: 'exp-287', category: 'Queer Culture', text: "Which Pride would you rather forget?" },
  { id: 'exp-288', category: 'Queer Culture', text: "What is the best coming-out reaction you have ever heard about — yours or someone else's?" },
  { id: 'exp-289', category: 'Queer Culture', text: "Which queer stereotype do you fit almost exactly, and how do you feel about that?" },
  { id: 'exp-290', category: 'Queer Culture', text: "What does the community do that you wish it would stop doing?" },
  { id: 'exp-291', category: 'Queer Culture', text: "Who was the first person you told, and would you pick them again?" },
  { id: 'exp-292', category: 'Queer Culture', text: "What queer film or show is genuinely bad and you would defend it anyway?" },
  { id: 'exp-293', category: 'Queer Culture', text: "Which queer elder do you wish you had met?" },
  { id: 'exp-294', category: 'Queer Culture', text: "Is there a label you tried on and handed back?" },
  { id: 'exp-295', category: 'Queer Culture', text: "What is the most useful thing an older queer person ever told you?" },
  { id: 'exp-296', category: 'Queer Culture', text: "What do straight people most misunderstand about queer friendship?" },
  { id: 'exp-297', category: 'Queer Culture', text: "What song turns any room into a gay bar?" },
  { id: 'exp-298', category: 'Queer Culture', text: "What is the gayest thing you own?" },
  { id: 'exp-299', category: 'Queer Culture', text: "Have you ever felt not queer enough for a queer space?" },
  { id: 'exp-300', category: 'Queer Culture', text: "What queer tradition would you like to invent?" },

  /* -- Dark Room (consent-gated) ------------------------------------------ */
  { id: 'exp-301', category: 'Dark Room', kind: 'challenge', text: "Share your Sniffies profile picture with the group." },
  { id: 'exp-312', category: 'Dark Room', kind: 'challenge', text: "No bottoms until your next turn — Winnie-the-Pooh style." },
  { id: 'exp-313', category: 'Dark Room', kind: 'challenge', text: "Create a penis puppet or genital origami and have the group guess what it is." },
  { id: 'exp-314', category: 'Dark Room', kind: 'challenge', text: "Do the elephant walk with the person on your left and right." },
  { id: 'exp-183', category: 'Dark Room', kind: 'challenge', text: "Read out the last message you sent on a hookup app." },
  { id: 'exp-169', category: 'Dark Room', kind: 'challenge', text: "Have you ever faked an orgasm? Demonstrate." },
  { id: 'exp-304', category: 'Dark Room', kind: 'challenge', text: "Show the group the last photo you sent that you'd never post publicly." },
  { id: 'exp-184', category: 'Dark Room', kind: 'challenge', text: "Let the group write your hookup-app tagline for the next 24 hours." },
  { id: 'exp-186', category: 'Dark Room', kind: 'challenge', text: "Do your most convincing moan." },
  { id: 'exp-310', category: 'Dark Room', kind: 'challenge', text: "Hypothesize who in the group has the largest urethra, then check your work." },
  { id: 'exp-311', category: 'Dark Room', kind: 'challenge', text: "Compare your areola to the person on your right. Would they date?" },
  { id: 'exp-188', category: 'Dark Room', kind: 'challenge', text: "Take off one item of clothing. You choose which." },
  { id: 'exp-189', category: 'Dark Room', kind: 'challenge', text: "Let the table pick one word to describe you in bed." },
  { id: 'exp-191', category: 'Dark Room', kind: 'challenge', text: "Whisper something filthy to the person on your right. They decide whether to repeat it." },
  { id: 'exp-194', category: 'Dark Room', kind: 'challenge', text: "Say the filthiest thing you’ve ever said in bed, in the most romantic voice you can manage." },
  {
    id: 'exp-195',
    category: 'Dark Room',
    kind: 'challenge',
    text: "Share your current hookup-app profile pic with the group — no context, no explanation.",
    retired:
      'Retired 2026-09-09: near-duplicate of exp-301, which asks for the same thing (your hookup-app profile picture, shown to the table) in fewer words and names the app. exp-301 is the stronger version and stays. Kept here with its id so anything ever rated against it still resolves.',
  },
  { id: 'exp-196', category: 'Dark Room', kind: 'challenge', text: "Dig up your most catfish Grindr photo — the one that owes everyone an apology — and share it." },
  { id: 'exp-185', category: 'Dark Room', kind: 'challenge', text: "Text an ex, “I was just thinking about you.” No explanation, no follow-up." },
  { id: 'exp-187', category: 'Dark Room', kind: 'challenge', text: "Try your best opening line on the person to your right." },
  { id: 'exp-190', category: 'Dark Room', kind: 'challenge', text: "Give the person to your left a fifteen-second shoulder massage." },
  { id: 'exp-192', category: 'Dark Room', kind: 'challenge', text: "Rank the table by who would be the best kisser. Out loud, with reasons." },
  { id: 'exp-193', category: 'Dark Room', kind: 'challenge', text: "Describe your type in three words, then let the table rule on whether that’s really true." },
  { id: 'exp-197', category: 'Dark Room', kind: 'challenge', text: "Find out who has the longest tongue at the table. Prove it." },
]

/* ----------------------------------------------------------------- deck --- */

/**
 * Retired questions are still in BASE_DECK and expansionQuestions above —
 * that is the archive, and their ids still resolve — but they are never
 * dealt. Everything the app touches below is built from the active set.
 */
const activeBase = BASE_DECK.filter((q) => !q.retired)
const activeExpansion = expansionQuestions.filter((q) => !q.retired)

/** The canonical originals still in play. Was 114; Dido's retirement makes it 113. */
export const baseQuestions: string[] = activeBase.map((q) => q.text)

/** What the app plays. Same flat shape it has always been. */
export const questions: string[] = [
  ...baseQuestions,
  ...activeExpansion.map((q) => q.text),
]

/**
 * The stable id for each index in `questions`. This is what a rating is
 * filed under — never the text, which is free to change underneath it.
 */
export const questionIdByIndex: string[] = [
  ...activeBase.map((q) => q.id),
  ...activeExpansion.map((q) => q.id),
]

/** Every question ever written, active or retired, by id. */
export const ALL_BY_ID: ReadonlyMap<string, BaseEntry | Expansion> = new Map(
  [...BASE_DECK, ...expansionQuestions].map((q) => [q.id, q]),
)

/**
 * Every pack, in menu order: every `expansion` pack (questions) first, then
 * every `challenge` pack (dares), so the menu's two grids — Expansion Packs,
 * then Challenges — can each just filter this list and keep the order.
 */
export const PACKS: Pack[] = [
  { category: 'Warm-up', group: 'expansion' },
  { category: 'Personal', group: 'expansion' },
  { category: 'Nostalgia', group: 'expansion' },
  { category: 'Adulting', group: 'expansion' },
  { category: 'Travel', group: 'expansion' },
  { category: 'Messy', group: 'expansion' },
  { category: 'Dating', group: 'expansion' },
  { category: 'Queer Culture', group: 'expansion' },
  { category: 'AI', group: 'expansion' },
  {
    category: 'Sex',
    group: 'expansion',
    consent:
      'Sex is explicit. It asks about hookups, kinks, and what happens in bed, directly. Nothing in it belongs in a room where one person has not agreed to it — so before it goes into the shuffle, everyone playing needs to say yes out loud.',
  },

  { category: 'Dare', group: 'challenge' },
  {
    category: 'Dark Room',
    group: 'challenge',
    consent:
      'Dark Room is explicit. It asks about sex directly and some of it is a dare, not a question. Nothing in it belongs in a room where one person has not agreed to it — so before it goes into the shuffle, everyone playing needs to say yes out loud.',
  },
]

/** Every category, in menu order. Unchanged shape; derived now. */
export const CATEGORIES: Category[] = PACKS.map((p) => p.category)

/** Packs listed without a consent gate — free to switch on directly. */
export const OPEN_PACKS: Pack[] = PACKS.filter((p) => !p.consent)

/**
 * Packs that need everyone at the table to agree before they can be
 * switched on. Still listed openly in their group's grid — see `Pack`.
 */
export const GATED_PACKS: Pack[] = PACKS.filter((p) => p.consent)

export function packFor(category: Category): Pack {
  const pack = PACKS.find((p) => p.category === category)
  if (!pack) throw new Error('no pack for category: ' + category)
  return pack
}

/**
 * Category for each index in `questions` — `null` marks an original base
 * question, which never gets an eyebrow and can never be filtered out.
 */
export const categoryByIndex: (Category | null)[] = [
  ...activeBase.map(() => null),
  ...activeExpansion.map((q) => q.category),
]

/** Indices of the original 114 — the pool when every expansion category is off. */
export const basePool: number[] = baseQuestions.map((_, i) => i)

/**
 * Provenance for each index in `questions` — `'original'` for Ian's 114,
 * `'todd'` for everything in `expansionQuestions`. This is what ratings and
 * future paid-pack gating key off; it's data-layer only, not a visible label
 * on the card (that's what the category eyebrow is for).
 */
export const sourceByIndex: Source[] = [
  ...activeBase.map((): Source => 'original'),
  ...activeExpansion.map((): Source => 'todd'),
]
