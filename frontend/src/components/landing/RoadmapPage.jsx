import "./landing.css";
import "./roadmap.css";
import { formatDateShort, weeksLeftLabel } from "../../lib/countdown";
import { PIECES_BY_ID } from "../banner/bannerCatalog";
import {
  ROADMAP_LATER,
  formatMilestoneDate,
  seasonEras,
  seasonNodes,
  shippedMilestones,
} from "./roadmapModel";

const ERAS = seasonEras();
const RELEASE_COUNT = shippedMilestones().length;
const FIRST_RELEASE = shippedMilestones().at(-1);

/**
 * Small art for one roadmap point. `img` is existing game art; `css` names a
 * composition in landing.css drawn over (or instead of) it. Decorative only:
 * the point's title carries the meaning.
 */
function RoadmapArt({ art }) {
  const cls = `rm-art${art.css ? ` rm-art--${art.css}` : ""}`;
  return (
    <div className={cls} aria-hidden="true">
      {art.img && (
        <img src={art.img} alt="" loading="lazy" style={art.pos ? { objectPosition: art.pos } : undefined} />
      )}
      {art.cards && (
        <div className="rm-fan">
          {art.cards.map((src) => <img key={src} src={src} alt="" loading="lazy" />)}
        </div>
      )}
      {art.cans > 0 && (
        <div className="rm-cans">
          {Array.from({ length: art.cans }, (_, i) => (
            <span key={i} className="rm-can">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M13 2 4 14h7l-1 8 9-12h-7z" /></svg>
            </span>
          ))}
        </div>
      )}
      {art.banners && (
        <div className="rm-pile">
          {art.banners.map((b) => (
            <span key={b.id} className="rm-mini-banner" style={{ background: PIECES_BY_ID[b.id]?.css }}>
              <small>{b.first}</small>
              <b>{b.last}</b>
            </span>
          ))}
        </div>
      )}
      {art.css === "silhouette" && <span className="rm-art-q">?</span>}
      {art.css === "wip" && <span className="rm-art-stamp">Today</span>}
      {art.css === "holiday-card" && (
        <span className="rm-art-card"><b>Holiday Card</b><i>Main Event</i></span>
      )}
      {art.css === "brand" && <span className="rm-art-mark">G<i>&amp;</i>P</span>}
    </div>
  );
}

/**
 * One release as a loose row: small art on the left, no box.
 */
function RoadmapRow({ item, kicker }) {
  return (
    <article className="rm-row">
      <RoadmapArt art={item.art} />
      <div className="rm-row-body">
        {kicker && <div className="rm-kicker">{kicker}</div>}
        <h3 className="rm-title">{item.title}</h3>
        <ul className="rm-points">
          {item.points.map((p) => <li key={p}>{p}</li>)}
        </ul>
      </div>
    </article>
  );
}

/**
 * A season: the landmark of the page. Full width, big type, its own art and
 * colour, so a season can never be mistaken for a release.
 */
function SeasonBanner({ number, name, art, kicker, pill, points, tone }) {
  return (
    <header className={`rm-season rm-season--${tone}`}>
      <RoadmapArt art={art} />
      <div className="rm-season-body">
        <div className="rm-season-kicker">{kicker}</div>
        <h2 className="rm-season-title">
          <span className="rm-season-num">Season {number}</span>
          {name && <span className="rm-season-name">{name}</span>}
        </h2>
        {points?.length > 0 && (
          <ul className="rm-season-points">
            {points.map((p) => <li key={p}>{p}</li>)}
          </ul>
        )}
        {pill && <span className="rm-season-pill">{pill}</span>}
      </div>
    </header>
  );
}

/**
 * The roadmap as its own page. It reads upward from the bottom like a
 * timeline: Season 1 at the foot of the page, then the next season's banner,
 * with undated Later work above it at the very top. Each season's banner sits
 * under its releases. Opened from the hero's Roadmap button
 * (`/?page=roadmap`); `onHome` returns to the landing page, optionally to an
 * anchor on it. With `player` (signed in, shown over the game by
 * RoadmapOverlay) the nav and the closing button lead back to the game instead.
 */
export function RoadmapPage({ seasonData, seasonLoading, onHome, player = false }) {
  const { now, next } = seasonNodes(seasonLoading ? null : seasonData);
  const nextIsLive = now?.seasonNumber === next.seasonNumber;

  const go = (hash) => (e) => {
    e.preventDefault();
    onHome(hash);
  };

  // The live season's banner carries what the ladder says right now.
  const livePill = (number) =>
    now?.seasonNumber === number ? `Live now${now.endDate ? ` · ${weeksLeftLabel(now.endDate)}` : ""}` : null;

  return (
    <div className="landing-page rm-page">
      <nav className="scrolled">
        <a className="nav-logo" href="/" onClick={go("")}>Ground <span>&amp;</span> Pound</a>
        <div className="nav-links">
          {player ? (
            <a className="nav-cta" href="/" onClick={go("")}>&larr; Back to the game</a>
          ) : (
            <>
              <a className="nav-link rm-nav-back" href="/" onClick={go("")}>&larr; Home</a>
              <a className="nav-cta" href="/#play" onClick={go("#play")}>Play Free</a>
            </>
          )}
        </div>
      </nav>

      <header className="rm-hero">
        <div className="sec-eye">Roadmap</div>
        <h1 className="sec-title rm-h1">Built round<br />by round</h1>
        <p className="sec-sub">
          What is planned and the next season at the top, and every season and release since the doors opened below it, newest first.
        </p>
        <div className="pvp-pills rm-hero-pills">
          <span className="pill">{RELEASE_COUNT} releases</span>
          {FIRST_RELEASE && <span className="pill">Since {formatMilestoneDate(FIRST_RELEASE.date)}</span>}
          {now && <span className="pill hot">Season {now.seasonNumber} live</span>}
        </div>
      </header>

      {/* LATER (very top): undated work not tied to a season, on a dashed rail. */}
      <section className="rm-block">
        <div className="rm-col-head">Later <i>No dates yet</i></div>
        <div className="rm-later">
          {ROADMAP_LATER.map((item) => <RoadmapRow key={item.title} item={item} />)}
        </div>
      </section>

      {/* COMING NEXT: just the next season's banner, no feature list. */}
      <section className="rm-block rm-block--next">

        <SeasonBanner
          number={next.seasonNumber}
          name={next.theme}
          tone="next"
          art={{ css: "season-next", img: "/assets/landing/arena.jpg" }}
          kicker={nextIsLive ? "Live now" : "Coming next"}
          pill={nextIsLive ? livePill(next.seasonNumber) : next.startDate ? `Opens ${formatDateShort(next.startDate)}` : "Date to come"}
        />
      </section>

      {/* THE ROAD SO FAR: reads upward. Newest season first, its releases newest at the top, its banner underneath. */}
      {ERAS.map((era) => (
        <section className="rm-block" key={era.number}>

          <div className="rm-releases">
            {era.releases.map((m) => (
              <RoadmapRow
                key={m.version}
                item={m}
                kicker={<><b>v{m.version}</b> · {formatMilestoneDate(m.date)}</>}
              />
            ))}
          </div>
          <SeasonBanner
            number={era.number}
            name={era.name}
            tone={`s${era.number}`}
            art={era.art}
            points={era.points}
            kicker={
              era.endDate
                ? `${era.startDate ? `${formatMilestoneDate(era.startDate)} to ` : "Ended "}${formatMilestoneDate(era.endDate)}`
                : era.startDate ? `Opened ${formatMilestoneDate(era.startDate)}` : ""
            }
            pill={livePill(era.number)}
          />
        </section>
      ))}

      <div className="rm-end">
        <p className="rm-note">What comes next is the plan, not a promise. Dates go up when they are locked.</p>
        {player
          ? <a className="btn-primary" href="/" onClick={go("")}>Back to the game</a>
          : <a className="btn-primary" href="/#play" onClick={go("#play")}>Start Your Career</a>}
      </div>
    </div>
  );
}
