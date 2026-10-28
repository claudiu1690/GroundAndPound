/**
 * Instagram, Facebook and TikTok marks, drawn as simple glyphs (lucide-react
 * dropped brand icons). Same contract as DiscordIcon: inherit color via
 * `currentColor`, decorative only, the link carries the accessible name.
 */
function Glyph({ size, className, children, filled = true }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={filled ? undefined : 2}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function InstagramIcon({ size = 16, className }) {
  return (
    <Glyph size={size} className={className} filled={false}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.4" cy="6.6" r="1.1" fill="currentColor" stroke="none" />
    </Glyph>
  );
}

export function FacebookIcon({ size = 16, className }) {
  return (
    <Glyph size={size} className={className}>
      <path d="M13.6 22v-8.2h2.8l.4-3.3h-3.2V8.4c0-.9.3-1.6 1.6-1.6h1.7V3.9c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3v2.4H7.4v3.3h2.8V22h3.4z" />
    </Glyph>
  );
}

export function TikTokIcon({ size = 16, className }) {
  return (
    <Glyph size={size} className={className}>
      <path d="M16.6 5.8A4.3 4.3 0 0 1 15.5 3h-3.1v12.4a2.6 2.6 0 1 1-2.6-2.6c.3 0 .5 0 .8.1V9.7a5.8 5.8 0 1 0 4.9 5.7V9.1a7.3 7.3 0 0 0 4.3 1.4V7.4a4.3 4.3 0 0 1-3.2-1.6z" />
    </Glyph>
  );
}
