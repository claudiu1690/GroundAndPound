/**
 * Preview XP for training session cards. Must stay aligned with
 * `services/trainingService.js` doTraining() (base × tier × backstory/apex × specialty/specialist, split across stats).
 *
 * Tier multipliers and backstory keys mirror `consts/gameConstants.js` — update both if those change.
 */
const GYM_XP_MULTIPLIER_BY_TIER = {
  T1: 1.0,
  T2: 1.15,
  T3: 1.3,
  T4: 1.5,
  T5: 1.75,
};

/** Same as BACKSTORIES.*.trainingXpMod in gameConstants */
const BACKSTORY_TRAINING_XP_MOD = {
  "Late Bloomer": 0.25,
};

/**
 * @param {{ xpBase: number, stats: string[] }} meta Session descriptor (e.g. SESSION_META entry)
 * @param {{ tier: string, specialtyStats?: string[] } | null | undefined} gym
 * @param {{ backstory?: string, activePerks?: { apexRegimen?: boolean, specialistStat?: string } } | null | undefined} fighter
 * @returns {string | null} e.g. "~18 XP" or "~9 XP / stat" — null if session grants no stat XP
 */
export function formatSessionXpHint(meta, gym, fighter) {
  if (!meta?.stats?.length || meta.xpBase <= 0) return null;

  const tierMult = GYM_XP_MULTIPLIER_BY_TIER[gym?.tier] ?? 1;
  const backMod =
    fighter?.backstory && BACKSTORY_TRAINING_XP_MOD[fighter.backstory]
      ? BACKSTORY_TRAINING_XP_MOD[fighter.backstory]
      : 0;
  const apexMod = fighter?.activePerks?.apexRegimen ? 0.2 : 0;
  const totalXpMod = 1 + backMod + apexMod;
  const baseXp = meta.xpBase * tierMult * totalXpMod;

  const specialtyStats = gym?.specialtyStats;
  const hasSpecialtyGym = Array.isArray(specialtyStats) && specialtyStats.length > 0;
  const specialtySessionBonus = hasSpecialtyGym ? 0.25 : 0;
  const specialistStat = fighter?.activePerks?.specialistStat;

  const perStatRounded = meta.stats.map((stat) => {
    const isSpecialtyStat = hasSpecialtyGym && specialtyStats.includes(stat);
    const specialistBonus = specialistStat === stat ? 0.1 : 0;
    const mult = 1 + (isSpecialtyStat ? specialtySessionBonus : 0) + specialistBonus;
    const raw = (baseXp * mult) / meta.stats.length;
    return Math.round(raw);
  });

  const min = Math.min(...perStatRounded);
  const max = Math.max(...perStatRounded);

  if (meta.stats.length === 1) {
    return `~${min} XP`;
  }
  if (min === max) {
    return `~${min} XP / stat`;
  }
  return `~${min}–${max} XP / stat`;
}
