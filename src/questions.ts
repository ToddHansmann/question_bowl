/**
 * The Question Bowl — the deck.
 *
 * `baseQuestions` is the original deck and is canonical: don't edit it. It's
 * Ian's original 114, and stays free.
 * `expansionQuestions` layers on top, each tagged with a category. It's
 * Todd-created content — the pool any future paid expansion packs would draw
 * from.
 * `questions` is the flat list the app plays — its shape is unchanged, so the
 * deck logic and UI don't know any of this structure exists.
 *
 * `sourceByIndex` and `categoryByIndex` (below) make that base/expansion
 * split, and each expansion question's category, queryable by index without
 * needing to change the shape of either array — so retiring a question or
 * adding a replacement is just editing the relevant array; nothing else
 * needs to change, since nothing persists an index across sessions (ratings
 * and suggestions, see feedback.ts, key on question *text*, not position).
 */

export type Category =
  | 'Warm-up'
  | 'Personal'
  | 'Messy'
  | 'Dating'
  | 'Risqué'
  | 'Challenge'
  | 'Adulting'
  | 'Travel'
  | 'Nostalgia'
  // Experimental packs — see PACKS at the foot of this file.
  | 'AI'
  | 'Queer Culture'
  | 'Dark Room'

/**
 * What a pack is for, which is not the same as what's in it.
 *
 * - `expansion` — the settled packs. Free, and not being measured for
 *   anything; they're just the deck.
 * - `experimental` — deliberately small, roughly 20–25 questions, shipped to
 *   find out whether a subject is worth more. The next tier here is the one
 *   that isn't written yet: a pack that earns its keep gets built out to ~100
 *   questions and moves behind a price. That gate reads `tier`, so adding it
 *   later is a new tier value and a check, not a reshape of this file. None
 *   of it is implemented, and nothing below assumes it.
 */
export type Tier = 'expansion' | 'experimental'

export type Pack = {
  category: Category
  tier: Tier
  /**
   * Present means the pack can't simply be switched on: it stays out of the
   * main list until deliberately revealed, and everyone at the table has to
   * agree before it joins the shuffle. The string is what they're agreeing
   * to. Consent is per-session and never remembered — same as every other
   * category choice, and for a better reason.
   */
  consent?: string
}

/** Where a question came from — `baseQuestions` vs. `expansionQuestions`. */
export type Source = 'original' | 'todd'

export type Expansion = {
  text: string
  category: Category
}

/* ------------------------------------------------------------------ base --- */

/** The original 114. Canonical — do not edit, reword, or reorder. */
export const baseQuestions: string[] = [
  "Describe a time or times when you feel very connected with yourself.",
  "Describe a time you were uncomfortable being alone.",
  "Describe a time you were mean to yourself.",
  "Share something people might not know about you. Maybe something you do at work or with family that people aren’t aware of.",
  "Describe your relationship to the contradicting human needs of: togetherness, separateness, security, freedom, surrender, autonomy.",
  "Dido has a famous song with the lyrics, “No love without freedom, no freedom without love.” Make a personal connection to this quote, or describe a time in your life when you feel this applied.",
  "“Love is the extremely difficult realization that something other than oneself is real.” — Iris Murdoch. Make a personal connection to this quote and share, or describe a time when you connected to this idea.",
  "Describe a time you ended a relationship. (Work, friend, romantic.)",
  "Describe a time a relationship was easy, flowy, and organic. Describe a time you had to work hard at a relationship.",
  "Describe an experience you had with the tension between tradition and newness.",
  "If you could snap your fingers and eliminate one thing from the planet, what would it be? (Except pain, suffering, death, war.) What would you add more of to the world?",
  "If you could eliminate gossip, would you?",
  "Would you rather ask someone out on a date or to hang out, or be asked out? (Friend, romance, etc.) Why?",
  "If you could make sure all children understood one thing, what would it be?",
  "If you could change the behavior of people, what would be one thing you would change?",
  "If you could change the way society views one thing, what would it be?",
  "Say out loud and fill in the blank: “I am amazing at ________.”",
  "What is an adage, mantra, saying, or quote you find meaningful?",
  "This is an acting card. Be very, very dramatic. With great drama and fanfare say, “I’m sorry. I can’t! I just can’t!” and dramatically discard the card.",
  "What is a misconception you think people have about you?",
  "What is a misconception you held for a very long time?",
  "Forgive someone else for something. Can be recent or from years ago. Say it out loud.",
  "Forgive yourself for something. Can be recent or from years ago. Say it out loud.",
  "What is a lesson that took you a really long time to learn?",
  "When you were a child, what is something you absolutely loved doing?",
  "Categories!",
  "What is a role you would like to play more in a relationship? (Work, friend, romantic.)",
  "What is a role you played in a relationship (work, friend, romantic) that you didn’t enjoy or sought to change?",
  "Describe a quality of “sameness” you look for in relationships, and a quality of “difference” you look for in relationships.",
  "What are 3 expectations you have for a relationship? Choose whether it’s a friend, romantic, business, or other.",
  "Did you have an open-door family vibe or a closed-door family vibe growing up?",
  "What was something you felt like you had too much of growing up, and too little of growing up?",
  "What is a story you often tell about yourself? What is a story you often tell about yourself that you would like to let go of?",
  "Were you educated in your youth that self-reliance is crucial, or were you taught to depend on others?",
  "What misinformation from your youth have you had to unlearn? Or do you want to unlearn?",
  "What is a piece of misinformation you often see other people falling for?",
  "Describe a time you were a people pleaser. What would you do differently now?",
  "When was a time you reacted in a way you wish you didn’t? What would you change?",
  "When was a time you made an assumption that turned out to be wrong?",
  "Describe a miscommunication that you experienced.",
  "When was a time you gave up but feel you shouldn’t have?",
  "Describe a firm boundary you have. Describe a porous boundary you have.",
  "Describe a time someone had power over you. Describe a time you had power over someone.",
  "Describe a time when you have given power to someone.",
  "Describe a time when you felt you had very little agency. Describe a time when you felt you had a lot of agency.",
  "Describe a difficult conversation you had with someone.",
  "Describe a time you had a conflict that got out of control. Describe a time you had a healthy conflict.",
  "Describe a time you avoided something.",
  "Describe a time you were confrontational.",
  "Describe a time you trusted someone and were let down.",
  "Describe a time you trusted someone and it worked out well.",
  "Describe a time you were betrayed.",
  "Describe a time you betrayed someone.",
  "Describe a relationship that ended and you had to let go.",
  "Describe a relationship you’ve had that is generative, erotic, vibrant.",
  "Describe a relationship you’ve had that felt dead and/or sapped your energy.",
  "What’s a dream you never shared?",
  "What’s a rule you secretly love to break?",
  "What’s a lie you’re tempted to tell about yourself?",
  "What did you learn about love or relationships from your parents?",
  "Never Have I Ever",
  "What makes you trust someone? What makes you distrust someone?",
  "Name a piece of art, movie, TV show, or play that you loved and think everyone should see.",
  "Give a compliment to the person to your right.",
  "Give an A grade to someone at the table for something they’ve done or said recently. Explain why.",
  "Give a rose and a thorn for the day, week, or month.",
  "Say something you’re grateful for.",
  "Say an intention or goal for the day, week, month, or year.",
  "Who would you be starstruck to see?",
  "What is something you wish you were more intentional about?",
  "What are three lessons or values you would want to instill upon your children (if you had children)?",
  "What is a life hack or productivity tip that has helped you a lot?",
  "What is a great piece of advice someone shared with you?",
  "What is an important lesson you learned from a prior relationship?",
  "What is something in your life you thought would never change but surprisingly did?",
  "Describe an ideal day.",
  "Name a place you’ve traveled to and would go again. Name a place you would avoid.",
  "What’s been your biggest adventure?",
  "What is something new sexually you would like to experience?",
  "What is one of the most challenging emotions for you to experience?",
  "When do you feel most present? Like you’re a child at play.",
  "What would you say makes you not the easiest person to live with?",
  "Describe a time when you changed your mind.",
  "What would you do if you had a different career?",
  "Were you raised for autonomy or raised for loyalty?",
  "What is something you wish you had known or been told as a child?",
  "What is one of the lessons learned from a heartbreak?",
  "What is a conversation that you need to have with yourself?",
  "What is a habit you would like to stop? What is a habit you would like to start?",
  "When did you know you were no longer a child?",
  "What is a tradition you love and wish to continue?",
  "What is the relationship legacy from your own family of origin that you want to keep?",
  "What is an aspect from your relationship culture that you’re set on changing?",
  "What’s a challenge that you have successfully faced, and how have you handled it?",
  "Name a risk you took that paid off.",
  "Name a risk that you’ve taken and learned from.",
  "Name someone who has inspired you, and how.",
  "Name a time you had an “aha” moment that led you to make a big change.",
  "Would you rather care for someone or be cared for? Why?",
  "What’s something you like or dislike that most other people don’t?",
  "What is your ______________ ____________ experience?",
  "Marry, ____________, kill . . . The person to your left chooses the 3.",
  "What is your ideal frequency for having _________?",
  "What’s something __________ you like that most other people don’t?",
  "What is a relationship must for you? Romantic or otherwise.",
  "What is a ____________ must for you?",
  "What is a major ___________ turn-off?",
  "What is a major relationship red flag for you?",
  "Why are you such a __________?",
  "What is one _______________ experience or act you would like to try?",
  "What is one _______________ experience or act you have done but don’t want to do again?",
  "M, F, K: Pudding, Pickles, Porridge.",
  "M, F, K: The person to your right chooses the 3.",
  "M, F, K: The person across from you chooses the 3.",
]

/* ------------------------------------------------------------- expansion --- */

/**
 * The expansion deck. Two exact duplicates of base questions were dropped
 * during the audit — see README. Near-duplicates are still here, flagged in
 * the audit but deliberately left in play pending review.
 */
export const expansionQuestions: Expansion[] = [
  /* -- Warm-up ----------------------------------------------------------- */
  { category: 'Warm-up', text: "What’s the weirdest compliment you’ve ever received?" },
  { category: 'Warm-up', text: "Which person here do you think would survive longest on a deserted island?" },
  { category: 'Warm-up', text: "What’s a completely useless talent you’re oddly proud of?" },
  { category: 'Warm-up', text: "If your life had a warning label, what would it say?" },
  { category: 'Warm-up', text: "Which person here would make the best cult leader?" },
  { category: 'Warm-up', text: "What’s the most ridiculous purchase you’ve ever justified?" },
  { category: 'Warm-up', text: "If you had to swap lives with someone here for a week, who would it be?" },
  { category: 'Warm-up', text: "What’s your most irrational fear?" },
  { category: 'Warm-up', text: "What TV family would you want to join?" },
  { category: 'Warm-up', text: "What’s the funniest lie you’ve ever told?" },
  { category: 'Warm-up', text: "What’s one thing everyone should experience once?" },
  { category: 'Warm-up', text: "What’s your most controversial food opinion?" },
  { category: 'Warm-up', text: "What would your autobiography be called?" },
  { category: 'Warm-up', text: "What’s something you’ve pretended to know about?" },
  { category: 'Warm-up', text: "Which person here would be the hardest to date?" },
  { category: 'Warm-up', text: "What’s a tiny hill you’d die on?" },
  { category: 'Warm-up', text: "If you could relive one day, which would it be?" },
  { category: 'Warm-up', text: "What’s something you secretly think you’re excellent at?" },
  { category: 'Warm-up', text: "If your phone wallpaper had to be explained, what would the story be?" },
  { category: 'Warm-up', text: "Are you a \"yes, hand me the baby\" person, or a \"please don't hand me the baby\" person?" },
  { category: 'Warm-up', text: "What's the most boomer thing you've caught yourself doing?" },
  { category: 'Warm-up', text: "Which generation — including the ones in between — do you feel like you don't quite belong to?" },
  { category: 'Warm-up', text: "What pet from your childhood are you still a little in mourning for, or a little relieved you don't have anymore?" },
  { category: 'Warm-up', text: "What's your hometown actually known for, and is it deserved?" },
  { category: 'Warm-up', text: "What's the worst haircut you've ever paid for and then had to walk around in public with?" },
  { category: 'Warm-up', text: "What's your gay identifier, if you claim one — twink, bear, otter, none of the above?" },
  { category: 'Warm-up', text: "Defend or convict: is double-dipping actually a big deal, or is George right that everyone's overreacting?" },
  { category: 'Warm-up', text: "What food combination do you love that visibly disturbs other people?" },
  { category: 'Warm-up', text: "If your group chat assigned you a job title, what would it be?" },
  { category: 'Warm-up', text: "What phase were you convinced was permanent at the time?" },
  { category: 'Warm-up', text: "What's the last thing you searched for that you'd hesitate to say out loud right now?" },
  { category: 'Warm-up', text: "What's your best \"you had to be there\" story from the pandemic — the one that still makes you laugh?" },
  { category: 'Warm-up', text: "Nobody ever sneezes again. How long before you notice?" },
  { category: 'Warm-up', text: "If ice cream came in flavours of emotions and ideas, which one are you trying first?" },
  { category: 'Warm-up', text: "You are stuck in a time loop repeating one thing forever. What are you picking?" },
  { category: 'Warm-up', text: "What would people in this room assume you had been arrested for?" },
  { category: 'Warm-up', text: "If one season vanished from the calendar forever, which are you sacrificing?" },
  { category: 'Warm-up', text: "Where do you actually land on time travel — back, forward, or leave it alone?" },
  { category: 'Warm-up', text: "Do you have a bird story? Everyone who has one has a strange one." },
  { category: 'Warm-up', text: "Phone call, voice note, or text — and what does your answer give away about when you were born?" },
  { category: 'Warm-up', text: "What is something younger people do that you mocked and have quietly started doing?" },
  { category: 'Warm-up', text: "What is your villain-era self doing right now?" },

  /* -- Personal ---------------------------------------------------------- */
  { category: 'Personal', text: "When was the last time you changed your mind about something important?" },
  { category: 'Personal', text: "What’s something you’ve never apologized for but probably should?" },
  { category: 'Personal', text: "What’s one thing you wish people understood about you?" },
  { category: 'Personal', text: "What’s your biggest relationship green flag?" },
  { category: 'Personal', text: "What’s your biggest relationship red flag?" },
  { category: 'Personal', text: "When do you feel most attractive?" },
  { category: 'Personal', text: "What’s the nicest thing an ex ever did for you?" },
  { category: 'Personal', text: "Who knows you better than anyone?" },
  { category: 'Personal', text: "What’s something you’ve outgrown?" },
  { category: 'Personal', text: "When do you feel most like yourself?" },
  { category: 'Personal', text: "What’s something you miss from childhood?" },
  { category: 'Personal', text: "What’s something you’ve never admitted to your parents?" },
  { category: 'Personal', text: "What’s one insecurity you’ve mostly overcome?" },
  { category: 'Personal', text: "What’s your love language — even if you hate the phrase?" },
  { category: 'Personal', text: "What’s something you’ve forgiven that surprised you?" },
  { category: 'Personal', text: "What’s your biggest “what if?”" },
  { category: 'Personal', text: "What’s something you’re currently working on in yourself?" },
  { category: 'Personal', text: "What’s one compliment you’ll never forget?" },
  { category: 'Personal', text: "What’s something you hope is true five years from now?" },
  { category: 'Personal', text: "What does a good night alone actually look like for you?" },
  { category: 'Personal', text: "What's something you do to recharge that would surprise people who think they know you?" },
  { category: 'Personal', text: "What's your unofficial ritual for coming back to yourself after a stretch of being \"on\" for other people?" },
  { category: 'Personal', text: "What's the difference between being alone and being lonely, for you specifically?" },
  { category: 'Personal', text: "What's a form of self-care everyone raves about that does nothing for you?" },
  { category: 'Personal', text: "How do you know when you've hit your social limit for the day?" },
  { category: 'Personal', text: "What's something you've stopped feeling guilty about doing by yourself?" },
  { category: 'Personal', text: "You have one hour left and you cannot contact anyone you love. How do you spend it?" },
  { category: 'Personal', text: "A machine writes the complete and honest account of your life. You may read one chapter. Which one?" },
  { category: 'Personal', text: "The lever kills one person instead of five. Do you pull it, and how long do you stand there?" },
  { category: 'Personal', text: "Would you take a pill that permanently removed one memory?" },
  { category: 'Personal', text: "What have you lost that you still think about?" },
  { category: 'Personal', text: "If this stretch of your life had a chapter title, what would it be?" },
  { category: 'Personal', text: "What advice from your younger self would you actually take?" },

  /* -- Messy ------------------------------------------------------------- */
  { category: 'Messy', text: "What’s the pettiest thing you’ve ever done?" },
  { category: 'Messy', text: "Have you ever accidentally ruined someone’s relationship?" },
  { category: 'Messy', text: "What’s the most awkward text you’ve sent to the wrong person?" },
  { category: 'Messy', text: "What’s the worst first impression you’ve ever made?" },
  { category: 'Messy', text: "Have you ever pretended not to recognize someone?" },
  { category: 'Messy', text: "What’s your most embarrassing drunk story?" },
  { category: 'Messy', text: "What’s something you’ve stolen — even accidentally?" },
  { category: 'Messy', text: "Have you ever faked being sick to avoid someone?" },
  { category: 'Messy', text: "What’s your biggest social regret?" },
  { category: 'Messy', text: "What’s the longest you’ve gone without admitting you were wrong?" },
  { category: 'Messy', text: "What’s the meanest thing you’ve ever said in an argument?" },
  { category: 'Messy', text: "Have you ever ghosted someone you actually liked?" },
  { category: 'Messy', text: "What’s the biggest lie you’ve told that nobody ever discovered?" },
  { category: 'Messy', text: "What’s the most jealous you’ve ever been?" },
  { category: 'Messy', text: "Have you ever sabotaged yourself?" },
  { category: 'Messy', text: "What’s the closest you’ve come to getting arrested?" },
  { category: 'Messy', text: "What’s your worst wedding guest behavior?" },
  { category: 'Messy', text: "What’s the most embarrassing thing someone has caught you doing?" },
  { category: 'Messy', text: "What’s the biggest misunderstanding you’ve ever created?" },
  { category: 'Messy', text: "What’s the hardest you’ve laughed at someone else’s misfortune?" },
  { category: 'Messy', text: "Have you ever quietly refused to pay someone back, purely out of principle?" },
  { category: 'Messy', text: "Have you ever calculated your exact share of a group bill down to the cent and made everyone wait for it?" },
  { category: 'Messy', text: "What's the worst version of yourself that group vacations bring out?" },
  { category: 'Messy', text: "Have you ever been genuinely offended by someone else's wedding plus-one policy?" },
  { category: 'Messy', text: "What's the pettiest thing you've done to a hairstylist who wronged you — including just never going back, no explanation?" },
  { category: 'Messy', text: "Have you ever pretended to like a haircut you hated, to the stylist's face?" },
  { category: 'Messy', text: "What's a group chat argument that got way more heated than the actual topic deserved?" },
  { category: 'Messy', text: "Did you break your own pandemic rules and never tell anyone?" },
  { category: 'Messy', text: "Have you ever fully checked out at a job while still collecting the paycheck — and for how long did you get away with it?" },
  { category: 'Messy', text: "Has a stranger ever watched you at your absolute worst in public?" },

  /* -- Dating ------------------------------------------------------------ */
  { category: 'Dating', text: "Which celebrity would immediately make you nervous to flirt with?" },
  { category: 'Dating', text: "What’s the boldest move you’ve made on someone?" },
  { category: 'Dating', text: "Have you ever had a crush on someone in this room?" },
  { category: 'Dating', text: "What’s your biggest turn-on that isn’t physical?" },
  { category: 'Dating', text: "What’s the most attractive quality someone can have?" },
  { category: 'Dating', text: "Have you ever kissed someone you just met?" },
  { category: 'Dating', text: "What’s the most spontaneous romantic thing you’ve ever done?" },
  { category: 'Dating', text: "Have you ever had feelings for someone you absolutely shouldn’t have?" },
  { category: 'Dating', text: "What’s your biggest dating “ick”?" },
  { category: 'Dating', text: "What’s something someone could do that would instantly make you interested?" },
  { category: 'Dating', text: "Have you ever accidentally flirted with the wrong person?" },
  { category: 'Dating', text: "What’s your most memorable first kiss?" },
  { category: 'Dating', text: "What’s the biggest age gap you’ve dated?" },
  { category: 'Dating', text: "Have you ever been caught making out?" },
  { category: 'Dating', text: "What’s your favorite excuse for leaving a bad date?" },
  { category: 'Dating', text: "What’s the most ridiculous reason you’ve liked someone?" },
  { category: 'Dating', text: "Have you ever matched with someone you already knew?" },
  { category: 'Dating', text: "What’s something you’ve always wanted to try on a date?" },
  { category: 'Dating', text: "Have you ever gone on two dates in one day?" },
  { category: 'Dating', text: "What’s your most unforgettable romantic disaster?" },
  { category: 'Dating', text: "Were you and an ex ever \"on a break\" in the Ross-and-Rachel sense — and did you both actually agree on what that meant?" },
  { category: 'Dating', text: "How do you and a partner actually split money — and did you ever have to negotiate that out loud?" },
  { category: 'Dating', text: "What's the most awkward you've felt being someone's plus-one at a wedding — or bringing a plus-one everyone was skeptical of?" },
  { category: 'Dating', text: "Would you rather find out your partner is bad with money or bad with time?" },
  { category: 'Dating', text: "What's a relationship \"rule\" you and a partner made up that would sound insane to anyone else?" },
  { category: 'Dating', text: "What is the largest age gap you would be comfortable with, and does the direction change your answer?" },
  { category: 'Dating', text: "Have you dated someone much older or much younger, and what did it teach you?" },
  { category: 'Dating', text: "At what point does an age gap stop being anybody else's business?" },

  /* -- Risqué ------------------------------------------------------------ */
  { category: 'Risqué', text: "What’s the most memorable hookup you’ve ever had, and what made it stick?" },
  { category: 'Risqué', text: "What does your Grindr profile claim about you that isn’t strictly true?" },
  { category: 'Risqué', text: "What’s a kink you were surprised to discover you were into?" },
  { category: 'Risqué', text: "What’s your hard limit — the thing you’ll never be talked into?" },
  { category: 'Risqué', text: "What’s the hottest thing someone has ever said to you in bed?" },
  { category: 'Risqué', text: "What’s the most public place you’ve ever had sex?" },
  { category: 'Risqué', text: "Top, bottom, vers — and has that changed over the years?" },
  { category: 'Risqué', text: "What’s the strangest place you’ve ever met someone for sex?" },
  { category: 'Risqué', text: "What’s a sexual boundary you set that you’re proud of?" },
  { category: 'Risqué', text: "What’s the biggest gap you’ve encountered between the profile and the person?" },
  { category: 'Risqué', text: "What’s a fantasy you’ve never said out loud to anyone at this table?" },
  { category: 'Risqué', text: "What’s the best sex you’ve ever had, and what made it the best?" },
  { category: 'Risqué', text: "What were you into five years ago that does nothing for you now?" },
  { category: 'Risqué', text: "Tell the story of your first time with a man." },
  { category: 'Risqué', text: "How do you turn someone down when you’re just not interested?" },
  { category: 'Risqué', text: "What’s a sexual insecurity you’ve made peace with?" },
  { category: 'Risqué', text: "What’s the worst hookup you’ve ever had — the one that became a story?" },
  { category: 'Risqué', text: "What’s a physical type you’re into that your friends have never understood?" },
  { category: 'Risqué', text: "Have you ever had sex somewhere you could have been caught? What happened?" },
  { category: 'Risqué', text: "Do you stay the night after a hookup, or are you out the door — and has that ever caused a problem?" },
  { category: 'Risqué', text: "Have you ever had a completely faceless, anonymous encounter, and would you do it again?" },
  { category: 'Risqué', text: "Glory holes: curiosity, hard pass, or been there?" },
  { category: 'Risqué', text: "Have you ever been the one to pump and dump — or the one left wondering why someone vanished?" },
  { category: 'Risqué', text: "Where's your personal line between sex and sex with substances involved?" },
  { category: 'Risqué', text: "What's a hookup situation where you genuinely felt unsafe, not just regretful?" },
  { category: 'Risqué', text: "What's the boldest lie you've told to get someone to come over?" },
  { category: 'Risqué', text: "How long was your longest dry spell, and what ended it?" },
  { category: 'Risqué', text: "Have you ever been part of a group scene — and would you seek that out again, or file it under \"once was enough\"?" },
  { category: 'Risqué', text: "How old were you the first time you used a hookup app, and does that number surprise people?" },
  { category: 'Risqué', text: "Have you ever hooked up with a coworker?" },
  { category: 'Risqué', text: "Have you ever jerked off at work?" },
  { category: 'Risqué', text: "Which celebrity was your gay sexual awakening?" },
  { category: 'Risqué', text: "What is your underwear vibe?" },
  { category: 'Risqué', text: "During sex, are you noisy or quiet?" },
  { category: 'Risqué', text: "Which uniform gets you instantly horny?" },
  { category: 'Risqué', text: "Have you ever faked an orgasm? Demonstrate." },

  /* -- Challenge --------------------------------------------------------- */
  { category: 'Challenge', text: "Let the group choose your phone wallpaper until tomorrow." },
  { category: 'Challenge', text: "Speak in an accent until your next turn." },
  { category: 'Challenge', text: "Swap seats with the person who knows you least." },
  { category: 'Challenge', text: "Attempt 20 push-ups." },
  { category: 'Challenge', text: "Trade one article of clothing with the person to your left." },
  { category: 'Challenge', text: "Do your best impression of another player." },
  { category: 'Challenge', text: "Serenade someone with the chorus of any song." },
  { category: 'Challenge', text: "Let another player style your hair." },
  { category: 'Challenge', text: "Do five yoga poses chosen by the group." },
  { category: 'Challenge', text: "Tell a joke. If nobody laughs, tell another." },
  { category: 'Challenge', text: "Moonwalk — or attempt to." },
  { category: 'Challenge', text: "Hold eye contact with the person across from you for 30 seconds without laughing." },
  { category: 'Challenge', text: "Do your best animal impression until someone guesses it." },
  { category: 'Challenge', text: "Read out the last message you sent on a hookup app." },
  { category: 'Challenge', text: "Let the group write your hookup-app tagline for the next 24 hours." },
  { category: 'Challenge', text: "Text an ex, “I was just thinking about you.” No explanation, no follow-up." },
  { category: 'Challenge', text: "Do your most convincing moan." },
  { category: 'Challenge', text: "Try your best opening line on the person to your right." },
  { category: 'Challenge', text: "Take off one item of clothing. You choose which." },
  { category: 'Challenge', text: "Let the table pick one word to describe you in bed." },
  { category: 'Challenge', text: "Give the person to your left a fifteen-second shoulder massage." },
  { category: 'Challenge', text: "Whisper something filthy to the person on your right. They decide whether to repeat it." },
  { category: 'Challenge', text: "Rank the table by who would be the best kisser. Out loud, with reasons." },
  { category: 'Challenge', text: "Describe your type in three words, then let the table rule on whether that’s really true." },
  { category: 'Challenge', text: "Say the filthiest thing you’ve ever said in bed, in the most romantic voice you can manage." },
  { category: 'Challenge', text: "Share your current hookup-app profile pic with the group — no context, no explanation." },
  { category: 'Challenge', text: "Dig up your most catfish Grindr photo — the one that owes everyone an apology — and share it." },
  { category: 'Challenge', text: "Find out who has the longest tongue at the table. Prove it." },
  { category: 'Challenge', text: "Say your screen time from last week out loud. The exact number." },

  /* -- Adulting ------------------------------------------------------------ */
  { category: 'Adulting', text: "What's the most you've ever spent trying to avoid an awkward conversation about money?" },
  { category: 'Adulting', text: "Do you round up, split exactly evenly, or calculate your precise share when the bill comes?" },
  { category: 'Adulting', text: "What's your actual tipping philosophy, and has it changed since you had to work for tips yourself?" },
  { category: 'Adulting', text: "How much \"quiet quitting\" is happening in your current job, if you're honest?" },
  { category: 'Adulting', text: "What's the most office-culture-poisoned phrase you've caught yourself saying out loud?" },
  { category: 'Adulting', text: "Are you the friend who organizes the group plans, or the one who shows up wherever you're told?" },
  { category: 'Adulting', text: "What's something you fixed yourself that you're unreasonably proud of?" },
  { category: 'Adulting', text: "Describe the last time you had to actually lead something — a project, a room, a group of drunk friends." },
  { category: 'Adulting', text: "What's your relationship with public speaking: thrive, survive, or actively avoid?" },
  { category: 'Adulting', text: "What's your actual daily screen time, and how far off is that from what you'd guess?" },
  { category: 'Adulting', text: "Is there a creator, celebrity, or total stranger online whose life you're weirdly invested in?" },
  { category: 'Adulting', text: "What platform do you actually enjoy using, versus the one you use out of habit?" },
  { category: 'Adulting', text: "What's a car repair or home repair you attempted yourself that you now regret?" },
  { category: 'Adulting', text: "Which generation's work ethic do you secretly think you have, regardless of when you were born?" },
  { category: 'Adulting', text: "What's the most \"I am becoming my parents\" financial habit you've picked up?" },
  { category: 'Adulting', text: "Are you chronically early, chronically late, or does it depend entirely on who's waiting for you?" },
  { category: 'Adulting', text: "What workplace rule were you told was non-negotiable that turned out to be nonsense?" },
  { category: 'Adulting', text: "What were you told about buying a home that turned out to be a fairy tale?" },

  /* -- Travel ---------------------------------------------------------------- */
  { category: 'Travel', text: "Are you an over-packer or an under-packer, and which trip finally proved it?" },
  { category: 'Travel', text: "What's the most convincing travel scam you've ever fallen for, even a little?" },
  { category: 'Travel', text: "What's your worst canceled- or delayed-flight story?" },
  { category: 'Travel', text: "What's an unwritten rule of flying that you think everyone should follow and clearly doesn't?" },
  { category: 'Travel', text: "What's the longest layover you've survived, and how did you fill the time?" },
  { category: 'Travel', text: "What's a trip that went wrong in a way that turned into a great story only in hindsight?" },
  { category: 'Travel', text: "Window, aisle, or you'll take whatever's left — and is that a real preference or just resignation?" },
  { category: 'Travel', text: "What's the most unexpectedly great thing that's happened to you while traveling alone?" },
  { category: 'Travel', text: "Have you ever nearly missed a flight because of something completely avoidable?" },
  { category: 'Travel', text: "What souvenir did you buy that you immediately regretted?" },
  { category: 'Travel', text: "What's your pre-flight ritual, if you have one?" },
  { category: 'Travel', text: "Have you ever lost your passport, wallet, or phone while traveling — and how did that story end?" },
  { category: 'Travel', text: "What's a destination with a five-star reputation that you'd personally give three stars?" },
  { category: 'Travel', text: "Would you fly somewhere else to have a medical procedure done cheaper?" },
  { category: 'Travel', text: "What is the most questionable thing you would have done to your body abroad to save money?" },

  /* -- Nostalgia --------------------------------------------------------- */
  { category: 'Nostalgia', text: "What was your first car, and do you remember it fondly or is it better left forgotten?" },
  { category: 'Nostalgia', text: "Describe your first kiss — the real, non-negotiable, no-do-overs first one." },
  { category: 'Nostalgia', text: "Was your first kiss with a person of the same sex before or after you'd figured out you were gay?" },
  { category: 'Nostalgia', text: "What's your coming out story — the real one, not the polished version you tell now?" },
  { category: 'Nostalgia', text: "Was there a period where you were out to some people and closeted with others? What was that like to manage?" },
  { category: 'Nostalgia', text: "Did you ever have a \"beard\" — a girlfriend or boyfriend to hide who you actually were?" },
  { category: 'Nostalgia', text: "When did you first realize you were gay, even before you had the words for it?" },
  { category: 'Nostalgia', text: "What's something you desperately wanted as a kid that you never got?" },
  { category: 'Nostalgia', text: "What toy, show, or piece of music defined your childhood more than anything else?" },
  { category: 'Nostalgia', text: "Did you go to prom? Who with, and how honest were you being with yourself that night?" },
  { category: 'Nostalgia', text: "What's your best or worst high school story that still comes up with old friends?" },
  { category: 'Nostalgia', text: "Who was in your pandemic pod, and would you choose the same people again?" },
  { category: 'Nostalgia', text: "What was your honest opinion on mask etiquette during the pandemic — not the polite one?" },
  { category: 'Nostalgia', text: "How did working from home change you, for better or worse?" },
  { category: 'Nostalgia', text: "What's a place you used to live that you have complicated feelings about?" },
  { category: 'Nostalgia', text: "What childhood friendship do you wish you'd kept, and what happened to it?" },
  { category: 'Nostalgia', text: "What was the first record, cassette, CD or download you bought with your own money?" },
  { category: 'Nostalgia', text: "One album for the rest of your life. Pick it, and no changing your mind." },
  { category: 'Nostalgia', text: "What is your go-to karaoke song, and how honest are you being right now?" },
  { category: 'Nostalgia', text: "What was your first username, and what does it say about you?" },
  { category: 'Nostalgia', text: "Which generation had it easiest, and can you defend that?" },
  { category: 'Nostalgia', text: "What technology did you have to learn as an adult that children now simply know?" },
  { category: 'Nostalgia', text: "What did dating look like when you started, and would you survive dating now?" },
  { category: 'Nostalgia', text: "What did your parents' generation get right that yours has quietly dropped?" },

  /* -- AI (experimental) ------------------------------------------------- */
  { category: 'AI', text: "Have you ever had a genuinely emotional exchange with an AI chatbot?" },
  { category: 'AI', text: "Have you ever thanked an AI, and did you mean it?" },
  { category: 'AI', text: "What have you told an AI that you have not told anyone in this room?" },
  { category: 'AI', text: "Would you be hurt if a friend used AI to write your birthday message?" },
  { category: 'AI', text: "If a machine could do most of your job tomorrow, are you relieved or terrified?" },
  { category: 'AI', text: "Would you date someone who talks to an AI companion every day?" },
  { category: 'AI', text: "What is the last thing you asked an AI that you would rather not say out loud?" },
  { category: 'AI', text: "Do you trust a machine's medical advice more or less than a doctor you waited six weeks to see?" },
  { category: 'AI', text: "If an AI wrote a song that made you cry, does it still count?" },
  { category: 'AI', text: "Who would you least want replaced by a machine — your therapist, your doctor, or your barista?" },
  { category: 'AI', text: "Have you ever changed your mind because an AI argued with you?" },
  { category: 'AI', text: "If a machine could imitate your voice perfectly, who would you have it call?" },
  { category: 'AI', text: "Would you want to know if the person you matched with wrote their profile with AI?" },
  { category: 'AI', text: "What job should never be automated, however good the machine gets?" },
  { category: 'AI', text: "If an AI remembered everything you ever told it, is that intimacy or surveillance?" },
  { category: 'AI', text: "Is something you made less yours because a machine helped make it?" },
  { category: 'AI', text: "Would you let an AI read your messages if it made you a better partner?" },
  { category: 'AI', text: "If a machine says it is conscious, what would actually convince you?" },
  { category: 'AI', text: "What would you want deleted before an AI got to know you?" },
  { category: 'AI', text: "How long could you work without AI before anyone noticed the difference?" },
  { category: 'AI', text: "Would you want a version of yourself that kept talking to your family after you died?" },
  { category: 'AI', text: "What is the most human thing you think a machine will never manage?" },
  { category: 'AI', text: "Has AI ever made you feel worse about your own creativity?" },

  /* -- Queer Culture (experimental) -------------------------------------- */
  { category: 'Queer Culture', text: "What is an unpopular opinion you hold about a queer icon?" },
  { category: 'Queer Culture', text: "What is something extremely gay you did while closeted and thought nobody clocked?" },
  { category: 'Queer Culture', text: "Who clocked you before you clocked yourself?" },
  { category: 'Queer Culture', text: "What is the first queer character you saw on screen who felt real?" },
  { category: 'Queer Culture', text: "Which queer bar or space do you still miss?" },
  { category: 'Queer Culture', text: "What piece of queer slang do you refuse to use?" },
  { category: 'Queer Culture', text: "What is the straightest thing about you?" },
  { category: 'Queer Culture', text: "What did you think being queer would cost you that it never did?" },
  { category: 'Queer Culture', text: "Which Pride would you rather forget?" },
  { category: 'Queer Culture', text: "What is the best coming-out reaction you have ever heard about — yours or someone else's?" },
  { category: 'Queer Culture', text: "Which queer stereotype do you fit almost exactly, and how do you feel about that?" },
  { category: 'Queer Culture', text: "What does the community do that you wish it would stop doing?" },
  { category: 'Queer Culture', text: "Who was the first person you told, and would you pick them again?" },
  { category: 'Queer Culture', text: "What queer film or show is genuinely bad and you would defend it anyway?" },
  { category: 'Queer Culture', text: "Which queer elder do you wish you had met?" },
  { category: 'Queer Culture', text: "Is there a label you tried on and handed back?" },
  { category: 'Queer Culture', text: "What is the most useful thing an older queer person ever told you?" },
  { category: 'Queer Culture', text: "What do straight people most misunderstand about queer friendship?" },
  { category: 'Queer Culture', text: "What song turns any room into a gay bar?" },
  { category: 'Queer Culture', text: "What is the gayest thing you own?" },
  { category: 'Queer Culture', text: "Have you ever felt not queer enough for a queer space?" },
  { category: 'Queer Culture', text: "What queer tradition would you like to invent?" },

  /* -- Dark Room (experimental, consent-gated) --------------------------- */
  { category: 'Dark Room', text: "Share your Sniffies profile picture with the group." },
  { category: 'Dark Room', text: "Have you ever used Sniffies? How did that go?" },
]

/* ----------------------------------------------------------------- deck --- */

/** What the app plays. Same flat shape it has always been. */
export const questions: string[] = [
  ...baseQuestions,
  ...expansionQuestions.map((q) => q.text),
]

/**
 * Every pack, in menu order: the settled ones first, then the experiments,
 * then the one nobody sees until they ask for it.
 */
export const PACKS: Pack[] = [
  { category: 'Warm-up', tier: 'expansion' },
  { category: 'Personal', tier: 'expansion' },
  { category: 'Nostalgia', tier: 'expansion' },
  { category: 'Adulting', tier: 'expansion' },
  { category: 'Travel', tier: 'expansion' },
  { category: 'Messy', tier: 'expansion' },
  { category: 'Dating', tier: 'expansion' },
  { category: 'Risqué', tier: 'expansion' },
  { category: 'Challenge', tier: 'expansion' },

  { category: 'AI', tier: 'experimental' },
  { category: 'Queer Culture', tier: 'experimental' },

  {
    category: 'Dark Room',
    tier: 'experimental',
    consent:
      'Dark Room is explicit. It asks about sex directly and some of it is a dare, not a question. Nothing in it belongs in a room where one person has not agreed to it — so before it goes into the shuffle, everyone playing needs to say yes out loud.',
  },
]

/** Every expansion category, in menu order. Unchanged shape; derived now. */
export const CATEGORIES: Category[] = PACKS.map((p) => p.category)

/** Packs listed plainly in the menu — everything without a consent gate. */
export const OPEN_PACKS: Pack[] = PACKS.filter((p) => !p.consent)

/** Packs that have to be revealed and agreed to before they can be enabled. */
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
  ...baseQuestions.map(() => null),
  ...expansionQuestions.map((q) => q.category),
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
  ...baseQuestions.map((): Source => 'original'),
  ...expansionQuestions.map((): Source => 'todd'),
]
