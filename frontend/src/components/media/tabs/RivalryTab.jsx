import { useCallback, useEffect, useState } from "react";
import { Skull, Flame, Handshake, Megaphone } from "lucide-react";
import { api } from "../../../api";
import { t } from "@/lib/i18n";

function RivRow({ Icon, iconColor, borderColor, name, tag, tagStyle, sub, bonus, bonusColor, window }) {
  return (
    <div className="media-riv-row" style={{ borderColor }}>
      <div className="media-riv-icon" style={{ color: iconColor }}><Icon size={18} /></div>
      <div className="media-riv-info">
        <div className="media-riv-name">
          {name}
          {tag && <span className="media-riv-tag" style={tagStyle}>{tag}</span>}
        </div>
        {sub && <div className="media-riv-sub">{sub}</div>}
      </div>
      <div className="media-riv-right">
        {bonus && <div className="media-riv-bonus" style={{ color: bonusColor }}>{bonus}</div>}
        {window && <div className="media-riv-window">{window}</div>}
      </div>
    </div>
  );
}

export function RivalryTab({ fighter, onMessage }) {
  const fighterId = fighter?._id;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!fighterId) return;
    setLoading(true);
    setError("");
    try {
      setData(await api.getRivalry(fighterId));
    } catch (e) {
      setError(e.message || t("media.rivalry.error"));
    } finally {
      setLoading(false);
    }
  }, [fighterId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="media-pane"><div className="media-state">{t("media.rivalry.loading")}</div></div>;
  if (error) {
    return (
      <div className="media-pane">
        <div className="media-state media-state--error">
          {error}
          <button type="button" className="media-mini-btn" onClick={load}>{t("common.retry")}</button>
        </div>
      </div>
    );
  }

  const nemesis = data?.nemesis;
  const beef = data?.beef || [];
  const respect = data?.respect || [];
  const callout = data?.callout;
  const empty = !nemesis && beef.length === 0 && respect.length === 0 && !callout;

  return (
    <div className="media-pane">
      <div className="media-slbl">{t("media.rivalry.activeStorylinesLabel")}</div>

      {empty ? (
        <div className="media-state">
          {t("media.rivalry.empty")}
        </div>
      ) : (
        <div className="media-riv-list">
          {nemesis && (
            <RivRow
              Icon={Skull}
              iconColor="var(--c-accent, #C8102E)"
              borderColor="rgba(200,16,46,0.25)"
              name={t("media.rivalry.nemesisPrefix", { name: nemesis.opponentName })}
              tag={t("media.rivalry.nemesisTag")}
              tagStyle={{ background: "rgba(200,16,46,0.1)", color: "var(--c-accent, #C8102E)", border: "1px solid rgba(200,16,46,0.2)" }}
              sub={`${nemesis.lossCount === 1 ? t("media.rivalry.nemesisSub", { n: nemesis.lossCount }) : t("media.rivalry.nemesisSubPlural", { n: nemesis.lossCount })}${t("media.rivalry.nemesisSubSuffix")}`}
              bonus={nemesis.fameBonus ? `+${nemesis.fameBonus} fame` : null}
              bonusColor="var(--c-accent, #C8102E)"
              window={t("media.rivalry.nemesisWindow")}
            />
          )}

          {beef.map((b) => (
            <RivRow
              key={`beef-${b.opponentId}`}
              Icon={Flame}
              iconColor="#F87171"
              borderColor="rgba(200,16,46,0.2)"
              name={t("media.rivalry.beefPrefix", { name: b.opponentName })}
              tag={t("media.rivalry.beefTag")}
              tagStyle={{ background: "rgba(200,16,46,0.1)", color: "#F87171", border: "1px solid rgba(200,16,46,0.15)" }}
              sub={b.source ? t("media.rivalry.beefSubSource", { source: b.source }) : t("media.rivalry.beefSubDefault")}
              bonusColor="#F87171"
              window={b.expiresAfterFights === 1 ? t("media.rivalry.beefFightLeft", { n: b.expiresAfterFights }) : t("media.rivalry.beefFightsLeft", { n: b.expiresAfterFights })}
            />
          ))}

          {respect.map((r) => (
            <RivRow
              key={`respect-${r.opponentId}`}
              Icon={Handshake}
              iconColor="#93C5FD"
              borderColor="rgba(59,130,246,0.2)"
              name={t("media.rivalry.respectPrefix", { name: r.opponentName })}
              tag={t("media.rivalry.respectTag")}
              tagStyle={{ background: "rgba(59,130,246,0.1)", color: "#93C5FD", border: "1px solid rgba(59,130,246,0.2)" }}
              sub={r.source ? t("media.rivalry.respectSubSource", { source: r.source }) : t("media.rivalry.respectSubDefault")}
              bonusColor="#93C5FD"
              window={r.expiresAfterFights === 1 ? t("media.rivalry.respectFightLeft", { n: r.expiresAfterFights }) : t("media.rivalry.respectFightsLeft", { n: r.expiresAfterFights })}
            />
          ))}

          {callout && (
            <RivRow
              Icon={Megaphone}
              iconColor="var(--c-gold, #D4A820)"
              borderColor="rgba(212,168,32,0.2)"
              name={t("media.rivalry.calloutPrefix", { name: callout.opponentName })}
              tag={t("media.rivalry.calloutTag")}
              tagStyle={{ background: "rgba(212,168,32,0.1)", color: "var(--c-gold, #D4A820)", border: "1px solid rgba(212,168,32,0.2)" }}
              sub={callout.isStretch ? t("media.rivalry.calloutSubStretch") : t("media.rivalry.calloutSubDefault")}
              bonus={callout.pursePct ? `+${callout.pursePct}% cash` : null}
              bonusColor="var(--c-gold, #D4A820)"
              window={t("media.rivalry.calloutWindow")}
            />
          )}
        </div>
      )}
    </div>
  );
}
