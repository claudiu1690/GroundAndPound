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

  if (!res.ok) throw new Error(data.message || res.statusText || "Request failed");
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
  addCampAction: (fighterId) =>
    request(`/fights/camp/${fighterId}`, { method: "POST" }),
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

  // ── Training / Recovery ─────────────────────────────────
  train: (fighterId, gymId, sessionType) =>
    request(`/fighters/${fighterId}/train`, {
      method: "POST",
      body: JSON.stringify({ gymId, sessionType }),
    }),
  rest: (fighterId) =>
    request(`/fighters/${fighterId}/rest`, { method: "POST" }),
  doctorVisit: (fighterId, injuryType) =>
    request(`/fighters/${fighterId}/doctor-visit`, {
      method: "POST",
      body: JSON.stringify({ injuryType }),
    }),
  mentalReset: (fighterId) =>
    request(`/fighters/${fighterId}/mental-reset`, { method: "POST" }),

  // ── Quests / Membership ──────────────────────────────────
  getGymQuests: (fighterId, gymId) =>
    request(`/quests/${fighterId}/${gymId}`),
  payGymMembership: (fighterId, gymId) =>
    request(`/fighters/${fighterId}/pay-membership`, {
      method: "POST",
      body: JSON.stringify({ gymId }),
    }),
};
