import { memo } from "react";
import { Check, Award } from "lucide-react";
import { t } from "@/lib/i18n";

/**
 * Stepper cards (owner pick 03-V1). Each rank is a bordered card joined by
 * short flex connectors — nothing absolute-positioned, so the "floating line
 * off the circle centres" bug class is structurally impossible.
 */
/**
 * Renders a rank-node caption, striking through any `~~…~~` span.
 *
 * The server wraps a teach fragment in `~~` when that rank was SUPPOSED to hand over a move
 * and didn't — a promotion bought before the teach channel existed, or a coach who arrived
 * already past the rank. Previously the fragment was simply omitted, so the node read
 * "Unlocks Grind-It-Out Rounds" while the teach list said the Rank-2 move was missed, and
 * nothing connected the two. The `rankLabels` contract stays `string[]`.
 */
function RankGrantText({ text }) {
  if (!text) return null;
  return (
    <>
      {String(text).split(/(~~[^~]*~~)/g).filter(Boolean).map((part, idx) =>
        part.startsWith("~~") && part.endsWith("~~") ? (
          <span key={idx} className="yc-dev-grant-missed">{part.slice(2, -2)}</span>
        ) : (
          <span key={idx}>{part}</span>
        )
      )}
    </>
  );
}

function RankNodes({ rank, maxRank, rankLabels }) {
  const cards = [];
  for (let i = 1; i <= maxRank; i++) {
    const cls = i < rank ? "done" : i === rank ? "cur" : "";
    if (i > 1) {
      cards.push(<div key={`c${i}`} className={`yc-dev-conn${i <= rank ? " on" : ""}`} />);
    }
    cards.push(
      <div key={i} className={`yc-dev-card ${cls}`}>
        <div className="yc-dev-circle">{i < rank ? <Check size={14} /> : i}</div>
        <div className="yc-dev-rank-lbl">
          {i === rank
            ? t("yourCamp.dev.rankCurrent", { rank: i })
            : t("yourCamp.dev.rank", { rank: i })}
        </div>
        <div className="yc-dev-grant"><RankGrantText text={rankLabels?.[i - 1]} /></div>
      </div>
    );
  }
  return (
    <div className="yc-dev-track-wrap">
      <div className="yc-dev-track">{cards}</div>
    </div>
  );
}

function ReqBar({ req }) {
  const met = req.cur >= req.tgt;
  const pct = Math.min(100, (req.cur / req.tgt) * 100);
  return (
    <div className="yc-req-item">
      <div className="yc-req-label">
        <span>{req.label}</span>
        <b>{req.cur}/{req.tgt}</b>
      </div>
      <div className="yc-req-bar-track">
        <div className={`yc-req-bar-fill${met ? " met" : ""}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/**
 * The max-rank card, split three ways by `coach.perk`:
 *  - claimable (rank 4, unclaimed): an unmissable gold claim card — this is
 *    the fix for migrated veterans who converted straight to rank 4 and
 *    otherwise saw a maxed coach with nothing.
 *  - held: the perk shown as owned, in place of the old empty max-rank text.
 *  - null (archetype has no perk): the plain max-rank message, unchanged.
 */
function MaxRankCard({ coach, onClaimPerk, claimingPerk }) {
  const perk = coach.perk;

  if (perk?.claimable) {
    return (
      <div className="yc-next-rank-card claimable" id="yc-next-rank-card">
        <div className="yc-nrc-head">
          <div>
            <div className="yc-nrc-title">{t("yourCamp.dev.perkReadyTitle")}</div>
            <div className="yc-nrc-grants">
              <b>{perk.name}</b> — {perk.effect}
            </div>
          </div>
          <span className="yc-claim-badge">
            <Award size={12} /> {t("yourCamp.dev.perkReadyBadge")}
          </span>
        </div>
        <button
          type="button"
          className="yc-claim-btn"
          disabled={claimingPerk}
          onClick={onClaimPerk}
        >
          {claimingPerk ? t("yourCamp.dev.claimingPerk") : t("yourCamp.dev.claimPerk", { name: perk.name })}
        </button>
      </div>
    );
  }

  if (perk?.held) {
    return (
      <div className="yc-next-rank-card held" id="yc-next-rank-card">
        <div className="yc-nrc-head">
          <div>
            <div className="yc-nrc-title">{t("yourCamp.dev.perkHeldTitle")}</div>
            <div className="yc-nrc-grants">{t("yourCamp.dev.perkHeldSub", { name: coach.name.split(" ")[0] })}</div>
          </div>
          <span className="yc-held-badge">
            <Check size={12} /> {perk.name}
          </span>
        </div>
        <div className="yc-perk-effect-row">{perk.effect}</div>
      </div>
    );
  }

  return (
    <div className="yc-next-rank-card" id="yc-next-rank-card">
      <div className="yc-nrc-title">{t("yourCamp.dev.maxRank")}</div>
      <div className="yc-nrc-grants">{t("yourCamp.dev.maxRankSub")}</div>
    </div>
  );
}

/**
 * Rank ladder + the next-rank promotion card. `coach.nextRank` is `null` at
 * max rank (coach.rank === coach.maxRank) — rendered via `MaxRankCard`, which
 * branches on `coach.perk` (claimable / held / none). Never a card with a
 * disabled/absent promote button.
 */
export const DevelopmentTrack = memo(function DevelopmentTrack({ coach, onPromote, promoting, onClaimPerk, claimingPerk }) {
  const nr = coach.nextRank;
  return (
    <>
      <RankNodes rank={coach.rank} maxRank={coach.maxRank} rankLabels={coach.rankLabels} />

      {!nr ? (
        <MaxRankCard coach={coach} onClaimPerk={onClaimPerk} claimingPerk={claimingPerk} />
      ) : (
        <div className={`yc-next-rank-card${nr.ready ? " ready" : ""}`} id="yc-next-rank-card">
          <div className="yc-nrc-head">
            <div>
              <div className="yc-nrc-title">{t("yourCamp.dev.nextRank", { rank: nr.rank })}</div>
              <div className="yc-nrc-grants">{nr.grants}</div>
            </div>
            {nr.ready && (
              <span className="yc-ready-badge">
                <Check size={12} /> {t("yourCamp.dev.readyBadge")}
              </span>
            )}
          </div>
          <div className="yc-nrc-reqs">
            {nr.reqs.map((req) => <ReqBar key={req.key} req={req} />)}
            <div className="yc-req-item yc-req-cost">
              <div className="yc-req-label">
                <span>{t("yourCamp.dev.cost")}</span>
                <b style={{ color: nr.ready ? "#4ade80" : "#eee" }}>
                  ${nr.cost.toLocaleString()}{nr.ready ? " ✓" : ""}
                </b>
              </div>
              <div className="yc-req-bar-track">
                <div className={`yc-req-bar-fill${nr.ready ? " met" : ""}`} style={{ width: nr.ready ? "100%" : "0%" }} />
              </div>
            </div>
          </div>
          <button
            type="button"
            className={`yc-promote-btn${nr.ready ? " ready" : ""}`}
            disabled={!nr.ready || promoting}
            onClick={onPromote}
          >
            {promoting
              ? t("yourCamp.dev.promoting")
              : nr.ready
                ? t("yourCamp.dev.promoteTo", { rank: nr.rank })
                : t("yourCamp.dev.requirementsRemaining")}
          </button>
        </div>
      )}
    </>
  );
});
