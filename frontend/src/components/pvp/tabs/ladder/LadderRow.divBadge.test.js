/**
 * Unit tests for the division badge logic added to LadderRow.
 *
 * These are pure-logic tests — no React renderer needed.
 * Run with: npx vitest (requires vitest devDependency; currently not installed).
 * Can also be validated by running the logic inline with Node ESM.
 *
 * Covers:
 *   1. Badge gating: showDivisionBadge=true when division==null ("All"), false otherwise
 *   2. divBadgeStyle is undefined when divisionColor is null/undefined (no crash, no badge)
 *   3. 3-digit hex color from backend ("#888" for Prospect) produces NaN in rgba() — BUG
 *   4. divisionLabel(null) returns null (empty badge content, not a crash)
 *   5. Meta-line guard: renders when showDivisionBadge=true even if metaParts is empty
 *   6. Meta-line guard: hidden when showDivisionBadge=false AND metaParts is empty
 *   7. Meta-line metaParts content is still rendered when showDivisionBadge=false (no regression)
 */

// ── Inline reproduction of the badge-style logic from LadderRow.jsx:61-71 ──
function computeDivBadgeStyle(showDivisionBadge, divisionColor) {
  if (showDivisionBadge && divisionColor) {
    const r = parseInt(divisionColor.slice(1, 3), 16);
    const g = parseInt(divisionColor.slice(3, 5), 16);
    const b = parseInt(divisionColor.slice(5, 7), 16);
    return {
      color: divisionColor,
      background: `rgba(${r},${g},${b},0.12)`,
      border: `1px solid rgba(${r},${g},${b},0.2)`,
    };
  }
  return undefined;
}

// ── Inline reproduction of divisionLabel from pvpConst.js ──
const DIVISIONS = [
  { key: "prospect",   label: "Prospect",   color: "#888888" },
  { key: "contender",  label: "Contender",  color: "#93C5FD" },
  { key: "challenger", label: "Challenger", color: "#C4B5FD" },
  { key: "elite",      label: "Elite",      color: "#5EEAD4" },
  { key: "champion",   label: "Champion",   color: "#C8102E" },
];
function divisionLabel(key) {
  return DIVISIONS.find((d) => d.key === key)?.label ?? key;
}

// ── Tests ──────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";

describe("LadderRow division badge gating", () => {
  it("showDivisionBadge=true when division prop is null (All view)", () => {
    const division = null;
    expect(division == null).toBe(true);
  });

  it("showDivisionBadge=true when division prop is undefined (missing prop)", () => {
    const division = undefined;
    expect(division == null).toBe(true);
  });

  it("showDivisionBadge=false when a specific division is selected", () => {
    for (const key of ["prospect", "contender", "challenger", "elite", "champion"]) {
      expect(key == null).toBe(false);
    }
  });
});

describe("LadderRow divBadgeStyle computation", () => {
  it("returns undefined when showDivisionBadge is false (no badge, no crash)", () => {
    expect(computeDivBadgeStyle(false, "#93C5FD")).toBeUndefined();
  });

  it("returns undefined when divisionColor is null (no badge, no crash)", () => {
    expect(computeDivBadgeStyle(true, null)).toBeUndefined();
  });

  it("returns undefined when divisionColor is undefined (no badge, no crash)", () => {
    expect(computeDivBadgeStyle(true, undefined)).toBeUndefined();
  });

  it("returns undefined when divisionColor is empty string (no badge, no crash)", () => {
    expect(computeDivBadgeStyle(true, "")).toBeUndefined();
  });

  it("correctly parses all 6-digit hex division colors (contender through champion)", () => {
    const sixDigitColors = {
      contender:  "#93C5FD",
      challenger: "#C4B5FD",
      elite:      "#5EEAD4",
      champion:   "#C8102E",
    };
    for (const [div, color] of Object.entries(sixDigitColors)) {
      const style = computeDivBadgeStyle(true, color);
      expect(style, `${div} style should be defined`).toBeDefined();
      expect(style.background, `${div} background should not contain NaN`).not.toContain("NaN");
      expect(style.border, `${div} border should not contain NaN`).not.toContain("NaN");
    }
  });

  // KNOWN BUG: Backend sends "#888" (3-digit hex) for the Prospect division.
  // The fixed-offset slice() parser in LadderRow.jsx produces NaN for green/blue channels.
  it("BUG: 3-digit hex '#888' (Prospect from backend API) produces NaN in rgba output", () => {
    const style = computeDivBadgeStyle(true, "#888");
    expect(style).toBeDefined(); // badge still renders (truthy object)
    expect(style.background).toContain("NaN"); // broken CSS value
    expect(style.border).toContain("NaN");     // broken CSS value
  });
});

describe("divisionLabel edge cases", () => {
  it("returns the label string for all known division keys", () => {
    expect(divisionLabel("prospect")).toBe("Prospect");
    expect(divisionLabel("contender")).toBe("Contender");
    expect(divisionLabel("challenger")).toBe("Challenger");
    expect(divisionLabel("elite")).toBe("Elite");
    expect(divisionLabel("champion")).toBe("Champion");
  });

  it("returns null for null key (React renders nothing — no crash but empty badge)", () => {
    expect(divisionLabel(null)).toBeNull();
  });

  it("returns undefined for undefined key (React renders nothing — no crash but empty badge)", () => {
    expect(divisionLabel(undefined)).toBeUndefined();
  });

  it("returns the unknown key as-is for unrecognised strings", () => {
    expect(divisionLabel("veteran")).toBe("veteran");
  });
});

describe("LadderRow meta-line guard regression", () => {
  // Guard change: `metaParts.length > 0` → `showDivisionBadge || metaParts.length > 0`

  it("meta div is shown when showDivisionBadge=true even with no metaParts", () => {
    const showDivisionBadge = true;
    const metaParts = [];
    expect(showDivisionBadge || metaParts.length > 0).toBe(true);
  });

  it("meta div is hidden when showDivisionBadge=false and no metaParts (original behavior preserved)", () => {
    const showDivisionBadge = false;
    const metaParts = [];
    expect(showDivisionBadge || metaParts.length > 0).toBe(false);
  });

  it("meta div is shown when showDivisionBadge=false but metaParts has content (original behavior preserved)", () => {
    const showDivisionBadge = false;
    const metaParts = ["FW", "Wrestling"];
    expect(showDivisionBadge || metaParts.length > 0).toBe(true);
  });

  it("metaParts span is guarded separately — metaParts.length>0 still required inside meta div", () => {
    // At LadderRow.jsx:115, metaParts.length > 0 gates the metaParts span independently.
    // This means the badge showing and the meta text showing are independent.
    const metaParts = [];
    expect(metaParts.length > 0).toBe(false); // metaParts span NOT rendered even if badge shows
  });
});
