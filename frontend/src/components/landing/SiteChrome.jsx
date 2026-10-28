import { SOCIAL_LINKS } from "./socialLinks";

// Open a legal modal or the bug report without navigating (LegalModals and
// ReportBugModal listen for these events).
const fire = (eventName) => (e) => {
  e.preventDefault();
  window.dispatchEvent(new CustomEvent(eventName));
};

/** The social icons shown in the logged-out nav (landing and roadmap pages). */
export function NavSocialIcons() {
  return SOCIAL_LINKS.map(({ key, label, aria, href, Icon }) => (
    <a
      key={key}
      className={`nav-link nav-link--icon nav-link--${key}`}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={aria}
      title={label}
    >
      <Icon size={17} />
    </a>
  ));
}

/**
 * The site footer: social links, then (with `legal`) cookie, privacy, terms and
 * bug-report links. Signed-in players see the roadmap over the game, whose bottom
 * bar already has the legal links, so it renders without them there.
 */
export function SiteFooter({ legal = true }) {
  return (
    <footer>
      <div className="foot-logo">Ground <span>&amp;</span> Pound</div>
      <div className="foot-links">
        {SOCIAL_LINKS.map(({ key, label, href }) => (
          <a key={key} className="foot-link" href={href} target="_blank" rel="noopener noreferrer">{label}</a>
        ))}
        {legal && (
          <>
            <a className="foot-link" href="#" onClick={fire("open-cookie-policy")}>Cookie Policy</a>
            <a className="foot-link" href="#" onClick={fire("open-privacy-policy")}>Privacy</a>
            <a className="foot-link" href="#" onClick={fire("open-terms")}>Terms</a>
            <a className="foot-link" href="#" onClick={fire("open-bug-report")}>Report a Bug</a>
          </>
        )}
      </div>
      <div className="foot-copy">&copy; 2026 Digital Olive SRL. All rights reserved.</div>
      <div className="foot-copy">CUI 50872480 · Trade Register J29/1032/2024 · support@groundandpound.net</div>
    </footer>
  );
}
