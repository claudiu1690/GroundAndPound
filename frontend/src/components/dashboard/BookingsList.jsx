import { useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { formatPurse, formatTimeLeft, oppStreak, bookingRowFlags, titleLockKey } from "./homeModel";

function BookHeader({ offers, onReload }) {
  const count = offers?.count ?? 0;
  const sub = count === 0 ? t("home.book.subNone") : count === 1 ? t("home.book.subOne") : t("home.book.sub", { n: count });
  const showCountdown = !offers?.frozen && !offers?.blockedReason && !!offers?.generatedAt;
  const time = showCountdown ? formatTimeLeft(offers?.expiresAt) : null;

  return (
    <div className="ap-book-head">
      <h2>
        {t("home.book.title")}
        <span>{sub}</span>
        {showCountdown ? (
          time ? (
            <span className="ap-book-rr">{t("home.book.newSetIn", { time })}</span>
          ) : (
            <span className="ap-book-rr">
              {t("home.book.newSetReady")}
              <button type="button" className="ap-btn is-ghost is-sm" onClick={onReload}>{t("home.book.refresh")}</button>
            </span>
          )
        ) : null}
      </h2>
    </div>
  );
}

function BookingRow({ item, heroBout, acceptingId, onAccept }) {
  const flags = bookingRowFlags(item, heroBout);
  const isLocked = item.type === "TitleShot" && !!item.locked;
  const rec = item.record ?? {};
  const streak = oppStreak(item.streak);

  const chip = item.isCallout
    ? { cls: "is-callout", label: t("home.book.calloutTag") }
    : item.type === "TitleShot"
      ? { cls: "is-title", label: t("home.next.chipTitle") }
      : { cls: `is-${(item.type ?? "even").toLowerCase()}`, label: t(`home.next.chip${item.type ?? "Even"}`) };

  const tagSuffix = item.nemesisLossCount != null
    ? ` · ${t("home.book.nemesisTag")}`
    : streak.key !== "none" ? ` · ${streak.key === "win" ? "W" : "L"}${streak.n}` : "";

  const lock = isLocked ? titleLockKey(item.titleLock) : null;
  const lockedText = lock ? t(`home.book.${lock.key}`, lock.n != null ? { n: lock.n } : undefined) : null;

  return (
    <div className={`ap-brow${flags.isMain ? " ap-brow--main" : ""}${isLocked ? " ap-brow--locked" : ""}`}>
      <div className="ap-sil is-blue" aria-hidden="true" />
      <div className="ap-brow-nm">
        <b>
          {item.opponentName}
          {item.opponentNickname ? <small>&quot;{item.opponentNickname}&quot;</small> : null}
        </b>
        <span>
          {rec.wins ?? 0}-{rec.losses ?? 0}-{rec.draws ?? 0} · OVR {item.opponentOvr ?? "n/a"}
          {item.opponentStyle ? ` · ${item.opponentStyle}` : ""}
          {tagSuffix}
        </span>
      </div>
      <span className={`ap-chip ${chip.cls}`}>{chip.label}</span>
      <div className="ap-brow-p">
        {item.purse != null ? formatPurse(item.purse) : "n/a"}
        <small>{t("home.book.purse")}</small>
      </div>
      {isLocked ? (
        <span className="ap-brow-locked-text">{lockedText}</span>
      ) : flags.isSigned ? (
        <span className="ap-brow-signed">{t("home.book.signed")}</span>
      ) : (
        <button
          type="button"
          className={`ap-btn is-sm ${flags.isMain ? "is-red" : "is-ghost"}`}
          disabled={!item.acceptable || !!acceptingId}
          onClick={() => onAccept?.(item.opponentId)}
        >
          {t("home.book.accept")}
        </button>
      )}
    </div>
  );
}

function RerollControl({ reroll }) {
  const { state, rerolling, error, onReroll } = reroll;
  const [confirming, setConfirming] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!confirming) return undefined;
    const onDocClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setConfirming(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [confirming]);

  if (!state.visible) return null;

  const costLabel = state.cost != null ? formatPurse(state.cost) : "";
  const label = rerolling
    ? t("home.book.rerolling")
    : confirming
      ? t("home.book.rerollConfirm", { cost: costLabel })
      : t("home.book.reroll", { cost: costLabel });

  const reasonText = state.reasonKey === "used" ? t("home.book.rerollUsed")
    : state.reasonKey === "cash" ? t("home.book.rerollCash", { cost: costLabel })
    : null;

  return (
    <div className="ap-book-reroll" ref={ref}>
      <button
        type="button"
        className="ap-btn is-ghost is-sm"
        disabled={state.disabled || rerolling}
        title={reasonText ?? undefined}
        onClick={() => {
          if (state.disabled) return;
          if (!confirming) { setConfirming(true); return; }
          setConfirming(false);
          onReroll?.();
        }}
      >
        {label}
      </button>
      {reasonText ? <span className="ap-book-reroll-reason">{reasonText}</span> : null}
      {error ? <span className="ap-book-reroll-error">{error}</span> : null}
    </div>
  );
}

/**
 * Bookings panel, the c-book section. `offers` is the dashboard payload's
 * offers block (OfferBoardMeta spread + `list`/`count`/`best`), `reroll` is
 * {state, rerolling, error, onReroll} built by the caller from
 * rerollButtonState(offers) + useOfferReroll (offer-board-contract.md §5).
 */
export function BookingsList({ offers, heroBout, loading, acceptingId, onAccept, reroll, activeCallout, onCallout, onReload, sectionRef }) {
  if (loading) {
    return (
      <div className="ap-book" ref={sectionRef}>
        <BookHeader offers={offers} onReload={onReload} />
        <div className="ap-book-list">
          <div className="ap-brow ap-skel" style={{ minHeight: 64 }} />
          <div className="ap-brow ap-skel" style={{ minHeight: 64 }} />
          <div className="ap-brow ap-skel" style={{ minHeight: 64 }} />
        </div>
      </div>
    );
  }

  // Frozen wins over a stale blockedReason (the backend hydrates a frozen
  // board as-is, it can still carry blockedCode/blockedReason from before the
  // fight was booked). A frozen board is hydrated with every offer's
  // acceptable:false rather than cleared, so rows still render (already
  // disabled below); only the reroll control and the callout CTA hide, since
  // neither makes sense while a fight is locked in.
  const frozen = !!offers?.frozen;
  const list = Array.isArray(offers?.list) ? offers.list : [];

  return (
    <div className="ap-book" ref={sectionRef}>
      <BookHeader offers={offers} onReload={onReload} />
      {!frozen && reroll ? <RerollControl reroll={reroll} /> : null}
      {frozen ? (
        <p className="ap-book-note">{t("home.book.frozenNote")}</p>
      ) : offers?.blockedReason ? (
        <p className="ap-book-note">{offers.blockedReason}</p>
      ) : null}
      <div className="ap-book-list">
        {list.map((item, i) => (
          <BookingRow key={item.opponentId ?? i} item={item} heroBout={heroBout} acceptingId={acceptingId} onAccept={onAccept} />
        ))}
        {!frozen ? (
          <div className="ap-brow ap-brow--callout">
            <div className="ap-sil" aria-hidden="true" />
            <div className="ap-brow-nm">
              <b>{activeCallout?.opponentId ? t("home.book.calloutManageTitle") : t("home.book.calloutTitle")}</b>
              <span>
                {activeCallout?.opponentId
                  ? t("home.book.calloutManageSub", { name: activeCallout.opponentName })
                  : t("home.book.calloutSub")}
              </span>
            </div>
            <button type="button" className="ap-btn is-ghost is-sm" onClick={onCallout}>{t("home.book.calloutCta")}</button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
