const API = import.meta.env.VITE_API_URL || "http://localhost:4001";

const TOKEN_KEY = "gnp_token";
const FIGHTER_KEY = "gnp_fighter_id";

export const authStorage = {
  getToken: () => localStorage.getItem(TOKEN_KEY),
  getFighterId: () => localStorage.getItem(FIGHTER_KEY),
  save: (token, fighterId) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(FIGHTER_KEY, fighterId);
  },
  clear: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(FIGHTER_KEY);
  },
  isLoggedIn: () => !!localStorage.getItem(TOKEN_KEY),
};

async function request(path, options = {}) {
  const token = authStorage.getToken();
  const headers = { "Content-Type": "application/json", ...options.headers };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const url = `${API}${path}`;
  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  // Force-logout on 401 only when we actually had a token — otherwise this is
  // just bad credentials on /auth/login or /auth/recover, and reloading would
  // clobber the form state and the error message.
  if (res.status === 401 && token) {
    authStorage.clear();
    window.location.reload();
  }

  if (!res.ok) {
    const err = new Error(data.message || res.statusText || "Request failed");
    err.code = data.code || null;
    err.status = res.status;
    // Stash the full body so flow-specific fields (e.g. daysLeft on the
    // account_deleted response) are available to callers without a second hop.
    err.body = data;
    if (data.daysLeft != null) err.daysLeft = data.daysLeft;
    if (data.retryAfter != null) err.retryAfter = data.retryAfter;
    throw err;
  }
  return data;
}

export const api = {
  // ── Auth ────────────────────────────────────────────────
  register: (body) =>
    request("/auth/register", { method: "POST", body: JSON.stringify(body) }),
  login: (body) =>
    request("/auth/login", { method: "POST", body: JSON.stringify(body) }),

  // ── Guest accounts ───────────────────────────────────────
  // Success 201: { token, fighterId, accountId, recoveryCode } — recoveryCode
  // is shown only here and at regenerateRecoveryCode, never again.
  createGuest: (fighter) =>
    request("/auth/guest", { method: "POST", body: JSON.stringify({ fighter }) }),
  // Success 200: { token, fighterId, accountId }
  resumeGuest: (recoveryCode) =>
    request("/auth/guest/resume", { method: "POST", body: JSON.stringify({ recoveryCode }) }),
  // Success 200: { success, token, email, emailConfirmed } — fresh token, bumps sessionEpoch.
  claimAccount: (accountId, email, password) =>
    request(`/account/${accountId}/claim`, { method: "POST", body: JSON.stringify({ email, password }) }),
  // Success 200: { recoveryCode } — one-time reveal, invalidates the previous code.
  regenerateRecoveryCode: (accountId) =>
    request(`/account/${accountId}/recovery-code`, { method: "POST" }),

  // ── Fighter ─────────────────────────────────────────────
  getFighter: (id) => request(`/fighters/${id}`),
  getDashboard: (id) => request(`/fighters/${id}/dashboard`),
  updateFighter: (id, body) =>
    request(`/fighters/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deductEnergy: (id, amount = 1) =>
    request(`/fighters/${id}/energy`, {
      method: "PATCH",
      body: JSON.stringify({ amount }),
    }),

  // ── Gym ─────────────────────────────────────────────────
  listGyms: (tier) => request(tier ? `/gyms?tier=${tier}` : "/gyms"),
  getGym: (id) => request(`/gyms/${id}`),

  // ── Fights ──────────────────────────────────────────────
  getOffers: (fighterId) => request(`/fights/offers/${fighterId}`),
  createOffer: (fighterId, body) =>
    request(`/fights/offers/${fighterId}`, { method: "POST", body: JSON.stringify(body) }),
  acceptOffer: (fighterId, fightId) =>
    request(`/fights/accept/${fighterId}/${fightId}`, { method: "POST" }),
  setStrategy: (fighterId, fightId, strategy) =>
    request("/fights/strategy", {
      method: "PUT",
      body: JSON.stringify({ fighterId, fightId, strategy }),
    }),
  resolveFight: (fighterId) =>
    request(`/fights/resolve/${fighterId}`, { method: "POST" }),
  setWeightCut: (fighterId, fightId, weightCut) =>
    request("/fights/weight-cut", {
      method: "PUT",
      body: JSON.stringify({ fighterId, fightId, weightCut }),
    }),

  // ── Fight Camp v1.1 ─────────────────────────────────────
  getCampReport: (fightId) =>
    request(`/fights/camp/${fightId}/report`),
  getCampState: (fightId, fighterId) =>
    request(`/fights/camp/${fightId}?fighterId=${fighterId}`),
  addCampSession: (fightId, fighterId, sessionType) =>
    request(`/fights/camp/${fightId}/session`, {
      method: "POST",
      body: JSON.stringify({ fighterId, sessionType }),
    }),
  removeCampSession: (fightId, fighterId, slotIndex) =>
    request(`/fights/camp/${fightId}/remove-session`, {
      method: "POST",
      body: JSON.stringify({ fighterId, slotIndex }),
    }),
  resolveCampInjury: (fightId, fighterId, choice) =>
    request(`/fights/camp/${fightId}/injury-choice`, {
      method: "POST",
      body: JSON.stringify({ fighterId, choice }),
    }),
  finaliseCamp: (fightId, fighterId, skip = false) =>
    request(`/fights/camp/${fightId}/finalise`, {
      method: "POST",
      body: JSON.stringify({ fighterId, skip }),
    }),

  // ── Shop / Inventory / Supplements ──────────────────────
  getShopCatalog: (id) => request(`/fighters/${id}/shop/catalog`),
  buyItem: (id, itemId, quantity = 1) =>
    request(`/fighters/${id}/shop/buy`, {
      method: "POST",
      body: JSON.stringify({ itemId, quantity }),
    }),
  buyPremium: (id, bundleId) =>
    request(`/fighters/${id}/shop/buy-premium`, {
      method: "POST",
      body: JSON.stringify({ bundleId }),
    }),
  useEnergyItem: (id, itemId) =>
    request(`/fighters/${id}/inventory/use-energy`, {
      method: "POST",
      body: JSON.stringify({ itemId }),
    }),
  selectCampBuff: (fightId, fighterId, buffId) =>
    request(`/fights/camp/${fightId}/buff`, {
      method: "PUT",
      body: JSON.stringify({ fighterId, buffId }),
    }),

  // ── Career Feed ─────────────────────────────────────────
  getActivity: (fighterId) =>
    request(`/fighters/${fighterId}/activity`),
  getChampions: (fighterId) =>
    request(`/fighters/${fighterId}/champions`),

  // ── Career Profile ──────────────────────────────────────
  getCareerProfile: (id) => request(`/fighters/${id}/profile`),
  setPinnedBadges: (id, pinnedBadges) =>
    request(`/fighters/${id}/pinned-badges`, {
      method: "PUT",
      body: JSON.stringify({ pinnedBadges }),
    }),
  markBadgesSeen: (id) => request(`/fighters/${id}/badges/seen`, { method: "POST" }),

  // ── Training / Recovery ─────────────────────────────────
  train: (fighterId, gymId, sessionType, quantity = 1) =>
    request(`/fighters/${fighterId}/train`, {
      method: "POST",
      body: JSON.stringify({ gymId, sessionType, quantity }),
    }),
  doctorVisit: (fighterId, injuryType) =>
    request(`/fighters/${fighterId}/doctor-visit`, {
      method: "POST",
      body: JSON.stringify({ injuryType }),
    }),
  hospitalSkipRecovery: (fighterId, injuryType) =>
    request(`/fighters/${fighterId}/hospital/skip-recovery`, {
      method: "POST",
      body: JSON.stringify({ injuryType }),
    }),
  hospitalFullRecovery: (fighterId) =>
    request(`/fighters/${fighterId}/hospital/full-recovery`, { method: "POST" }),
  hospitalRestoreHealth: (fighterId, packageKey) =>
    request(`/fighters/${fighterId}/hospital/restore-health`, {
      method: "POST",
      body: JSON.stringify({ package: packageKey }),
    }),
  hospitalQuote: (fighterId) =>
    request(`/fighters/${fighterId}/hospital/quote`),

  // ── Ranking System v1.0 ─────────────────────────────────
  getRankings: (tier, weightClass, fighterId) => {
    const params = new URLSearchParams({ weightClass });
    if (fighterId) params.set("fighterId", fighterId);
    return request(`/rankings/${encodeURIComponent(tier)}?${params}`);
  },
  getFighterRank: (fighterId) =>
    request(`/fighters/${fighterId}/rank`),

  // ── Octagon Gazette ─────────────────────────────────────
  mentalReset: (fighterId) =>
    request(`/fighters/${fighterId}/mental-reset`, { method: "POST" }),

  // ── Onboarding Tutorial ─────────────────────────────────
  getTutorial: (fighterId) =>
    request(`/tutorial/${fighterId}`),
  advanceTutorial: (fighterId, step) =>
    request(`/tutorial/${fighterId}/advance`, {
      method: "POST",
      body: JSON.stringify({ step }),
    }),
  completeTutorial: (fighterId) =>
    request(`/tutorial/${fighterId}/complete`, { method: "POST" }),

  // ── Gyms ────────────────────────────────────────────────
  listGymsForFighter: (fighterId) =>
    request(`/gyms/for-fighter/${fighterId}`),
  switchGym: (fighterId, gymId) =>
    request(`/fighters/${fighterId}/switch-gym`, {
      method: "POST",
      body: JSON.stringify({ gymId }),
    }),
  rankUpGym: (fighterId, gymId) =>
    request(`/fighters/${fighterId}/rank-up-gym`, {
      method: "POST",
      body: JSON.stringify({ gymId }),
    }),

  /** Top fighters by fame score (backend route name unchanged) */
  fameLeaderboard: () => request("/fighters/leaderboard/notoriety"),

  /** Recent fame events for a fighter — feeds the Fame drawer */
  getFameEvents: (fighterId, limit = 10) =>
    request(`/fighters/${fighterId}/fame-events?limit=${limit}`),

  // ── Post-fight interview (Phase 1) ──────────────────────
  getCalloutCandidates: (fighterId, excludeOpponentId) => {
    const qs = new URLSearchParams({ fighterId });
    if (excludeOpponentId) qs.set("excludeOpponentId", excludeOpponentId);
    return request(`/fights/interview/candidates?${qs.toString()}`);
  },
  postInterview: (fightId, body) =>
    request(`/fights/${fightId}/interview`, { method: "POST", body: JSON.stringify(body) }),

  // ── Banner customizer (Phase 2) ─────────────────────────
  getBannerCatalog: (fighterId) =>
    request(`/fighters/${fighterId}/banner/catalog`),
  saveBanner: (fighterId, banner) =>
    request(`/fighters/${fighterId}/banner`, {
      method: "PUT",
      body: JSON.stringify(banner),
    }),

  // ── Sponsorships (Phase 3) ──────────────────────────────
  getSponsorships: (fighterId) => request(`/sponsorships/${fighterId}`),
  acceptSponsor: (fighterId, sponsorId) =>
    request(`/sponsorships/${fighterId}/accept`, {
      method: "POST",
      body: JSON.stringify({ sponsorId }),
    }),
  dropSponsor: (fighterId, sponsorshipId) =>
    request(`/sponsorships/${fighterId}/drop/${sponsorshipId}`, {
      method: "POST",
    }),

  // ── Callouts (Phase 4) ──────────────────────────────────
  getCalloutRoster: (fighterId) =>
    request(`/fighters/${fighterId}/callouts/roster`),
  createCallout: (fighterId, opponentId) =>
    request(`/fighters/${fighterId}/callouts`, {
      method: "POST",
      body: JSON.stringify({ opponentId }),
    }),
  cancelCallout: (fighterId) =>
    request(`/fighters/${fighterId}/callouts`, { method: "DELETE" }),

  // ── Fight Card / predictions (Phase 5) ──────────────────
  getFightCard: (fighterId) =>
    request(`/events/current?fighterId=${encodeURIComponent(fighterId || "")}`),
  submitCardPrediction: (cardId, body) =>
    request(`/events/${cardId}/predict`, { method: "POST", body: JSON.stringify(body) }),
  getPredictionHistory: (fighterId, limit = 20) =>
    request(`/events/history?fighterId=${encodeURIComponent(fighterId)}&limit=${limit}`),

  // ── Media Hub ───────────────────────────────────────────
  getMediaState: (fighterId) => request(`/media/${fighterId}`),
  getMediaTargets: (fighterId) => request(`/media/${fighterId}/targets`),
  recordPodcast: (fighterId, body) =>
    request(`/media/${fighterId}/podcast`, { method: "POST", body: JSON.stringify(body) }),
  recordDocumentary: (fighterId, body) =>
    request(`/media/${fighterId}/documentary`, { method: "POST", body: JSON.stringify(body) }),
  getAppearances: (fighterId) => request(`/media/${fighterId}/appearances`),
  takeAppearance: (fighterId, instanceId, body) =>
    request(`/media/${fighterId}/appearances/${instanceId}`, { method: "POST", body: JSON.stringify(body || {}) }),
  getRivalry: (fighterId) => request(`/media/${fighterId}/rivalry`),
  getArchive: (fighterId, filter = "all", page = 1) =>
    request(`/media/${fighterId}/archive?filter=${encodeURIComponent(filter)}&page=${page}`),

  // ── Account settings ────────────────────────────────────
  getAccountProfile: (accountId) =>
    request(`/account/${accountId}`),
  changeNickname: (accountId, nickname) =>
    request(`/account/${accountId}/nickname`, { method: "PATCH", body: JSON.stringify({ nickname }) }),
  setEmailNotifications: (accountId, emailEnabled) =>
    request(`/account/${accountId}/notifications`, { method: "PATCH", body: JSON.stringify({ email_enabled: emailEnabled }) }),
  requestEmailChange: (accountId, newEmail) =>
    request(`/account/${accountId}/email/request`, { method: "POST", body: JSON.stringify({ new_email: newEmail }) }),
  resendEmailChange: (accountId) =>
    request(`/account/${accountId}/email/resend`, { method: "POST" }),
  cancelEmailChange: (accountId) =>
    request(`/account/${accountId}/email/pending`, { method: "DELETE" }),
  resendVerifyEmail: (accountId) =>
    request(`/account/${accountId}/email/verify-resend`, { method: "POST" }),
  changePassword: (accountId, currentPassword, newPassword) =>
    request(`/account/${accountId}/password`, {
      method: "POST",
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    }),
  deleteAccount: (accountId, fighterName) =>
    request(`/account/${accountId}`, {
      method: "DELETE",
      body: JSON.stringify({ fighter_name: fighterName }),
    }),

  // ── Forgot password / reset (unauthenticated) ───────────
  forgotPassword: (email) =>
    request("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) }),
  checkResetToken: (token) =>
    request(`/auth/reset-password?token=${encodeURIComponent(token)}`),
  resetPassword: (token, newPassword) =>
    request("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, new_password: newPassword }),
    }),
  logout: () =>
    request("/auth/logout", { method: "POST" }),

  // Restore a soft-deleted account within the 30-day grace window. Same
  // response shape as login on success (token + fighterId).
  recoverAccount: (email, password) =>
    request("/auth/recover", { method: "POST", body: JSON.stringify({ email, password }) }),

  // ── Fight Breakdown ──────────────────────────────────────
  getFightBreakdown: (fightId) => request(`/fights/${fightId}/breakdown`),
  pvpFightBreakdown: (fightId) => request(`/pvp/fights/by-id/${fightId}/breakdown`),

  // ── PVP / The Proving Ground ─────────────────────────────
  pvpLadder: ({ seasonId, division, weightClass, page = 1, limit = 20 }) => {
    const p = new URLSearchParams({ seasonId, page: String(page), limit: String(limit) });
    if (division) p.set("division", division);
    if (weightClass && weightClass !== "All") p.set("weightClass", weightClass);
    return request(`/pvp/ladder?${p}`);
  },
  pvpLadderPosition: (seasonId) => request(`/pvp/ladder/position?seasonId=${seasonId}`),
  pvpChallengeEligibility: (playerId) => request(`/pvp/challenge-eligibility/${playerId}`),
  pvpRecord: (playerId) =>
    request(`/pvp/record/${playerId}`),
  pvpOpponents: () =>
    request(`/pvp/opponents`),
  pvpFight: (body) =>
    request(`/pvp/fight`, { method: "POST", body: JSON.stringify(body) }),
  pvpFights: (seasonId, page = 1, limit = 25) =>
    request(`/pvp/fights/${seasonId}?page=${page}&limit=${limit}`),
  pvpDefenseResults: (ack = true) =>
    request(`/pvp/defense-results?ack=${ack ? "true" : "false"}`),
  pvpSetDefenseGameplan: (gameplan) =>
    request(`/pvp/defense-gameplan`, { method: "POST", body: JSON.stringify({ gameplan }) }),
  pvpHof: (wc) =>
    request(wc ? `/pvp/hof?weightClass=${wc}` : `/pvp/hof`),
  pvpCurrentSeason: (wc) =>
    request(`/pvp/season/current/${wc}`),
  pvpAcknowledgeSeason: (seasonId) =>
    request(`/pvp/acknowledge-season`, { method: "POST", body: JSON.stringify({ seasonId }) }),

  /**
   * Public (unauth) season status for the landing band. Returns the DTO or null.
   * DTO: { status:"upcoming"|"active", seasonNumber, name, startDate, endDate, crossWeightClass, weightClass }
   */
  pvpPublicSeason: () => request("/pvp/season/public"),

  // ── Bug Reports ─────────────────────────────────────────
  // Works logged-in and logged-out — request() attaches the JWT automatically
  // when one is present, so the server can resolve identity server-side.
  reportBug: (body) =>
    request("/bug-reports", { method: "POST", body: JSON.stringify(body) }),
};
