import "./landing.css";
import { useState, useEffect } from "react";
import { api, authStorage } from "../../api";
import { AuthPage } from "../auth/AuthPage";
import { CookieConsent } from "../legal/CookieConsent";
import { LegalModals } from "../legal/LegalModals";
import { ReportBugModal } from "../shared/ReportBugModal";
import { DiscordIcon } from "../shared/DiscordIcon";
import { useSeasonBand } from "../../hooks/useSeasonBand";

// Open a legal modal from a footer link without navigating.
const openLegal = (e, eventName) => {
  e.preventDefault();
  window.dispatchEvent(new CustomEvent(eventName));
};

// Formats a Date/ISOstring as "Mon D, YYYY" e.g. "Jul 4, 2026"
function formatDate(isoStr) {
  const d = new Date(isoStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Formats a Date/ISOstring as "Mon D" e.g. "Jul 4"
function formatDateShort(isoStr) {
  const d = new Date(isoStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Showcase card fan — real in-game Special Move art + rarity colors
// (same palette as the in-game rarity chips).
/**
 * My Camp showcase — one painted card per coach discipline, same treatment as FAN_CARDS.
 * `rar`/`glow` reuse the fan card's CSS custom properties so both rows share one component
 * style; the colour here is the DISCIPLINE's, not a rarity.
 */
const COACH_CARDS = [
  { id: "coach-striking",     name: "Striking Coach", rar: "#C8102E", glow: "rgba(200,16,46,.34)" },
  { id: "coach-wrestling",    name: "Wrestling Coach", rar: "#3b82f6", glow: "rgba(59,130,246,.32)" },
  { id: "coach-bjj",          name: "BJJ Professor", rar: "#14B8A6", glow: "rgba(20,184,166,.32)" },
  { id: "coach-conditioning", name: "Conditioning Coach", rar: "#D4A820", glow: "rgba(212,168,32,.34)" },
];

const FAN_CARDS = [
  { id: "granite-jaw",     name: "Granite Jaw",     rarity: "Common",    rar: "#888888", glow: "rgba(136,136,136,.25)" },
  { id: "sprawl-instinct", name: "Sprawl Instinct", rarity: "Uncommon",  rar: "#22c55e", glow: "rgba(34,197,94,.3)" },
  { id: "the-finisher",    name: "The Finisher",    rarity: "Legendary", rar: "#D4A820", glow: "rgba(212,168,32,.45)" },
  { id: "heavy-hands",     name: "Heavy Hands",     rarity: "Rare",      rar: "#3b82f6", glow: "rgba(59,130,246,.32)" },
  { id: "killer-instinct", name: "Killer Instinct", rarity: "Rare",      rar: "#3b82f6", glow: "rgba(59,130,246,.32)" },
];

export function LandingPage({ onAuthenticated, initialResetToken }) {
  // Season band (data-driven PVP section)
  const { data: seasonData, loading: seasonLoading, countdown, timerColor, finalHour } = useSeasonBand();

  // Nav scroll darkening
  const [scrolled, setScrolled] = useState(false);

  // The game shell pins #root to height:100vh; overflow:hidden (inner panels
  // scroll). The landing is a tall marketing page that needs normal document
  // scroll, so relax #root while it's mounted and restore on unmount.
  useEffect(() => {
    document.body.classList.add("landing-active");
    return () => document.body.classList.remove("landing-active");
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Lightbox
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const [lightboxAlt, setLightboxAlt] = useState("");

  useEffect(() => {
    if (!lightboxSrc) return;
    document.body.style.overflow = "hidden";
    const onKey = (e) => { if (e.key === "Escape") closeLightbox(); };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [lightboxSrc]);

  function openLightbox(src, alt) {
    setLightboxSrc(src);
    setLightboxAlt(alt || "");
  }

  function closeLightbox() {
    setLightboxSrc(null);
    setLightboxAlt("");
    document.body.style.overflow = "";
  }

  // Auth — full AuthPage overlay
  const [showAuth, setShowAuth] = useState(false);
  const [authTab, setAuthTab] = useState("register"); // "register" | "login" | "guest" | "resume"

  // Inline login form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { token, fighterId } = await api.login({ email, password });
      authStorage.save(token, fighterId);
      onAuthenticated(fighterId);
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  function openRegister() {
    setAuthTab("register");
    setShowAuth(true);
  }

  function openForgot() {
    setAuthTab("forgot");
    setShowAuth(true);
  }

  function openGuest() {
    setAuthTab("guest");
    setShowAuth(true);
  }

  function openResume() {
    setAuthTab("resume");
    setShowAuth(true);
  }

  // If a password-reset link is active, show AuthPage immediately
  if (initialResetToken) {
    return <AuthPage onAuthenticated={onAuthenticated} initialResetToken={initialResetToken} />;
  }

  // Full AuthPage overlay (register / forgot flows)
  if (showAuth) {
    return (
      <AuthPage
        onAuthenticated={onAuthenticated}
        initialTab={authTab}
        onBack={() => setShowAuth(false)}
      />
    );
  }

  return (
    <div className="landing-page">
      {/* NAV */}
      <nav className={scrolled ? "scrolled" : ""}>
        <div className="nav-logo">Ground <span>&amp;</span> Pound</div>
        <div className="nav-links">
          <a className="nav-link" href="#features">Features</a>
          <a className="nav-link" href="#how">How It Works</a>
          <a className="nav-link" href="#screenshots">Showcase</a>
          <a className="nav-link" href="#pvp">{seasonData ? `Season ${seasonData.seasonNumber}` : "Season 1"}</a>
          <a
            className="nav-link nav-link--icon"
            href="https://discord.gg/jDmh4wuBMb"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Join our Discord"
            title="Discord"
          >
            <DiscordIcon size={17} />
          </a>
          <a className="nav-cta" href="#play">Play Free</a>
        </div>
      </nav>

      {/* HERO */}
      <div className="hero">
        <img
          className="hero-bg"
          src="/assets/landing/arena.jpg"
          alt="MMA Arena"
          loading="eager"
          // lowercase, NOT `fetchPriority` — React only learned the camelCase spelling in 19,
          // and on 18 it fails the prop through to the DOM with a warning instead of setting
          // the attribute. Lowercase is passed through verbatim, which is what browsers read.
          fetchpriority="high"
        />
        <div className="hero-overlay"></div>
        <div className="hero-body">
          <div className="hero-eye">Step into the cage</div>
          <h1 className="hero-title">Ground<br /><span>&amp;</span> Pound</h1>
          <p className="hero-sub">Build your MMA career from zero. Train across six disciplines, climb ranked seasons, fight real players, and take the championship belt.</p>
          <div className="hero-actions">
            <a className="btn-primary" href="#play">Start Your Career</a>
            <a className="btn-secondary" href="#features">See How It Works</a>
          </div>
        </div>
        <div className="hero-scroll">Scroll</div>
      </div>

      {/* STATS BAR */}
      <div className="stats-bar">
        <div className="stat-item"><div className="stat-val">100<span>%</span></div><div className="stat-lbl">Free to Play</div></div>
        <div className="stat-item"><div className="stat-val"><span>0</span></div><div className="stat-lbl">Downloads Required</div></div>
        <div className="stat-item"><div className="stat-val">5</div><div className="stat-lbl">Division Tiers</div></div>
        <div className="stat-item"><div className="stat-val">8</div><div className="stat-lbl">Combat Stats</div></div>
        <div className="stat-item">
          <div className="stat-val"><span>{seasonData ? `S${seasonData.seasonNumber}` : "S1"}</span></div>
          <div className="stat-lbl">
            {(!seasonData || seasonLoading)
              ? "Season Live Now"
              : seasonData.status === "upcoming"
                ? "Season Opening Soon"
                : "Season Live Now"}
          </div>
        </div>
      </div>

      {/* FEATURES */}
      <section id="features">
        <div className="sec-eye">What you get</div>
        <h2 className="sec-title">Everything a real<br />manager needs</h2>
        <p className="sec-sub">Eight stats to build. Your own camp to run. Real opponents to study. Every fight earned, never handed to you.</p>
        <div className="features-grid">
          <div className="feat">
            <div className="feat-icon-text">STR</div>
            <div className="feat-name">Train &amp; Develop</div>
            <div className="feat-desc">Build your fighter across Striking, Speed, Kicks, Wrestling, Ground Game, Submissions, Chin and Fight IQ. Every session costs energy — spend it wisely.</div>
            <div className="feat-tag">8 Stats</div>
          </div>
          <div className="feat">
            <div className="feat-icon-text">FGT</div>
            <div className="feat-name">Fight &amp; Compete</div>
            <div className="feat-desc">Take fights from your contract offers. Choose opponents, set your gameplan, and watch the simulation unfold with full round-by-round detail.</div>
            <div className="feat-tag">Real PvP Seasons</div>
          </div>
          <div className="feat">
            <div className="feat-icon-text">RNK</div>
            <div className="feat-name">Climb the Ladder</div>
            <div className="feat-desc">Rise from Prospect through Contender, Challenger, Elite to Champion. Earn Division Points, defend your rank, and chase the belt.</div>
            <div className="feat-tag">5 Division Tiers</div>
          </div>
          <div className="feat">
            <div className="feat-icon-text">INJ</div>
            <div className="feat-name">Manage Injuries</div>
            <div className="feat-desc">Concussions block fighting. Rib strains kill your stamina. Twisted knees cost you drilling time. Real injury mechanics with real consequences.</div>
            <div className="feat-tag">Hospital &amp; Recovery</div>
          </div>
          <div className="feat">
            <div className="feat-icon-text">CNT</div>
            <div className="feat-name">Sign Contracts</div>
            <div className="feat-desc">Promoters send offers with different terms, opponents, and payouts. Rivalries develop. Title shots get earned, not handed out.</div>
            <div className="feat-tag">Dynamic Contracts</div>
          </div>
          <div className="feat">
            <div className="feat-icon-text">LEG</div>
            <div className="feat-name">Build Your Legacy</div>
            <div className="feat-desc">Earn Fame, unlock badges, grow your ranking. Every fight adds to a permanent career record that other players can see and study.</div>
            <div className="feat-tag">43 Badges</div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <div className="how-wrap" id="how">
        <div className="how-inner">
          <div className="sec-eye">Getting started</div>
          <h2 className="sec-title">Four steps to your first fight</h2>
          <div className="steps">
            <div className="step">
              <div className="step-num">1</div>
              <div className="step-title">Create Your Fighter</div>
              <div className="step-desc">Pick your weight class, fighting style, and name. No pay wall to start.</div>
            </div>
            <div className="step">
              <div className="step-num">2</div>
              <div className="step-title">Train Your Stats</div>
              <div className="step-desc">Spend energy on drills, sparring, and conditioning. Watch your OVR climb.</div>
            </div>
            <div className="step">
              <div className="step-num">3</div>
              <div className="step-title">Accept a Fight</div>
              <div className="step-desc">Review the offer, study your opponent's intel, set your gameplan.</div>
            </div>
            <div className="step">
              <div className="step-num">4</div>
              <div className="step-title">Climb the Rankings</div>
              <div className="step-desc">Win, earn DP, defend your rank, and chase the championship belt.</div>
            </div>
          </div>
        </div>
      </div>

      {/* SHOWCASE — Special Moves card fan + Persona (game art, not screenshots) */}
      <div className="ss-section" id="screenshots">
        <div className="ss-head ss-head--center">
          <div className="sec-eye">Special Moves</div>
          <h2 className="sec-title">Build your arsenal</h2>
          <p className="sec-sub">Thirteen collectible signature techniques, painted like trading cards. Pull them from sparring, upgrade them by rarity, equip up to three.</p>
        </div>

        <div className="fan-row">
          {FAN_CARDS.map((c, i) => (
            <div
              key={c.id}
              className={`fan-card fan-c${i + 1}`}
              style={{ "--rar": c.rar, "--rar-glow": c.glow }}
              onClick={() => openLightbox(`/assets/moves/${c.id}.webp`, c.name)}
            >
              <img src={`/assets/moves/${c.id}.webp`} alt={c.name} loading="lazy" />
              <div className="fan-plate">
                <div className="fan-name">{c.name}</div>
                <div className="fan-rar">{c.rarity}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="fan-note">Common · Uncommon · Rare · <b>Legendary</b> — your coaches teach them, hard sessions drop them.</div>

        {/* MY CAMP — the ownership loop. Same card treatment as the moves fan. */}
        <div className="camp-band">
          <div className="ss-head ss-head--center">
            <div className="sec-eye">My Camp</div>
            <h2 className="sec-title">Your name<br />on the door</h2>
            <p className="sec-sub">
              You don&apos;t rent a gym — you run a camp. Hire coaches with names, rarities and
              personalities, pay them every week, and rank them up. Each one teaches Special Moves
              you can read on his card <i>before</i> you sign him.
            </p>
          </div>

          <div className="camp-row">
            {COACH_CARDS.map((c) => (
              <div
                key={c.id}
                className="camp-card"
                style={{ "--rar": c.rar, "--rar-glow": c.glow }}
                onClick={() => openLightbox(`/assets/camp/${c.id}.webp`, c.name)}
              >
                <img src={`/assets/camp/${c.id}.webp`} alt={c.name} loading="lazy" />
                <div className="fan-plate camp-plate">
                  <div className="fan-name">{c.name}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="camp-points">
            <div className="camp-point">
              <div className="camp-point-k">Weekly wages</div>
              <div className="camp-point-v">Coaches are staff, not furniture. Miss payroll or bench a coach and morale slides — let it hit zero and he walks out, taking his rank with him.</div>
            </div>
            <div className="camp-point">
              <div className="camp-point-k">Rank them up</div>
              <div className="camp-point-v">Sessions, style wins and cash. Rank 3 is a permanent XP bonus; Rank 4 hands over his discipline&apos;s perk for good.</div>
            </div>
            <div className="camp-point">
              <div className="camp-point-k">A room that decays</div>
              <div className="camp-point-v">Facility Condition slides when you don&apos;t show up, and a run-down camp trains you slower. Skip a week and you feel it.</div>
            </div>
          </div>

          <div className="fan-note">One Monday market · no rerolls · <b>a Common coach knows one move, a Legendary knows them all</b></div>
        </div>

        {/* PERSONA */}
        <div className="persona-band">
          <div className="persona-band-art">
            <img src="/assets/persona/octagon-map.webp" alt="Persona map" loading="lazy" />
            <span className="persona-band-dot" />
          </div>
          <div className="persona-band-copy">
            <div className="sec-eye">Persona</div>
            <h2 className="sec-title">Who will they<br />call you?</h2>
            <p className="sec-sub">Every mic you touch shapes your public character. Commit to a corner and the press crowns you — with real rewards, and real costs.</p>
            <div className="persona-band-archs">
              <span className="arch-chip arch-v">The Villain</span>
              <span className="arch-chip arch-c">People's Champ</span>
              <span className="arch-chip arch-b">Boogeyman</span>
              <span className="arch-chip arch-r">Role Model</span>
            </div>
            <p className="persona-band-line">Villains get paid but lose sponsors. Champs get the crowd. Boogeymen get feared. Role Models get taken care of. <b>Nothing is ever locked</b> — heel turns are one hot mic away.</p>
          </div>
        </div>

        {/* FACE-OFF — static poster of the in-game tale-of-the-tape */}
        <div className="fo-band">
          <div className="ss-head--center fo-head">
            <div className="sec-eye">The Face-Off</div>
            <h2 className="sec-title">Square up before<br />you step in</h2>
            <p className="sec-sub">Take a fight and the tape drops: you in the blue corner, them in the red. Public numbers only — the rest you scout in camp.</p>
          </div>

          <div className="fo-poster">
            <div className="fo-side fo-side--you">
              <div className="fo-port">DV</div>
              <div className="fo-corner">◆ Blue Corner · You</div>
              <div className="fo-name">Demo Villain</div>
              <div className="fo-nick">&ldquo;The Unwritten&rdquo;</div>
              <div className="fo-rec">7–2–0</div>
            </div>

            <div className="fo-center">
              <div className="fo-vs"><span>V</span>S</div>
              <div className="fo-tape">
                <div className="fo-trow">
                  <span className="fo-tval l win">71</span>
                  <span className="fo-tlbl">Overall</span>
                  <span className="fo-tval r">68</span>
                </div>
                <div className="fo-trow">
                  <span className="fo-tval l">7–2–0</span>
                  <span className="fo-tlbl">Record</span>
                  <span className="fo-tval r">11–4–0</span>
                </div>
                <div className="fo-trow">
                  <span className="fo-tval l">Boxer</span>
                  <span className="fo-tlbl">Style</span>
                  <span className="fo-tval r">Wrestler</span>
                </div>
                <div className="fo-trow">
                  <span className="fo-tval l">MW</span>
                  <span className="fo-tlbl">Class</span>
                  <span className="fo-tval r">MW</span>
                </div>
              </div>
              <div className="fo-scout">Detailed stats stay hidden — scout them in camp.</div>
            </div>

            <div className="fo-side fo-side--opp">
              <div className="fo-port">★</div>
              <div className="fo-corner">Champion · Red Corner ◆</div>
              <div className="fo-name">Marcus Kane</div>
              <div className="fo-nick">&ldquo;The Warden&rdquo;</div>
              <div className="fo-rec">11–4–0</div>
            </div>
          </div>
        </div>
      </div>

      {/* PVP CALLOUT */}
      <div className="pvp-band" id="pvp">
        <div className="pvp-inner">
          {/* fallback: data===null, error, OR still loading — renders the hardcoded copy */}
          {(!seasonData || seasonLoading) && (
            <>
              <div className="pvp-season">Season 1 — Iron Circuit — Live Now</div>
              <h2 className="pvp-title">The Proving<br />Ground</h2>
              <p className="pvp-sub">Compete in ranked PvP seasons. Earn Division Points, defend your spot on the ladder, and fight your way to the top before the season ends.</p>
              <div className="pvp-pills">
                <span className="pill hot">Open Now</span>
                <span className="pill">10 Weeks Remaining</span>
                <span className="pill">All Weight Classes</span>
                <span className="pill">Real Players Only</span>
              </div>
            </>
          )}

          {/* upcoming */}
          {seasonData && !seasonLoading && seasonData.status === "upcoming" && (() => {
            const wcPill = seasonData.crossWeightClass ? "Open · All Weight Classes" : seasonData.weightClass;
            return (
              <>
                <div className="pvp-season">Season {seasonData.seasonNumber} — {seasonData.name} — Opening Soon</div>
                <h2 className="pvp-title">The Proving<br />Ground</h2>
                <p className="pvp-sub">Compete in ranked PvP seasons. Earn Division Points, defend your spot on the ladder, and fight your way to the top before the season ends.</p>
                <div className="pvp-countdown-wrap">
                  <div className="pvp-countdown-label">Opens in</div>
                  <div
                    className={`pvp-countdown-timer${finalHour ? " pvp-countdown-timer--final" : ""}`}
                    style={{ color: timerColor }}
                  >{countdown}</div>
                  <div className="pvp-countdown-start">Starts {formatDate(seasonData.startDate)}</div>
                </div>
                <div className="pvp-pills">
                  <span className="pill">Opens {formatDateShort(seasonData.startDate)}</span>
                  <span className="pill">{wcPill}</span>
                  <span className="pill">Real Players Only</span>
                </div>
              </>
            );
          })()}

          {/* active */}
          {seasonData && !seasonLoading && seasonData.status === "active" && (() => {
            const wcPill = seasonData.crossWeightClass ? "Open · All Weight Classes" : seasonData.weightClass;
            const weeksLeft = Math.floor((new Date(seasonData.endDate) - Date.now()) / (7 * 86400000));
            const weeksPill = weeksLeft >= 2
              ? `${weeksLeft} Weeks Remaining`
              : weeksLeft === 1
                ? "1 Week Remaining"
                : "Final Week";
            return (
              <>
                <div className="pvp-season">Season {seasonData.seasonNumber} — {seasonData.name} — Live Now</div>
                <h2 className="pvp-title">The Proving<br />Ground</h2>
                <p className="pvp-sub">Compete in ranked PvP seasons. Earn Division Points, defend your spot on the ladder, and fight your way to the top before the season ends.</p>
                <div className="pvp-pills">
                  <span className="pill hot">Open Now</span>
                  <span className="pill">{weeksPill}</span>
                  <span className="pill">{wcPill}</span>
                  <span className="pill">Real Players Only</span>
                </div>
              </>
            );
          })()}
        </div>
      </div>

      {/* LOGIN / REGISTER */}
      <div className="login-section" id="play">
        <div className="sec-eye" style={{ textAlign: "center" }}>Free to play · No download</div>
        <h2 className="sec-title" style={{ textAlign: "center", fontSize: "40px" }}>Enter the Cage</h2>
        <div className="login-box">
          <div className="login-tabs">
            <div className="ltab on">Login</div>
            <div className="ltab" onClick={openRegister} style={{ cursor: "pointer" }}>Create Account</div>
          </div>
          <form onSubmit={handleLogin}>
            <div className="field-lbl">Email</div>
            <input
              className="field-input"
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
            <div className="field-lbl">Password</div>
            <input
              className="field-input"
              type="password"
              placeholder="&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
            {error && <div className="login-error">{error}</div>}
            <button className="login-btn" type="submit" disabled={loading}>
              {loading ? "Signing in..." : "Enter the Cage"}
            </button>
          </form>
          <div className="login-help">
            <a
              href="#"
              onClick={(e) => { e.preventDefault(); openForgot(); }}
            >
              Forgot password?
            </a>
            <a
              href="#"
              onClick={(e) => { e.preventDefault(); openRegister(); }}
            >
              No account? Create one
            </a>
          </div>
          <div className="login-guest-divider"><span>or</span></div>
          <button type="button" className="btn-secondary login-guest-btn" onClick={openGuest}>
            Play as guest — no email needed
          </button>
          <div className="login-help login-help-resume">
            <a
              href="#"
              onClick={(e) => { e.preventDefault(); openResume(); }}
            >
              Resume with a recovery code
            </a>
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <div style={{ borderTop: "1px solid #181818", marginTop: "40px" }}>
        <footer>
          <div className="foot-logo">Ground <span>&amp;</span> Pound</div>
          <div className="foot-links">
            <a className="foot-link" href="https://discord.gg/jDmh4wuBMb" target="_blank" rel="noopener noreferrer">Discord</a>
            <a className="foot-link" href="#" onClick={(e) => openLegal(e, "open-cookie-policy")}>Cookie Policy</a>
            <a className="foot-link" href="#" onClick={(e) => openLegal(e, "open-privacy-policy")}>Privacy</a>
            <a className="foot-link" href="#" onClick={(e) => openLegal(e, "open-terms")}>Terms</a>
            <a className="foot-link" href="#" onClick={(e) => { e.preventDefault(); window.dispatchEvent(new CustomEvent("open-bug-report")); }}>Report a Bug</a>
          </div>
          <div className="foot-copy">&copy; 2026 Digital Olive. All rights reserved.</div>
        </footer>
      </div>

      {/* Cookie consent banner + legal modals for logged-out visitors */}
      <CookieConsent />
      <LegalModals />
      <ReportBugModal />

      {/* LIGHTBOX */}
      <div
        id="lightbox"
        className={lightboxSrc ? "open" : ""}
        onClick={(e) => {
          if (e.target === e.currentTarget) closeLightbox();
        }}
      >
        <button id="lightbox-close" onClick={closeLightbox}>
          Close &times;
        </button>
        <img id="lightbox-img" src={lightboxSrc || ""} alt={lightboxAlt} />
      </div>
    </div>
  );
}
