/**
 * Octagon Gazette template catalog.
 *
 * Each story type has 4–6 template variants. The composer picks one at render time
 * (deterministic per (date, fighterId) — see utils/gazetteRng.js).
 *
 * Variables are written as {VARIABLE_NAME} and substituted by the variable resolver.
 *
 * Each template is { headline, body } — body is null for filler briefs.
 */

const TEMPLATES = {

    // ── PRIORITY 0: Mental Reset Required (overrides almost everything) ──────────
    mental_reset_required: [
        { headline: "MENTAL RESET REQUIRED FOR {FIGHTER}",
          body: "Three losses on the bounce. {FIGHTER} must clear a Mental Reset before the next fight." },
        { headline: "TIME TO BREATHE",
          body: "The losses have piled up for {FIGHTER}. A Mental Reset is mandatory before they fight again." },
        { headline: "PAUSE BUTTON",
          body: "After three straight defeats, {FIGHTER} can't fight until they complete a Mental Reset." },
    ],

    // ── PRIORITY 1: Event Result ────────────────────────────────────────────────
    event_result_ko: [
        { headline: "{WINNER} DEMOLISHES {LOSER} IN ROUND {ROUND}",
          body: "{EVENT_NAME} delivered a statement finish last night as {WINNER} put {LOSER} away with a devastating stoppage." },
        { headline: "LIGHTS OUT FOR {LOSER} — {WINNER} WINS BY KO",
          body: "It was over in round {ROUND}. {WINNER} landed the shot that ended the night at {EVENT_NAME}." },
        { headline: "BRUTAL STOPPAGE AT {EVENT_NAME}",
          body: "{WINNER} needed just {ROUND} round(s) to finish {LOSER} in one of the year's most emphatic performances." },
        { headline: "ROUND {ROUND} FINISH: {WINNER} OVER {LOSER}",
          body: "The main card at {EVENT_NAME} ended early as {WINNER} secured the KO victory." },
    ],
    event_result_sub: [
        { headline: "{WINNER} TAPS OUT {LOSER} IN ROUND {ROUND}",
          body: "A masterclass on the mat at {EVENT_NAME} as {WINNER} secured the submission finish." },
        { headline: "SUBMISSION SPECIALIST {WINNER} DOES IT AGAIN",
          body: "{LOSER} had no answer for {WINNER}'s ground game at {EVENT_NAME}. Tap out in round {ROUND}." },
        { headline: "THE MAT IS {WINNER}'S DOMAIN",
          body: "{EVENT_NAME} saw another dominant submission victory as {WINNER} finished {LOSER} in round {ROUND}." },
        { headline: "TECHNICAL MASTERPIECE AT {EVENT_NAME}",
          body: "{WINNER} forces the tap from {LOSER} in round {ROUND} in a display of elite grappling." },
    ],
    event_result_dec: [
        { headline: "{WINNER} EDGES {LOSER} OVER THE DISTANCE AT {EVENT_NAME}",
          body: "Three rounds of war ended with the judges favouring {WINNER} in a hard-fought contest." },
        { headline: "DECISION VICTORY FOR {WINNER} AT {EVENT_NAME}",
          body: "{LOSER} pushed the pace but {WINNER} had the answers when it counted." },
        { headline: "CLOSE FIGHT, CLEAR WINNER",
          body: "{WINNER} takes the decision over {LOSER} at {EVENT_NAME} after a grinding, tactical contest." },
        { headline: "JUDGES FAVOUR {WINNER} AFTER THREE ROUNDS",
          body: "It went the distance at {EVENT_NAME} but {WINNER} did enough to take the nod over {LOSER}." },
    ],

    // ── PRIORITY 2: First Loss + Title Fight Composite ─────────────────────────
    first_loss_in_title: [
        { headline: "FIRST DEFEAT — AND IT WAS FOR THE BELT",
          body: "{OPPONENT} hands {FIGHTER} a maiden professional loss in the {TIER} title fight. A career-defining night." },
        { headline: "THE PERFECT RECORD BREAKS UNDER THE LIGHTS",
          body: "{FIGHTER}'s unbeaten run ends in the {TIER} title fight. {OPPONENT} keeps the belt." },
        { headline: "GOLD ELUDES THE UNDEFEATED",
          body: "{FIGHTER} arrives with a perfect record and leaves with a first loss. {OPPONENT} retains the {TIER} title." },
    ],

    // ── PRIORITY 3: Title Fight Result ─────────────────────────────────────────
    title_won: [
        { headline: "NEW CHAMPION CROWNED",
          body: "{FIGHTER} defeats {OPPONENT} to become the {TIER} champion. The belt is theirs." },
        { headline: "THE THRONE IS TAKEN",
          body: "{FIGHTER} dethrones {OPPONENT} in {ROUND} round(s) to claim the {TIER} title." },
        { headline: "CHAMPION. {FIGHTER} IS CHAMPION.",
          body: "The {TIER} division has a new ruler. {FIGHTER} finishes {OPPONENT} and seizes the gold." },
        { headline: "UPSET OF THE YEAR? {FIGHTER} CAPTURES THE {TIER} BELT",
          body: "{OPPONENT} didn't see it coming. {FIGHTER} is the new champion." },
    ],
    title_lost: [
        { headline: "SO CLOSE, YET SO FAR",
          body: "{FIGHTER} falls short in the title fight against {OPPONENT}. The {TIER} belt remains out of reach." },
        { headline: "{OPPONENT} RETAINS — {FIGHTER} MUST REGROUP",
          body: "A valiant effort from {FIGHTER} but {OPPONENT} proved too strong on the night." },
        { headline: "TITLE SHOT COMES UP SHORT FOR {FIGHTER}",
          body: "{OPPONENT} keeps the {TIER} title. {FIGHTER} returns to the rankings to rebuild." },
        { headline: "NOT YET",
          body: "{FIGHTER} pushes {OPPONENT} but falls short of the {TIER} championship. The hunger remains." },
    ],

    // ── PRIORITY 4: First Loss (standalone) ────────────────────────────────────
    first_loss: [
        { headline: "THE PERFECT RECORD IS GONE",
          body: "{FIGHTER} suffers a first professional loss at the hands of {OPPONENT}. The question now is how they respond." },
        { headline: "ZERO BECOMES ONE",
          body: "{OPPONENT} hands {FIGHTER} their first career defeat. Every great fighter faces this moment." },
        { headline: "FIRST LOSS FOR {FIGHTER}",
          body: "The {RECORD} record takes its first blemish. {OPPONENT} was the one to do it." },
        { headline: "NOBODY GOES FOREVER — {FIGHTER} FALLS",
          body: "{OPPONENT} ends the unbeaten run. How {FIGHTER} responds will define them." },
        { headline: "A DARK NIGHT FOR {FIGHTER}",
          body: "The unbeaten record is no more. {OPPONENT} wins in a defining moment in {FIGHTER}'s career." },
    ],

    // ── PRIORITY 5: Auto-Promotion ─────────────────────────────────────────────
    auto_promotion: [
        { headline: "{FIGHTER} EARNS THE STEP UP",
          body: "Promoted to the {TIER} division. The stakes just got higher." },
        { headline: "WELCOME TO {TIER}",
          body: "{FIGHTER} ascends to the {TIER} division. A new pool of opponents awaits." },
        { headline: "DIVISION MOVE FOR {FIGHTER}",
          body: "Up and out. {FIGHTER} graduates to the {TIER} ranks." },
    ],

    // ── PRIORITY 6: Rank Entry ─────────────────────────────────────────────────
    rank_entry: [
        { headline: "{FIGHTER} ENTERS THE {TIER} RANKINGS AT #{NEW_RANK}",
          body: "Three fights in. {FIGHTER} earns a spot in the {TIER} rankings at #{NEW_RANK}." },
        { headline: "OFFICIALLY RANKED",
          body: "After three fights, {FIGHTER} debuts in the {TIER} rankings at #{NEW_RANK}." },
        { headline: "FROM UNRANKED TO #{NEW_RANK}",
          body: "{FIGHTER} makes their {TIER} ranking debut. The climb begins." },
    ],

    // ── PRIORITY 7: Win Streak Milestone ───────────────────────────────────────
    win_streak: [
        { headline: "{STREAK} AND COUNTING — {FIGHTER} IS ON FIRE",
          body: "The wins keep coming. {FIGHTER} has now strung together {STREAK} consecutive victories." },
        { headline: "CAN ANYONE STOP {FIGHTER}?",
          body: "{STREAK} straight wins. The division is taking notice." },
        { headline: "{FIGHTER} ROLLS TO {STREAK}-FIGHT WIN STREAK",
          body: "Dominant, consistent, relentless. {FIGHTER} continues to build a statement run." },
        { headline: "THE STREAK IS REAL — {FIGHTER} AT {STREAK}",
          body: "What started as a good run is becoming something special. {STREAK} wins in a row for {FIGHTER}." },
        { headline: "UNSTOPPABLE? {FIGHTER} MAKES IT {STREAK}",
          body: "Another win, another step toward the top." },
    ],

    // ── PRIORITY 8: Rank Jump ──────────────────────────────────────────────────
    rank_jump: [
        { headline: "ROCKET UP THE RANKINGS",
          body: "{FIGHTER} jumps from #{OLD_RANK} to #{NEW_RANK} in the {TIER} division after last night's result." },
        { headline: "THE RANKINGS ARE SHIFTING",
          body: "A big move for {FIGHTER}, climbing from #{OLD_RANK} to #{NEW_RANK} in {TIER}." },
        { headline: "#{NEW_RANK} AND RISING",
          body: "{FIGHTER} makes a statement leap up the {TIER} rankings, moving to #{NEW_RANK}." },
        { headline: "EYES ON {FIGHTER}",
          body: "From #{OLD_RANK} to #{NEW_RANK} in one night. The {TIER} division is paying attention." },
    ],

    // ── PRIORITY 9: Last Fight Result (default lead/secondary) ─────────────────
    win_ko: [
        { headline: "KNOCKOUT VICTORY FOR {FIGHTER}",
          body: "{FIGHTER} put {OPPONENT} away in round {ROUND}. Another finish, another step up the rankings." },
        { headline: "{FIGHTER} SENDS {OPPONENT} TO THE CANVAS",
          body: "Brutal and efficient. {FIGHTER} secured the stoppage in round {ROUND}." },
        { headline: "STATEMENT WIN FOR {FIGHTER}",
          body: "{OPPONENT} had no answer for what {FIGHTER} brought. KO finish, round {ROUND}." },
        { headline: "ROUND {ROUND} FINISH — {FIGHTER} OVER {OPPONENT}",
          body: "The fight was stopped in round {ROUND} as {FIGHTER} landed the decisive blow." },
        { headline: "LIGHTS OUT",
          body: "{FIGHTER} ends the night early with a KO victory over {OPPONENT} in round {ROUND}." },
    ],
    win_sub: [
        { headline: "{FIGHTER} SUBMITS {OPPONENT} IN ROUND {ROUND}",
          body: "Another tap out. {FIGHTER} continues to impress on the mat." },
        { headline: "THE GROUND IS {FIGHTER}'S HOME",
          body: "{OPPONENT} tapped in round {ROUND} as {FIGHTER} locked in the submission." },
        { headline: "SUBMISSION WIN FOR {FIGHTER} OVER {OPPONENT}",
          body: "Technical, precise, and effective. {FIGHTER} gets the tap in round {ROUND}." },
        { headline: "ROUND {ROUND}: {FIGHTER} FORCES THE TAP",
          body: "{OPPONENT} had no escape as {FIGHTER} secured the submission victory." },
    ],
    win_dec: [
        { headline: "{FIGHTER} GRINDS OUT DECISION OVER {OPPONENT}",
          body: "Three rounds of work, one clear winner. Judges score it for {FIGHTER}." },
        { headline: "DECISION WIN FOR {FIGHTER}",
          body: "{OPPONENT} made it competitive but {FIGHTER} did enough to earn the nod." },
        { headline: "JUDGES FAVOUR {FIGHTER} OVER {OPPONENT}",
          body: "A disciplined performance from {FIGHTER} earns the decision victory." },
        { headline: "THE DISTANCE FAVOURS {FIGHTER}",
          body: "{OPPONENT} pushed hard but {FIGHTER} controlled the fight to earn the decision." },
    ],
    loss: [
        { headline: "{FIGHTER} SUFFERS DEFEAT AGAINST {OPPONENT}",
          body: "A tough night. {FIGHTER} falls to {OPPONENT} and returns to the gym to regroup." },
        { headline: "SETBACK FOR {FIGHTER}",
          body: "{OPPONENT} proved too much on the night. {FIGHTER} drops the result and reflects." },
        { headline: "BACK TO THE DRAWING BOARD",
          body: "{FIGHTER} loses to {OPPONENT}. The work continues." },
        { headline: "DEFEAT FOR {FIGHTER} AT THE HANDS OF {OPPONENT}",
          body: "{FIGHTER} fought hard but {OPPONENT} had the answers tonight." },
        { headline: "A LESSON LEARNED",
          body: "{FIGHTER} suffers a loss to {OPPONENT}. Every setback is data." },
    ],

    // ── PRIORITY 10: Division Spotlight (fallback lead) ────────────────────────
    spotlight_ranked: [
        { headline: "THE {TIER} DIVISION AWAITS",
          body: "{FIGHTER} sits at #{RANK} and the path forward is clear. Get back in the gym." },
        { headline: "WHAT'S NEXT FOR {FIGHTER}?",
          body: "Sitting at #{RANK} in {TIER}, the next fight could change everything." },
        { headline: "THE DIVISION KEEPS MOVING",
          body: "{FIGHTER} is #{RANK} in {TIER}. Every day without a fight is a day others are catching up." },
    ],
    spotlight_unranked: [
        { headline: "THE JOURNEY BEGINS",
          body: "{FIGHTER} is unranked and hungry. The {TIER} division won't know what hit it." },
        { headline: "UNRANKED. FOR NOW.",
          body: "{FIGHTER} has everything to prove in the {TIER} division. Time to get to work." },
        { headline: "A CAREER IN MOTION",
          body: "{FIGHTER} is building something in the {TIER} division. The rankings are within reach." },
    ],

    // ── SECONDARY / FILLER STORIES ─────────────────────────────────────────────

    fame_tier_up: [
        { headline: "{FIGHTER} ASCENDS TO {FAME_TIER}",
          body: "The fans are taking notice. {FIGHTER}'s fame has climbed into the {FAME_TIER} bracket." },
        { headline: "RECOGNITION GROWS",
          body: "{FIGHTER} reaches {FAME_TIER} status. The buzz around the name is real." },
        { headline: "INTO {FAME_TIER}",
          body: "Notoriety check: {FIGHTER} just moved up to {FAME_TIER}." },
    ],

    notoriety_gained: [
        { headline: "THE BUZZ IS BUILDING",
          body: "{FIGHTER}'s notoriety sits at {NOTORIETY}. The fans are watching." },
        { headline: "FAME ON THE RISE FOR {FIGHTER}",
          body: "Up {CHANGE} notoriety points." },
        { headline: "PEOPLE ARE TALKING ABOUT {FIGHTER}",
          body: "Notoriety now at {NOTORIETY}." },
    ],
    notoriety_lost: [
        { headline: "FADING FROM THE SPOTLIGHT",
          body: "{FIGHTER}'s notoriety dips to {NOTORIETY}. Results on the canvas are the only cure." },
        { headline: "THE BUZZ COOLS FOR {FIGHTER}",
          body: "Down {CHANGE} notoriety. Time to make some noise." },
        { headline: "QUIET SPELL FOR {FIGHTER}",
          body: "Notoriety at {NOTORIETY}. The fans need a reason to keep talking." },
    ],

    nemesis_set: [
        { headline: "A RIVALRY IS BORN",
          body: "{OPPONENT} just handed {FIGHTER} a loss. A grudge has officially started." },
        { headline: "{FIGHTER} HAS A NEW NEMESIS",
          body: "{OPPONENT}. Remember the name." },
    ],
    nemesis_cleared: [
        { headline: "REVENGE SERVED",
          body: "{FIGHTER} settles the score with {OPPONENT}. Nemesis cleared." },
        { headline: "{FIGHTER} GETS THE WIN BACK",
          body: "The grudge is over. {FIGHTER} defeats {OPPONENT}." },
    ],

    beef_lapsed: [
        { headline: "GRUDGE FIZZLES OUT",
          body: "{FIGHTER}'s beef with {OPPONENT} expired without a fight. The talk costs fame." },
        { headline: "ALL TALK, NO ACTION",
          body: "The beef with {OPPONENT} timed out. Fame penalty applied." },
    ],

    sponsorship_new: [
        { headline: "SPONSOR INTEREST FOR {FIGHTER}",
          body: "{SPONSOR_NAME} has reached out with a sponsorship offer." },
        { headline: "BRANDS ARE WATCHING",
          body: "A new deal from {SPONSOR_NAME} lands on {FIGHTER}'s desk." },
        { headline: "COMMERCIAL APPEAL",
          body: "{FIGHTER} attracts interest from {SPONSOR_NAME}." },
    ],
    sponsorship_clause: [
        { headline: "BONUS UNLOCKED",
          body: "{FIGHTER} triggered a clause with {SPONSOR_NAME}." },
        { headline: "CLAUSE ACTIVATED",
          body: "{SPONSOR_NAME} clause triggered — {FIGHTER} earns the bonus." },
    ],
    sponsorship_expiring: [
        { headline: "DEAL RUNNING OUT",
          body: "{FIGHTER}'s contract with {SPONSOR_NAME} is nearing its end." },
        { headline: "SPONSORSHIP EXPIRY AHEAD",
          body: "{SPONSOR_NAME} deal expires soon." },
    ],

    record_milestone: [
        { headline: "BY THE NUMBERS — {FIGHTER} HITS {MILESTONE_LABEL}",
          body: "The stats tell the story. {FIGHTER}'s record stands at {RECORD}." },
        { headline: "{MILESTONE_LABEL} FOR {FIGHTER}",
          body: "A career marker reached. {RECORD} and still going." },
        { headline: "MILESTONE ALERT: {FIGHTER} AT {MILESTONE_LABEL}",
          body: "Record now reads {RECORD}." },
        { headline: "CAREER LANDMARK FOR {FIGHTER}",
          body: "{MILESTONE_LABEL} reached. {RECORD} on the books." },
    ],

    gym_session: [
        { headline: "HOURS IN THE GYM ADDING UP", body: null },
        { headline: "THE WORK IS REAL", body: null },
        { headline: "DEDICATED", body: null },
    ],
    gym_perk: [
        { headline: "GYM LOYALTY PAYS OFF", body: null },
        { headline: "NEW BENEFIT AT {GYM_NAME}", body: null },
    ],

    comeback: [
        { headline: "TOUGH TIMES FOR {FIGHTER}",
          body: "{LOSS_STREAK} losses in a row. The gym is the only answer." },
        { headline: "BACK AGAINST THE WALL",
          body: "{FIGHTER} has dropped {LOSS_STREAK} straight. The critics are circling." },
        { headline: "CHARACTER BUILDING MOMENTS",
          body: "{LOSS_STREAK} consecutive losses for {FIGHTER}. This is where careers are defined." },
        { headline: "DARK SPELL FOR {FIGHTER}",
          body: "{LOSS_STREAK} straight defeats. The comeback story is waiting to be written." },
    ],
};

module.exports = { TEMPLATES };
