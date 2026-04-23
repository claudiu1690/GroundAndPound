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

  if (res.status === 401) {
    // Token expired or invalid — force logout
    authStorage.clear();
    window.location.reload();
  }

  if (!res.ok) {
    const err = new Error(data.message || res.statusText || "Request failed");
    err.code = data.code || null;
    err.status = res.status;
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

  // ── Fighter ─────────────────────────────────────────────
  getFighter: (id) => request(`/fighters/${id}`),
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

  // ── Career Feed ─────────────────────────────────────────
  getActivity: (fighterId) =>
    request(`/fighters/${fighterId}/activity`),
  getChampions: (fighterId) =>
    request(`/fighters/${fighterId}/champions`),

  // ── Training / Recovery ─────────────────────────────────
  train: (fighterId, gymId, sessionType) =>
    request(`/fighters/${fighterId}/train`, {
      method: "POST",
      body: JSON.stringify({ gymId, sessionType }),
    }),
  doctorVisit: (fighterId, injuryType) =>
    request(`/fighters/${fighterId}/doctor-visit`, {
      method: "POST",
      body: JSON.stringify({ injuryType }),
    }),
  mentalReset: (fighterId) =>
    request(`/fighters/${fighterId}/mental-reset`, { method: "POST" }),

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

  // ── Main Event / predictions (Phase 5) ──────────────────
  getMainEvent: (fighterId) =>
    request(`/events/current?fighterId=${encodeURIComponent(fighterId || "")}`),
  submitPrediction: (eventId, body) =>
    request(`/events/${eventId}/predict`, { method: "POST", body: JSON.stringify(body) }),
  getPredictionHistory: (fighterId, limit = 10) =>
    request(`/events/history?fighterId=${encodeURIComponent(fighterId)}&limit=${limit}`),

  // ── Media Hub (Phase 6) ─────────────────────────────────
  getMediaState: (fighterId) => request(`/media/${fighterId}`),
  getDivisionRoster: (fighterId) => request(`/media/${fighterId}/division-roster`),
  getInterviewArchive: (fighterId, limit = 20) =>
    request(`/media/${fighterId}/archive?limit=${limit}`),
  doPodcast: (fighterId, body) =>
    request(`/media/${fighterId}/podcast`, { method: "POST", body: JSON.stringify(body) }),
  doDocumentary: (fighterId) =>
    request(`/media/${fighterId}/documentary`, { method: "POST" }),
};
