import { memo } from "react";

/**
 * Inline SVG octagon arena background — no image file needed.
 * Renders a perspective-view MMA cage with spotlights, crowd, and grain texture.
 */
export const OctagonBackground = memo(function OctagonBackground() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 600 520"
      preserveAspectRatio="xMidYMid slice"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }}
      aria-hidden="true"
    >
      <defs>
        {/* Arena ambient gradient */}
        <radialGradient id="arena-bg" cx="50%" cy="38%" r="70%">
          <stop offset="0%"   stopColor="#1a2440" stopOpacity="1" />
          <stop offset="55%"  stopColor="#0d0e18" stopOpacity="1" />
          <stop offset="100%" stopColor="#050509" stopOpacity="1" />
        </radialGradient>

        {/* Main spotlight cone */}
        <radialGradient id="spot-center" cx="50%" cy="0%" r="80%" gradientUnits="userSpaceOnUse"
          x1="300" y1="0" x2="300" y2="340">
          <stop offset="0%"   stopColor="#4a6fa5" stopOpacity="0.35" />
          <stop offset="60%"  stopColor="#1a2440" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0" />
        </radialGradient>

        {/* Floor octagon gradient */}
        <radialGradient id="floor-grad" cx="50%" cy="50%" r="60%">
          <stop offset="0%"   stopColor="#1e2d4a" stopOpacity="1" />
          <stop offset="100%" stopColor="#0c0d16" stopOpacity="1" />
        </radialGradient>

        {/* Noise / grain filter */}
        <filter id="grain" x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="linearRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.72" numOctaves="4" seed="2" stitchTiles="stitch" result="noise" />
          <feColorMatrix type="saturate" values="0" in="noise" result="greyNoise" />
          <feBlend in="SourceGraphic" in2="greyNoise" mode="overlay" result="blended" />
          <feComposite in="blended" in2="SourceGraphic" operator="in" />
        </filter>

        {/* Spotlight glow filter */}
        <filter id="glow">
          <feGaussianBlur stdDeviation="8" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>

        {/* Red line glow */}
        <filter id="red-glow">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>

        {/* Crowd blur */}
        <filter id="crowd-blur">
          <feGaussianBlur stdDeviation="3" />
        </filter>

        <clipPath id="arena-clip">
          <rect width="600" height="520" />
        </clipPath>
      </defs>

      {/* ── Base dark arena background ── */}
      <rect width="600" height="520" fill="url(#arena-bg)" />

      {/* ── Crowd silhouettes (back rows, blurred) ── */}
      <g filter="url(#crowd-blur)" opacity="0.45">
        {/* Back crowd tier */}
        {Array.from({ length: 38 }, (_, i) => {
          const x = 12 + i * 15.5;
          const h = 18 + Math.sin(i * 1.7) * 6;
          const w = 10 + Math.sin(i * 2.3) * 3;
          return (
            <ellipse key={`bc${i}`} cx={x} cy={82 - h * 0.3} rx={w * 0.5} ry={h * 0.45} fill="#1a1f35" opacity="0.9" />
          );
        })}
        {/* Upper crowd row */}
        {Array.from({ length: 34 }, (_, i) => {
          const x = 20 + i * 16.5;
          const h = 14 + Math.sin(i * 2.1) * 5;
          return (
            <ellipse key={`uc${i}`} cx={x} cy={62} rx={7} ry={h * 0.45} fill="#161b30" opacity="0.8" />
          );
        })}
        {/* Crowd dots — lights */}
        {Array.from({ length: 60 }, (_, i) => {
          const x = 5 + (i % 30) * 19.5 + Math.sin(i * 1.3) * 4;
          const y = 30 + Math.floor(i / 30) * 22 + Math.sin(i * 2.7) * 5;
          const colors = ["#3a4a7a", "#4a5a8a", "#2a3a6a", "#5a6a9a", "#ffffff"];
          const c = colors[Math.floor(Math.random() * 3)];
          return (
            <circle key={`dot${i}`} cx={x} cy={y} r={1.2} fill={c} opacity={0.3 + Math.sin(i) * 0.2} />
          );
        })}
      </g>

      {/* ── Spotlight beams from rig above ── */}
      <g opacity="0.18">
        {/* Center main spot */}
        <ellipse cx="300" cy="10" rx="160" ry="20" fill="#6090d0" filter="url(#glow)" />
        <polygon points="140,10 460,10 360,320 240,320" fill="url(#spot-center)" opacity="0.6" />

        {/* Side spots */}
        <polygon points="80,30 130,30 250,300 190,300"  fill="#3060a0" opacity="0.12" />
        <polygon points="470,30 520,30 410,300 350,300"  fill="#3060a0" opacity="0.12" />
      </g>

      {/* ── Hanging arena lights ── */}
      <g filter="url(#glow)" opacity="0.75">
        {[120, 200, 300, 400, 480].map((x, i) => (
          <g key={`light${i}`}>
            <line x1={x} y1="0" x2={x} y2="18" stroke="#888" strokeWidth="1" opacity="0.4" />
            <rect x={x - 6} y="16" width="12" height="6" rx="2" fill="#c0c0a0" opacity="0.9" />
            <ellipse cx={x} cy="30" rx={30 + i * 4} ry="18" fill="#8ab0e0" opacity="0.08" />
          </g>
        ))}
      </g>

      {/* ── Arena level / stands bottom edge ── */}
      <path
        d="M0,105 Q150,88 300,85 Q450,88 600,105 L600,130 Q450,115 300,112 Q150,115 0,130 Z"
        fill="#0d0e1a"
        opacity="0.95"
      />
      <line x1="0" y1="105" x2="600" y2="105" stroke="#1e2440" strokeWidth="1" opacity="0.6" />

      {/* ── Octagon cage — perspective top view ── */}
      {/* Floor: octagon in mild perspective */}
      {(() => {
        // 8 corners of an octagon, perspective-warped (top compressed)
        const cx = 300, cy = 320;
        const rx = 195, ryTop = 115, ryBot = 165;
        const angles = Array.from({ length: 8 }, (_, i) => (i * 45 - 22.5) * Math.PI / 180);
        const pts = angles.map((a) => {
          const cos = Math.cos(a), sin = Math.sin(a);
          const ry = sin < 0 ? ryTop : ryBot;
          return [cx + rx * cos, cy + ry * sin];
        });
        const floor = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ") + " Z";
        return (
          <g>
            {/* Shadow under cage */}
            <ellipse cx={cx} cy={cy + 10} rx={rx + 10} ry={ryBot * 0.4} fill="#000" opacity="0.5" />
            {/* Floor surface */}
            <path d={floor} fill="url(#floor-grad)" stroke="#1e2d50" strokeWidth="1.5" />
            {/* Floor center line (red) */}
            <line x1={cx - rx * 0.7} y1={cy} x2={cx + rx * 0.7} y2={cy}
              stroke="#cc1122" strokeWidth="2" opacity="0.7" filter="url(#red-glow)" />
            {/* Floor center circle */}
            <ellipse cx={cx} cy={cy} rx={42} ry={28}
              fill="none" stroke="#cc1122" strokeWidth="2" opacity="0.6" />
            {/* Octagon logo text placeholder */}
            <text x={cx} y={cy + 5} textAnchor="middle" fontSize="11" fontWeight="900"
              fontFamily="Arial, sans-serif" fill="#cc1122" opacity="0.45" letterSpacing="3">
              G&amp;P
            </text>

            {/* Cage fence posts (vertical lines at each corner) */}
            {pts.map(([px, py], i) => {
              const postH = 75 + (cy - py) * 0.18;
              return (
                <g key={`post${i}`}>
                  <line x1={px} y1={py} x2={px} y2={py - postH}
                    stroke="#2a3550" strokeWidth="3" />
                  <line x1={px} y1={py} x2={px} y2={py - postH}
                    stroke="#4a6090" strokeWidth="1" opacity="0.5" />
                </g>
              );
            })}

            {/* Cage top ring */}
            {(() => {
              const topPts = angles.map((a, i) => {
                const [px, py] = pts[i];
                const postH = 75 + (cy - py) * 0.18;
                return [px, py - postH];
              });
              const topPath = topPts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ") + " Z";
              return (
                <>
                  <path d={topPath} fill="none" stroke="#2a3860" strokeWidth="2.5" />
                  <path d={topPath} fill="none" stroke="#4a6090" strokeWidth="1" opacity="0.5" />
                </>
              );
            })()}

            {/* Fence mesh — horizontal lines on each panel */}
            {pts.map(([px, py], i) => {
              const next = pts[(i + 1) % 8];
              const postH1 = 75 + (cy - py) * 0.18;
              const postH2 = 75 + (cy - next[1]) * 0.18;
              const lines = 5;
              return Array.from({ length: lines }, (_, j) => {
                const t = (j + 1) / (lines + 1);
                const x1 = px, y1 = py - postH1 * t;
                const x2 = next[0], y2 = next[1] - postH2 * t;
                return (
                  <line key={`mesh${i}-${j}`} x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke="#1e2d50" strokeWidth="1" opacity="0.55" />
                );
              });
            })}

            {/* Red sponsor stripe at cage bottom */}
            {pts.map(([px, py], i) => {
              const next = pts[(i + 1) % 8];
              return (
                <line key={`stripe${i}`} x1={px} y1={py} x2={next[0]} y2={next[1]}
                  stroke="#991122" strokeWidth="5" opacity="0.55" />
              );
            })}
          </g>
        );
      })()}

      {/* ── Floor reflections / wetness ── */}
      <ellipse cx="300" cy="380" rx="160" ry="40"
        fill="none" stroke="#1e3060" strokeWidth="1" opacity="0.2" />

      {/* ── Grain texture overlay ── */}
      <rect width="600" height="520" fill="url(#arena-bg)" opacity="0" filter="url(#grain)" />
      <rect width="600" height="520" fill="#050509" opacity="0.0">
        <animate attributeName="opacity" values="0;0.02;0" dur="0.15s" repeatCount="indefinite" />
      </rect>

      {/* ── Vignette corners ── */}
      <radialGradient id="vignette" cx="50%" cy="50%" r="70%">
        <stop offset="0%"   stopColor="#000000" stopOpacity="0" />
        <stop offset="100%" stopColor="#000000" stopOpacity="0.75" />
      </radialGradient>
      <rect width="600" height="520" fill="url(#vignette)" />
    </svg>
  );
});
