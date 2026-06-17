import { memo, useEffect, useMemo, useRef } from "react";
import { formatRecoveryRemaining } from "../../utils/injuryDisplay";

/**
 * Holographic body-map for the Hospital's Active Injuries card.
 *
 * A full-card hologram figure (public/hospital/hologram_body.jpg, 848×1087) sits
 * behind injury cards laid out in left/right columns. An SVG overlay draws a
 * pulsing anatomical dot per active injury and a dashed line connecting it to its
 * card. All dot positions are computed at runtime from the image's object-fit:cover
 * scale, so they stay pixel-accurate at any width (ResizeObserver-driven).
 *
 * Dot positions are calibrated against the 848×1087 reference asset. To add a part,
 * measure (x,y) in that image and set xPct = x/848, yFrac = y/1087.
 */
const IMG_W = 848;
const IMG_H = 1087;

// Real game injury types (consts/injuryDefinitions.js) → body position + layout side.
// Colour is derived from severity (major = red, minor = amber), not hardcoded here.
const INJURY_PARTS = {
    // Calibrated against the live render (?bmcal=1). Ribcage + ankle interpolated.
    concussion:     { xPct: 0.501, yFrac: 0.118, r: 18, side: "left",  zone: "Head" },
    cut:            { xPct: 0.520, yFrac: 0.148, r: 11, side: "right", zone: "Brow" },
    broken_nose:    { xPct: 0.498, yFrac: 0.170, r: 11, side: "right", zone: "Face" },
    bruised_rib:    { xPct: 0.440, yFrac: 0.315, r: 16, side: "left",  zone: "Ribcage" },
    broken_hand:    { xPct: 0.664, yFrac: 0.486, r: 13, side: "right", zone: "Hand" },
    torn_ligament:  { xPct: 0.441, yFrac: 0.632, r: 14, side: "left",  zone: "Knee" },
    sprained_ankle: { xPct: 0.565, yFrac: 0.809, r: 12, side: "right", zone: "Ankle" },
};

const SVGNS = "http://www.w3.org/2000/svg";
const svgEl = (name) => document.createElementNS(SVGNS, name);

const dotColor = (sev) => (sev === "major" ? "#C8102E" : "#C87A10");
const dotGlow = (sev) => (sev === "major" ? "rgba(200,16,46," : "rgba(200,122,16,");
const lineColor = (sev) => (sev === "major" ? "rgba(200,16,46,0.65)" : "rgba(200,122,16,0.6)");

export const InjuryBodyMap = memo(function InjuryBodyMap({
    injuries,
    busyId,
    onDoctorVisit,
    onSkipRecovery,
}) {
    const cardRef = useRef(null);
    const svgRef = useRef(null);
    const rafRef = useRef(0);

    // Only injuries we have a body position for get a dot/line; the rest still render
    // as cards (in the left column) but without an anatomical anchor.
    const placed = useMemo(() => injuries.filter((i) => INJURY_PARTS[i.type]), [injuries]);
    const unmapped = useMemo(() => injuries.filter((i) => !INJURY_PARTS[i.type]), [injuries]);
    // Order each column head→toe so the cards read top-to-bottom down the figure.
    const byBodyHeight = (a, b) => (INJURY_PARTS[a.type]?.yFrac ?? 99) - (INJURY_PARTS[b.type]?.yFrac ?? 99);
    const leftCards = useMemo(
        () => [...placed.filter((i) => INJURY_PARTS[i.type].side === "left").sort(byBodyHeight), ...unmapped],
        [placed, unmapped]
    );
    const rightCards = useMemo(
        () => placed.filter((i) => INJURY_PARTS[i.type].side === "right").sort(byBodyHeight),
        [placed]
    );

    // ── Draw dots + connector lines (imperative, like the spec) ──
    useEffect(() => {
        const draw = () => {
            const card = cardRef.current;
            const svg = svgRef.current;
            if (!card || !svg) return;
            const cardRect = card.getBoundingClientRect();
            const W = cardRect.width;
            const H = cardRect.height;
            if (W < 1 || H < 1) return;

            // Match object-fit: contain exactly — the full figure scales to fit the
            // (compact) card and is centred, so every body part stays on-screen.
            const scale = Math.min(W / IMG_W, H / IMG_H);
            const imgDrawW = IMG_W * scale;
            const imgDrawH = IMG_H * scale;
            const xOffset = (W - imgDrawW) / 2;
            const yOffset = (H - imgDrawH) / 2;

            svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
            svg.setAttribute("width", W);
            svg.setAttribute("height", H);
            while (svg.firstChild) svg.removeChild(svg.firstChild);

            const pos = {};
            placed.forEach((inj) => {
                const bp = INJURY_PARTS[inj.type];
                pos[inj.type] = {
                    cx: xOffset + bp.xPct * imgDrawW,
                    cy: yOffset + bp.yFrac * imgDrawH,
                };
            });

            // Lines first (render behind dots).
            placed.forEach((inj) => {
                const bp = INJURY_PARTS[inj.type];
                const cardEl = card.querySelector(`[data-card="${inj.type}"]`);
                if (!cardEl) return;
                const ir = cardEl.getBoundingClientRect();
                const connX = bp.side === "left" ? ir.right - cardRect.left : ir.left - cardRect.left;
                const connY = ir.top + ir.height / 2 - cardRect.top;
                const { cx, cy } = pos[inj.type];
                const line = svgEl("line");
                line.setAttribute("x1", connX);
                line.setAttribute("y1", connY);
                line.setAttribute("x2", cx);
                line.setAttribute("y2", cy);
                line.setAttribute("stroke", lineColor(inj.severity));
                line.setAttribute("stroke-width", "1.3");
                line.setAttribute("stroke-dasharray", "5,3");
                svg.appendChild(line);
            });

            // Dots on top.
            placed.forEach((inj, i) => {
                const bp = INJURY_PARTS[inj.type];
                const { cx, cy } = pos[inj.type];
                const r = bp.r;
                const color = dotColor(inj.severity);
                const glow = dotGlow(inj.severity);

                const g = svgEl("g");
                const ell = svgEl("ellipse");
                ell.setAttribute("cx", cx);
                ell.setAttribute("cy", cy);
                ell.setAttribute("rx", r);
                ell.setAttribute("ry", r);
                ell.setAttribute("fill", glow + "0.13)");
                ell.setAttribute("stroke", glow + "0.65)");
                ell.setAttribute("stroke-width", "1.4");
                g.appendChild(ell);

                const ring = svgEl("circle");
                ring.setAttribute("cx", cx);
                ring.setAttribute("cy", cy);
                ring.setAttribute("r", r * 0.42);
                ring.setAttribute("fill", color);
                ring.classList.add("pulse-ring");
                ring.setAttribute("data-base", r * 0.42);
                ring.setAttribute("data-delay", i * 380);
                g.appendChild(ring);

                const dot = svgEl("circle");
                dot.setAttribute("cx", cx);
                dot.setAttribute("cy", cy);
                dot.setAttribute("r", r * 0.28);
                dot.setAttribute("fill", color);
                g.appendChild(dot);

                svg.appendChild(g);
            });
        };

        draw();
        // ResizeObserver is more reliable than window.resize inside a scrolling panel,
        // and also catches the card growing/shrinking as injuries change.
        const ro = new ResizeObserver(draw);
        if (cardRef.current) ro.observe(cardRef.current);
        // Re-draw once the bg image has loaded / layout settled.
        const t1 = setTimeout(draw, 80);
        const t2 = setTimeout(draw, 320);
        return () => {
            ro.disconnect();
            clearTimeout(t1);
            clearTimeout(t2);
        };
    }, [placed, leftCards, rightCards]);

    // ── Pulse animation (independent RAF, cleaned up on unmount) ──
    useEffect(() => {
        const tick = (now) => {
            const svg = svgRef.current;
            if (svg) {
                svg.querySelectorAll(".pulse-ring").forEach((ring) => {
                    const base = parseFloat(ring.getAttribute("data-base"));
                    const delay = parseFloat(ring.getAttribute("data-delay") || 0);
                    const phase = ((((now - delay) / 1600) % 1) + 1) % 1;
                    ring.setAttribute("r", base * (1 + Math.sin(phase * Math.PI) * 0.75));
                    ring.setAttribute("opacity", 1 - phase * 0.85);
                });
            }
            rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafRef.current);
    }, []);

    return (
        <div className="bm-card" ref={cardRef}>
            <img className="bm-bg" src="/hospital/hologram_body.jpg" alt="" draggable="false" />
            <div className="bm-vignette" />
            <svg className="bm-svg" ref={svgRef} />
            <div className="bm-head">
                <span className="bm-head-title">Diagnostic Scan</span>
                <span className="bm-head-count">{injuries.length} active</span>
            </div>
            <div className="bm-body">
                <div className="inj-col inj-col-left">
                    {leftCards.map((inj, i) => (
                        <BodyInjuryCard
                            key={`${inj.type ?? "x"}-${i}`}
                            injury={inj}
                            side="left"
                            anchored={!!INJURY_PARTS[inj.type]}
                            busy={busyId === inj.type}
                            onDoctorVisit={() => onDoctorVisit(inj.type)}
                            onSkipRecovery={() => onSkipRecovery(inj.type)}
                        />
                    ))}
                </div>
                <div className="sil-center" />
                <div className="inj-col inj-col-right">
                    {rightCards.map((inj, i) => (
                        <BodyInjuryCard
                            key={`${inj.type ?? "x"}-${i}`}
                            injury={inj}
                            side="right"
                            anchored
                            busy={busyId === inj.type}
                            onDoctorVisit={() => onDoctorVisit(inj.type)}
                            onSkipRecovery={() => onSkipRecovery(inj.type)}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
});

const BodyInjuryCard = memo(function BodyInjuryCard({
    injury: inj,
    side,
    anchored,
    busy,
    onDoctorVisit,
    onSkipRecovery,
}) {
    const sevClass = inj.severity === "major" ? "major" : "moderate";
    const needsDoctor = inj.requiresDoctorVisit && !inj.doctorVisited;
    const hoursLeft = inj.recoveryHoursLeft > 0 ? inj.recoveryHoursLeft : (inj.recoveryDaysLeft || 0) * 24;
    const isAutoHealing = !inj.requiresDoctorVisit && hoursLeft > 0;
    const ticking = hoursLeft > 0 && !inj.doctorVisited;

    return (
        <article
            className={`inj-card ${sevClass} ${anchored ? "" : "no-anchor"}`}
            data-card={inj.type}
            data-side={side}
        >
            <div className="inj-card-name-row">
                <span className="inj-card-name">{inj.label}</span>
                <span className="inj-card-sev">{inj.severity}</span>
            </div>
            <div className="inj-card-blocks">
                {inj.cannotFight && <span className="inj-card-block">Blocks Fighting</span>}
                {inj.cannotSpar && <span className="inj-card-block">Blocks Sparring</span>}
                {inj.cannotBagWork && <span className="inj-card-block">Blocks Bag/Pad</span>}
            </div>
            <p className="inj-card-desc">{inj.effect}</p>
            {ticking && (
                <p className="inj-card-timer">
                    Auto-heals in <strong>{formatRecoveryRemaining(inj)}</strong>
                </p>
            )}
            <div className="inj-card-actions">
                {needsDoctor && (
                    <button type="button" className="treat-btn" disabled={busy} onClick={onDoctorVisit}>
                        Treat Now <span className="treat-cost-inline">${inj.docVisitIron} + {inj.docVisitEnergy}E</span>
                    </button>
                )}
                {isAutoHealing && inj.recoverySkipIron > 0 && (
                    <button type="button" className="treat-btn" disabled={busy} onClick={onSkipRecovery}>
                        Treat Now <span className="treat-cost-inline">${inj.recoverySkipIron}</span>
                    </button>
                )}
            </div>
        </article>
    );
});
