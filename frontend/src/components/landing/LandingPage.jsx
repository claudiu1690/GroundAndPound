import "./landing.css";
import { useState, useEffect } from "react";
import { api, authStorage } from "../../api";
import { AuthPage } from "../auth/AuthPage";
import { CookieConsent } from "../legal/CookieConsent";
import { LegalModals } from "../legal/LegalModals";

// Open a legal modal from a footer link without navigating.
const openLegal = (e, eventName) => {
  e.preventDefault();
  window.dispatchEvent(new CustomEvent(eventName));
};

export function LandingPage({ onAuthenticated, initialResetToken }) {
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
  const [authTab, setAuthTab] = useState("register");

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
          <a className="nav-link" href="#screenshots">Screenshots</a>
          <a className="nav-link" href="#pvp">Season 1</a>
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
          fetchPriority="high"
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
        <div className="stat-item"><div className="stat-val">6</div><div className="stat-lbl">Fight Disciplines</div></div>
        <div className="stat-item"><div className="stat-val"><span>S1</span></div><div className="stat-lbl">Season Live Now</div></div>
      </div>

      {/* FEATURES */}
      <section id="features">
        <div className="sec-eye">What you get</div>
        <h2 className="sec-title">Everything a real<br />manager needs</h2>
        <p className="sec-sub">Six stats to build. Nine gyms to train at. Real opponents to study. Every fight earned, never handed to you.</p>
        <div className="features-grid">
          <div className="feat">
            <div className="feat-icon-text">STR</div>
            <div className="feat-name">Train &amp; Develop</div>
            <div className="feat-desc">Build your fighter across Striking, Boxing, Wrestling, Grappling, Strength and Conditioning. Every session costs energy — spend it wisely.</div>
            <div className="feat-tag">6 Disciplines</div>
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

      {/* SCREENSHOTS */}
      <div className="ss-section" id="screenshots">
        <div className="ss-head">
          <div className="sec-eye">Inside the game</div>
          <h2 className="sec-title">Deep enough to keep<br />you thinking</h2>
          <p className="sec-sub">Every screen has a decision. Every decision has a consequence.</p>
        </div>

        {/* 1: Fight Summary */}
        <div className="ss-pair">
          <div className="ss-img-wrap">
            <img
              src="/assets/landing/ss_fight.webp"
              alt="Fight Summary"
              loading="lazy"
              onClick={() => openLightbox("/assets/landing/ss_fight.webp", "Fight Summary")}
            />
          </div>
          <div className="ss-copy">
            <div className="ss-copy-num">01</div>
            <div className="ss-copy-eye">After the bell</div>
            <h3 className="ss-copy-title">Every fight tells a complete story</h3>
            <p className="ss-copy-desc">Round-by-round breakdown, XP gains, cash earned, nemesis settled. Then the mic goes live — Humble, Confident, or Trash Talk. Your call. Your consequences.</p>
            <div className="ss-copy-pills">
              <span className="ss-pill">Round stats</span>
              <span className="ss-pill">XP breakdown</span>
              <span className="ss-pill">Post-fight interview</span>
              <span className="ss-pill">Rivalry system</span>
            </div>
          </div>
        </div>

        {/* 2: Hospital (flipped) */}
        <div className="ss-pair flip">
          <div className="ss-img-wrap">
            <img
              src="/assets/landing/ss_hospital.webp"
              alt="Hospital"
              loading="lazy"
              onClick={() => openLightbox("/assets/landing/ss_hospital.webp", "Hospital")}
            />
          </div>
          <div className="ss-copy">
            <div className="ss-copy-num">02</div>
            <div className="ss-copy-eye">Medical Centre</div>
            <h3 className="ss-copy-title">Injuries have real consequences</h3>
            <p className="ss-copy-desc">A concussion blocks fighting. A torn rib kills your stamina. A busted hand ends sparring. The diagnostic scanner maps every injury on your fighter's body — ignore them at your peril.</p>
            <div className="ss-copy-pills">
              <span className="ss-pill">Body map</span>
              <span className="ss-pill">Auto-heal timers</span>
              <span className="ss-pill">Doctor visits</span>
              <span className="ss-pill">Blocks training</span>
            </div>
          </div>
        </div>

        {/* 3: Gyms */}
        <div className="ss-pair">
          <div className="ss-img-wrap">
            <img
              src="/assets/landing/ss_gyms.webp"
              alt="Choose Your Gym"
              loading="lazy"
              onClick={() => openLightbox("/assets/landing/ss_gyms.webp", "Choose Your Gym")}
            />
          </div>
          <div className="ss-copy">
            <div className="ss-copy-num">03</div>
            <div className="ss-copy-eye">Training</div>
            <h3 className="ss-copy-title">Your gym defines your path</h3>
            <p className="ss-copy-desc">From the free Community MMA Center to the $10,000/week Elite Fight Academy. Each gym unlocks different drills, builds different strengths, and requires a different rank to access.</p>
            <div className="ss-copy-pills">
              <span className="ss-pill">9 gyms</span>
              <span className="ss-pill">Rank gated</span>
              <span className="ss-pill">XP multipliers</span>
              <span className="ss-pill">Specialty drills</span>
            </div>
          </div>
        </div>

        {/* 4: Fight Camp (flipped) */}
        <div className="ss-pair flip">
          <div className="ss-img-wrap">
            <img
              src="/assets/landing/ss_camp.webp"
              alt="Fight Camp"
              loading="lazy"
              onClick={() => openLightbox("/assets/landing/ss_camp.webp", "Fight Camp")}
            />
          </div>
          <div className="ss-copy">
            <div className="ss-copy-num">04</div>
            <div className="ss-copy-eye">Pre-fight</div>
            <h3 className="ss-copy-title">Win the fight before it starts</h3>
            <p className="ss-copy-desc">Pick your camp sessions based on the opponent's style. Takedown defence against wrestlers. Submission escapes against BJJ specialists. Add a supplement. Set your weight cut. Then step in.</p>
            <div className="ss-copy-pills">
              <span className="ss-pill">9 camp drills</span>
              <span className="ss-pill">Opponent matching</span>
              <span className="ss-pill">Supplements</span>
              <span className="ss-pill">Weight cut risk</span>
            </div>
          </div>
        </div>

        {/* 5: Dashboard */}
        <div className="ss-pair">
          <div className="ss-img-wrap">
            <img
              src="/assets/landing/ss_dashboard.webp"
              alt="Dashboard"
              loading="lazy"
              onClick={() => openLightbox("/assets/landing/ss_dashboard.webp", "Dashboard")}
            />
          </div>
          <div className="ss-copy">
            <div className="ss-copy-num">05</div>
            <div className="ss-copy-eye">Home</div>
            <h3 className="ss-copy-title">Everything at a glance, nothing wasted</h3>
            <p className="ss-copy-desc">The Octagon Gazette breaks the latest news. Your rank, injuries, energy, cash, recent career, active sponsorships — all in one place. You always know exactly where you stand.</p>
            <div className="ss-copy-pills">
              <span className="ss-pill">Live newspaper</span>
              <span className="ss-pill">Injury alerts</span>
              <span className="ss-pill">Career timeline</span>
              <span className="ss-pill">Sponsorships</span>
            </div>
          </div>
        </div>
      </div>

      {/* PVP CALLOUT */}
      <div className="pvp-band" id="pvp">
        <div className="pvp-inner">
          <div className="pvp-season">Season 1 — Iron Circuit — Live Now</div>
          <h2 className="pvp-title">The Proving<br />Ground</h2>
          <p className="pvp-sub">Compete in ranked PvP seasons. Earn Division Points, defend your spot on the ladder, and fight your way to the top before the season ends.</p>
          <div className="pvp-pills">
            <span className="pill hot">Open Now</span>
            <span className="pill">10 Weeks Remaining</span>
            <span className="pill">All Weight Classes</span>
            <span className="pill">Real Players Only</span>
          </div>
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
        </div>
      </div>

      {/* FOOTER */}
      <div style={{ borderTop: "1px solid #181818", marginTop: "40px" }}>
        <footer>
          <div className="foot-logo">Ground <span>&amp;</span> Pound</div>
          <div className="foot-links">
            <a className="foot-link" href="#" onClick={(e) => openLegal(e, "open-cookie-policy")}>Cookie Policy</a>
            <a className="foot-link" href="#" onClick={(e) => openLegal(e, "open-privacy-policy")}>Privacy</a>
            <a className="foot-link" href="#" onClick={(e) => openLegal(e, "open-terms")}>Terms</a>
          </div>
          <div className="foot-copy">&copy; 2026 Digital Olive. All rights reserved.</div>
        </footer>
      </div>

      {/* Cookie consent banner + legal modals for logged-out visitors */}
      <CookieConsent />
      <LegalModals />

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
