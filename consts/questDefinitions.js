/**
 * GDD 7.4 — Gym Side Quests.
 * Each quest has conditions (cumulative counters or snapshot checks) and a reward.
 * Rewards are applied once when ALL conditions are met.
 */

const QUEST_DEFINITIONS = {
    coaches_test: {
        id: "coaches_test",
        title: "The Coach's Test",
        description: "Complete 10 training sessions and earn 2 wins while enrolled here.",
        gymTierRequired: "T1",   // available at T1+ gyms
        requiresSpecialtyGym: false,
        conditions: [
            { key: "gymTrainingSessions", target: 10, label: "Training sessions at gym" },
            { key: "winsWhileEnrolled",   target: 2,  label: "Wins while enrolled" }
        ],
        reward: {
            type: "stat_cap_bonus",
            value: 3,
            description: "+3 to primary style stat cap at this gym"
        }
    },

    iron_will: {
        id: "iron_will",
        title: "Iron Will",
        description: "Spar 5 times and complete 1 fight (win or loss) while enrolled here.",
        gymTierRequired: "T2",
        requiresSpecialtyGym: false,
        requiresQuest: "coaches_test",   // must complete Coach's Test first
        conditions: [
            { key: "sparringSessions",  target: 5, label: "Sparring sessions" },
            { key: "fightsCompleted",   target: 1, label: "Fights completed" }
        ],
        reward: {
            type: "perk",
            perkId: "ironWill",
            description: "Toughness: −5% KO/TKO probability permanently"
        }
    },

    the_specialist: {
        id: "the_specialist",
        title: "The Specialist",
        description: "Train your gym's specialty stat 20 times and reach the gym's stat soft cap.",
        gymTierRequired: null,   // any tier, but gym must have specialty stats
        requiresSpecialtyGym: true,
        conditions: [
            { key: "specialtyStatSessions", target: 20, label: "Specialty stat sessions" },
            { key: "specialtyStatAtCap",    target: 1,  label: "Specialty stat at soft cap" }
        ],
        reward: {
            type: "perk",
            perkId: "specialistStat",
            description: "Specialty stat trains 10% faster permanently"
        }
    },

    science_of_fighting: {
        id: "science_of_fighting",
        title: "Science of Fighting",
        description: "Complete 5 film study sessions and win a fight by decision.",
        gymTierRequired: "T3",
        requiresSpecialtyGym: false,
        requiresQuest: "iron_will",    // must complete Iron Will first
        conditions: [
            { key: "filmStudySessions", target: 5, label: "Film study sessions" },
            { key: "decisionWins",      target: 1, label: "Decision wins" }
        ],
        reward: {
            type: "stat_bonus",
            stat: "fiq",
            value: 5,
            description: "Immediate +5 FIQ"
        }
    },

    the_grind: {
        id: "the_grind",
        title: "The Grind",
        description: "Complete 100 total training sessions at this gym.",
        gymTierRequired: "T3",
        requiresSpecialtyGym: false,
        requiresQuest: "science_of_fighting",  // must complete Science of Fighting first
        conditions: [
            { key: "gymTotalSessions", target: 100, label: "Total sessions at this gym" }
        ],
        reward: {
            type: "perk",
            perkId: "theGrind",
            description: "+500 Iron bonus per fight while enrolled here"
        }
    },

    champion_mentality: {
        id: "champion_mentality",
        title: "Champion Mentality",
        description: "Complete 10 fights at National tier or higher.",
        gymTierRequired: "T4",
        requiresSpecialtyGym: false,
        requiresQuest: "the_grind",  // must complete The Grind first
        conditions: [
            { key: "nationalPlusFights", target: 10, label: "National+ tier fights" }
        ],
        reward: {
            type: "stat_bonus",
            stat: "maxStamina",
            value: 10,
            description: "Permanent +10 Max Stamina"
        }
    },

    apex_regimen: {
        id: "apex_regimen",
        title: "The Apex Regimen",
        description: "Raise all stats to 60+ and complete 5 GCS-tier fights.",
        gymTierRequired: "T5",
        requiresSpecialtyGym: false,
        requiresQuest: "champion_mentality",  // must complete Champion Mentality first
        conditions: [
            { key: "allStats60Plus", target: 1, label: "All stats at 60+" },
            { key: "gcsFights",      target: 5, label: "GCS-tier fights" }
        ],
        reward: {
            type: "perk",
            perkId: "apexRegimen",
            description: "Legend training mode: +20% XP on all training sessions permanently"
        }
    }
};

const TIER_ORDER = ["T1", "T2", "T3", "T4", "T5"];

/**
 * Return the list of quest IDs applicable to a given gym (tier + specialty).
 */
function getQuestsForGym(gymTier, gymSpecialtyStats) {
    const hasSpecialty = Array.isArray(gymSpecialtyStats) && gymSpecialtyStats.length > 0;
    const gymTierIndex = TIER_ORDER.indexOf(gymTier);
    return Object.values(QUEST_DEFINITIONS).filter((q) => {
        if (q.requiresSpecialtyGym && !hasSpecialty) return false;
        if (!q.gymTierRequired) return hasSpecialty; // specialty quests: only at gyms with specialty
        const reqIndex = TIER_ORDER.indexOf(q.gymTierRequired);
        return gymTierIndex >= reqIndex;
    });
}

module.exports = { QUEST_DEFINITIONS, TIER_ORDER, getQuestsForGym };
