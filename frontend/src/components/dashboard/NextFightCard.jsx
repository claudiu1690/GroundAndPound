import { t } from "@/lib/i18n";
import { formatPurse, formatTimeLeft, oppStreak } from "./homeModel";

function ChipDifficulty({ offerType }) {
  if (!offerType) return null;
  if (offerType === "TitleShot") {
    return <span className="ap-chip is-title">{t("home.next.chipTitle")}</span>;
  }
  const cls = offerType.toLowerCase();
  return <span className={`ap-chip is-${cls}`}>{t(`home.next.chip${offerType}`)}</span>;
}

function ChipNemesis({ n }) {
  if (n == null) return null;
  return (
    <span className="ap-chip is-nem">
      {n === 1 ? t("home.next.chipNemesisOne") : t("home.next.chipNemesisMany", { n })}
    </span>
  );
}

function ChipCallout({ isCallout }) {
  if (!isCallout) return null;
  return <span className="ap-chip is-callout">{t("home.next.chipCallout")}</span>;
}

/**
 * Next Fight card, the c-next panel beside the identity block. States table:
 * offer-branch hero bout / accepted bout / blocked / frozen / no bout
 * (offer-board-contract.md §5, "NextFightCard states").
 */
export function NextFightCard({ heroBout, heroAction, offers, loading, acceptingId, onAccept, onNavigate, onOtherBouts }) {
  if (loading) {
    return <div className="ap-next ap-skel" style={{ minHeight: 260, borderRadius: 10 }} />;
  }

  const isOffer = heroBout?.source === "offer";
  const isAccepted = heroBout?.source === "accepted";

  let eyebrowKey = "home.next.eyebrow";
  let subText = null;

  if (isOffer) {
    const time = formatTimeLeft(offers?.expiresAt);
    subText = time ? t("home.next.booked", { time }) : t("home.next.bookedExpired");
  } else if (isAccepted) {
    eyebrowKey = "home.next.eyebrowSigned";
    subText = t("home.next.signed");
  } else if (offers?.frozen) {
    // Frozen wins over a stale blockedReason, a frozen board can still carry
    // blockedCode/blockedReason from before the fight was booked (backend
    // hydrates a frozen board as-is, it does not clear those fields).
    subText = t("home.next.frozen");
  } else if (offers?.blockedReason) {
    subText = offers.blockedReason;
  } else {
    subText = t("home.next.none");
  }

  const streak = heroBout ? oppStreak(heroBout.streak) : { key: "none", n: 0 };
  const streakLabel = streak.key === "win" ? `W${streak.n}` : streak.key === "loss" ? `L${streak.n}` : "-";

  return (
    <div className="ap-next">
      <div className="ap-next-eb">
        <span className="ap-eyebrow">{t(eyebrowKey)}</span>
        {isOffer || isAccepted ? <span className="ap-next-lk">{subText}</span> : null}
      </div>

      {heroBout ? (
        <>
          <div className="ap-next-opp">
            <div className="ap-sil is-blue" aria-hidden="true" />
            <div>
              <b>
                {heroBout.opponentName}
                {heroBout.opponentNickname || heroBout.opponentStyle ? (
                  <small>
                    {heroBout.opponentNickname ? `"${heroBout.opponentNickname}"` : ""}
                    {heroBout.opponentNickname && heroBout.opponentStyle ? " · " : ""}
                    {heroBout.opponentStyle ?? ""}
                  </small>
                ) : null}
              </b>
              <span>
                {(heroBout.record?.wins ?? 0)}-{(heroBout.record?.losses ?? 0)}-{(heroBout.record?.draws ?? 0)}
                {heroBout.opponentOvr != null ? ` · OVR ${heroBout.opponentOvr}` : ""}
                {heroBout.opponentRank != null ? ` · #${heroBout.opponentRank} ${heroBout.opponentWeightClass ?? ""}` : ""}
              </span>
            </div>
          </div>

          <div className="ap-next-stk">
            <ChipDifficulty offerType={heroBout.offerType} />
            <ChipNemesis n={heroBout.nemesisLossCount} />
            <ChipCallout isCallout={heroBout.isCallout} />
          </div>

          <div className="ap-next-m">
            <div className="g"><b>{heroBout.purse != null ? formatPurse(heroBout.purse) : "n/a"}</b><span>{t("home.next.purse")}</span></div>
            <div><b>{heroBout.rounds ?? "n/a"}</b><span>{t("home.next.rounds")}</span></div>
            <div><b>{streakLabel}</b><span>{t("home.next.streak")}</span></div>
          </div>
        </>
      ) : (
        <p className="ap-next-body">{subText}</p>
      )}

      <div className="ap-next-ct">
        {isOffer ? (
          <>
            <button
              type="button"
              className="ap-btn is-red"
              disabled={!!acceptingId}
              onClick={() => onAccept?.(heroBout.opponentId)}
            >
              {acceptingId ? t("home.next.accepting") : t("home.next.accept")}
            </button>
            <button type="button" className="ap-btn is-ghost" onClick={onOtherBouts}>
              {t("home.next.otherBouts")}
            </button>
          </>
        ) : (
          <button type="button" className="ap-btn is-red" onClick={() => onNavigate?.(heroAction?.linkTarget)}>
            {heroAction?.label ?? t("home.next.none")}
          </button>
        )}
      </div>
    </div>
  );
}
