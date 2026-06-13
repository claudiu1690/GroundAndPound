/**
 * Fight Description System — template library.
 * All template arrays are verbatim from the contract spec.
 */

export const INTRO = {
  standard: [
    "{playerName} marches to the center to meet {opponentName}. Both fighters touch gloves.",
    "The cage door closes. {playerName} and {opponentName} meet in the center.",
    "{opponentName} is already moving. {playerName} settles into stance and waits.",
    "The crowd settles. {playerName} and {opponentName} touch gloves and back away.",
    "{playerName} comes out loose. {opponentName} looks focused and ready.",
    "Referee gives the signal. Both fighters move to the center — this one is on.",
    "{opponentName} nods at {playerName}. {playerName} doesn't blink. Fight's on.",
    "The cage is locked. {playerName} finds their feet. {opponentName} is circling already.",
  ],
  comeback: [
    "{playerName} has something to prove tonight. {opponentName} is in the way.",
    "Comeback mode. {playerName} walks out like they have nothing to lose. {opponentName} is ready.",
    "{playerName} needs this one. {opponentName} walks out loose — maybe too loose.",
  ],
  nemesis: [
    "This one is personal. {playerName} faces {opponentName} — the rematch everyone wanted.",
    "{opponentName} put {playerName} down before. Tonight is different. It has to be.",
    "The bad blood fills the room before either fighter throws a punch.",
  ],
  title: [
    "The belt is on the line. {playerName} and {opponentName} meet for the championship.",
    "Five rounds. Everything on the line. {playerName} vs {opponentName} for the title.",
    "Gold on the line tonight. {playerName} came here to take it. {opponentName} came to keep it.",
  ],
  callout: [
    "{playerName} called this one out. {opponentName} accepted. Now everyone finds out who was right.",
    "This fight started in a post-fight interview. Now it ends in the cage.",
    "{opponentName} had things to say. {playerName} had things to prove. Here we are.",
  ],
};

export const EVENT = {
  takedown_secured: [
    "{actor} shoots for the double — secured. {target} brought to the mat.",
    "{actor} changes levels and drives through — takedown lands clean.",
    "{actor} shoots in deep, {target} can't sprawl in time. Down they go.",
    "Single leg from {actor} — {target} loses their base. Takedown.",
    "{actor} times the shot perfectly. {target} goes to the canvas.",
    "{actor} shoots {position} — powerful takedown, {target} has no answer.",
    "Level change from {actor} — {target} grabbed and taken down hard.",
    "{actor} clinches and trips — {target} off their feet and on the mat.",
  ],
  takedown_stuffed: [
    "{target} sprawls hard — {actor}'s shot stuffed cold.",
    "{target} reads the shot and defends. {actor} can't convert.",
    "{actor} shoots — {target} has the takedown defence, shuts it down.",
    "Takedown attempt from {actor} — {target} sits on it and denies.",
    "{actor} tries the level change — {target} stays upright. Denied.",
    "{target} blocks the shot and resets to the feet. Clean defence.",
    "{actor} shoots low — {target} circles out and avoids it completely.",
    "{actor} telegraphed the shot. {target} was already sprawling.",
  ],
  camp_takedown_defence_fired: [
    "{target}'s takedown defence pays off — the shot is sprawled perfectly.",
    "Camp work shows — {target} stuffs the takedown. Preparation met the moment.",
    "{target} drilled this exact shot in camp. {actor} gets nothing.",
    "The sprawl is there. {target} trained for this. {actor}'s takedown stuffed.",
    "All those reps in camp — {target} sprawls and resets like it's nothing.",
  ],
  takedown_attempt_failed: [
    "{actor} reaches for the leg — {target} hops away. Nothing doing.",
    "Half-hearted shot from {actor}. {target} doesn't even need to sprawl.",
    "{actor} feints the takedown. {target} doesn't bite.",
    "{actor} tries to shoot — {target} circles and denies the angle.",
  ],
  strike_clean: [
    "{actor} lands a clean {strike}. {target} takes it and moves.",
    "Sharp {strike} from {actor} finds the mark.",
    "{actor} times the {strike} perfectly. {target} feels it.",
    "{actor} snaps a {strike} — clean connection.",
    "Crisp {strike} from {actor}. {target} nods and resets.",
    "{actor} flicks the {strike} through {target}'s guard.",
    "{actor} lands the {strike} — {target} absorbs it well.",
    "The {strike} from {actor} gets through. {target} takes it clean.",
  ],
  strike_hurt: [
    "Big {strike} from {actor} — {target} is hurt.",
    "{actor} lands the {strike} flush — {target} wobbles.",
    "{target} is shaken after that {strike} from {actor}.",
    "{actor} digs a {strike} and {target}'s legs go momentarily.",
    "That {strike} landed — {target} is in trouble.",
    "{actor} finds the chin with a {strike}. {target} is hurt, covering up.",
    "{target} takes a {strike} and backpedals. {actor} smells blood.",
    "Damage from that {strike}. {target} is not comfortable right now.",
  ],
  strike_body: [
    "{actor} digs to the {bodyPart} — {target} winces.",
    "{actor} lands a {strike} to the {bodyPart}. {target} grimaces.",
    "Body work from {actor}. The {strike} lands clean to the {bodyPart}.",
    "{actor} targets the {bodyPart} — {target} grunts and resets.",
    "Nasty {bodyPart} shot from {actor}. {target} feels that one.",
    "{actor} hammers the {bodyPart}. {target} steps back to breathe.",
  ],
  knockdown: [
    "{actor} drops {target} with a {strike}. {target} scrambles up before the follow-up.",
    "{target} goes down from the {strike} — and immediately works back to their feet.",
    "Down goes {target} — {actor} landed the {strike} clean and swarms in after them.",
    "{actor} connects with the {strike} and {target} hits the canvas.",
    "Flash knockdown — {target} down from the {strike}, scrambling back up fast.",
    "{target} is dropped. The {strike} from {actor} found the mark.",
  ],
  knockdown_recovery: [
    "{target} is back to their feet, trying to shake it off.",
    "{target} survives the moment — covers up, ties {actor} up, and recovers.",
    "{target} clears their head. They're back but they're hurt.",
    "Somehow {target} stays in it — scrambles back up and resets. Still in this one.",
    "{target} gets up on shaky legs. {actor} moves in.",
  ],
  submission_attempt: [
    "{actor} locks in the {sub} — {target} is in danger.",
    "{actor} sinks in the {sub} from back control.",
    "{actor} transitions to the {sub}. {target} is scrambling to defend.",
    "{actor} latches onto the {sub}. {target} has to fight out of this.",
    "{actor} hunting the {sub} — arm threaded, searching for the tap.",
    "{actor} finds the {sub}. {target} is in trouble, defending hard.",
    "{actor} gets the {sub} locked in tight. Referee watching closely.",
  ],
  submission_escaped: [
    "{target} survives the {sub} attempt — escapes to the fence.",
    "{target} defends the {sub}, works free. Impressive escape.",
    "{actor} had the {sub} — {target} manages to slip out.",
    "{target} fights through the {sub} and scrambles to their feet.",
    "Somehow {target} escapes the {sub}. {actor} loses the position.",
    "{target} tucks the chin and denies the {sub}. Back to the feet.",
    "{target} rolls out of the {sub}. Smart escape work.",
  ],
  camp_submission_escape_fired: [
    "{target} trained for this — escapes the {sub} with textbook defence.",
    "Camp work pays off. {target} defends the {sub} and scrambles free.",
    "{target} drilled submission escapes. It shows — {actor} gets nothing.",
    "All those escape drills in camp. {target} works free of the {sub}.",
    "The {sub} defence was in the game plan. {target} executes it clean.",
  ],
  submission_finish: [
    "{actor} locks in the {sub}. {target} taps. Fight over.",
    "{actor} gets the {sub} in deep — {target} has no choice but to tap.",
    "The {sub} is tight. {target} taps and the referee waves it off.",
    "{actor} sinks the {sub} and {target} goes out. Referee stops it.",
    "{target} has nowhere to go. The {sub} is locked. They tap.",
    "{actor} secures the {sub} and squeezes — the tap comes quickly.",
    "Clean finish. {actor} locks the {sub} — {target} taps immediately.",
    "The {sub} from {actor} is textbook. {target} taps before it gets worse.",
  ],
  ko_finish: [
    "{actor} lands the {strike} — {target} goes down and doesn't get up. It's over.",
    "Clean {strike} from {actor}. {target} is out before they hit the canvas.",
    "{actor} times the {strike} perfectly. Lights out for {target}.",
    "{target} walks into the {strike}. Referee waves it off immediately.",
    "The {strike} from {actor} ends it. {target} is unconscious. Fight's done.",
    "{actor} catches {target} with the {strike}. Down and out. Official.",
    "One {strike}. That's all it took. {target} crumples and the fight is stopped.",
    "The {strike} lands and {target} is gone. Dominant finish from {actor}.",
  ],
  // tko_finish has been split into two keys. The engine resolves whole rounds —
  // a finish is always detected within a round, so "between rounds" / corner towel
  // / doctor wording is impossible. All such variants have been removed.
  tko_finish_strike: [
    "Referee steps in — {target} can't defend themselves anymore. TKO.",
    "Referee stops it. {target} was taking too many unanswered shots.",
    "{actor} swarms with punches — {target} covers up but the referee waves it off.",
    "TKO. {actor} had {target} hurt and finished the job.",
    "{actor} unloads on {target} and the referee pulls them apart. It's over.",
    "{target} is absorbing too much. The referee waves it off standing.",
  ],
  tko_finish_ground: [
    "{actor} pours on the ground and pound. Referee has seen enough. Stopped.",
    "{actor} in top position, landing unanswered shots. Referee stops it.",
    "Ground and pound from {actor} — {target} can't intelligently defend. TKO.",
    "The referee dives in — {actor} was doing too much damage from top position.",
    "{target} is taking heavy ground shots. Referee waves it off. TKO.",
  ],
  ground_control_carried: [
    "{actor} keeps {target} grounded — top control carried over from the last round.",
    "{actor} stays heavy on top; {target} is still stuck underneath.",
    "No escape for {target} — {actor} maintains top position from the previous round.",
    "{actor} holds {target} down, picking up where the last round left off.",
  ],
  clinch_work: [
    "{actor} drags {target} into the clinch, lands elbows.",
    "{actor} ties up {target} against the fence. Knees to the body.",
    "Clinch from {actor} — dirty boxing, {target} taking damage.",
    "{actor} controls the clinch, landing short punches inside.",
    "{actor} musters {target} to the fence. Grinding work.",
    "{actor} locks up {target} and throws knees to the thigh.",
    "Against the fence — {actor} works the clinch, {target} trying to create space.",
  ],
  scramble_to_feet: [
    "{target} scrambles back to their feet. Good recovery.",
    "{target} works back up against the fence. Back to standing.",
    "Impressive scramble from {target} — back to their feet.",
    "{target} gets up off the canvas. The fight continues.",
    "{target} refuses to stay down — scrambles up and resets.",
    "Good bottom work from {target}. They're back on their feet.",
    "{target} bridges and rolls, gets back to a standing position.",
    "{target} fights back to their feet. {actor} has to reset.",
  ],
  ground_pound: [
    "Ground and pound from {actor}. {target} is covering up tight.",
    "{actor} in top position, landing heavy shots. {target} absorbing damage.",
    "{actor} postures up and rains down punches. {target} is in trouble.",
    "Heavy ground and pound from {actor}. {target} taking damage.",
    "{actor} works from top, landing elbows and punches. {target} defending.",
    "{actor} settles into top position and starts working. {target} can't get up.",
    "Dominant position for {actor} — pounding away at {target} from the top.",
  ],
  back_control: [
    "{actor} takes the back. Hooks in. {target} is in serious danger.",
    "{actor} gets behind {target}. Both hooks locked in — worst position in MMA.",
    "{target} gives up the back trying to stand. {actor} capitalises immediately.",
    "{actor} rolls to the back — hooks secured. Now hunting the finish.",
    "Back control for {actor}. {target} is defending the choke desperately.",
  ],
  camp_gnp_fired: [
    "{actor} postures up — the ground and pound camp work is paying off.",
    "Heavy shots from {actor} on the ground. Those G&P drills are showing.",
    "{actor} is devastating from top position. Exactly what the camp prepared for.",
  ],
  camp_cardio_fired: [
    "{actor} looks fresh despite the pace. The Cardio Push sessions show.",
    "Late in the round and {actor} still has gas. Camp conditioning paying dividends.",
    "{actor} keeps pushing the pace. The cardio work is real.",
  ],
  camp_striking_accuracy_fired: [
    "The striking accuracy work shows — {actor} is landing at a high rate.",
    "{actor}'s shots are finding the mark. Crisp, accurate striking.",
    "Precision from {actor} on the feet. Camp work translating well.",
  ],
  camp_clinch_fired: [
    "{actor} is controlling the clinch completely. Clinch Control sessions paying off.",
    "Inside work from {actor} — the clinch camp session is delivering.",
    "{actor} owns the clinch range. Exactly what was drilled in camp.",
  ],
  wildcard_fired: [
    "Something {target} didn't see on tape — {actor} springs a surprise.",
    "{actor} shows a side the scouting didn't cover. {target} has no answer.",
    "The wildcard comes out — {actor} pulls something unexpected.",
    "{target} had no answer for this. The wildcard makes itself known.",
    "{actor} does something {target} clearly didn't prepare for.",
  ],
};

export const RESULT = {
  win_submission: {
    standard: [
      "{playerName} locks in the {sub} and {opponentName} has no choice but to tap.",
      "The {sub} from {playerName} is immaculate. {opponentName} taps and it's over.",
      "{playerName} submits {opponentName} with the {sub}. Clean finish.",
      "{opponentName} had no answer for the {sub}. {playerName} gets the tap.",
      "Technical finish — {playerName} sinks the {sub} and {opponentName} goes out.",
    ],
    comeback: [
      "Comeback complete. {playerName} submits {opponentName} and the record is set straight.",
      "{playerName} came back from adversity and finished with the {sub}. Statement made.",
      "Down but not out. {playerName} finds the {sub} and ends it. Comeback complete.",
    ],
    nemesis: [
      "The nemesis falls. {playerName} submits {opponentName} — the grudge is settled.",
      "{playerName} taps out the nemesis. The rivalry ends here.",
      "{opponentName} is {playerName}'s nemesis no more. The {sub} closes the chapter.",
    ],
    title: [
      "New champion. {playerName} submits {opponentName} and takes the belt.",
      "{playerName} locks in the {sub} and becomes champion. Textbook finish.",
      "The {sub} ends the title fight. {playerName} is the new champion.",
    ],
    callout: [
      "{playerName} called it — and then backed it up. {opponentName} taps to the {sub}.",
      "The callout ends in a tap. {playerName} proved every point.",
      "{playerName} talked the talk and submitted {opponentName} to walk the walk.",
    ],
    giantKiller: [
      "{playerName} submits the bigger, higher-ranked {opponentName}. Giant killer finish.",
      "Nobody expected this. {playerName} taps out {opponentName} with the {sub}.",
      "David beats Goliath. {playerName} submits {opponentName} against all odds.",
    ],
  },
  win_ko: {
    standard: [
      "{playerName} puts {opponentName} away with the {strike}. Lights out.",
      "Clean KO finish. {playerName} lands the {strike} and {opponentName} is done.",
      "{playerName} times the {strike} perfectly. {opponentName} never saw it coming.",
      "One punch. {playerName} ends it with the {strike}. {opponentName} is out.",
      "Brutal finish — {playerName} drops {opponentName} with the {strike} and it's over.",
    ],
    comeback: [
      "Comeback delivered with a knockout. {playerName} drops {opponentName} and the story writes itself.",
      "{playerName} was counted out by everyone. The {strike} proves them all wrong.",
      "Redemption via knockout. {playerName} puts {opponentName} away cleanly.",
    ],
    nemesis: [
      "The nemesis is finished. {playerName} drops {opponentName} and the rivalry is over.",
      "Knockout revenge. {playerName} puts down the nemesis with the {strike}.",
      "{opponentName} beat {playerName} before. Not this time. KO — nemesis cleared.",
    ],
    title: [
      "{playerName} knocks out the champion. New title holder.",
      "Championship knockout. {playerName} lands the {strike} and takes the gold.",
      "The {strike} ends the title fight. {playerName} is champion.",
    ],
    callout: [
      "Called it. {playerName} backs up the callout with a knockout.",
      "{playerName} said they'd finish it — they did. {opponentName} goes down.",
      "The callout ends with the {strike}. {playerName} had the right.",
    ],
    giantKiller: [
      "{playerName} knocks out the {strike} and the giant falls.",
      "Nobody gave {playerName} a chance. The knockout says otherwise.",
      "Massive upset — {playerName} drops {opponentName} and takes the win.",
    ],
  },
  win_decision: {
    standard: [
      "{playerName} takes the decision. Judges had it comfortable.",
      "Decision win for {playerName}. Controlled from start to finish.",
      "Three rounds, one winner — {playerName} earns it on the cards.",
      "{playerName} outworks {opponentName} for the full duration. Decision.",
      "Unanimous decision — {playerName} dominated enough rounds to get the nod.",
      "The judges score it for {playerName}. Hard to argue.",
      "{playerName} did enough. Decision win and the record improves.",
    ],
    comeback: [
      "Comeback decision. {playerName} grinds it out and earns the win.",
      "Not the most exciting finish but {playerName} needed this one. Decision.",
      "{playerName} was down and came back. The decision confirms the turn.",
    ],
    nemesis: [
      "Decision over the nemesis. {playerName} wins the war of attrition.",
      "{playerName} beats {opponentName} on the cards. Nemesis status cleared.",
      "Three rounds and {playerName} comes out on top. The nemesis is handled.",
    ],
    title: [
      "{playerName} wins the championship on the cards. New title holder.",
      "Championship decision — {playerName} takes it across three judges.",
      "Unanimous decision and a new champion. {playerName} earns the gold.",
    ],
    callout: [
      "{playerName} called out {opponentName} and won the decision. Point proved.",
      "The callout works out. {playerName} takes the decision.",
      "Decision victory for {playerName}. The callout paid off.",
    ],
    giantKiller: [
      "{playerName} outpoints the bigger {opponentName}. Giant killer decision.",
      "Upset decision — {playerName} wins on the cards against all expectations.",
      "{playerName} fights smart and earns the decision win over {opponentName}.",
    ],
  },
  loss_submission: {
    standard: [
      "The {sub} goes the wrong way — {opponentName} gets the tap.",
      "{opponentName} locks in the {sub} and {playerName} has to give it up.",
      "{playerName} taps to the {sub}. {opponentName} was too slick on the ground.",
      "The {sub} from {opponentName} is tight. {playerName} taps.",
      "{opponentName} takes the back and secures the {sub}. {playerName} taps out.",
      "Loss by submission. {opponentName} sinks the {sub} — {playerName} goes out.",
    ],
    nemesis: [
      "{opponentName} submits {playerName}. The nemesis extends the rivalry.",
      "The nemesis claims another one. {opponentName} taps out {playerName}.",
      "{opponentName} is still the problem. Submission loss — nemesis active.",
    ],
    comeback: [
      "Comeback attempt falls short. {opponentName} submits {playerName}.",
      "{playerName} had the momentum — {opponentName} ends it with the {sub}.",
      "So close to the comeback. {opponentName} finds the {sub} and ends it.",
    ],
    title: [
      "The title shot comes up short. {opponentName} submits {playerName}.",
      "{opponentName} submits the challenger. The belt stays put.",
      "Title fight ends in submission. {playerName} comes up short.",
    ],
  },
  loss_ko: {
    standard: [
      "{opponentName} lands the {strike} and {playerName} goes down. Fight over.",
      "KO loss. {opponentName} times the {strike} and ends the night.",
      "{playerName} didn't see the {strike} coming. {opponentName} gets the KO.",
      "One punch ends it. {opponentName} drops {playerName} with the {strike}.",
      "The {strike} from {opponentName} puts {playerName} on the canvas. It's over.",
    ],
    nemesis: [
      "{opponentName} puts {playerName} down again. The nemesis is relentless.",
      "Another knockout for {opponentName} over {playerName}. Nemesis status confirmed.",
      "The nemesis delivers. {opponentName} drops {playerName} with the {strike}.",
    ],
    comeback: [
      "Comeback cut short. {opponentName} lands the {strike} and it's over.",
      "{playerName} was building momentum. One {strike} from {opponentName} ends it.",
      "So close. {opponentName} finds the {strike} and the comeback stalls.",
    ],
    title: [
      "The champion defends with a KO. {playerName}'s title shot ends on the canvas.",
      "{opponentName} retains the title via knockout. {playerName} falls short.",
      "KO — the title fight goes the wrong way for {playerName}.",
    ],
  },
  loss_decision: {
    standard: [
      "The judges go against {playerName}. {opponentName} takes the decision.",
      "Decision loss. {opponentName} did enough to earn the nod on all three cards.",
      "{opponentName} wins on the scorecards. {playerName} couldn't do enough.",
      "Competitive fight but {opponentName} edges it on the cards.",
      "Judges score it for {opponentName}. Tight fight but {playerName} falls short.",
      "The decision goes to {opponentName}. A night {playerName} will want back.",
      "Loss by decision. {playerName} needs to review the tape and come back stronger.",
    ],
    nemesis: [
      "{opponentName} takes the decision over {playerName}. Nemesis still active.",
      "Decision loss to the nemesis. {opponentName} wins the night.",
      "The nemesis takes the nod. {playerName} still chasing that win.",
    ],
    title: [
      "The champion survives. {playerName}'s title shot ends in a decision loss.",
      "Decision — {opponentName} keeps the belt. {playerName} came close.",
      "Title fight goes to the champion on the cards. {playerName} falls short.",
    ],
  },
  draw: {
    standard: [
      "The judges can't split it. Draw — {playerName} and {opponentName} share the spoils.",
      "All square after three rounds. The draw reflects a genuinely close fight.",
      "Neither fighter could put it away. Draw.",
      "Close fight, no clear winner. The cards reflect what everyone saw.",
      "The draw is the right call — nobody dominated.",
      "Tight throughout. Draw — {playerName} and {opponentName} fought to a standstill.",
    ],
  },
};

export const ROUND_WINNER = {
  player_dominant: [
    "{playerName} dominant",
    "{playerName} controls this round",
    "{playerName} takes it clearly",
  ],
  player_ahead: [
    "{playerName} slightly ahead",
    "{playerName} edges this one",
    "{playerName} takes this round",
  ],
  even: [
    "Even round",
    "Close round — hard to score",
    "Competitive round, no clear winner",
  ],
  opponent_ahead: [
    "{opponentName} slightly ahead",
    "{opponentName} edges this one",
    "{opponentName} takes this round",
  ],
  opponent_dominant: [
    "The round goes to {opponentName}",
    "{opponentName} dominates this round",
    "{opponentName} takes it clearly",
  ],
};
