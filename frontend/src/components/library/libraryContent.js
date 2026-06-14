/**
 * Library — in-game knowledge base content.
 *
 * Each article: { id, category, title, summary, tags, body, keyTakeaway }
 *   body — array of blocks. A block is either a string (paragraph) or
 *          { type: "table", headers: [...], rows: [[...], [...]] }.
 *
 * Content is hardcoded by design (per spec) — no CMS. Search index is
 * built on Library mount from this array.
 *
 * Where the original spec referenced game systems that have since changed,
 * the prose has been updated to match the live game (weight class rename,
 * Mental Reset removal, injury auto-heal, post-fight interview win-only).
 */

export const LIBRARY_CATEGORIES = [
    "Getting Started",
    "Fighting",
    "The Proving Ground",
    "Training & Gyms",
    "Career",
    "Economy",
    "Health",
    "Shop & Supplements",
    "Events & Media",
];

export const CATEGORY_COLOR = {
    "Getting Started": "start",
    "Fighting": "fight",
    "The Proving Ground": "fight",
    "Training & Gyms": "gym",
    "Career": "career",
    "Economy": "economy",
    "Health": "health",
    "Shop & Supplements": "shop",
    "Events & Media": "events",
};
export const slugFor = (cat) => CATEGORY_COLOR[cat] ?? "start";

export const LIBRARY_ARTICLES = [
    // ──────────────────────────────────────────────────────────────
    // GETTING STARTED
    // ──────────────────────────────────────────────────────────────
    {
        id: "what-is-this-game",
        category: "Getting Started",
        title: "What Is Ground & Pound?",
        summary: "The big picture — what kind of game this is and what you're actually trying to do.",
        tags: ["overview", "intro", "career", "championship", "gcs", "simulation"],
        body: [
            "Ground & Pound is a text-based MMA career simulation. You are not watching fights happen — you are building the fighter who wins them. Every decision you make before stepping into the cage determines what happens when the door shuts.",
            "Your career starts at the bottom of the Amateur division, completely unknown, with raw stats and a borrowed locker at the community gym. From there, every training session, every fight camp, every sponsorship deal, and every callout is a step toward the only thing that matters: the GCS Championship.",
            "There are five promotion tiers standing between you and the top. Almost every one makes you look the tier's champion in the eye and take what's theirs — starting with the Amateur belt that turns you pro. Only one tier promotes on Overall Rating alone. The game doesn't hand you anything.",
            "The fight itself resolves instantly — press Fight and the simulation runs. The real game happens in the hours and days before that moment. How you trained, which sessions you picked in camp, how you read the Fighter Report — that's where championships are won and lost.",
        ],
        keyTakeaway: "Build the fighter. Make the decisions. The cage takes care of the rest.",
    },
    {
        id: "creating-your-fighter",
        category: "Getting Started",
        title: "Creating Your Fighter",
        summary: "Everything you choose at character creation and what it means for your career.",
        tags: ["creation", "weight class", "style", "backstory", "ovr"],
        body: [
            "When you create a fighter, three choices define your starting point: weight class, fighting style, and backstory. None of these lock you into a fixed path — you can train any stat to 100 regardless of style — but they determine where you start and how quickly you develop in certain areas.",
            "Weight class isn't cosmetic — it shapes your entire matchmaking universe. The four options are Featherweight (145 lb), Lightweight (155 lb), Middleweight (185 lb), and Heavyweight (265 lb). You'll only ever face opponents in your own class, you can only call out fighters who share it, and the rankings and champions you compete against are class-specific. Pick deliberately — you stay in this class for your career.",
            "Fighting style has real mechanical weight. Each style assigns your eight stats into primary (1.2× OVR weight), secondary (1.0×), and off-style (0.85×) categories. A Boxer's STR and SPD count for more in their Overall Rating than a Wrestler's would. Choose the style that matches how you want to fight.",
            "Backstory gives a small permanent bonus that never goes away. Street Fighter gives CHN and KO resistance. Late Bloomer gives +25% XP from all training — extremely valuable for a grinding playstyle. MMA Prodigy gives +2 to everything, safe and consistent. Choose based on how you plan to develop your fighter.",
        ],
        keyTakeaway: "Style affects how your stats are weighted in your OVR. Backstory gives a permanent bonus. Both matter — choose deliberately.",
    },
    {
        id: "energy",
        category: "Getting Started",
        title: "Energy — The Daily Resource",
        summary: "How energy works, what it costs, and how to think about spending it.",
        tags: ["energy", "training", "daily", "resource"],
        body: [
            "Energy is the heartbeat of your career. Maximum 100. Every meaningful action costs it. It regenerates automatically at 1 point per minute — a full bar from zero takes about an hour and forty minutes of real time.",
            "Training sessions cost 3–8 energy depending on the session. Sparring is the most expensive at 8 but trains all eight stats. Accepting a fight costs 10–20 depending on your tier. Hospital doctor visits cost 10–20 on top of their cash cost.",
            "The most important thing to understand about energy is that it forces prioritisation. You can't do everything every day. On days you're in fight camp, energy spent on sessions is energy not available for training. On days you're grinding stats, accepting a fight costs a chunk of your daily budget.",
            "Energy doesn't carry over. A full bar you didn't spend is wasted. Log in regularly, spend your energy, and come back. The players who treat their energy bar like a daily task are the ones who climb fastest.",
        ],
        keyTakeaway: "Energy regens at 1/min. Spend it every day. It doesn't roll over — unused energy is a missed opportunity.",
    },
    {
        id: "career-feed",
        category: "Getting Started",
        title: "The Career Feed",
        summary: "Your career story, told in real time.",
        tags: ["feed", "dashboard", "history", "fame"],
        body: [
            "The Career Feed on your dashboard is a reverse-chronological log of everything significant that has happened in your career. Fight results, promotions, title shots, badges earned, sponsor contracts signed and broken, nemesis events — it's all there.",
            "Think of it as your fighter's autobiography being written in real time. When you win your first title, it's in the feed. When you lose three in a row and freeze your notoriety, that's in there too. The feed doesn't judge — it just records.",
            "Any fight row — career or Proving Ground — has a › arrow on the right. Click it to open a side drawer with the full round-by-round breakdown of that fight: the event feed, per-round stats, and a Result tab with the camp outcomes and combined stats. It's the same breakdown you saw on the post-fight summary, available forever from your history. Non-fight rows (badges, promotions, nemesis events) don't open a drawer.",
            "The Fame drawer (★ Fame button in the footer) gives you a focused view of fame-only events — every notoriety gain, milestone hit, and fame tier-up in order. Useful when you want to track your fame growth specifically without the noise of everything else.",
        ],
        keyTakeaway: "The Career Feed is your permanent record. Click any fight's › to re-read its full round-by-round breakdown.",
    },

    // ──────────────────────────────────────────────────────────────
    // FIGHTING
    // ──────────────────────────────────────────────────────────────
    {
        id: "fight-offers",
        category: "Fighting",
        title: "Fight Offers — Reading the Room",
        summary: "How fight offers work, what the four types mean, and how to choose.",
        tags: ["offers", "matchmaking", "easy", "hard", "title shot", "intel", "threat tags", "callout", "nemesis"],
        body: [
            "When you're ready to fight, you request offers from the promoter. Three cards come back — Easy, Even, and Hard. A fourth Title Shot card appears when you've earned it.",
            "Easy opponents are 3–5 Overall below you. They're safer wins but pay less cash and earn less notoriety. Even opponents are within 3 OVR either way — competitive fights that pay fair. Hard opponents are 2–5 OVR above you — the upset potential is real, and so is the payout.",
            "Each card carries a scouting preview: the opponent's top stats with a reliability tag — Confirmed, Suspected, or Unknown — drawn from the same fog-of-war system as the full Fighter Report. The less tape exists on a fighter, the foggier the read; champions are especially restricted (only two fight logs). The card's threat tags follow the same rule — a tag like \"Exploitable chin\" or \"Elite KO power\" only shows when scouting actually supports it, so unscouted stats stay hidden. Calling an opponent out unlocks full intel — every stat Confirmed, no fog. Use Game Plan Study or Sparring to fill the gaps before a fight you're unsure about.",
            "Special cards change the picture. A Callout card takes the Hard slot when you've called someone out (full intel, +25% cash, +30% fame on the win). A Nemesis card appears for a fighter who's beaten you — it shows your record against them and pays a +150 fame bonus that lands even when your fame is frozen. A Grudge or Respect pill on a card flags a fight that carries its own cash/fame modifier from a past beef or show of respect.",
            "There's no objectively correct choice. If you need cash, take the safer fight. If you're chasing notoriety milestones or have a sponsor clause demanding a finish, a harder opponent might serve you better. If you're deep in comeback mode after two losses, staying healthy and building a win streak matters more than the risk-reward of a Hard fight.",
            "The Title Shot card appears in gold when your OVR hits the threshold, you've earned the required wins at your current tier (2 at Amateur, 3 from Regional Pro up), and you're ranked in the top 5. Beating the Amateur champion on this card is how you turn pro. It replaces nothing — it's a fourth option, always optional. You can ignore it and keep taking regular fights, but the clock is ticking.",
        ],
        keyTakeaway: "Easy, Even, Hard, Title Shot — each card previews scouted intel and threat tags (fog-of-war respected). Match your pick to what your career needs right now, not what looks safest in isolation.",
    },
    {
        id: "fight-camp",
        category: "Fighting",
        title: "Fight Camp — Preparing to Win",
        summary: "How camp works, why session selection matters, and how to get an S grade.",
        tags: ["camp", "sessions", "matched", "preparation", "wildcard"],
        body: [
            "Accept a fight and you enter Fight Camp — the preparation phase between agreeing to the match and stepping into the cage. Camp doesn't permanently improve your stats. It sets up conditional bonuses that fire during the fight when specific situations arise.",
            "The number of camp slots you get depends on your tier and whether it's a title fight. Amateur fighters get 2 slots on normal fights. Title fights always get 5 slots regardless of tier — the biggest stage gets the most preparation.",
            "Choosing the right sessions requires reading the Fighter Report first. If the report shows your opponent is a wrestler, Takedown Defence is your most valuable session. If they're a submission hunter, Submission Escapes should be in your camp. Match your preparation to their threat.",
            "Sessions are rated Matched, Partial, Unmatched, or Wrong — but the rating stays hidden while you build. It's revealed only when you finalise camp, so you have to read the opponent and commit rather than guess-and-check. Matched means you directly countered their game and received 100% of the bonus. Partial means it was broadly useful but not targeted — 50%. Unmatched sessions gave nothing. Wrong sessions actively hurt you. The camp grade S through F reflects how well you read the opponent.",
            "Game Plan Study is always Partial against any opponent — it's the safe fallback when you're uncertain. Sparring trains all stats at +3% (always active) but carries a 3% injury risk per session. Repeating the same session has diminishing returns — the second time gets 60% value, the third 30%.",
        ],
        keyTakeaway: "Read the Fighter Report, pick sessions that counter what you see. Matched sessions at 100% beat safe sessions at 50% every time.",
    },
    {
        id: "fighter-report",
        category: "Fighting",
        title: "The Fighter Report — Reading Your Opponent",
        summary: "How to interpret scouting intel and use it to build a smarter camp.",
        tags: ["fighter report", "scouting", "intel", "confirmed", "suspected"],
        body: [
            "Before you fill your camp slots, you get a Fighter Report — a scouting document that tells you what's known about your opponent's stats and tendencies. Not everything is visible. The report classifies each stat as Confirmed, Suspected, or Unknown.",
            "Confirmed stats are proven across multiple fights — treat them as fact. Suspected stats are suggested by limited footage — likely but not certain. Unknown means you're flying blind on that stat — no tape exists, or the evidence is too thin to trust.",
            "The key is reading what the report is telling you about their style, not just the numbers. A fighter with Confirmed high WRE and GND is telling you to prepare for takedowns and ground control. A fighter with Suspected high SUB is warning you to prepare submission escapes even if the data isn't locked in.",
            "Champions show less information — their report is restricted to 2 visible fight logs instead of 5. Against champions, lean on Game Plan Study and Sparring as safety nets when intel is thin. Don't overcommit to specific counters you can't confirm.",
            "Callout opponents are different — their report shows full intel, every stat Confirmed. If you spent the fame to call someone out, you earned the complete picture.",
        ],
        keyTakeaway: "Confirmed intel is fact. Suspected intel is a signal worth acting on. Unknown stats are where opponents hide their surprises.",
    },
    {
        id: "wildcards",
        category: "Fighting",
        title: "Wildcards — The Hidden Variable",
        summary: "What wildcards are, how they work, and how to defend against them.",
        tags: ["wildcard", "hidden", "tactician", "surprise"],
        body: [
            "Every opponent carries a hidden tendency — a middle-tier stat that can unexpectedly boost their performance during the fight. You'll never see it in the Fighter Report. It's the one thing you can't fully prepare for.",
            "If your camp sessions happen to counter the wildcard — for example, you prepared Submission Escapes and the wildcard was a submission tendency — the wildcard is neutralised and you get the full benefit of your session. If your camp didn't address it, the opponent gets a hidden +15% advantage in that area.",
            "This is why camp preparation is never fully predictable. You can build a perfect camp based on the report and still face an unexpected threat in the fight. The wildcard is the game acknowledging that real fighters always have something you didn't see on tape.",
            "There's one way to partially beat the system: reach Rank 4 at The War Room and earn the Tactician perk. It gives a 30% chance to reveal the opponent's wildcard before camp starts — not guaranteed, but information you can act on when it fires.",
        ],
        keyTakeaway: "The wildcard is hidden and always present. Build your camp to cover the obvious threats — the wildcard is the game's one unavoidable surprise.",
    },
    {
        id: "weight-cut",
        category: "Fighting",
        title: "Weight Cut — The Gamble Before the Fight",
        summary: "How to choose a weight cut strategy and what the risk-reward actually looks like.",
        tags: ["weight cut", "stamina", "easy", "moderate", "aggressive"],
        body: [
            "Before every fight, you choose a weight cut strategy. It's a gamble — you're trading certainty for potential upside, or accepting a safe result with no ceiling.",
            "Easy cut gives you exactly +0 stamina and a 0% chance of missing weight. Boring, but reliable. Moderate cut rolls −5 to +10 stamina with a 5% miss chance. Aggressive cut rolls −12 to +18 stamina with a 20% miss chance. A good aggressive cut is a significant advantage. A bad one puts you at a deficit before the fight starts.",
            "Missing weight backfires badly. A failed cut never gives you the good roll — your stamina always crashes — and on top of that you lose 20% of your cash purse and 200 fame. Against a hard opponent or in a title fight, showing up drained, broke, and less famous is a combination that ends careers.",
            "The Titan perk from Rank 4 at Titan Performance Center raises the bad roll floor by 3 — it doesn't remove the risk, but it reduces the damage ceiling of a failed cut. For fighters who love the aggressive cut, it's a meaningful safety net.",
        ],
        keyTakeaway: "Aggressive cuts have a 20% miss rate. Missing crashes your stamina and costs 20% cash plus 200 fame. Factor the risk into every decision — there's no shame in an Easy cut before a title fight.",
    },
    {
        id: "fight-outcomes",
        category: "Fighting",
        title: "Fight Outcomes — What Can Happen",
        summary: "The eight possible results, what causes them, and what they mean for your career.",
        tags: ["outcomes", "ko", "submission", "decision", "draw"],
        body: [
            "Every fight resolves to one of eight outcomes. Understanding what each one means helps you interpret your fight summary and understand where your fighter needs to grow.",
            "KO/TKO win means your striking was dominant enough to stop the fight. Submission win means you either took the fight to the ground and controlled it, or your opponent shot for a takedown and you capitalised. Decision win means you outworked the opponent across the duration of the fight — consistent pressure, smart game plan, better conditioning.",
            "The same logic applies in reverse for losses. A KO/TKO loss means your chin or your defence couldn't handle their striking. A submission loss means they were better on the ground. A decision loss means they simply outperformed you over the full fight — often the hardest result to diagnose because no single thing went catastrophically wrong.",
            "Draws are rare and feel anticlimactic, but they're possible. They don't count as wins for streak or title shot purposes but also don't break comeback mode.",
            "How you win and lose matters beyond the result column. KO wins earn more notoriety than decisions. Submission wins show technical mastery. Decision wins against hard opponents show you can compete for the full duration. Every result tells a story about your fighter.",
        ],
        keyTakeaway: "How you win is as important as winning. KO and submission finishes earn more notoriety and tell a better story than decisions.",
    },
    {
        id: "fight-summary",
        category: "Fighting",
        title: "The Fight Summary — Understanding What Happened",
        summary: "How to read your post-fight breakdown and what every section means.",
        tags: ["summary", "camp performance", "diagnostics", "xp", "round by round", "fight description"],
        body: [
            "After every fight, the Fight Summary shows you a complete breakdown of what happened. This isn't just a scoreboard — it's a diagnostic tool. Use it to understand your fighter and improve your next camp.",
            "The right side is the Fight Description — a round-by-round retelling, not a generic paragraph. Each round shows an intro, a handful of timestamped moments (takedowns, big strikes, submission attempts, knockdowns, camp triggers, the finish), a stat bar (Strikes · Takedowns · Sub att. · Damage, you vs them), a momentum bar, and who took the round. A camp line only appears when that session actually fired. It's a faithful retelling of what the engine produced — the same breakdown is saved to your Career Feed, openable any time from a fight's › arrow.",
            "The Camp Performance section is the most valuable part. It shows your camp grade, which sessions triggered, what match status they received, and how your wildcard played out. If you got a D-grade camp and lost, this is where you find out why. If you prepared perfectly and still lost, the wildcard section might hold the answer.",
            "The Notoriety section gives a line-by-line breakdown of every fame modifier that applied — the base fight reward, any streak bonuses, milestone hits, callout bonuses, and beef or respect flag payouts. If your notoriety moved less than expected, this section explains exactly where the shortfall was.",
            "XP gained per stat is shown here too. Fights give XP based on what happened in them — a KO win gives big STR and CHN XP, a submission win rewards SUB and GND. Watching which stats level up from which fights helps you understand how your fighter is naturally developing.",
            "If it was a title fight, a dedicated championship victory screen appears with gold styling before the summary. The moment deserves the treatment.",
        ],
        keyTakeaway: "The Camp Performance section tells you whether your preparation was right. Check it after every fight — it's the fastest way to become a better player.",
    },

    // ──────────────────────────────────────────────────────────────
    // TRAINING & GYMS
    // ──────────────────────────────────────────────────────────────
    {
        id: "how-training-works",
        category: "Training & Gyms",
        title: "How Training Works",
        summary: "The basics of stat development, XP, and why training is the foundation of everything.",
        tags: ["training", "xp", "stats", "ovr", "leveling"],
        body: [
            "Training is how your fighter improves. Every session earns XP in specific stats. Once a stat's XP bank fills up, that stat increases by one point. Your Overall Rating rises as your stats grow.",
            "There are no levels in this game. Your fighter doesn't gain 'experience' in an abstract sense — they get concretely better at striking, grappling, takedowns, and so on. The OVR number is a reflection of your actual stats, not a progress bar.",
            "The XP cost to raise a stat increases as it gets higher. Early points are cheap — 10 XP per point in the 1–10 range. By the time you're pushing into the 70s, each point costs 1,500 XP. Elite stats (96–99) can only be raised through fights, not training sessions — only real combat experience can push a fighter to that level.",
            "Your fighting style determines how stats are weighted in your OVR calculation. Training a primary stat raises your OVR faster than training an off-style stat. That's not a reason to ignore off-style stats — a well-rounded fighter is harder to exploit — but it explains why a Boxer training LEG sees slower OVR growth than a Boxer training STR.",
        ],
        keyTakeaway: "Stats grow through XP. Higher stats cost more XP per point. The right gym makes everything faster.",
    },
    {
        id: "gym-system",
        category: "Training & Gyms",
        title: "The Gym System — Choosing Where to Train",
        summary: "How gyms work, what separates them, and how to decide where your cash goes.",
        tags: ["gym", "membership", "iron", "focus stats", "community"],
        body: [
            "There are eleven gyms in Ground & Pound — one free community gym and ten specialty gyms that require a weekly cash membership. You can only have one paid membership active at a time. Switching gyms cancels your current membership immediately.",
            "The Community MMA Center is always available at no cost. It trains all stats at 0.6× base XP — slower than any specialty gym but always there when your cash runs low. It has no ranks and no progression. Think of it as the safety net, not the goal.",
            "Specialty gyms focus on 2–3 stats and give faster XP in those areas. An Amateur-tier gym gives 1.25× XP on focus stats. A National-tier gym gives 1.5× on focus stats. Elite Fight Academy gives 1.5× on all stats. The further up the career ladder you climb, the better your training options become — but they also get significantly more expensive.",
            "Choosing the right gym means matching the gym's focus to your style's primary stats. A Boxer should be at Iron Fist Boxing (STR, SPD, CHN). A BJJ fighter belongs at Gracie Ground Game (GND, SUB). Training your primary stats at the right gym is the fastest path to a high OVR.",
        ],
        keyTakeaway: "Match the gym to your style's primary stats. The right gym makes your strong stats stronger faster.",
    },
    {
        id: "gym-ranks",
        category: "Training & Gyms",
        title: "Gym Ranks — The Long Game",
        summary: "How gym ranks work, what they unlock, and why they follow you forever.",
        tags: ["gym rank", "perks", "progression", "permanent"],
        body: [
            "Every specialty gym has four ranks. You earn them by accumulating training sessions and scoring specific types of wins while enrolled at that gym. Ranks are permanent — they follow you even if you switch gyms or can't afford the membership. Earn a rank, keep it forever.",
            "Rank 1 is granted automatically when you join. It gives you access to the gym's training sessions. Rank 2 unlocks a unique advanced session only available at that gym. Rank 3 gives a permanent +5% XP bonus to focus stats — a compounding advantage that pays off across your entire career. Rank 4 is the pinnacle: a utility perk and a permanent badge on your fighter profile.",
            "Win types matter for ranks. Striking gyms count KO/TKO wins. BJJ and submission gyms count submission wins. Tactical gyms count decision wins. If you're training at a wrestling gym but winning all your fights by KO, those wins don't contribute to your gym rank progress.",
            "Ranks 3 and 4 also require a cash payment in addition to the training and win thresholds. The cash cost is significant — these are career investments, not freebies. But the permanent XP bonus from Rank 3 and the utility perk from Rank 4 are some of the most powerful advantages in the game.",
        ],
        keyTakeaway: "Gym ranks are permanent and compound over time. Rank 3's +5% XP bonus is worth planning your career around.",
    },
    {
        id: "rank-4-perks",
        category: "Training & Gyms",
        title: "Rank 4 Perks — What They Do",
        summary: "Every gym's Rank 4 perk explained and which ones to prioritise.",
        tags: ["rank 4", "perks", "tactician", "elite master", "fight scientist"],
        body: [
            "Reaching Rank 4 at any gym earns a permanent utility perk that changes how something in the game works. These aren't cosmetic — they affect camp performance, weight cuts, fight preparation, and more. Here's what each one does.",
            {
                type: "table",
                headers: ["Gym", "Perk", "What It Actually Means"],
                rows: [
                    ["Iron Fist Boxing", "Champion Boxer", "An extra camp slot when fighting a striker. More prep time against your most common opponents."],
                    ["Dragon Kickboxing", "Grand Master Kickboxer", "Cardio Push costs 1 less energy. Makes stamina preservation cheaper in camp."],
                    ["Warrior Muay Thai", "Grand Kru", "Conditioning raises Max Stamina by +2 instead of +1. Faster path to a higher stamina ceiling."],
                    ["Apex Wrestling", "Olympic Wrestler", "Takedown Defence always rates at least PARTIAL. Your wrestling preparation never completely misfires."],
                    ["Gracie Ground Game", "BJJ Black Belt", "Submission Escapes gives +5% extra bonus. More reliable escape probability on the mat."],
                    ["Renzo Combat", "Submission Master", "Fighter Report shows 1 extra fight log. Better intel in every camp."],
                    ["Precision MMA Lab", "Fight Scientist", "Game Plan Study counts as MATCHED instead of PARTIAL. The safe fallback becomes a full-value session."],
                    ["Titan Performance", "Titan", "Weight cut bad roll floor raised by 3. Reduces the damage ceiling of a failed aggressive cut."],
                    ["The War Room", "Tactician", "30% chance the opponent's wildcard is revealed before camp. Information you can act on."],
                    ["Elite Fight Academy", "Elite Master", "+10% fame from all fights. Every fight, forever, pays more notoriety."],
                ],
            },
        ],
        keyTakeaway: "Fight Scientist (Game Plan Study = MATCHED) and Elite Master (+10% fame forever) are among the most universally powerful perks. Tactician (wildcard reveal) is transformative if you hate surprises.",
    },
    {
        id: "training-sessions",
        category: "Training & Gyms",
        title: "Training Sessions — What Each One Does",
        summary: "Every available session, its energy cost, and what stats it trains.",
        tags: ["sessions", "bag work", "sparring", "film study", "conditioning"],
        body: [
            "Sessions are the atomic unit of training. Each one costs energy and earns XP in specific stats. Here's a complete reference.",
            {
                type: "table",
                headers: ["Session", "Energy", "Stats Trained", "Notes"],
                rows: [
                    ["Bag Work", "4", "STR", "Pure striking power. Core session for Boxers and Kickboxers."],
                    ["Footwork", "4", "SPD", "Hand speed and movement. Builds fast combinations."],
                    ["Kick Drills", "4", "LEG", "Lower body attacks. Essential for Muay Thai and Kickboxers."],
                    ["Pad Work", "5", "STR, SPD", "Combination striking. Two stats for one session — efficient."],
                    ["Wrestling", "5", "WRE", "Takedown offence. Core for Wrestlers and Sambo fighters."],
                    ["Clinch Work", "5", "WRE, STR", "Dirty boxing and clinch pressure. Two stats, useful for Muay Thai."],
                    ["BJJ", "6", "GND, SUB", "Ground control and submission chains. Two stats — good value."],
                    ["Submissions", "6", "SUB", "Pure submission hunting. More targeted than BJJ sessions."],
                    ["Sparring", "8", "All 8 stats", "Most expensive but broadest. 3% injury risk per session."],
                    ["Film Study", "3", "FIQ", "Cheapest session. Tactical awareness. Often overlooked, valuable for decision fighters."],
                    ["Conditioning", "4", "Max Stamina", "Raises your stamina ceiling, not the stat itself. Stacks over time."],
                ],
            },
        ],
        keyTakeaway: "Sparring trains everything but carries injury risk. Film Study is the cheapest session in the game and directly improves Fight IQ — don't ignore it.",
    },

    // ──────────────────────────────────────────────────────────────
    // CAREER
    // ──────────────────────────────────────────────────────────────
    {
        id: "promotion-tiers",
        category: "Career",
        title: "The Five Tiers — Your Roadmap to the Top",
        summary: "What each tier looks like, how you move between them, and what changes as you climb.",
        tags: ["tiers", "amateur", "regional pro", "national", "gcs", "promotion"],
        body: [
            "Your career moves through five promotion tiers: Amateur, Regional Pro, National, GCS Contender, and GCS. Each tier has a different OVR range, a different energy cost per fight, and a different signing fee for the professional tiers.",
            "Amateur is where everyone starts. Modest payouts, cheap fights at 10 energy each, OVR range of 0–30. It's the proving ground — the place where you find your style and start building the record that will define your reputation. It ends with your first belt: beat the Amateur champion to turn pro.",
            "Every tier from Amateur upward makes you beat the tier's champion to advance — the one exception is GCS Contender, which promotes automatically at OVR 62. You don't get promoted just by reaching the OVR threshold; you have to earn it in the most important fight of that chapter of your career. GCS is the final tier. There's no tier above it. Winning the GCS Championship is the peak of the mountain.",
            "As you climb, the pace of the game changes. There's no daily fight limit — how often you fight is bounded only by your energy — but fights get more expensive: 10 energy each in Amateur, up to 20 in GCS. The game slows down and every fight carries more weight. The signing fees at higher tiers aren't just flavour — they're a signal that this tier costs more to compete in, and the rewards need to justify the investment.",
        ],
        keyTakeaway: "Every tier from Amateur up makes you beat the champion to advance — only GCS Contender auto-promotes. You can't buy or train your way past a belt; you have to fight your way through.",
    },
    {
        id: "champions-and-title-shots",
        category: "Career",
        title: "Champions & Title Shots",
        summary: "How to earn a title shot, what makes champion fights different, and what happens when you win or lose.",
        tags: ["champion", "title shot", "belt", "promotion", "nemesis"],
        body: [
            "Beating the tier champion is the only way to advance — at every tier except GCS Contender, which promotes automatically at OVR 62. Your very first belt is the Amateur title: beat the Amateur champion (the top contender in your division) to turn pro and move up to Regional Pro.",
            "The path to a title shot has three steps, and all three must be met before the Title Shot (or Turn Pro) card appears in your Fight Offers. First, your Overall Rating reaches the next tier's threshold — once it does, you become a contender and a \"Path to the Belt\" checklist appears at the top of your Fight Offers tracking your progress. Second, you climb into the top 5 of your division's rankings. Third, you bank the required number of wins at your current tier: 2 wins at Amateur, and 3 wins from Regional Pro upward. Hit all three and the card unlocks automatically.",
            "The Amateur title shot is your pro debut, so the framing is \"Turn Pro\" rather than a belt defence — but the three steps are the same: reach OVR 30, sit in your division's top 5, and bank 2 wins at the Amateur tier. Win the Amateur belt and you earn the distinct Amateur Champion badge plus a fame boost.",
            "Champion fights are harder than regular fights. The champion receives a +5% boost to all stats during the fight. Their Fighter Report shows only 2 visible fight logs instead of the normal 5 — less tape to study means more uncertainty. Bring your best camp and don't assume you can out-prepare what you can't see. Title fights always run a full 5-slot training camp regardless of tier.",
            "Win the title and you promote to the next tier, earn a notoriety boost on top of the fight reward, and receive a permanent belt badge — the distinct Amateur Champion badge for the Amateur belt, or the generic Champion badge for every pro title from Regional Pro up. A new NPC champion is seeded from the strongest remaining fighter in the old tier.",
            "Lose a title shot and you can't immediately re-challenge — you enter a 2-win cooldown. The Title Shot card stays locked until you win 2 more fights; the checklist shows your recovery progress (for example 1/2) so you always know how close you are to a rematch. Each win ticks the cooldown down by one. If the same champion beats you twice, they also become your Nemesis, and beating them clears both the Nemesis flag and reopens the title shot.",
        ],
        keyTakeaway: "Champions get +5% to all stats and show less tape. Treat every title fight like the hardest fight of your career — because it is.",
    },
    {
        id: "rankings",
        category: "Career",
        title: "Rankings — Your Place in the Division",
        summary: "How rankings work, when you enter them, and why the top 5 matters.",
        tags: ["rankings", "rank", "top 5", "title shot", "callout"],
        body: [
            "Every tier in your weight class has a ranked roster. The champion sits at the top, then the contenders are ranked #1 through #N below them. Your job is to climb that ladder — and the rank you hold gates the most important opportunities in the game.",
            "You don't enter the rankings on day one. The first 3 fights at any tier are your entry period. After fight 3, you're placed in the rankings based on your record so far — a 3–0 record puts you closer to the title shot zone, a 1–2 places you at the bottom. From there, every win climbs you up, every loss drops you down.",
            "Wins by KO or submission climb faster than decision wins. Upset wins (beating a higher-ranked opponent) climb the most — you can move multiple ranks at once. Decision losses drop you one rank; losses to lower-ranked fighters drop you two. The rank movement formula favours fighters who go after the toughest matchups.",
            "Top 5 of your division is the title shot zone. Hitting it is one of three requirements to challenge the champion — alongside reaching the OVR threshold and a minimum number of wins at the current tier (2 at Amateur, 3 from Regional Pro up). The other ranks gate other features: top 15 unlocks callouts, top 1 means you're the champion of your tier (you're not, unless you've won the belt — the champion always sits above the ranked roster).",
            "NPC ranks are fixed and never change. When you climb past them, they don't move down — you just visually slot in above them. This keeps the division stable and meaningful: the #5 NPC has been the #5 NPC since you started.",
        ],
        keyTakeaway: "First 3 fights at a tier are your placement matches. Top 5 unlocks the title shot. Top 15 unlocks callouts. Every rank matters.",
    },
    {
        id: "notoriety-and-fame",
        category: "Career",
        title: "Notoriety & Fame — The Second Economy",
        summary: "What notoriety actually is, how it grows and shrinks, and why it matters beyond a number.",
        tags: ["notoriety", "fame", "tier", "freeze", "decay"],
        body: [
            "Notoriety is your fame score — a measure of how known and talked-about your fighter is in the MMA world. It's not just a vanity metric. Notoriety determines your fame tier, which gates sponsorship contracts, callout access, the documentary, and your banner cosmetics.",
            "You earn notoriety from fights, media appearances, sponsorship bonuses, event predictions, and career milestones. You can lose it from losses, inactivity, broken sponsorship clauses, and beef flags that lapse. The system is designed to reward activity and punish stagnation.",
            "Your notoriety has a floor — it can never drop below the level of your highest-ever tier. If you climbed to National tier and lost five in a row, your notoriety might tank but it won't fall back to Amateur levels. The floor protects your career's history.",
            "After 3 consecutive losses, your notoriety freezes — no gains until you win again, with one exception: Nemesis victories and title shot wins always apply their bonuses regardless. The freeze never blocks you from fighting; it just pauses fame growth until you bounce back. After 20 days without a fight, notoriety begins decaying at 1% per day until you fight again. The game rewards fighters who stay active.",
        ],
        keyTakeaway: "Notoriety has a floor based on your career peak. Three straight losses freeze it. Stay active or watch it decay.",
    },
    {
        id: "badges",
        category: "Career",
        title: "Badges — Permanent Career Marks",
        summary: "Every badge in the game, how to earn it, and what it means for your profile.",
        tags: ["badges", "achievements", "resilience", "champion", "documentary"],
        body: [
            "Badges are permanent markers earned through career achievements and gym mastery. They appear on your fighter profile and can be pinned to your banner. Once earned, they never go away.",
            "Career badges come from doing exceptional things in your fights: winning while in comeback mode earns the Resilience badge. Your first belt — beating the Amateur champion to turn pro — earns the distinct Amateur Champion badge. Every pro title after it (Regional Pro and up) earns the generic Champion badge. Winning a callout fight earns the Callout Win badge. Recording your documentary at Star fame tier earns the Documentary badge and unlocks the Legacy banner piece.",
            "Gym badges are earned by reaching Rank 4 at each specialty gym — Champion Boxer, BJJ Black Belt, Tactician, Elite Master, and the rest. These are the hardest to earn because they require sustained dedication to one gym across training sessions and specific win types. A fighter with multiple Rank 4 gym badges has put in serious time.",
            "Badges aren't just cosmetic. Several unlock banner pieces for the customizer, and the gym badges come with the Rank 4 utility perks that change how the game works for you permanently.",
        ],
        keyTakeaway: "Gym badges require the most work but come with permanent perks. Career badges tell the story of your biggest moments.",
    },
    {
        id: "banner-customizer",
        category: "Career",
        title: "Banner Customizer — Your Fighter's Identity",
        summary: "How the banner works, what each layer unlocks, and why it matters.",
        tags: ["banner", "customization", "cosmetic", "background", "frame"],
        body: [
            "Every fighter has a customizable banner on their profile. It's a visual identity layer — four customizable parts that evolve as your career progresses. Open it with the Customize button on your profile sidebar.",
            "The four layers are Background, Frame, Accent Colour, and Pinned Badges. Backgrounds unlock at fame tiers — starting at a basic Slate and working up to Holographic at Legend fame. Frames unlock through fame progression too, with a special Championship frame available to anyone who has won a professional belt (Regional Pro and up — the Amateur belt earns the distinct Amateur Champion badge but not this frame). Accent colours span seven options unlocked by fame tier. Pinned Badges let you choose up to three of your earned badges to display prominently.",
            "The banner is purely cosmetic — it doesn't affect fight outcomes. But it appears on your profile and in any future context where other players see your fighter. A banner loaded with Rank 4 gym badges and a Championship frame tells everyone who looks at it exactly what kind of fighter you are and what you've done.",
        ],
        keyTakeaway: "The banner is cosmetic but meaningful. It's the visual summary of your career that other players see first.",
    },

    // ──────────────────────────────────────────────────────────────
    // ECONOMY
    // ──────────────────────────────────────────────────────────────
    {
        id: "iron",
        category: "Economy",
        title: "Cash — How Money Works",
        summary: "Where cash comes from, where it goes, and how to manage it across your career.",
        tags: ["iron", "money", "purse", "gym", "hospital"],
        body: [
            "Cash is the currency of your MMA career. You earn it by fighting — every fight pays a purse based on your tier, the opponent's difficulty, and any bonuses from callouts, sponsorships, or comeback mode. You spend it on gym memberships, hospital treatment, and eventually title shot fees.",
            "The cash economy gets tighter in the middle tiers. Amateur fights pay modest purses with low gym costs. Regional Pro and National fights pay more, but the gym memberships in those tiers cost significantly more too. Managing your cash means knowing when to upgrade your gym, when to stay at the cheaper one, and when a hospital visit is worth the cost versus just waiting for natural recovery.",
            "Sponsorships are the cash multiplier. A well-chosen sponsor with a clause you can realistically meet pays per-fight cash plus a lump-sum bonus on completion. Multiple sponsors active at once can double or triple the cash you earn per fight. This is why fame tier matters beyond prestige — more fame means more sponsor slots.",
            "Don't let your cash run dry right before a title fight. Preparation costs energy. Treatment costs cash. If you're going into the most important fight of your career with an untreated injury and empty pockets, the prep phase was mismanaged. Budget ahead.",
        ],
        keyTakeaway: "Fight for cash, spend it on gyms and health. Sponsorships multiply your fight earnings. Never run out before a title shot.",
    },
    {
        id: "sponsorship-contracts",
        category: "Economy",
        title: "Sponsorship Contracts — Passive Income",
        summary: "How to read a sponsor offer, choose the right clause, and avoid breaking deals.",
        tags: ["sponsors", "contracts", "clauses", "iron", "fame"],
        body: [
            "Sponsorships are deals that pay cash per fight while active and trigger a bonus when you complete their clause. They're passive income — sign the contract, keep fighting, collect the reward. The catch is the clause. Every contract has one, and breaking it costs you fame.",
            "Clause types vary widely. Win Next N requires consecutive wins — any non-win breaks the streak. Finish Next N demands KO or submission victories — decision wins break it. Win Any N within a time window is the most flexible. No Weight Miss requires you to make weight on every fight for N fights. No Finish Loss means you can lose by decision but not by KO or submission.",
            "The right sponsor is one whose clause aligns with how you actually fight. Don't sign a Finish Next 3 clause if you've been winning by decision all month. Don't sign No Weight Miss if you love aggressive cuts. The per-fight cash is nice but the clause bonus is the real payday — only sign what you can realistically complete.",
            "You can drop a contract at any time for half the break penalty in fame. Useful when circumstances change and the clause is no longer achievable. Better to pay half than break it for the full penalty.",
            "Your sponsor pool refreshes every 7 days. Sponsors you've completed, broken, or dropped this week won't reappear until the next rotation. Build your relationships with the offers available, not the ones you're waiting for.",
        ],
        keyTakeaway: "Only sign clauses you can actually complete. The per-fight cash is nice but the clause bonus and fame penalty are what really matter.",
    },
    {
        id: "callouts",
        category: "Economy",
        title: "Callouts — Forcing the Matchup",
        summary: "What callouts cost, what you get for the cash, and when they're worth it.",
        tags: ["callouts", "fame", "intel", "matchmaking", "grudge"],
        body: [
            "The Callout button in the Fight tab lets you spend fame to force a specific opponent into your next Hard offer slot. You're not buying a guaranteed win — you're buying a guaranteed matchup with full intel. The rest is on you.",
            "Same-tier callouts start at 200 fame plus 50 per OVR gap. Stretch callouts — targeting someone in the tier above — start at 800 fame plus 75 per OVR gap. Both are capped at 3,000 fame. You can cancel for a full refund any time before the fight.",
            "What you get: the opponent's Fighter Report shows every stat as Confirmed. No fog of war, no guessing. Against someone you've been trying to read for weeks, complete intel is worth real fame. You also get a +25% cash purse and +30% fame on a win — the grudge bonus stacks with everything else.",
            "Callouts are locked until you're ranked in the top 15 of your division. You must also only target fighters ranked above you — calling out lower-ranked opponents isn't allowed. This makes callouts a rank-climbing tool, not a farming mechanism.",
        ],
        keyTakeaway: "Callouts give full intel and a win bonus. They cost fame upfront and require top 15 rank. Use them when the matchup matters more than the cost.",
    },

    // ──────────────────────────────────────────────────────────────
    // HEALTH
    // ──────────────────────────────────────────────────────────────
    {
        id: "health-and-stamina",
        category: "Health",
        title: "Health & Stamina — Your Physical State",
        summary: "How HP and stamina work, how they deplete, and how they recover.",
        tags: ["health", "stamina", "hp", "regen", "conditioning"],
        body: [
            "Your fighter has two physical meters: Health and Stamina. Both run 0–100. Both affect performance. Both recover over time.",
            "Health represents your physical condition between fights. It depletes from damage taken in fights. Losing by KO or TKO drops your health to zero. It regenerates passively at +1 HP every 5 minutes of real time — a full recovery from zero takes about 8 hours. Log off after a brutal fight and come back fresh.",
            "Stamina is a fight-level resource. It affects your performance during the fight based on your weight cut result and conditioning. Conditioning sessions raise your maximum stamina ceiling, and certain backstories (Army Veteran) start with a higher max.",
            "Going into a fight at low health isn't just a number — it affects your ability to absorb damage and stay in the fight. Fighting at 40% health against a hard opponent is a mistake you'll feel in the result. The Hospital exists for exactly this situation.",
        ],
        keyTakeaway: "Health recovers passively at +1 HP per 5 minutes. Low health going into a fight is a real disadvantage — not just a warning.",
    },
    {
        id: "injuries",
        category: "Health",
        title: "Injuries — Types, Penalties, and Recovery",
        summary: "Every injury in the game, what it does to your fighter, and how to get rid of it.",
        tags: ["injuries", "concussion", "cut", "sparring", "auto-heal"],
        body: [
            "Injuries happen in fights and in sparring sessions. They apply stat penalties and can block you from fighting or training certain ways until they clear. The good news: every injury heals on its own. The system never permanently locks you out of the game.",
            "Each injury ticks down a recovery timer once every real hour, then auto-clears. Bruised Ribs heal in 6 hours with a −10 max stamina penalty. Cuts heal in 6 hours but block fighting until cleared. Broken Noses heal in 9 hours with −3 CHN. Concussions (from KO/sub losses) heal in 12 hours and block both fighting and sparring. Sprained Ankles (from sparring) take 18 hours with −15 LEG. Torn Ligaments take 24 hours and block fighting. Broken Hands take 24 hours and block bag work and pad work.",
            "Doctor-required injuries (Cut, Broken Nose, Concussion, Torn Ligament) can also be cleared instantly at the Hospital for energy + cash — the paid fast path. The wait-versus-pay choice is yours. If you have a title shot waiting, paying is usually worth it. If you've got time to spare, the free heal is just as effective — the worst injury in the game clears in a single day.",
            "Sparring is the most common source of new injuries. A 3% chance per session sounds small but it adds up across a full camp. If an injury occurs during camp, you choose between stopping camp (losing remaining slots, healthier fighter) or pushing through (keeping slots, carrying the injury penalty into the fight).",
            "There's a new-fighter grace period: during your first 3 fights, no fight-blocking injury (Concussion, Cut, Torn Ligament) is ever inflicted on you — in fights or in sparring. A rough debut can't lock a brand-new fighter out of the game.",
        ],
        keyTakeaway: "Every injury heals on its own within 24 hours at most. Pay the doctor when you can't even wait that long. Otherwise, the free heal is the same outcome.",
    },
    {
        id: "hospital",
        category: "Health",
        title: "The Hospital — When to Spend and When to Wait",
        summary: "Hospital services, what they cost, and how to decide whether a visit is worth it.",
        tags: ["hospital", "treatment", "doctor visit", "health restoration", "skip recovery"],
        body: [
            "The Hospital tab is your medical centre. It offers four services: Doctor Visit (Treatment) for the doctor-required injuries, Skip Recovery to instantly clear an auto-heal injury, Health Restoration packages, and a Full Recovery Package when you have multiple injuries at once.",
            "Doctor Visit clears one doctor-required injury — Cut, Broken Nose, Concussion, or Torn Ligament. It costs energy and cash. Concussions are the most expensive at 20 energy and $1,500. Cuts and Broken Noses are cheaper. Torn Ligaments are expensive but worth it if a title shot is waiting. Remember — these injuries will heal on their own within 6 to 24 hours even if you don't pay; the doctor visit is just the fast path.",
            "Skip Recovery instantly clears an auto-heal injury. Use it when an injury is dragging on and you have a fight or sponsor clause that can't wait. Bruised Ribs cost $600, Sprained Ankles $800, Broken Hands $1,200. If you can wait a few hours, don't spend the cash.",
            "Health Restoration packages restore HP without waiting. Quick Patch restores up to 25 HP for $250. Recovery Bay restores up to 50 HP for $400. Full Restoration brings you to 100 HP for $700. The cost is pro-rated — if you only need 15 HP, Quick Patch charges you proportionally less. You never overpay for more restoration than you need.",
            "Full Recovery Package heals every active injury in one transaction, with a 15% bulk discount over the sum of individual services. Available when you have 2 or more active injuries.",
        ],
        keyTakeaway: "Every injury heals for free within a day at most. Pay the hospital when even that wait is too long — typically when a title shot or sponsor clause is on the line.",
    },
    {
        id: "comeback-mode",
        category: "Health",
        title: "Comeback Mode — Bouncing Back",
        summary: "What happens when you lose, how the game helps you recover, and why a losing streak never blocks you from fighting.",
        tags: ["comeback", "loss", "resilience", "streak", "freeze"],
        body: [
            "Every loss activates Comeback Mode. While in Comeback Mode, your next fight earns 1.5× XP and a 30% larger cash purse. Win that fight and you earn the Resilience badge (once per career) and Comeback clears. The game is designed to give you a reason to keep going after a setback, not to punish you into quitting.",
            "Three consecutive losses freeze your notoriety — no fame gains from fights, sponsors, or media until you win again. The freeze is automatic and clears itself the moment you put a win on the record. Nemesis victories and title shot wins are the two exceptions: they always pay their bonuses, even through a freeze.",
            "Crucially, a losing streak never blocks you from fighting. You can always step into the cage to break the freeze. The game gives you the comeback XP and cash bonuses precisely so you have every incentive to climb back out — there is no forced rest, no mandatory cleanup step, no gate between you and the next fight.",
            "Come back with a new camp, a different approach, and a clear head. The Career Feed will remember the losing streak, but it'll also remember the comeback.",
        ],
        keyTakeaway: "One loss = Comeback Mode bonus. Three straight losses = frozen notoriety until your next win. Nothing ever blocks you from fighting your way out.",
    },
    {
        id: "nemesis-system",
        category: "Health",
        title: "The Nemesis System — Unfinished Business",
        summary: "How you get a nemesis, what they do to your fight offers, and how to get rid of them.",
        tags: ["nemesis", "rival", "rematch", "grudge", "notoriety"],
        body: [
            "If an opponent beats you, they become your Nemesis. You can only have one at a time. The Nemesis appears in your fight offers, slotted at a difficulty matching their strength relative to where you are now. Their card is marked differently — you know exactly who it is and why they're there.",
            "Beating your Nemesis pays +150 Notoriety on top of the normal fight reward. That bonus applies even if your notoriety is frozen from a losing streak — Nemesis victories are one of the two exceptions to the freeze (the other being title shot wins). The game is giving you a specific reason to seek out the rematch.",
            "If the champion beats you twice in a title shot, they become your Nemesis. This is the sharpest version of the system — the person standing between you and promotion is now also the person who haunts your fight offers. Beating them clears both the Nemesis flag and opens the title shot again.",
            "Nemesis flags clear in two ways: you beat them, or you get promoted past their tier. If you've outgrown the tier your Nemesis operates in, they're automatically cleared. Some fighters choose to pursue the rematch for pride and the notoriety bonus. Others just climb past it. Both are valid.",
        ],
        keyTakeaway: "Nemesis wins pay +150 notoriety even through a freeze. The rematch is always worth it if you can win it.",
    },

    // ──────────────────────────────────────────────────────────────
    // EVENTS & MEDIA
    // ──────────────────────────────────────────────────────────────
    {
        id: "events-and-predictions",
        category: "Events & Media",
        title: "Events — Betting on the Card",
        summary: "How the weekly fight card works, how betting works, and how the odds shape your payout.",
        tags: ["events", "betting", "odds", "card", "headliner", "stake"],
        body: [
            "Every week the Events tab runs a 5-fight NPC card featuring GCS-level fighters. You can't fight on these cards — but you can bet on them. Each bet stakes cash and either pays out at the odds you locked in, or the stake is gone. No fame is involved; this is a pure cash sidebet.",
            "The card has three tiers: two Prelim fights featuring mid-tier GCS fighters (OVR 70–87), two Main Card fights featuring top GCS fighters (OVR 88+), and one Headliner — the highest combined OVR matchup on the card. The tab presents it like a real fight poster.",
            "When you click a fight you choose between two bet types. Winner bets are just on who wins — A, Draw, or B. Lower odds, lower risk. Exact bets are winner plus method (KO/TKO, Submission, Decision, or Draw). The harder the call, the higher the multiplier. Decimal odds are shown next to every option — a fight at ×1.50 means a $100 bet pays back $150 on a win (a $50 profit). At ×8.00 the same $100 stake pays $800 back.",
            "Stake limits scale with your promotion tier. An Amateur fighter can bet $50–$1,000 per fight. By GCS, the band is $500–$10,000. Bigger stakes match the bigger purses, but the house edge (15%) is the same at every tier — the longer you bet without an information edge, the slower your cash bleeds. Use bets to swing for upside on fights you've actually studied, not as a passive income stream.",
            "The card runs for 7 days and resolves automatically. Your cash is debited the moment you place the bet and the odds are locked at that moment — even if the line moves later, you get the price you signed up for. When the card resolves, every winning bet pays back stake × locked odds straight to your cash. The first time you open the Events tab after resolution, a reveal modal walks you through every result with your verdict and net change per fight.",
        ],
        keyTakeaway: "Bets cost cash up front. Odds are locked at bet time. Payout on a win = stake × odds, paid in cash. There's a house edge — bet on fights you've actually studied.",
    },
    {
        id: "media-hub",
        category: "Events & Media",
        title: "The Media Hub — Building Your Profile Outside the Cage",
        summary: "The five tabs of the Media Hub — Podcast, Documentary, Appearances, Rivalry Board and Archive — and what each one pays.",
        tags: ["media", "podcast", "documentary", "appearances", "rivalry", "archive", "listeners", "beef", "respect"],
        body: [
            "The Media Hub is where you build your public persona alongside your fighting career. It doesn't touch your fight stats — it generates fame and cash, creates and tracks rivalries, and records your media history. It has five tabs: Podcast, Documentary, Appearances, Rivalry Board, and Archive. Your podcast's listener count grows with your fame and never resets.",
            "The Podcast records once per day (resets at midnight UTC) for 5 energy. You pick TWO segments and they air together as one titled episode. Recap Last Fight (+100 fame, +$150) and Fight Breakdown (+200 fame) are safe fame with no strings. The Division Talk segments target a rival: Trash Talk pays the most up front (+300 fame) but writes a Beef flag — a 4-fight clock with a +30% fame bonus if you beat them, and a −150 fame penalty if the window lapses. Show Respect (+100 fame) writes a Respect flag instead — a 6-fight window worth +15% cash on a win, with no penalty. Stay Cryptic (+40 fame) is safe filler. Bring On a Guest (+250 fame, unlocks at Regional Pro) lets you choose the tone — Beef or Respect — for your target. You can't aim both segments at the same fighter, and any rival is only ever a Beef or a Respect, never both.",
            "The Documentary is a once-per-career production unlocked at Star fame tier. You make three choices: a Focus (The Fighter for broad appeal, The Underdog for a bigger cash share, or The Technician for a one-time gym XP booster), a Tone (Inspirational, Raw & Honest, or Controversial — which spikes fame but starts a Beef with a random rival), and a Release Timing (release now, or hold it for a title shot or a title win to multiply the whole payout, up to ×2). On top of a tone-based fame bonus it pays a base of +1,500 fame and +$2,000, awards the Documentary badge, and unlocks the Legacy banner piece. You only ever get one — pick your moment.",
            "Appearances are a rotating pool of three one-off opportunities that refresh every week. A Magazine Cover pays fame scaled to your tier; an Undercard Feature pays its fame only if you actually fight within ten days of booking it; a Podcast Guest spot (+350 fame) lets you set a Beef or Respect flag; a Brand Deal Clip pays cash if you have an active sponsor; a Charity Exhibition pays fame once you reach Contender tier. Take what you want before the week is out — unused opportunities expire and don't roll over.",
            "The Rivalry Board and the Archive are read-only. The Rivalry Board gathers every active storyline in one place — your Nemesis, every Beef and Respect flag with its remaining window, and any active callout — so you can see what's live and what's about to lapse. The Archive is your full media history in reverse order: every podcast episode, post-fight interview, appearance, and your documentary, filterable by type.",
        ],
        keyTakeaway: "Two podcast segments a day — beef for fame, respect for cash, and never both on one rival. Appearances refresh weekly: use them or lose them. The Documentary is once-per-career — save it for a title run to double the payout.",
    },
    {
        id: "post-fight-interview",
        category: "Events & Media",
        title: "Post-Fight Interview — Every Word Counts",
        summary: "The four interview tones and what each one does to your career.",
        tags: ["interview", "humble", "confident", "trash talk", "beef", "respect"],
        body: [
            "After every win, before the summary closes, you're asked to give a post-fight interview. Losses skip this step — only winners take the mic. There are four tones to choose from: Humble, Confident, Trash Talk, and Skip. Each one does something different — this isn't just flavour.",
            "Humble earns a small notoriety bonus now and sets up a larger cash reward if you fight that opponent again in a rematch. It's the long-game option — sacrifice immediate reward for a future payday. Confident earns a standard notoriety bonus with no side effects. It's the clean, uncomplicated choice.",
            "Trash Talk earns the highest immediate notoriety bonus but writes a Beef flag on the opponent. The Beef flag pays a bonus if you fight them within 4 fights — but if the 4-fight window closes without a matchup, you take a −150 fame penalty. Trash talk is a commitment, not just an attitude.",
            "Skip is neutral. No bonus, no penalty. Sometimes the right move is to say nothing.",
        ],
        keyTakeaway: "Interviews are only available after wins. Trash Talk pays the most but starts a 4-fight clock — fight them before the window closes or pay the penalty.",
    },

    // ──────────────────────────────────────────────────────────────
    // SHOP & SUPPLEMENTS
    // ──────────────────────────────────────────────────────────────
    {
        id: "shop-and-supplements",
        category: "Shop & Supplements",
        title: "The Shop — Energy, Boosters & Buffs",
        summary: "Everything you can buy, how it works, and when it's worth spending Cash.",
        tags: ["shop", "energy", "energy shot", "energy drink", "xp booster", "pre-fight buff", "supplement", "premium", "inventory"],
        body: [
            "The Shop is where you turn Cash into an edge. It has three areas: the Cash Store (spend Cash you earn from fights), Premium (optional real-money Energy Drink bundles), and My Inventory (use what you own). Nothing in the Shop is required to win — it's there to smooth out the grind and let you spike your preparation when a fight matters.",
            "Energy items refill your energy bar instantly. An Energy Shot restores 30 energy and is bought with Cash. An Energy Drink restores 50 energy and is a premium item — you earn them free through contracts, win streaks and promotions, or buy a bundle. Use them from My Inventory or straight from the sidebar Inventory panel. You can't use an energy item when your bar is already full.",
            "XP Boosters multiply the XP you earn from training sessions. Only one booster can be active at a time — while one is running, every other booster card is locked until it's used up. Each booster covers a set number of sessions and targets either all stats or a specific group (for example STR and WRE). The Full Camp Stack is the best value: a long run of all-stat boost in one purchase. While a booster is active, the gym shows a banner with its sessions remaining, and every session it boosts is marked with a +X% badge — so you can see at a glance which training to spend charges on. Each training session burns one charge.",
            {
                type: "table",
                headers: ["Item type", "What it does", "Duration", "Bought with"],
                rows: [
                    ["Energy Shot", "Restores 30 energy", "Instant", "Cash"],
                    ["Energy Drink", "Restores 50 energy", "Instant", "Premium / earned"],
                    ["XP Booster", "More XP per training session", "N sessions", "Cash"],
                    ["Pre-Fight Buff", "Stat boost or injury protection", "1 fight", "Cash"],
                ],
            },
            "Pre-Fight Buffs are consumed the moment your next fight resolves. You can hold many in inventory, but you select only one per fight — and you do it in Fight Camp, not the Shop. Stat buffs (like a Whey Protein Shake for STR, or a Focus Stack for FIQ and CHN) raise the listed stats for that single bout. Collagen Recovery is different: instead of stats, it reduces the severity of any injury you take in the fight. If you come out unhurt, it simply wasn't needed — and the result screen will say so.",
            "Spending discipline matters. Boosters pay off most during a focused training push toward a stat threshold or promotion. Pre-fight buffs are worth it for a fight you genuinely need to win — a title shot, a grudge match, or a fight you're slightly underdog in. Energy items are for the days you log in to a full bar you can't spend fast enough. Buying everything every day is how you go broke; timing your purchases is how you climb.",
        ],
        keyTakeaway: "One XP Booster active at a time, one Pre-Fight Buff per fight (picked in Camp). Time your spending to the moments that matter instead of buying on autopilot.",
    },

    // ──────────────────────────────────────────────────────────────
    // THE PROVING GROUND (PvP)
    // ──────────────────────────────────────────────────────────────
    {
        id: "proving-ground-overview",
        category: "The Proving Ground",
        title: "The Proving Ground — PvP, Explained",
        summary: "What the Proving Ground is, how a PvP fight works, and how it fits alongside your career.",
        tags: ["pvp", "proving ground", "ladder", "division points", "dp", "gameplan", "defense", "season", "energy"],
        body: [
            "The Proving Ground is the game's player-versus-player ladder — a place to test your fighter against other real players' fighters. It runs in parallel to the title path: your PvP results never change your PvE rank, tier, or championship. But it's the same fighter in both — PvP fights cost you real HP, can injure you, and earn you stat XP, exactly like a career fight (more below). Whatever you've built in training is exactly what fights here.",
            "PvP is asynchronous — there's no live opponent sitting across from you. You pick a matchmade opponent, choose a gameplan, and the fight resolves instantly against their stored defense. When someone attacks you while you're offline, the game fights on your behalf using your saved defense gameplan. That's the whole loop: attack to climb, defend to hold your spot.",
            "Every PvP fight costs 15 energy from the same bar you train with, so laddering competes with your career for energy — pick your spots. The matchmaker hands you up to five opponents near your skill and standing; each card flags how tough they are, whether beating them pays a bonus, and whether they're a rival or the current belt holder.",
            "Before each fight you choose an attack gameplan — there are five, each built around a different way to win: Striking (STR + SPD + LEG — bang on the feet), Wrestling (WRE + GND — put them on the mat), Submission (SUB + GND — hunt the finish), Counter (takes less strike damage + grappling defense — make them miss), or Balanced (no bias). Each one boosts its cluster, pays a defensive cost, and shifts how the fight actually plays out — how often you shoot takedowns, chase submissions, or pressure on the feet — so pick the one that matches your build (the picker flags which suits your stats). Your defense gameplan is set once — from the Defense tab in the Proving Ground, open any time — and reused every time someone attacks you while you're offline; it starts on Balanced until you change it, so set it to match your build early. Because PvP reuses the same stat-driven engine as your career fights, it's a fair contest decided by stats, gameplan, and the season's rules.",
            "PvP fights are not consequence-free: it's your one real body. You enter at your current HP and can leave hurt or injured — a real injury that lands in the Hospital and blocks your career fights until it heals — and both fighters earn stat XP from the bout, win or lose. This is true even on defense: someone can attack you while you're offline and you'll take the HP, injuries, and XP from it (your defense report shows what it cost). The flip side: a fighter who's already injured can't be attacked (they show as 'Recovering'), and a low-HP fighter is easy prey — so don't sit on the ladder hurt.",
        ],
        keyTakeaway: "PvP is a parallel ladder (15 energy a fight) — but the same body: fights cost real HP, can injure you (Hospital-real, career-blocking), and earn stat XP, win or lose, even on offline defenses.",
    },
    {
        id: "proving-ground-onboarding",
        category: "The Proving Ground",
        title: "Your First Steps on the Ladder",
        summary: "Unlocking PvP, placement matches, your new-competitor protections, and the first-season bonus.",
        tags: ["pvp", "unlock", "placement", "new competitor shield", "catch-up", "first season", "onboarding", "new player"],
        body: [
            "The Proving Ground doesn't open the moment you create a fighter — you unlock it by winning 3 career fights first. Until then the tab is visible but shows a locked screen with your progress, so you always know it's waiting. The gate makes sure you arrive with a fighter that can actually compete instead of getting fed to the ladder on day one.",
            "Once unlocked, your first 3 PvP fights are placement matches. These are real fights against real opponents, but nothing is at stake: no Division Points change hands for you or your opponent, and your win streak and rivalries don't start ticking yet. They exist to find your level. Win all three and you enter as a Contender on 400 DP; the fewer you win, the lower you seed (2 wins → 200 DP, 1 → 100, 0 → 0). While you're in placement you also can't be attacked — you fight on your own terms until you've found your footing.",
            "When placement ends you get a New Competitor Shield: for 7 days, or until you throw your first real attack, no one can challenge you. It's a grace period to settle in, not a fortress — the moment you go on the offensive the shield drops and you're fully in the game. Other players see a 'Protected' tag on you and can't pick you as a target until then.",
            "If you join a season late — more than two weeks after it started — you get a catch-up bonus: your DP gains are doubled for 7 days so you can close the gap on players who've been grinding all season. It only boosts wins, never softens losses, and it switches off once you reach the top divisions (Elite and Champion) — it's there to get you to the middle of the pack quickly, not to hand you the belt. And whenever you finish your very first PvP season with at least one fight, you bank a one-time welcome bonus of 500 cash and 100 fame on top of your normal rewards.",
            "Season 1 is the exception. Because it's the open launch season where everyone starts together, placement, the shield, and catch-up are all switched off — you enter straight onto the ladder at Prospect. The 3-win unlock gate and the first-season bonus still apply.",
        ],
        keyTakeaway: "Win 3 career fights to unlock PvP, play 3 no-stakes placement matches to set your starting rank, then enjoy a 7-day shield. Late joiners get ×2 DP to catch up; everyone gets a one-time first-season bonus.",
    },
    {
        id: "proving-ground-divisions",
        category: "The Proving Ground",
        title: "Division Points, Divisions & the Belt",
        summary: "How DP, the five divisions, promotion, rivalries, decay and the seasonal belt work.",
        tags: ["pvp", "division points", "dp", "divisions", "promotion", "shield", "belt", "rivalry", "decay", "bracket", "streak"],
        body: [
            "Your standing in the Proving Ground is one number: Division Points (DP). Win and it climbs, lose and it falls. Your division is read straight off your DP — there are five, each with a floor you sit above and a threshold that promotes you.",
            {
                type: "table",
                headers: ["Division", "DP floor", "Promotes at"],
                rows: [
                    ["Prospect", "0", "300"],
                    ["Contender", "300", "1,200"],
                    ["Challenger", "1,200", "2,500"],
                    ["Elite", "2,500", "5,000"],
                    ["Champion", "5,000", "Top — holds the belt"],
                ],
            },
            "A win that pushes you past your division's promotion threshold promotes you: you move up and your DP resets to the new division's floor. You never get demoted mid-season — a loss can floor your DP at your current division's bottom, but you keep the division until the season resets.",
            "A win starts at +120 DP and is shaped by modifiers, in order. Beating the belt holder adds +50. Resolving a rivalry adds +25. Fighting up the rankings pays a bracket bonus — +10% for a 6–10 OVR gap, +25% for an 11–20 gap. The season twist can multiply matching wins. A 3-plus win streak multiplies everything by ×1.25. But hit the same opponent twice in one week and the reward is halved, then quartered — so spread your fights around. Losing as the attacker costs up to −55; defending and losing only costs −28; a win always banks at least +1, and no single loss costs more than −100.",
            "Rivalries build as you keep beating the same player within a season — the third win 'resolves' the rivalry and pays its +25 bonus. The belt belongs to whoever sits #1 in the Champion division when the season ends (with at least one fight): they're crowned, enter the Hall of Fame, and take the season's biggest reward. And if you go quiet, it costs you — seven days without a PvP fight bleeds −10 DP (Prospects are spared), so check in to defend your climb.",
            "You watch all of this on the Ladder screen. Filter it by division — and, in the open Season 1, by weight class — to see exactly who sits above and below you; your own position stays pinned at the top no matter what you're browsing, and a 'Last Active' column flags who's drifting toward inactivity decay. Tap any fighter to open their profile, and if they're a fair match in your season you can challenge them straight from there. That shortcut still respects matchmaking, though: brand-new fighters under their New Competitor Shield, and anyone too far outside your skill range, can't be called out directly.",
        ],
        keyTakeaway: "DP is everything. Promotions reset you to the new floor with a 3-fight shield, the belt goes to the season-end Champion #1, and a week of inactivity costs DP.",
    },
    {
        id: "proving-ground-seasons",
        category: "The Proving Ground",
        title: "Seasons, Twists & Rewards",
        summary: "How PvP seasons run, what twists do, end-of-season rewards, and the special Open Season 1.",
        tags: ["pvp", "season", "twist", "rewards", "soft reset", "open season", "cross weight class", "belt", "hall of fame"],
        body: [
            "The Proving Ground runs in seasons of 70 days. Each season carries a twist — a rule that rewards a particular way of winning: Blood Sport pays +25% on KO and submission wins, Iron Fist +30% on KOs, Ground War +30% on submissions, The Marathon +20% on decisions, The Contenders switches on streak bonuses sooner, and Iron Circuit is the clean, no-twist baseline. Read the twist when a season opens and lean your gameplan into it.",
            "When a season ends, everyone who fought at least once is paid by the division they finished in. The belt holder's reward replaces the Champion reward — it doesn't stack on top of it.",
            {
                type: "table",
                headers: ["Final division", "Iron", "Fame", "Energy drinks", "Badge"],
                rows: [
                    ["Prospect", "500", "500", "0", "—"],
                    ["Contender", "1,200", "1,200", "0", "—"],
                    ["Challenger", "2,500", "2,500", "0", "Challenger"],
                    ["Elite", "5,000", "5,000", "2", "Elite"],
                    ["Champion", "10,000", "10,000", "5", "Champion"],
                    ["Belt holder", "15,000", "15,000", "7", "Belt"],
                ],
            },
            "After rewards, a soft reset drops each player one tier into the next season and sets their DP to that division's floor — so every season is a fresh climb, but finishing high still buys you a head start. The next season is seeded automatically.",
            "Season 1 is special. Normally each weight class runs its own ladder and crowns its own belt, but at launch there aren't enough players to fill four ladders — so Season 1 is run as a single Open season: every weight class shares one ladder, one belt, and one reward pass. You'll be matched against fighters from other weight classes, and you'll see their real weight class on every screen. It's still a fair fight — the engine decides bouts on stats and OVR, not body weight. When the Open season ends, everyone returns to their own weight class for the normal four-ladder Season 2, carrying their soft-reset standing. The one-of-a-kind Open belt is the prize for being the best fighter in the game, full stop.",
        ],
        keyTakeaway: "70-day seasons, each with a twist; rewards scale by final division and soft-reset you one tier for the next. Season 1 is a single Open ladder across all weight classes — one belt for everyone.",
    },
];

/**
 * Build a flat string of searchable content for an article. Used to power
 * the Library search bar — title gets the highest weight implicitly because
 * we also keep title-only matches separately.
 */
export function articleSearchText(article) {
    const body = article.body
        .map((b) => (typeof b === "string" ? b : ""))
        .join(" ");
    return [
        article.title,
        article.summary,
        body,
        article.keyTakeaway || "",
        (article.tags || []).join(" "),
    ]
        .join(" ")
        .toLowerCase();
}
