import { useEffect } from "react";
import { createPortal } from "react-dom";
import { t } from "@/lib/i18n";

/**
 * "Tale of the tape" face-off shown on fight accept, BEFORE the Fighter Report.
 * You (blue corner) and the opponent (red corner) slide in from opposite sides,
 * clash on a "VS", and a public tale-of-the-tape (Overall / Record / Style /
 * Class) staggers in — then it auto-dismisses into the report.
 *
 * SPOILER-SAFE: only shows public info already visible on the offer card. The
 * opponent's detailed combat stats stay fogged for the player to scout in camp
 * via the Fighter Report — this screen never reveals them.
 *
 * Rendered as a portal overlay ABOVE the already-loaded report; on done it just
 * unmounts, revealing the report underneath. Auto-advances after HOLD_MS or on
 * Skip / Esc / Enter — never traps the player in a cutscene.
 */
const HOLD_MS = 3500;

const WC_ABBR = { Featherweight: "FW", Lightweight: "LW", Middleweight: "MW", Heavyweight: "HW" };
const abbr = (wc) => WC_ABBR[wc] || (wc ? wc.slice(0, 2).toUpperCase() : "—");
const initialsOf = (name) =>
    (name || "").split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";

function FighterSide({ side, f, corner }) {
    return (
        <div className={`faceoff-fighter faceoff-fighter--${side}`}>
            <div className="faceoff-port">{f.isTitle ? "★" : initialsOf(f.name)}</div>
            <div className="faceoff-info">
                <div className="faceoff-corner">{corner}</div>
                <div className="faceoff-name">{f.name}</div>
                {f.nickname && <div className="faceoff-nick">&ldquo;{f.nickname}&rdquo;</div>}
                <div className="faceoff-rec">{f.record}</div>
            </div>
        </div>
    );
}

function TapeRow({ lbl, l, r, lWin, rWin }) {
    return (
        <div className="faceoff-trow">
            <span className={`faceoff-tval l${lWin ? " win" : ""}`}>{l}</span>
            <span className="faceoff-tlbl">{lbl}</span>
            <span className={`faceoff-tval r${rWin ? " win" : ""}`}>{r}</span>
        </div>
    );
}

export function FaceOff({ player, opponent, onDone }) {
    useEffect(() => {
        const id = setTimeout(() => onDone?.(), HOLD_MS);
        const onKey = (e) => {
            if (e.key === "Escape" || e.key === "Enter") { clearTimeout(id); onDone?.(); }
        };
        window.addEventListener("keydown", onKey);
        return () => { clearTimeout(id); window.removeEventListener("keydown", onKey); };
    }, [onDone]);

    if (!player || !opponent) return null;

    const pOvr = player.ovr ?? 0;
    const oOvr = opponent.ovr ?? 0;

    return createPortal(
        <div className="faceoff" role="dialog" aria-label={t("fights.faceOff.aria")}>
            <button type="button" className="faceoff-skip" onClick={() => onDone?.()}>
                {t("fights.faceOff.skip")} &#9656;
            </button>

            <div className="faceoff-arena">
                <FighterSide side="you" f={player} corner={t("fights.faceOff.blueCorner")} />

                <div className="faceoff-center">
                    <div className="faceoff-vs">
                        <span>V</span>S<span className="faceoff-clash" aria-hidden="true" />
                    </div>
                    <div className="faceoff-tape">
                        <TapeRow lbl={t("fights.faceOff.overall")} l={pOvr} r={oOvr} lWin={pOvr > oOvr} rWin={oOvr > pOvr} />
                        <TapeRow lbl={t("fights.faceOff.record")} l={player.record} r={opponent.record} />
                        <TapeRow lbl={t("fights.faceOff.style")} l={player.style} r={opponent.style} />
                        <TapeRow lbl={t("fights.faceOff.klass")} l={abbr(player.weightClass)} r={abbr(opponent.weightClass)} />
                    </div>
                    <div className="faceoff-scout">{t("fights.faceOff.scoutNote")}</div>
                </div>

                <FighterSide
                    side="opp"
                    f={opponent}
                    corner={opponent.isTitle ? t("fights.faceOff.champCorner") : t("fights.faceOff.redCorner")}
                />
            </div>

            <div className="faceoff-prompt">
                <span className="faceoff-go">&#9656; {t("fights.faceOff.entering")}</span>
            </div>
        </div>,
        document.body
    );
}
